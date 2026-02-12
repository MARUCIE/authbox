package handlers

import (
	"errors"
	"net/http"
	"strings"

	"auth-box-api/internal/models"
	"auth-box-api/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// CredentialHandler handles credential-related HTTP requests.
type CredentialHandler struct {
	repo      *repository.CredentialRepository
	auditRepo *repository.AuditRepository
}

// NewCredentialHandler creates a new credential handler.
func NewCredentialHandler(repo *repository.CredentialRepository, auditRepo *repository.AuditRepository) *CredentialHandler {
	return &CredentialHandler{repo: repo, auditRepo: auditRepo}
}

// List handles GET /api/v1/credentials.
func (h *CredentialHandler) List(w http.ResponseWriter, r *http.Request) {
	credentials, _, err := h.repo.List(100, 0)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list credentials")
		return
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Items:         credentials,
		NextPageToken: "",
	})
}

// Create handles POST /api/v1/credentials.
func (h *CredentialHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	var req models.CreateCredentialRequest
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

	credential, err := h.repo.Create(req)
	if err != nil {
		if strings.Contains(err.Error(), "account not found") {
			writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "account_id does not exist")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create credential")
		return
	}

	h.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "CREDENTIAL_CREATED",
		Resource: credential.ID.String(),
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input:    req,
		Output: map[string]any{
			"credential_id": credential.ID.String(),
			"status":        credential.Status,
		},
	})
	writeJSON(w, http.StatusCreated, credential)
}

// Rotate handles POST /api/v1/credentials/{id}/rotate.
func (h *CredentialHandler) Rotate(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid credential id")
		return
	}

	credential, err := h.repo.Rotate(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "credential not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to rotate credential")
		return
	}

	h.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "CREDENTIAL_ROTATED",
		Resource: credential.ID.String(),
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input: map[string]any{
			"credential_id": id.String(),
		},
		Output: map[string]any{
			"credential_id": credential.ID.String(),
			"status":        credential.Status,
		},
	})
	writeJSON(w, http.StatusOK, credential)
}

// Delete handles DELETE /api/v1/credentials/{id}.
func (h *CredentialHandler) Delete(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid credential id")
		return
	}

	err = h.repo.Delete(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "credential not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete credential")
		return
	}

	h.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "CREDENTIAL_REVOKED",
		Resource: id.String(),
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input: map[string]any{
			"credential_id": id.String(),
		},
		Output: map[string]any{
			"credential_id": id.String(),
			"status":        "revoked",
		},
	})
	w.WriteHeader(http.StatusNoContent)
}
