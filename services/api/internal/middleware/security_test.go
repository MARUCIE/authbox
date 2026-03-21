package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	checks := map[string]string{
		"X-Content-Type-Options":              "nosniff",
		"X-Frame-Options":                     "DENY",
		"X-XSS-Protection":                    "1; mode=block",
		"Referrer-Policy":                     "no-referrer",
		"X-Permitted-Cross-Domain-Policies":   "none",
		"Access-Control-Allow-Private-Network": "true",
	}

	for header, want := range checks {
		got := rr.Header().Get(header)
		if got != want {
			t.Errorf("%s: want %q, got %q", header, want, got)
		}
	}

	// HSTS should be present
	hsts := rr.Header().Get("Strict-Transport-Security")
	if !strings.Contains(hsts, "max-age=") {
		t.Errorf("HSTS missing max-age: %s", hsts)
	}

	// CSP should deny everything by default
	csp := rr.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "default-src 'none'") {
		t.Errorf("CSP missing default-src 'none': %s", csp)
	}
}

func TestRequireJSON_AllowsJSONPost(t *testing.T) {
	handler := RequireJSON(okHandler())

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Errorf("JSON POST: want 200, got %d", rr.Code)
	}
}

func TestRequireJSON_RejectsNonJSON(t *testing.T) {
	handler := RequireJSON(okHandler())

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("foo=bar"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnsupportedMediaType {
		t.Errorf("form POST: want 415, got %d", rr.Code)
	}
}

func TestRequireJSON_AllowsGETWithoutContentType(t *testing.T) {
	handler := RequireJSON(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Errorf("GET without Content-Type: want 200, got %d", rr.Code)
	}
}

func TestRequireJSON_AllowsOPTIONS(t *testing.T) {
	handler := RequireJSON(okHandler())

	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Errorf("OPTIONS: want 200, got %d", rr.Code)
	}
}

func TestRequireJSON_AllowsPostWithoutContentType(t *testing.T) {
	handler := RequireJSON(okHandler())

	// POST with empty Content-Type (no body) should be allowed
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != 200 {
		t.Errorf("POST without Content-Type: want 200, got %d", rr.Code)
	}
}

func TestPrivateNetworkAccess(t *testing.T) {
	handler := PrivateNetworkAccess(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	got := rr.Header().Get("Access-Control-Allow-Private-Network")
	if got != "true" {
		t.Errorf("PNA header: want 'true', got %q", got)
	}
}

func TestClientIP_RemoteAddr(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "192.168.1.100:54321"

	ip := ClientIP(req)
	if ip != "192.168.1.100" {
		t.Errorf("want 192.168.1.100, got %s", ip)
	}
}

func TestClientIP_XForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.1, 10.0.0.2")

	ip := ClientIP(req)
	if ip != "203.0.113.50" {
		t.Errorf("want first XFF entry 203.0.113.50, got %s", ip)
	}
}

func TestClientIP_SingleXForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	req.Header.Set("X-Forwarded-For", "198.51.100.1")

	ip := ClientIP(req)
	if ip != "198.51.100.1" {
		t.Errorf("want 198.51.100.1, got %s", ip)
	}
}

func TestBodySizeLimit(t *testing.T) {
	handler := BodySizeLimit(10)(okHandler())

	// Small body: OK
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("hi"))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("small body: want 200, got %d", rr.Code)
	}
}
