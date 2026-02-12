package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"auth-box-api/internal/models"
	"auth-box-api/internal/repository"
	"auth-box-api/internal/security"
)

func TestParseAuthTokens(t *testing.T) {
	registry, err := parseAuthTokens("token-a:actor-a:platform_admin|security_ops")
	if err != nil {
		t.Fatalf("parseAuthTokens returned error: %v", err)
	}

	principal, ok := registry["token-a"]
	if !ok {
		t.Fatalf("expected token-a in registry")
	}
	if principal.ActorID != "actor-a" {
		t.Fatalf("unexpected actor id: %q", principal.ActorID)
	}
	if !principal.HasRole(rolePlatformAdmin) || !principal.HasRole(roleSecurityOps) {
		t.Fatalf("expected platform_admin and security_ops roles")
	}
}

func TestParseAuthTokensRejectsUnknownRole(t *testing.T) {
	_, err := parseAuthTokens("token-a:actor-a:platform_admin|unknown_role")
	if err == nil {
		t.Fatalf("expected parseAuthTokens to reject unknown role")
	}
}

func TestParseAuthTokensRejectsEmptyRole(t *testing.T) {
	_, err := parseAuthTokens("token-a:actor-a:platform_admin|")
	if err == nil {
		t.Fatalf("expected parseAuthTokens to reject empty role")
	}
}

func TestRequireAnyRoleDeniedRecordsAudit(t *testing.T) {
	s := &Server{
		auditRepo: repository.NewAuditRepository(),
		authTokens: map[string]security.Principal{
			"platform-token": security.NewPrincipal("actor-platform", "api", []string{rolePlatformAdmin}),
		},
	}

	called := false
	protected := s.authn(
		s.requireAnyRole("CREDENTIAL_ROTATE", roleSecurityOps)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				w.WriteHeader(http.StatusOK)
			}),
		),
	)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/123/rotate", nil)
	req.Header.Set("Authorization", "Bearer platform-token")
	rec := httptest.NewRecorder()
	protected.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
	if called {
		t.Fatalf("protected handler should not run on denied role")
	}

	events, _, err := s.auditRepo.List(10, 0)
	if err != nil {
		t.Fatalf("list audit events failed: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 audit event, got %d", len(events))
	}
	if events[0].Decision != models.AuditDecisionDeny {
		t.Fatalf("expected deny decision, got %q", events[0].Decision)
	}
	if events[0].ActorID != "actor-platform" {
		t.Fatalf("unexpected actor id: %q", events[0].ActorID)
	}
	if events[0].EventHash == "" {
		t.Fatalf("expected event hash to be populated")
	}
}

func TestRequireAnyRoleAllowsAuthorizedRole(t *testing.T) {
	s := &Server{
		auditRepo: repository.NewAuditRepository(),
		authTokens: map[string]security.Principal{
			"security-token": security.NewPrincipal("actor-security", "api", []string{roleSecurityOps}),
		},
	}

	called := false
	protected := s.authn(
		s.requireAnyRole("CREDENTIAL_ROTATE", roleSecurityOps)(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				w.WriteHeader(http.StatusNoContent)
			}),
		),
	)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/credentials/123/rotate", nil)
	req.Header.Set("Authorization", "Bearer security-token")
	rec := httptest.NewRecorder()
	protected.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
	if !called {
		t.Fatalf("protected handler should run on allowed role")
	}

	events, _, err := s.auditRepo.List(10, 0)
	if err != nil {
		t.Fatalf("list audit events failed: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected no deny events for allowed role, got %d", len(events))
	}
}
