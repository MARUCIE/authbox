package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	appmw "auth-box-api/internal/middleware"

	"github.com/google/uuid"
)

// auditRecorder appends to the user's audit chain (service.AuditService).
type auditRecorder interface {
	RecordUserAction(ctx context.Context, userID uuid.UUID, action, resourceType, resourceID, ipAddress, userAgent string) error
}

// auditWriteTimeout bounds the audit write, which runs on its own context.
const auditWriteTimeout = 5 * time.Second

// recordAudit logs a completed change. The change already happened, so a
// failed write is logged and the request still succeeds. The write does not
// use the request's context: a client that hangs up right after the change
// commits must not be able to cancel its audit record.
func recordAudit(a auditRecorder, r *http.Request, userID uuid.UUID, action, resourceType, resourceID string) {
	if a == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), auditWriteTimeout)
	defer cancel()
	if err := a.RecordUserAction(ctx, userID, action, resourceType, resourceID, appmw.ClientIP(r), r.UserAgent()); err != nil {
		slog.Error("audit event not recorded", "action", action, "error", err)
	}
}
