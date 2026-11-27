package pg

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	pool *pgxpool.Pool
}

type auditChainRow struct {
	ActorType     string
	ActorID       string
	Action        string
	ResourceType  string
	ResourceID    string
	Decision      string
	EventHash     string
	PrevEventHash string
	CreatedAt     time.Time
}

func NewAuditRepository(pool *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

// auditEventHash hashes the chained fields. Each field is length-prefixed so
// no choice of values (for example a "|" inside a resource id) can make two
// different events hash alike, and the timestamp is hashed at the precision
// Postgres stores, so the stored row always re-verifies.
func auditEventHash(userID uuid.UUID, row auditChainRow) string {
	h := sha256.New()
	for _, field := range []string{
		"authbox-audit-v2",
		userID.String(),
		row.PrevEventHash,
		row.ActorType,
		row.ActorID,
		row.Action,
		row.ResourceType,
		row.ResourceID,
		row.Decision,
		row.CreatedAt.UTC().Format(time.RFC3339Nano),
	} {
		h.Write([]byte(strconv.Itoa(len(field))))
		h.Write([]byte{':'})
		h.Write([]byte(field))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func (r *AuditRepository) AppendEvent(ctx context.Context, event *domain.AuditEvent) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		// One writer per user at a time: without this, two concurrent appends
		// read the same latest hash and fork the chain.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "audit:"+event.UserID.String()); err != nil {
			return err
		}

		var prevHash string
		var prevAt time.Time
		err := tx.QueryRow(ctx, `SELECT event_hash, created_at FROM audit_events
			WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, event.UserID).Scan(&prevHash, &prevAt)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		// Postgres keeps microseconds. Keep timestamps strictly increasing per
		// user so the verifier's ordering matches the append order even when
		// API instances' clocks disagree.
		createdAt := time.Now().UTC().Truncate(time.Microsecond)
		if !prevAt.IsZero() && !createdAt.After(prevAt) {
			createdAt = prevAt.UTC().Add(time.Microsecond)
		}

		event.PrevEventHash = prevHash
		event.CreatedAt = createdAt
		event.EventHash = auditEventHash(event.UserID, auditChainRow{
			ActorType:     event.ActorType,
			ActorID:       event.ActorID.String(),
			Action:        event.Action,
			ResourceType:  event.ResourceType,
			ResourceID:    event.ResourceID,
			Decision:      event.Decision,
			PrevEventHash: prevHash,
			CreatedAt:     createdAt,
		})

		return tx.QueryRow(ctx, `INSERT INTO audit_events (user_id, actor_type, actor_id, action, resource_type,
			resource_id, decision, metadata, event_hash, prev_event_hash, ip_address, user_agent, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			RETURNING id`,
			event.UserID, event.ActorType, event.ActorID, event.Action,
			event.ResourceType, event.ResourceID, event.Decision, event.Metadata,
			event.EventHash, event.PrevEventHash, event.IPAddress, event.UserAgent, createdAt,
		).Scan(&event.ID)
	})
}

func (r *AuditRepository) ListEvents(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.AuditEvent, error) {
	query := `SELECT id, user_id, actor_type, actor_id, action, COALESCE(resource_type, ''), COALESCE(resource_id, ''),
		decision, COALESCE(metadata, '{}'), event_hash, prev_event_hash, COALESCE(ip_address, ''), COALESCE(user_agent, ''), created_at
		FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		if err := rows.Scan(
			&e.ID, &e.UserID, &e.ActorType, &e.ActorID,
			&e.Action, &e.ResourceType, &e.ResourceID,
			&e.Decision, &e.Metadata, &e.EventHash, &e.PrevEventHash,
			&e.IPAddress, &e.UserAgent, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (r *AuditRepository) VerifyChain(ctx context.Context, userID uuid.UUID) (bool, int, error) {
	// Limit to the most recent 10,000 events to prevent OOM on large audit trails,
	// then restore chronological order for hash-chain verification.
	query := `WITH recent AS (
			SELECT id, actor_type, actor_id::text AS actor_id, action,
				COALESCE(resource_type, '') AS resource_type, COALESCE(resource_id, '') AS resource_id,
				decision, event_hash, prev_event_hash, created_at
			FROM audit_events
			WHERE user_id = $1
			ORDER BY created_at DESC, id DESC
			LIMIT 10000
		)
		SELECT actor_type, actor_id, action, resource_type, resource_id, decision, event_hash, prev_event_hash, created_at
		FROM recent
		ORDER BY created_at ASC, id ASC`
	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return false, 0, err
	}
	defer rows.Close()

	var chainRows []auditChainRow
	for rows.Next() {
		var row auditChainRow
		if err := rows.Scan(&row.ActorType, &row.ActorID, &row.Action, &row.ResourceType, &row.ResourceID,
			&row.Decision, &row.EventHash, &row.PrevEventHash, &row.CreatedAt); err != nil {
			return false, len(chainRows), err
		}
		chainRows = append(chainRows, row)
	}
	if err := rows.Err(); err != nil {
		return false, len(chainRows), err
	}

	valid, verified := verifyChainRows(userID, chainRows)
	return valid, verified, nil
}

func verifyChainRows(userID uuid.UUID, rows []auditChainRow) (bool, int) {
	if len(rows) == 0 {
		return true, 0
	}

	prevHash := rows[0].PrevEventHash
	verified := 0
	for _, row := range rows {
		if row.PrevEventHash != prevHash || auditEventHash(userID, row) != row.EventHash {
			return false, verified
		}
		prevHash = row.EventHash
		verified++
	}
	return true, verified
}
