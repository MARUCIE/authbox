package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"auth-box-api/internal/models"
	"auth-box-api/internal/repository"
	"auth-box-api/internal/security"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

const (
	rolePlatformAdmin     = "platform_admin"
	roleSecurityOps       = "security_ops"
	roleComplianceAuditor = "compliance_auditor"
	rolePolicyAdmin       = "policy_admin"
)

var allowedRoles = map[string]struct{}{
	rolePlatformAdmin:     {},
	roleSecurityOps:       {},
	roleComplianceAuditor: {},
	rolePolicyAdmin:       {},
}

type authError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

func parseAuthTokens(raw string) (map[string]security.Principal, error) {
	registry := make(map[string]security.Principal)

	entries := strings.Split(raw, ",")
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		parts := strings.SplitN(entry, ":", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid token entry %q: expected token:actor:role1|role2", entry)
		}

		token := strings.TrimSpace(parts[0])
		actorID := strings.TrimSpace(parts[1])
		rolesRaw := strings.TrimSpace(parts[2])
		if token == "" || actorID == "" || rolesRaw == "" {
			return nil, fmt.Errorf("invalid token entry %q: empty token/actor/roles", entry)
		}

		if _, exists := registry[token]; exists {
			return nil, fmt.Errorf("duplicate token configured: %q", token)
		}

		rawRoles := strings.Split(rolesRaw, "|")
		roles := make([]string, 0, len(rawRoles))
		seenRoles := make(map[string]struct{}, len(rawRoles))
		for _, role := range rawRoles {
			role = strings.TrimSpace(role)
			if role == "" {
				return nil, fmt.Errorf("invalid token entry %q: empty role", entry)
			}
			if _, ok := allowedRoles[role]; !ok {
				return nil, fmt.Errorf("invalid token entry %q: unsupported role %q", entry, role)
			}
			if _, duplicated := seenRoles[role]; duplicated {
				continue
			}
			seenRoles[role] = struct{}{}
			roles = append(roles, role)
		}
		if len(roles) == 0 {
			return nil, fmt.Errorf("invalid token entry %q: no valid roles", entry)
		}

		registry[token] = security.NewPrincipal(actorID, "api", roles)
	}

	if len(registry) == 0 {
		return nil, fmt.Errorf("no auth tokens configured")
	}

	return registry, nil
}

func writeAuthError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(authError{
		Code:      code,
		Message:   message,
		RequestID: chimiddleware.GetReqID(r.Context()),
	})
}

func (s *Server) authn(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			s.recordAuthnDeny(r, "missing bearer token", map[string]any{
				"authorization_header_present": authHeader != "",
			})
			writeAuthError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "missing bearer token")
			return
		}

		token := strings.TrimSpace(authHeader[len("Bearer "):])
		principal, ok := s.authTokens[token]
		if !ok {
			s.recordAuthnDeny(r, "invalid bearer token", map[string]any{
				"token_length": len(token),
			})
			writeAuthError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "invalid bearer token")
			return
		}

		if source := strings.TrimSpace(r.Header.Get("X-Auth-Source")); source != "" {
			principal.Source = source
		}

		next.ServeHTTP(w, r.WithContext(security.WithPrincipal(r.Context(), principal)))
	})
}

func (s *Server) recordAuthnDeny(r *http.Request, reason string, input map[string]any) {
	if s.auditRepo == nil {
		return
	}

	s.auditRepo.Record(repository.RecordAuditEventInput{
		ActorID:  "anonymous",
		Source:   "api",
		Action:   "AUTHN_TOKEN_VALIDATE",
		Resource: fmt.Sprintf("%s %s", r.Method, r.URL.Path),
		Decision: models.AuditDecisionDeny,
		Result:   "unauthorized",
		Reason:   reason,
		Input:    input,
	})
}

func (s *Server) requireAnyRole(action string, allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal, ok := security.PrincipalFromContext(r.Context())
			if !ok {
				writeAuthError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "missing principal context")
				return
			}

			for _, role := range allowedRoles {
				if principal.HasRole(role) {
					next.ServeHTTP(w, r)
					return
				}
			}

			s.auditRepo.Record(repository.RecordAuditEventInput{
				ActorID:  principal.ActorID,
				Source:   principal.Source,
				Action:   action,
				Resource: fmt.Sprintf("%s %s", r.Method, r.URL.Path),
				Decision: models.AuditDecisionDeny,
				Result:   "forbidden",
				Reason:   "required role not satisfied",
				Input: map[string]any{
					"required_roles": allowedRoles,
					"actor_roles":    principal.RoleList(),
				},
			})

			writeAuthError(w, r, http.StatusForbidden, "FORBIDDEN", "insufficient role for action")
		})
	}
}
