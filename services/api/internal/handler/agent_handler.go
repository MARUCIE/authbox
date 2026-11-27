package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/domain"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// writeAgentError maps agent-service errors: client mistakes become 400 or
// 409, a missing row 404, anything else a logged 500 with a generic message.
func writeAgentError(w http.ResponseWriter, err error, notFound error, notFoundMsg, op string) {
	switch {
	case errors.Is(err, service.ErrInvalidAgent):
		writeError(w, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, "an agent with this name already exists", "CONFLICT")
	case notFound != nil && errors.Is(err, notFound):
		writeError(w, http.StatusNotFound, notFoundMsg, "NOT_FOUND")
	default:
		slog.Error(op+" failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to "+op, "INTERNAL_ERROR")
	}
}

type AgentHandler struct {
	agentService *service.AgentService
}

func NewAgentHandler(agentService *service.AgentService) *AgentHandler {
	return &AgentHandler{agentService: agentService}
}

func (h *AgentHandler) CreateAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.CreateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	resp, err := h.agentService.CreateAgent(r.Context(), userID, req)
	if err != nil {
		writeAgentError(w, err, nil, "", "create agent")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *AgentHandler) ListAgents(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agents, err := h.agentService.ListAgents(r.Context(), userID)
	if err != nil {
		slog.Error("list agents failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list agents", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"agents": agents,
	})
}

func (h *AgentHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	resp, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		slog.Error("get agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get agent", "INTERNAL_ERROR")
		return
	}
	if resp == nil {
		writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *AgentHandler) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	var req service.UpdateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.agentService.UpdateAgent(r.Context(), agentID, userID, req); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "update agent")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AgentHandler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	if err := h.agentService.DeleteAgent(r.Context(), agentID, userID); err != nil {
		if errors.Is(err, domain.ErrAgentNotFound) {
			writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
			return
		}
		slog.Error("delete agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete agent", "INTERNAL_ERROR")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Policy handlers ---

func (h *AgentHandler) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	// Verify the agent belongs to this user
	agent, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		slog.Error("get agent for policy failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to verify agent ownership", "INTERNAL_ERROR")
		return
	}
	if agent == nil {
		writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
		return
	}

	var req service.PolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	resp, err := h.agentService.CreatePolicy(r.Context(), agentID, req)
	if err != nil {
		writeAgentError(w, err, nil, "", "create policy")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *AgentHandler) ListPolicies(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	// Verify the agent belongs to this user
	agent, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		slog.Error("get agent for policies failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to verify agent ownership", "INTERNAL_ERROR")
		return
	}
	if agent == nil {
		writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
		return
	}

	policies, err := h.agentService.ListPolicies(r.Context(), agentID)
	if err != nil {
		slog.Error("list policies failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list policies", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"policies": policies,
	})
}

func (h *AgentHandler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	policyID, err := uuid.Parse(chi.URLParam(r, "pid"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid policy id", "BAD_REQUEST")
		return
	}

	// Verify the agent belongs to this user
	agent, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		slog.Error("get agent for policy update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to verify agent ownership", "INTERNAL_ERROR")
		return
	}
	if agent == nil {
		writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
		return
	}

	var req service.PolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.agentService.UpdatePolicy(r.Context(), agentID, policyID, req); err != nil {
		writeAgentError(w, err, domain.ErrPolicyNotFound, "policy not found", "update policy")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AgentHandler) DeletePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	agentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid agent id", "BAD_REQUEST")
		return
	}

	policyID, err := uuid.Parse(chi.URLParam(r, "pid"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid policy id", "BAD_REQUEST")
		return
	}

	// Verify the agent belongs to this user
	agent, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		slog.Error("get agent for policy delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to verify agent ownership", "INTERNAL_ERROR")
		return
	}
	if agent == nil {
		writeError(w, http.StatusNotFound, "agent not found", "NOT_FOUND")
		return
	}

	if err := h.agentService.DeletePolicy(r.Context(), policyID, agentID); err != nil {
		if errors.Is(err, domain.ErrPolicyNotFound) {
			writeError(w, http.StatusNotFound, "policy not found", "NOT_FOUND")
			return
		}
		slog.Error("delete policy failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete policy", "INTERNAL_ERROR")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
