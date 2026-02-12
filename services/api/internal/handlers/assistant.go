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

// AssistantHandler handles assistant-related HTTP requests.
type AssistantHandler struct {
	repo      *repository.AssistantRepository
	auditRepo *repository.AuditRepository
}

// NewAssistantHandler creates a new assistant handler.
func NewAssistantHandler(repo *repository.AssistantRepository, auditRepo *repository.AuditRepository) *AssistantHandler {
	return &AssistantHandler{repo: repo, auditRepo: auditRepo}
}

// List handles GET /api/v1/assistants.
func (h *AssistantHandler) List(w http.ResponseWriter, r *http.Request) {
	assistants, _, err := h.repo.List(100, 0)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list assistants")
		return
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Items:         assistants,
		NextPageToken: "",
	})
}

// Create handles POST /api/v1/assistants.
func (h *AssistantHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	var req models.CreateAssistantRequest
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

	assistant, err := h.repo.Create(req)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create assistant")
		return
	}

	h.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "ASSISTANT_CREATED",
		Resource: assistant.ID.String(),
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input:    req,
		Output: map[string]any{
			"assistant_id": assistant.ID.String(),
			"status":       assistant.Status,
		},
	})
	writeJSON(w, http.StatusCreated, assistant)
}

// Get handles GET /api/v1/assistants/{id}.
func (h *AssistantHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid assistant id")
		return
	}

	assistant, err := h.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "assistant not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get assistant")
		return
	}

	writeJSON(w, http.StatusOK, assistant)
}

// Bind handles POST /api/v1/assistants/{id}/bind.
func (h *AssistantHandler) Bind(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid assistant id")
		return
	}

	var req models.BindAssistantRequest
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

	assistant, err := h.repo.Bind(id, req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "assistant not found")
			return
		}
		if strings.Contains(err.Error(), "credential not found") {
			writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "credential_id does not exist")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to bind assistant")
		return
	}

	h.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  principal.ActorID,
		Source:   principal.Source,
		Action:   "ASSISTANT_BOUND",
		Resource: assistant.ID.String(),
		Decision: models.AuditDecisionAllow,
		Result:   "success",
		Input: map[string]any{
			"assistant_id":  id.String(),
			"credential_id": req.CredentialID.String(),
		},
		Output: map[string]any{
			"assistant_id":  assistant.ID.String(),
			"credential_id": assistant.CredentialID.String(),
			"status":        assistant.Status,
		},
	})
	writeJSON(w, http.StatusOK, assistant)
}
