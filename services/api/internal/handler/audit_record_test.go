package handler

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
)

type ctxCheckingRecorder struct{ ctxErr error }

func (c *ctxCheckingRecorder) RecordUserAction(ctx context.Context, _ uuid.UUID, _, _, _, _, _ string) error {
	c.ctxErr = ctx.Err()
	return nil
}

// A client that hangs up after its change commits must not cancel the audit write.
func TestRecordAuditIgnoresRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest("DELETE", "/api/v1/agents/x", nil).WithContext(ctx)

	rec := &ctxCheckingRecorder{}
	recordAudit(rec, r, uuid.New(), "agent.delete", "agent", "x")
	if rec.ctxErr != nil {
		t.Fatalf("audit write ran on a cancelled context: %v", rec.ctxErr)
	}
}
