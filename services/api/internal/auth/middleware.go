package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"auth-box-api/internal/httpx"

	"github.com/google/uuid"
)

type contextKey string

const userIDKey contextKey = "userID"
const tokenHashKey contextKey = "tokenHash"

// touchSessionTimeout bounds the background last_active_at update.
const touchSessionTimeout = 5 * time.Second

// UserIDFromContext extracts the authenticated user's ID from the request context.
func UserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(userIDKey).(uuid.UUID)
	return id, ok
}

// SessionValidator looks up a session token hash and returns the user ID
// if the session is valid (exists and not expired).
type SessionValidator interface {
	ValidateSession(ctx context.Context, tokenHash []byte) (uuid.UUID, error)
	TouchSession(ctx context.Context, tokenHash []byte) error
}

// TokenHashFromContext extracts the token hash from the request context.
func TokenHashFromContext(ctx context.Context) ([]byte, bool) {
	hash, ok := ctx.Value(tokenHashKey).([]byte)
	return hash, ok
}

// Middleware returns an HTTP middleware that extracts a Bearer token from
// the Authorization header, validates it via SessionValidator, and sets
// the user ID in the request context.
func Middleware(validator SessionValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				httpx.WriteError(w, http.StatusUnauthorized, "missing authorization header", httpx.CodeUnauthorized)
				return
			}

			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				httpx.WriteError(w, http.StatusUnauthorized, "invalid authorization format", httpx.CodeUnauthorized)
				return
			}

			tokenHash, err := HashToken(token)
			if err != nil {
				httpx.WriteError(w, http.StatusUnauthorized, "invalid token", httpx.CodeUnauthorized)
				return
			}

			userID, err := validator.ValidateSession(r.Context(), tokenHash)
			if err != nil {
				httpx.WriteError(w, http.StatusUnauthorized, "invalid or expired session", httpx.CodeUnauthorized)
				return
			}

			// Update session last_active_at off the request path. The timeout
			// keeps a stalled database from piling up one goroutine per request.
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), touchSessionTimeout)
				defer cancel()
				_ = validator.TouchSession(ctx, tokenHash)
			}()

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, tokenHashKey, tokenHash)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
