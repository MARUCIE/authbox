package handler

import (
	"errors"
	"net/http"

	"auth-box-api/internal/domain"
	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
)

// writeAgentError maps agent-service errors: client mistakes become 400 or
// 409, a missing row 404, anything else a logged 500 with a generic message.
func writeAgentError(w http.ResponseWriter, err error, notFound error, notFoundMsg, op string) {
	switch {
	case errors.Is(err, service.ErrInvalidAgent):
		httpx.WriteError(w, http.StatusBadRequest, err.Error(), httpx.CodeBadRequest)
	case errors.Is(err, domain.ErrConflict):
		httpx.WriteError(w, http.StatusConflict, "an agent with this name already exists", httpx.CodeConflict)
	case notFound != nil && errors.Is(err, notFound):
		httpx.WriteError(w, http.StatusNotFound, notFoundMsg, httpx.CodeNotFound)
	default:
		writeInternal(w, err, op+" failed", "failed to "+op)
	}
}

type AgentHandler struct {
	agentService *service.AgentService
	audit        auditRecorder
}

func NewAgentHandler(agentService *service.AgentService, audit auditRecorder) *AgentHandler {
	return &AgentHandler{agentService: agentService, audit: audit}
}

func (h *AgentHandler) CreateAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.CreateAgentRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	resp, err := h.agentService.CreateAgent(r.Context(), userID, req)
	if err != nil {
		writeAgentError(w, err, nil, "", "create agent")
		return
	}
	recordAudit(h.audit, r, userID, "agent.create", "agent", resp.ID)

	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *AgentHandler) ListAgents(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agents, err := h.agentService.ListAgents(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "list agents failed", "failed to list agents")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"agents": agents,
	})
}

func (h *AgentHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	resp, err := h.agentService.GetAgent(r.Context(), agentID, userID)
	if err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "get agent")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *AgentHandler) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	var req service.UpdateAgentRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.agentService.UpdateAgent(r.Context(), agentID, userID, req); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "update agent")
		return
	}
	recordAudit(h.audit, r, userID, "agent.update", "agent", agentID.String())

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AgentHandler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	if err := h.agentService.DeleteAgent(r.Context(), agentID, userID); err != nil {
		if errors.Is(err, domain.ErrAgentNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "agent not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "delete agent failed", "failed to delete agent")
		return
	}
	recordAudit(h.audit, r, userID, "agent.delete", "agent", agentID.String())

	w.WriteHeader(http.StatusNoContent)
}

// --- Policy handlers ---

func (h *AgentHandler) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	// Verify the agent belongs to this user
	if _, err := h.agentService.GetAgent(r.Context(), agentID, userID); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "verify agent ownership")
		return
	}

	var req service.PolicyRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	resp, err := h.agentService.CreatePolicy(r.Context(), agentID, req)
	if err != nil {
		writeAgentError(w, err, nil, "", "create policy")
		return
	}
	recordAudit(h.audit, r, userID, "policy.create", "policy", resp.ID)

	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *AgentHandler) ListPolicies(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	// Verify the agent belongs to this user
	if _, err := h.agentService.GetAgent(r.Context(), agentID, userID); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "verify agent ownership")
		return
	}

	policies, err := h.agentService.ListPolicies(r.Context(), agentID)
	if err != nil {
		writeInternal(w, err, "list policies failed", "failed to list policies")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"policies": policies,
	})
}

func (h *AgentHandler) UpdatePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	policyID, ok := uuidParam(w, r, "pid", "invalid policy id")
	if !ok {
		return
	}

	// Verify the agent belongs to this user
	if _, err := h.agentService.GetAgent(r.Context(), agentID, userID); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "verify agent ownership")
		return
	}

	var req service.PolicyRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.agentService.UpdatePolicy(r.Context(), agentID, policyID, req); err != nil {
		writeAgentError(w, err, domain.ErrPolicyNotFound, "policy not found", "update policy")
		return
	}
	recordAudit(h.audit, r, userID, "policy.update", "policy", policyID.String())

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AgentHandler) DeletePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	agentID, ok := uuidParam(w, r, "id", "invalid agent id")
	if !ok {
		return
	}

	policyID, ok := uuidParam(w, r, "pid", "invalid policy id")
	if !ok {
		return
	}

	// Verify the agent belongs to this user
	if _, err := h.agentService.GetAgent(r.Context(), agentID, userID); err != nil {
		writeAgentError(w, err, domain.ErrAgentNotFound, "agent not found", "verify agent ownership")
		return
	}

	if err := h.agentService.DeletePolicy(r.Context(), policyID, agentID); err != nil {
		if errors.Is(err, domain.ErrPolicyNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "policy not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "delete policy failed", "failed to delete policy")
		return
	}
	recordAudit(h.audit, r, userID, "policy.delete", "policy", policyID.String())

	w.WriteHeader(http.StatusNoContent)
}
