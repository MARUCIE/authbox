package pg

import (
	"errors"

	"auth-box-api/internal/domain"

	"github.com/jackc/pgx/v5/pgconn"
)

// uniqueViolation is the Postgres SQLSTATE for a unique constraint failure.
const uniqueViolation = "23505"

// mapUniqueViolation turns a unique constraint failure into domain.ErrConflict
// so handlers can answer 409 instead of 500. Other errors pass through.
func mapUniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return domain.ErrConflict
	}
	return err
}
