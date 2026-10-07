package pg

import (
	"context"
	"crypto/sha256"
	"fmt"
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

func (r *AuditRepository) GetLatestEvent(ctx context.Context, userID uuid.UUID) (*domain.AuditEvent, error) {
	query := `SELECT id, user_id, actor_type, actor_id, action, resource_type, resource_id,
		decision, metadata, event_hash, prev_event_hash, ip_address, user_agent, created_at
		FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`

	var event domain.AuditEvent
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&event.ID, &event.UserID, &event.ActorType, &event.ActorID,
		&event.Action, &event.ResourceType, &event.ResourceID,
		&event.Decision, &event.Metadata, &event.EventHash, &event.PrevEventHash,
		&event.IPAddress, &event.UserAgent, &event.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (r *AuditRepository) CreateEvent(ctx context.Context, event *domain.AuditEvent) error {
	// The whole append is one transaction under a per-user advisory lock:
	// prev-hash read + insert must be atomic or two concurrent events fork
	// the chain, which verification then reports as tampering.
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtext($1::text))`, event.UserID,
	); err != nil {
		return err
	}

	// Read the latest hash inside the lock; a value the service fetched
	// earlier could already be stale.
	var prevHash string
	err = tx.QueryRow(ctx,
		`SELECT event_hash FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
		event.UserID,
	).Scan(&prevHash)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	event.PrevEventHash = prevHash

	// Hash and STORE the same timestamp: hashing service time while the DB
	// default NOW() got stored made verification fail whenever the two
	// clocks landed in different seconds — false tamper alarms by design.
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}
	hashInput := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s",
		event.PrevEventHash, event.ActorType, event.ActorID.String(),
		event.Action, event.ResourceType, event.ResourceID,
		event.Decision, event.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"))
	hash := sha256.Sum256([]byte(hashInput))
	event.EventHash = fmt.Sprintf("%x", hash)

	query := `INSERT INTO audit_events (user_id, actor_type, actor_id, action, resource_type,
		resource_id, decision, metadata, event_hash, prev_event_hash, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at`

	if err := tx.QueryRow(ctx, query,
		event.UserID, event.ActorType, event.ActorID, event.Action,
		event.ResourceType, event.ResourceID, event.Decision, event.Metadata,
		event.EventHash, event.PrevEventHash, event.IPAddress, event.UserAgent,
		event.CreatedAt,
	).Scan(&event.ID, &event.CreatedAt); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *AuditRepository) ListEvents(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.AuditEvent, error) {
	query := `SELECT id, user_id, actor_type, actor_id, action, resource_type, resource_id,
		decision, metadata, event_hash, prev_event_hash, ip_address, user_agent, created_at
		FROM audit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`

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
	return events, nil
}

func (r *AuditRepository) VerifyChain(ctx context.Context, userID uuid.UUID) (bool, int, error) {
	// Limit to the most recent 10,000 events to prevent OOM on large audit trails,
	// then restore chronological order for hash-chain verification.
	query := `WITH recent AS (
			SELECT actor_type, actor_id, action, resource_type, resource_id,
				decision, event_hash, prev_event_hash, created_at
			FROM audit_events
			WHERE user_id = $1
			ORDER BY created_at DESC
			LIMIT 10000
		)
		SELECT actor_type, actor_id, action, resource_type, resource_id,
			decision, event_hash, prev_event_hash, created_at
		FROM recent
		ORDER BY created_at ASC`

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

	valid, verified := verifyChainRows(chainRows)
	return valid, verified, nil
}

func verifyChainRows(rows []auditChainRow) (bool, int) {
	if len(rows) == 0 {
		return true, 0
	}

	prevHash := rows[0].PrevEventHash
	verified := 0

	for _, row := range rows {
		if row.PrevEventHash != prevHash {
			return false, verified
		}

		hashInput := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s",
			row.PrevEventHash, row.ActorType, row.ActorID, row.Action,
			row.ResourceType, row.ResourceID, row.Decision,
			row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"))
		computed := sha256.Sum256([]byte(hashInput))
		if fmt.Sprintf("%x", computed) != row.EventHash {
			return false, verified
		}

		prevHash = row.EventHash
		verified++
	}

	return true, verified
}
