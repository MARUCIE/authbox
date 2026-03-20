package pg

import (
	"context"
	"errors"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

func (r *SessionRepository) Create(ctx context.Context, s *domain.Session) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO sessions (user_id, token_hash, device_name, ip_address, user_agent, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at`,
		s.UserID, s.TokenHash, s.DeviceName, s.IPAddress, s.UserAgent, s.ExpiresAt,
	).Scan(&s.ID, &s.CreatedAt)
}

// ValidateSession looks up a session by token hash and returns the user ID
// if the session exists and has not expired. Implements auth.SessionValidator.
func (r *SessionRepository) ValidateSession(ctx context.Context, tokenHash []byte) (uuid.UUID, error) {
	var userID uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > $2`,
		tokenHash, time.Now().UTC(),
	).Scan(&userID)

	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, errors.New("session not found or expired")
	}
	return userID, err
}

func (r *SessionRepository) DeleteByTokenHash(ctx context.Context, tokenHash []byte) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE token_hash = $1`,
		tokenHash,
	)
	return err
}

func (r *SessionRepository) DeleteByUserID(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE user_id = $1`,
		userID,
	)
	return err
}

// ListByUserID returns all active sessions for a user, ordered by last active.
func (r *SessionRepository) ListByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Session, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, token_hash, device_name, ip_address, user_agent, expires_at, last_active_at, created_at
		 FROM sessions WHERE user_id = $1 AND expires_at > $2
		 ORDER BY last_active_at DESC`,
		userID, time.Now().UTC(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []domain.Session
	for rows.Next() {
		var s domain.Session
		if err := rows.Scan(&s.ID, &s.UserID, &s.TokenHash, &s.DeviceName, &s.IPAddress, &s.UserAgent, &s.ExpiresAt, &s.LastActiveAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// DeleteByID deletes a specific session (for revoking).
func (r *SessionRepository) DeleteByID(ctx context.Context, sessionID uuid.UUID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
		sessionID, userID,
	)
	return err
}

// TouchSession updates last_active_at for a session.
func (r *SessionRepository) TouchSession(ctx context.Context, tokenHash []byte) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE sessions SET last_active_at = $1 WHERE token_hash = $2`,
		time.Now().UTC(), tokenHash,
	)
	return err
}
