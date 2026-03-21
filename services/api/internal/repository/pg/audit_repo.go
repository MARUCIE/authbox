package pg

import (
	"context"
	"crypto/sha256"
	"fmt"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	pool *pgxpool.Pool
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
	// Compute hash chain
	hashInput := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s",
		event.PrevEventHash, event.ActorType, event.ActorID.String(),
		event.Action, event.ResourceType, event.ResourceID,
		event.Decision, event.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"))
	hash := sha256.Sum256([]byte(hashInput))
	event.EventHash = fmt.Sprintf("%x", hash)

	query := `INSERT INTO audit_events (user_id, actor_type, actor_id, action, resource_type,
		resource_id, decision, metadata, event_hash, prev_event_hash, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at`

	return r.pool.QueryRow(ctx, query,
		event.UserID, event.ActorType, event.ActorID, event.Action,
		event.ResourceType, event.ResourceID, event.Decision, event.Metadata,
		event.EventHash, event.PrevEventHash, event.IPAddress, event.UserAgent,
	).Scan(&event.ID, &event.CreatedAt)
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
	// Limit to most recent 10,000 events to prevent OOM on large audit trails
	query := `SELECT actor_type, actor_id, action, resource_type, resource_id,
		decision, event_hash, prev_event_hash, created_at
		FROM audit_events WHERE user_id = $1 ORDER BY created_at ASC LIMIT 10000`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return false, 0, err
	}
	defer rows.Close()

	var prevHash string
	verified := 0

	for rows.Next() {
		var (
			actorType, actorID, action, resType, resID string
			decision, eventHash, prevEventHash         string
			createdAt                                  interface{}
		)
		if err := rows.Scan(&actorType, &actorID, &action, &resType, &resID,
			&decision, &eventHash, &prevEventHash, &createdAt); err != nil {
			return false, verified, err
		}

		if prevEventHash != prevHash {
			return false, verified, nil
		}

		hashInput := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s",
			prevEventHash, actorType, actorID, action, resType, resID,
			decision, fmt.Sprintf("%v", createdAt))
		computed := sha256.Sum256([]byte(hashInput))
		computedHex := fmt.Sprintf("%x", computed)

		if computedHex != eventHash {
			return false, verified, nil
		}

		prevHash = eventHash
		verified++
	}

	return true, verified, nil
}
