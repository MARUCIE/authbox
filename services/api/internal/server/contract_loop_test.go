package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"auth-box-api/internal/config"
)

func newContractTestServer() *Server {
	cfg := config.Config{
		HTTPAddr: ":0",
		Env:      "test",
		Version:  "test",
		AuthTokens: "local-admin-token:actor-platform-admin:platform_admin|security_ops|compliance_auditor|policy_admin," +
			"local-security-token:actor-security-ops:security_ops," +
			"local-auditor-token:actor-compliance-auditor:compliance_auditor",
	}
	return New(cfg)
}

func doJSONRequest(t *testing.T, handler http.Handler, method, path, token string, body any) (*httptest.ResponseRecorder, map[string]any) {
	return doJSONRequestWithHeaders(t, handler, method, path, token, nil, body)
}

func doJSONRequestWithHeaders(
	t *testing.T,
	handler http.Handler,
	method, path, token string,
	headers map[string]string,
	body any,
) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()

	var payloadBytes []byte
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request failed: %v", err)
		}
		payloadBytes = data
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(payloadBytes))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	var parsed map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &parsed)
	}
	return rec, parsed
}

func TestContractLoopAuthAndErrorCodes(t *testing.T) {
	s := newContractTestServer()

	rec, parsed := doJSONRequest(t, s.router, http.MethodGet, "/api/v1/platforms", "", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	if parsed["code"] != "UNAUTHORIZED" {
		t.Fatalf("expected code=UNAUTHORIZED, got %v", parsed["code"])
	}
	requestID, ok := parsed["request_id"].(string)
	if !ok || requestID == "" {
		t.Fatalf("expected request_id for unauthorized response")
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/platforms",
		"local-admin-token",
		map[string]any{
			"name": "OpenAI",
			"type": "openai",
			"config": map[string]any{
				"base_url":  "https://api.openai.com",
				"auth_type": "api_key",
			},
		},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 create platform, got %d body=%s", rec.Code, rec.Body.String())
	}
	platformID, ok := parsed["id"].(string)
	if !ok || platformID == "" {
		t.Fatalf("expected platform id in response")
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/accounts",
		"local-admin-token",
		map[string]any{
			"platform_id":  platformID,
			"display_name": "security-bot",
		},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 create account, got %d body=%s", rec.Code, rec.Body.String())
	}
	accountID, ok := parsed["id"].(string)
	if !ok || accountID == "" {
		t.Fatalf("expected account id in response")
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/credentials",
		"local-security-token",
		map[string]any{
			"account_id": accountID,
			"type":       "api_key",
			"expires_at": "2027-12-31T00:00:00Z",
		},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 create credential, got %d body=%s", rec.Code, rec.Body.String())
	}
	credentialID, ok := parsed["id"].(string)
	if !ok || credentialID == "" {
		t.Fatalf("expected credential id in response")
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/credentials/"+credentialID+"/rotate",
		"local-auditor-token",
		nil,
	)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 forbidden rotate, got %d body=%s", rec.Code, rec.Body.String())
	}
	if parsed["code"] != "FORBIDDEN" {
		t.Fatalf("expected code=FORBIDDEN, got %v", parsed["code"])
	}
	requestID, ok = parsed["request_id"].(string)
	if !ok || requestID == "" {
		t.Fatalf("expected request_id for forbidden response")
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/credentials/not-a-uuid/rotate",
		"local-security-token",
		nil,
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 invalid id, got %d body=%s", rec.Code, rec.Body.String())
	}
	if parsed["code"] != "VALIDATION_FAILED" {
		t.Fatalf("expected code=VALIDATION_FAILED, got %v", parsed["code"])
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/audit/exports",
		"local-auditor-token",
		map[string]any{
			"from": "2026-01-01T00:00:00Z",
			"to":   "2026-12-31T23:59:59Z",
		},
	)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 invalid export request, got %d body=%s", rec.Code, rec.Body.String())
	}
	if parsed["code"] != "VALIDATION_FAILED" {
		t.Fatalf("expected code=VALIDATION_FAILED, got %v", parsed["code"])
	}
}

func TestContractLoopAuditPathAndPermissions(t *testing.T) {
	s := newContractTestServer()

	rec, _ := doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/audit/exports",
		"local-security-token",
		map[string]any{
			"from":   "2026-01-01T00:00:00Z",
			"to":     "2026-12-31T23:59:59Z",
			"format": "csv",
		},
	)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-auditor export, got %d body=%s", rec.Code, rec.Body.String())
	}

	rec, parsed := doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/audit/exports",
		"local-auditor-token",
		map[string]any{
			"from":   "2026-01-01T00:00:00Z",
			"to":     "2026-12-31T23:59:59Z",
			"format": "csv",
		},
	)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 export create, got %d body=%s", rec.Code, rec.Body.String())
	}
	exportID, ok := parsed["id"].(string)
	if !ok || exportID == "" {
		t.Fatalf("expected export id")
	}

	rec, parsed = doJSONRequest(t, s.router, http.MethodGet, "/api/v1/audit", "local-auditor-token", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 list audit, got %d body=%s", rec.Code, rec.Body.String())
	}
	items, ok := parsed["items"].([]any)
	if !ok {
		t.Fatalf("expected audit items array")
	}
	if len(items) == 0 {
		t.Fatalf("expected at least one audit event")
	}
}

func TestContractLoopPermissionMatrixAndSourcePropagation(t *testing.T) {
	s := newContractTestServer()

	rec, parsed := doJSONRequestWithHeaders(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/platforms",
		"local-admin-token",
		map[string]string{"X-Auth-Source": "console-ui"},
		map[string]any{
			"name": "Anthropic",
			"type": "anthropic",
			"config": map[string]any{
				"base_url":  "https://api.anthropic.com",
				"auth_type": "api_key",
			},
		},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected admin create platform 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	platformID, ok := parsed["id"].(string)
	if !ok || platformID == "" {
		t.Fatalf("expected platform id")
	}

	rec, parsed = doJSONRequestWithHeaders(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/accounts",
		"local-admin-token",
		map[string]string{"X-Auth-Source": "console-ui"},
		map[string]any{
			"platform_id":  platformID,
			"display_name": "ops-runner",
		},
	)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected admin create account 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	rec, parsed = doJSONRequest(
		t,
		s.router,
		http.MethodPost,
		"/api/v1/platforms",
		"local-security-token",
		map[string]any{
			"name": "DeniedByRBAC",
			"type": "openai",
			"config": map[string]any{
				"base_url":  "https://api.openai.com",
				"auth_type": "api_key",
			},
		},
	)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected security_ops create platform to be forbidden, got %d body=%s", rec.Code, rec.Body.String())
	}
	if parsed["code"] != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN, got %v", parsed["code"])
	}

	rec, parsed = doJSONRequest(t, s.router, http.MethodGet, "/api/v1/audit", "local-auditor-token", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected audit list 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	items, ok := parsed["items"].([]any)
	if !ok {
		t.Fatalf("expected audit items array")
	}

	var foundPlatformCreated bool
	var foundAccountProvisioned bool
	var foundDeniedCreate bool
	for _, raw := range items {
		event, ok := raw.(map[string]any)
		if !ok {
			continue
		}

		action, _ := event["action"].(string)
		source, _ := event["source"].(string)
		decision, _ := event["decision"].(string)
		if action == "PLATFORM_CREATED" && source == "console-ui" {
			foundPlatformCreated = true
		}
		if action == "ACCOUNT_PROVISIONED" && source == "console-ui" {
			foundAccountProvisioned = true
		}
		if action == "PLATFORM_CREATE" && decision == "deny" {
			foundDeniedCreate = true
		}
	}

	if !foundPlatformCreated {
		t.Fatalf("expected PLATFORM_CREATED event with source console-ui")
	}
	if !foundAccountProvisioned {
		t.Fatalf("expected ACCOUNT_PROVISIONED event with source console-ui")
	}
	if !foundDeniedCreate {
		t.Fatalf("expected denied PLATFORM_CREATE audit event")
	}
}
