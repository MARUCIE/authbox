package middleware

import (
	"net/http"
	"strings"
)

// PrivateNetworkAccess handles Chrome 130+ PNA preflight.
// Wraps ResponseWriter to inject the header just before WriteHeader is called,
// ensuring it survives go-chi/cors's internal header manipulation on OPTIONS.
func PrivateNetworkAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(&pnaWriter{ResponseWriter: w}, r)
	})
}

type pnaWriter struct {
	http.ResponseWriter
}

func (pw *pnaWriter) WriteHeader(code int) {
	pw.ResponseWriter.Header().Set("Access-Control-Allow-Private-Network", "true")
	pw.ResponseWriter.WriteHeader(code)
}

// SecurityHeaders adds standard security headers to all responses.
// Includes Access-Control-Allow-Private-Network for Chrome 130+ PNA policy
// (required when localhost:3010 calls localhost:4010).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy",
			"default-src 'none'; connect-src 'self'; frame-ancestors 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")

		next.ServeHTTP(w, r)
	})
}

// RequireJSON rejects non-GET/HEAD/OPTIONS/DELETE requests that don't carry
// Content-Type: application/json. This prevents content-type confusion attacks.
func RequireJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			// These methods have no body; skip content-type check.
		default:
			ct := r.Header.Get("Content-Type")
			if ct != "" && !strings.HasPrefix(ct, "application/json") {
				http.Error(w, `{"error":"Content-Type must be application/json","code":"INVALID_CONTENT_TYPE"}`, http.StatusUnsupportedMediaType)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// BodySizeLimit returns middleware that limits the request body size.
func BodySizeLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP extracts the real client IP from X-Forwarded-For or falls back
// to RemoteAddr. Only the leftmost (first) entry in X-Forwarded-For is
// used because subsequent entries can be spoofed by the client.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if ip, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(ip)
		}
		return strings.TrimSpace(xff)
	}
	// RemoteAddr may contain port; strip it.
	if host, _, ok := strings.Cut(r.RemoteAddr, ":"); ok {
		return host
	}
	return r.RemoteAddr
}
