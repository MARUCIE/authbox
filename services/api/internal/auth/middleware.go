package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

type contextKey string

const userIDKey contextKey = "userID"
const tokenHashKey contextKey = "tokenHash"

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
				http.Error(w, `{"error":"missing authorization header","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
				return
			}

			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				http.Error(w, `{"error":"invalid authorization format","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
				return
			}

			tokenHash, err := HashToken(token)
			if err != nil {
				http.Error(w, `{"error":"invalid token","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
				return
			}

			userID, err := validator.ValidateSession(r.Context(), tokenHash)
			if err != nil {
				http.Error(w, `{"error":"invalid or expired session","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
				return
			}

			// Update session last_active_at (fire-and-forget, non-blocking)
			go validator.TouchSession(context.Background(), tokenHash)

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, tokenHashKey, tokenHash)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
