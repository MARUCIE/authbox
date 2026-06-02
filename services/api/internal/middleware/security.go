package middleware

import (
	"mime"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync/atomic"
)

// PrivateNetworkAccess handles Chrome 130+ PNA preflight.
// Wraps ResponseWriter to inject the header just before WriteHeader is called,
// ensuring it survives go-chi/cors's internal header manipulation on OPTIONS.
func PrivateNetworkAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(&pnaWriter{ResponseWriter: w, request: r}, r)
	})
}

type pnaWriter struct {
	http.ResponseWriter
	request *http.Request
}

func (pw *pnaWriter) WriteHeader(code int) {
	if shouldAllowPrivateNetwork(pw.request) {
		pw.ResponseWriter.Header().Set("Access-Control-Allow-Private-Network", "true")
	}
	pw.ResponseWriter.WriteHeader(code)
}

// SecurityHeaders adds standard security headers to all responses.
// PNA is emitted only for explicit Chrome private-network preflights.
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
		w.Header().Add("Vary", "Origin")
		w.Header().Add("Vary", "Access-Control-Request-Private-Network")
		if shouldAllowPrivateNetwork(r) {
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}

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
			if hasRequestBody(r) && ct == "" {
				http.Error(w, `{"error":"Content-Type must be application/json","code":"INVALID_CONTENT_TYPE"}`, http.StatusUnsupportedMediaType)
				return
			}
			if ct != "" && !isJSONContentType(ct) {
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

func shouldAllowPrivateNetwork(r *http.Request) bool {
	return r.Method == http.MethodOptions &&
		strings.EqualFold(r.Header.Get("Access-Control-Request-Private-Network"), "true")
}

func hasRequestBody(r *http.Request) bool {
	return r.Body != nil && r.Body != http.NoBody && r.ContentLength != 0
}

func isJSONContentType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	return err == nil && strings.EqualFold(mediaType, "application/json")
}

// trustedProxies is the CIDR allowlist of proxies permitted to set
// X-Forwarded-For. Configured once at startup (before the server accepts
// connections) via SetTrustedProxies, then read-only. Empty = trust no proxy:
// X-Forwarded-For is ignored and the real socket peer is authoritative. (AUD-AUTH-02)
var trustedProxies atomic.Pointer[[]netip.Prefix]

// SetTrustedProxies configures the trusted-proxy CIDR allowlist. Accepts CIDRs
// ("10.0.0.0/8") or bare IPs ("203.0.113.7"). Invalid entries are skipped. Call
// once at startup before serving; the value is then read-only.
func SetTrustedProxies(cidrs []string) {
	prefixes := make([]netip.Prefix, 0, len(cidrs))
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if p, err := netip.ParsePrefix(c); err == nil {
			prefixes = append(prefixes, p)
		} else if a, err := netip.ParseAddr(c); err == nil {
			prefixes = append(prefixes, netip.PrefixFrom(a, a.BitLen())) // bare IP → /32 or /128
		}
	}
	trustedProxies.Store(&prefixes)
}

func isTrustedProxy(a netip.Addr) bool {
	p := trustedProxies.Load()
	if p == nil {
		return false
	}
	for _, prefix := range *p {
		if prefix.Contains(a) {
			return true
		}
	}
	return false
}

// ClientIP returns the IP to key rate-limiting and auditing on. X-Forwarded-For
// is honored ONLY when the direct socket peer is a configured trusted proxy;
// otherwise the header is attacker-controlled and ignored, so rotating it cannot
// mint fresh rate-limit buckets (AUD-AUTH-02). When the peer is trusted, the XFF
// chain is read right-to-left and the first non-trusted hop is the real client.
//
// This is the single client-IP authority: the router does NOT use chi's RealIP,
// which rewrites RemoteAddr from the spoofable header unconditionally.
func ClientIP(r *http.Request) string {
	peer := remoteAddrHost(r.RemoteAddr)
	peerAddr, err := netip.ParseAddr(peer)
	if err != nil || !isTrustedProxy(peerAddr) {
		return peer // untrusted (or unparsable) peer → header ignored, socket IP wins
	}
	parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		cand := strings.TrimSpace(parts[i])
		a, err := netip.ParseAddr(cand)
		if err != nil || isTrustedProxy(a) {
			continue // skip blanks and our own proxy hops
		}
		return cand
	}
	return peer // no usable client entry → the trusted peer itself
}

// remoteAddrHost strips the port from RemoteAddr, handling IPv6 ("[::1]:p") too.
func remoteAddrHost(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}
