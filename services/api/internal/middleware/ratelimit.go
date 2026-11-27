package middleware

import (
	"net/http"
	"net/netip"
	"strconv"
	"sync"
	"time"
)

type visitor struct {
	count       int
	windowStart time.Time
}

// RateLimiter provides per-IP fixed-window rate limiting.
// The window starts on the first request and resets after the duration expires,
// regardless of subsequent requests. Rejected requests do NOT extend the window.
type RateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	limit    int
	window   time.Duration
}

// NewRateLimiter creates a rate limiter that allows limit requests per window per IP.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		window:   window,
	}
	go rl.cleanup()
	return rl
}

// Handler returns middleware that enforces the rate limit.
func (rl *RateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := rateLimitKey(ClientIP(r))

		rl.mu.Lock()
		v, exists := rl.visitors[ip]
		now := time.Now()

		// New visitor or window expired: start a fresh window
		if !exists || now.Sub(v.windowStart) > rl.window {
			if !exists {
				rl.makeRoomLocked(now)
			}
			rl.visitors[ip] = &visitor{count: 1, windowStart: now}
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		v.count++
		if v.count > rl.limit {
			// Calculate seconds remaining in the current window
			remaining := rl.window - now.Sub(v.windowStart)
			retryAfter := int(remaining.Seconds()) + 1
			rl.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate limit exceeded","code":"RATE_LIMITED"}`))
			return
		}
		rl.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}

// maxVisitors caps the number of tracked clients to prevent unbounded memory
// growth from address rotation.
const maxVisitors = 10000

// rateLimitKey maps a client address to its rate-limit bucket. An IPv6 client
// is routinely handed a whole /64, so limiting per address would let it rotate
// through 2^64 fresh budgets; the /64 is the smallest unit one client controls.
// IPv4-mapped IPv6 addresses count as their IPv4 address.
func rateLimitKey(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ip
	}
	addr = addr.Unmap().WithZone("")
	if addr.Is6() {
		return netip.PrefixFrom(addr, 64).Masked().String()
	}
	return addr.String()
}

// makeRoomLocked keeps the map at or under maxVisitors before a new client is
// added. Expired windows go first; if the map is still full, an arbitrary
// entry is dropped, so memory stays bounded between cleanup ticks.
// rl.mu must be held.
func (rl *RateLimiter) makeRoomLocked(now time.Time) {
	if len(rl.visitors) < maxVisitors {
		return
	}
	for key, v := range rl.visitors {
		if now.Sub(v.windowStart) > rl.window {
			delete(rl.visitors, key)
		}
	}
	for key := range rl.visitors {
		if len(rl.visitors) < maxVisitors {
			break
		}
		delete(rl.visitors, key)
	}
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, v := range rl.visitors {
			if now.Sub(v.windowStart) > rl.window {
				delete(rl.visitors, key)
			}
		}
		rl.mu.Unlock()
	}
}
