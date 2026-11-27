package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

type rejectAll struct{}

func (rejectAll) ValidateSession(context.Context, []byte) (uuid.UUID, error) {
	return uuid.Nil, errors.New("no session")
}
func (rejectAll) TouchSession(context.Context, []byte) error { return nil }

// Rejections use the API's JSON error envelope and content type, the same as
// every handler error (they were text/plain before httpx owned the format).
func TestMiddlewareRejectionsAreJSON(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler must not run")
	})
	cases := map[string]struct{ header, body string }{
		"missing": {"", `{"error":"missing authorization header","code":"UNAUTHORIZED"}`},
		"format":  {"Basic abc", `{"error":"invalid authorization format","code":"UNAUTHORIZED"}`},
		"session": {"Bearer some-token", `{"error":"invalid or expired session","code":"UNAUTHORIZED"}`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()
			Middleware(rejectAll{})(next).ServeHTTP(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d", rec.Code)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("content type = %q", ct)
			}
			if got := rec.Body.String(); got != tc.body+"\n" {
				t.Fatalf("body = %q", got)
			}
		})
	}
}
