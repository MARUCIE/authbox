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

// AccountHandler handles account-related HTTP requests
type AccountHandler struct {
	repo      *repository.AccountRepository
	auditRepo *repository.AuditRepository
}

// NewAccountHandler creates a new account handler
func NewAccountHandler(repo *repository.AccountRepository, auditRepo *repository.AuditRepository) *AccountHandler {
	return &AccountHandler{repo: repo, auditRepo: auditRepo}
}

// List handles GET /api/v1/accounts
func (h *AccountHandler) List(w http.ResponseWriter, r *http.Request) {
	// Optional filter by platform_id
	var platformID *uuid.UUID
	if pidStr := r.URL.Query().Get("platform_id"); pidStr != "" {
		pid, err := uuid.Parse(pidStr)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid platform_id")
			return
		}
		platformID = &pid
	}

	accounts, _, err := h.repo.List(platformID, 100, 0)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to list accounts")
		return
	}

	writeJSON(w, http.StatusOK, PaginatedResponse{
		Items:         accounts,
		NextPageToken: "",
	})
}

// Create handles POST /api/v1/accounts
func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	var req models.CreateAccountRequest
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

	account, err := h.repo.Create(req)
	if err != nil {
		// Check if it's a platform not found error
		if strings.Contains(err.Error(), "platform not found") {
			writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "platform_id does not exist")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create account")
		return
	}

	if h.auditRepo != nil {
		h.auditRepo.Record(repository.RecordAuditEventInput{
			ActorID:  principal.ActorID,
			Source:   principal.Source,
			Action:   "ACCOUNT_PROVISIONED",
			Resource: account.ID.String(),
			Decision: models.AuditDecisionAllow,
			Result:   "success",
			Input:    req,
			Output: map[string]any{
				"account_id": account.ID.String(),
				"status":     account.Status,
			},
		})
	}

	writeJSON(w, http.StatusCreated, account)
}

// Get handles GET /api/v1/accounts/{id}
func (h *AccountHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid account id")
		return
	}

	account, err := h.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "account not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to get account")
		return
	}

	writeJSON(w, http.StatusOK, account)
}

// Update handles PATCH /api/v1/accounts/{id}
func (h *AccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromRequest(w, r)
	if !ok {
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid account id")
		return
	}

	var req models.UpdateAccountRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid request body")
		return
	}

	account, err := h.repo.Update(id, req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "account not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update account")
		return
	}

	if h.auditRepo != nil && req.Status != nil {
		h.auditRepo.Record(repository.RecordAuditEventInput{
			ActorID:  principal.ActorID,
			Source:   principal.Source,
			Action:   "ACCOUNT_STATUS_CHANGED",
			Resource: account.ID.String(),
			Decision: models.AuditDecisionAllow,
			Result:   "success",
			Input: map[string]any{
				"account_id": id.String(),
				"status":     req.Status,
			},
			Output: map[string]any{
				"account_id": account.ID.String(),
				"status":     account.Status,
			},
		})
	}

	writeJSON(w, http.StatusOK, account)
}

// Delete handles DELETE /api/v1/accounts/{id}
func (h *AccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "VALIDATION_FAILED", "invalid account id")
		return
	}

	err = h.repo.Delete(id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "RESOURCE_NOT_FOUND", "account not found")
			return
		}
		writeError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete account")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
