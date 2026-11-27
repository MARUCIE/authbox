package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteErrorEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusTooManyRequests, "rate limit exceeded", CodeRateLimited)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content type = %q", ct)
	}
	// Byte-identical to the hand-written bodies this package replaced.
	if got, want := rec.Body.String(), `{"error":"rate limit exceeded","code":"RATE_LIMITED"}`+"\n"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}

func TestWriteErrorEscapesMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusBadRequest, `bad "name"`, CodeBadRequest)
	if got, want := rec.Body.String(), `{"error":"bad \"name\"","code":"BAD_REQUEST"}`+"\n"; got != want {
		t.Fatalf("body = %q, want %q", got, want)
	}
}
