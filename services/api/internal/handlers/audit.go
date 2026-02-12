package handlers

import (
	"errors"
	"net/http"

	"auth-box-api/internal/models"
	"auth-box-api/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// AuditHandler handles audit-related HTTP requests.
type AuditHandler struct {
	repo *repository.AuditRepository
}

// NewAuditHandler creates a new audit handler.
func NewAuditHandler(repo *repository.AuditRepository) *AuditHandler {
	return &AuditHandler{repo: repo}
}

// List handles GET /api/v1/audit.
func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	events, _, err := h.repo.List(100, 0)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list audit events")
		return
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Items:         events,
		NextPageToken: "",
	})
}

// CreateExport handles POST /api/v1/audit/exports.
func (h *AuditHandler) CreateExport(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	var req models.CreateAuditExportRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid request body")
		return
	}

	if err := req.Validate(); err != nil {
		var validationErr models.ErrValidation
		if errors.As(err, &validationErr) {
			writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", validationErr.Message)
			return
		}
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", err.Error())
		return
	}

	export, err := h.repo.CreateExport(req)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "AUDIT_EXPORT_FAILED", "failed to create audit export")
		return
	}

	h.repo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "AUDIT_EXPORT_REQUESTED",
		Resource: export.ID.String(),
		Decision: models.AuditDecisionAllow,
		Result:   string(export.Status),
		Input:    req,
		Output: map[string]any{
			"export_id": export.ID.String(),
			"status":    export.Status,
		},
	})

	writeJSON(w, http.StatusAccepted, export)
}

// GetExport handles GET /api/v1/audit/exports/{id}.
func (h *AuditHandler) GetExport(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid audit export id")
		return
	}

	export, err := h.repo.GetExport(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "audit export not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get audit export")
		return
	}

	writeJSON(w, http.StatusOK, export)
}
