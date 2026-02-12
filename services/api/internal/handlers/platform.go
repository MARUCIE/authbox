package handlers

import (
	"errors"
	"net/http"

	"auth-box-api/internal/models"
	"auth-box-api/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// PlatformHandler handles platform-related HTTP requests
type PlatformHandler struct {
	repo      *repository.PlatformRepository
	auditRepo *repository.AuditRepository
}

// NewPlatformHandler creates a new platform handler
func NewPlatformHandler(repo *repository.PlatformRepository, auditRepo *repository.AuditRepository) *PlatformHandler {
	return &PlatformHandler{repo: repo, auditRepo: auditRepo}
}

// List handles GET /api/v1/platforms
func (h *PlatformHandler) List(w http.ResponseWriter, r *http.Request) {
	platforms, _, err := h.repo.List(100, 0)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list platforms")
		return
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Items:         platforms,
		NextPageToken: "",
	})
}

// Create handles POST /api/v1/platforms
func (h *PlatformHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	var req models.CreatePlatformRequest
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

	platform, err := h.repo.Create(req)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create platform")
		return
	}

	if h.auditRepo != nil {
		h.auditRepo.Record(repository.RecordAuditEventInput{
			ActorID:  principal.ActorID,
			Source:   principal.Source,
			Action:   "PLATFORM_CREATED",
			Resource: platform.ID.String(),
			Decision: models.AuditDecisionAllow,
			Result:   "success",
			Input:    req,
			Output: map[string]any{
				"platform_id": platform.ID.String(),
				"status":      platform.Status,
			},
		})
	}

	writeJSON(w, http.StatusCreated, platform)
}

// Get handles GET /api/v1/platforms/{id}
func (h *PlatformHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid platform id")
		return
	}

	platform, err := h.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "platform not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get platform")
		return
	}

	writeJSON(w, http.StatusOK, platform)
}

// Update handles PATCH /api/v1/platforms/{id}
func (h *PlatformHandler) Update(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid platform id")
		return
	}

	var req models.UpdatePlatformRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid request body")
		return
	}

	platform, err := h.repo.Update(id, req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "platform not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update platform")
		return
	}

	if h.auditRepo != nil {
		h.auditRepo.Record(repository.RecordAuditEventInput{
			ActorID:  principal.ActorID,
			Source:   principal.Source,
			Action:   "PLATFORM_UPDATED",
			Resource: platform.ID.String(),
			Decision: models.AuditDecisionAllow,
			Result:   "success",
			Input: map[string]any{
				"platform_id": id.String(),
				"request":     req,
			},
			Output: map[string]any{
				"platform_id": platform.ID.String(),
				"status":      platform.Status,
			},
		})
	}

	writeJSON(w, http.StatusOK, platform)
}

// Delete handles DELETE /api/v1/platforms/{id}
func (h *PlatformHandler) Delete(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid platform id")
		return
	}

	err = h.repo.Delete(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "platform not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete platform")
		return
	}

	if h.auditRepo != nil {
		h.auditRepo.Record(repository.RecordAuditEventInput{
			ActorID:  principal.ActorID,
			Source:   principal.Source,
			Action:   "PLATFORM_DELETED",
			Resource: id.String(),
			Decision: models.AuditDecisionAllow,
			Result:   "success",
			Input: map[string]any{
				"platform_id": id.String(),
			},
			Output: map[string]any{
				"platform_id": id.String(),
				"status":      "deleted",
			},
		})
	}

	w.WriteHeader(http.StatusNoContent)
}
