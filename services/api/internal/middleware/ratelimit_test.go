package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestRateLimiter_AllowsWithinLimit(t *testing.T) {
	rl := NewRateLimiter(3, 1*time.Minute)
	handler := rl.Handler(okHandler())

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("request %d: want 200, got %d", i+1, rr.Code)
		}
	}
}

func TestRateLimiter_RejectsOverLimit(t *testing.T) {
	rl := NewRateLimiter(2, 1*time.Minute)
	handler := rl.Handler(okHandler())

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("request %d: want 200, got %d", i+1, rr.Code)
		}
	}

	// 3rd request should be rate limited
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("want 429, got %d", rr.Code)
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Error("missing Retry-After header")
	}
}

func TestRateLimiter_RetryAfterIsAccurate(t *testing.T) {
	rl := NewRateLimiter(1, 30*time.Second)
	handler := rl.Handler(okHandler())

	// First request passes
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Second request gets 429 with Retry-After
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	retryAfter, err := strconv.Atoi(rr.Header().Get("Retry-After"))
	if err != nil {
		t.Fatalf("invalid Retry-After: %v", err)
	}
	// Should be between 1 and 31 seconds (30s window + 1s buffer)
	if retryAfter < 1 || retryAfter > 31 {
		t.Errorf("Retry-After %d out of expected range [1, 31]", retryAfter)
	}
}

func TestRateLimiter_PerIPIsolation(t *testing.T) {
	rl := NewRateLimiter(1, 1*time.Minute)
	handler := rl.Handler(okHandler())

	// IP A: 1 request (at limit)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("IP A first request: want 200, got %d", rr.Code)
	}

	// IP A: 2nd request (over limit)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 429 {
		t.Errorf("IP A second request: want 429, got %d", rr.Code)
	}

	// IP B: should still be allowed (different IP)
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.RemoteAddr = "10.0.0.2:12345"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Errorf("IP B first request: want 200, got %d", rr2.Code)
	}
}

func TestRateLimiter_WindowResetsAfterExpiry(t *testing.T) {
	// Use a tiny window so the test is fast
	rl := NewRateLimiter(1, 50*time.Millisecond)
	handler := rl.Handler(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"

	// First request passes
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("want 200, got %d", rr.Code)
	}

	// Second request immediately: 429
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 429 {
		t.Errorf("want 429, got %d", rr.Code)
	}

	// Wait for window to expire
	time.Sleep(60 * time.Millisecond)

	// Third request: should pass (window reset)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("after window expiry: want 200, got %d", rr.Code)
	}
}

func TestRateLimiter_RejectedRequestsDoNotExtendWindow(t *testing.T) {
	rl := NewRateLimiter(1, 100*time.Millisecond)
	handler := rl.Handler(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"

	// Exhaust the limit
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Hammer with rejected requests during the window
	for i := 0; i < 5; i++ {
		time.Sleep(15 * time.Millisecond)
		rr = httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != 429 {
			t.Errorf("during window, request %d: want 429, got %d", i, rr.Code)
		}
	}

	// Wait for original window to expire (100ms from first request)
	time.Sleep(30 * time.Millisecond)

	// Should pass now — rejected requests did NOT extend the window
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("after window expiry (despite rejected requests): want 200, got %d", rr.Code)
	}
}

func TestRateLimiter_XForwardedFor(t *testing.T) {
	rl := NewRateLimiter(1, 1*time.Minute)
	handler := rl.Handler(okHandler())

	// Request with X-Forwarded-For
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.99:12345"
	req.Header.Set("X-Forwarded-For", "203.0.113.50, 10.0.0.1")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Errorf("want 200, got %d", rr.Code)
	}

	// Same X-Forwarded-For: should be rate limited
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != 429 {
		t.Errorf("want 429, got %d", rr.Code)
	}

	// Different X-Forwarded-For: should pass
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2.RemoteAddr = "10.0.0.99:12345"
	req2.Header.Set("X-Forwarded-For", "198.51.100.1")
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != 200 {
		t.Errorf("different XFF: want 200, got %d", rr2.Code)
	}
}

func TestRateLimiter_ResponseBody(t *testing.T) {
	rl := NewRateLimiter(1, 1*time.Minute)
	handler := rl.Handler(okHandler())

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:12345"

	// Exhaust limit
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	// Check 429 response body
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Content-Type") != "application/json" {
		t.Errorf("want Content-Type application/json, got %s", rr.Header().Get("Content-Type"))
	}
	body := rr.Body.String()
	if body != `{"error":"rate limit exceeded","code":"RATE_LIMITED"}` {
		t.Errorf("unexpected body: %s", body)
	}
}
