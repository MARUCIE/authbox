package handler

import (
	"context"
	"log/slog"
	"net/http"

	appmw "auth-box-api/internal/middleware"

	"github.com/google/uuid"
)

// auditRecorder appends to the user's audit chain (service.AuditService).
type auditRecorder interface {
	RecordUserAction(ctx context.Context, userID uuid.UUID, action, resourceType, resourceID, ipAddress, userAgent string) error
}

// recordAudit logs a completed change. The change already happened, so a
// failed write is logged and the request still succeeds.
func recordAudit(a auditRecorder, r *http.Request, userID uuid.UUID, action, resourceType, resourceID string) {
	if a == nil {
		return
	}
	if err := a.RecordUserAction(r.Context(), userID, action, resourceType, resourceID, appmw.ClientIP(r), r.UserAgent()); err != nil {
		slog.Error("audit event not recorded", "action", action, "error", err)
	}
}
