package middleware

import (
	"net/http"
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
		ip := ClientIP(r)

		rl.mu.Lock()
		v, exists := rl.visitors[ip]
		now := time.Now()

		// New visitor or window expired: start a fresh window
		if !exists || now.Sub(v.windowStart) > rl.window {
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

// maxVisitors caps the number of tracked IPs to prevent unbounded memory growth
// from IP rotation attacks.
const maxVisitors = 10000

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		// Evict expired visitors
		for ip, v := range rl.visitors {
			if time.Since(v.windowStart) > rl.window*2 {
				delete(rl.visitors, ip)
			}
		}
		// Hard cap: if still over limit, evict oldest entries
		if len(rl.visitors) > maxVisitors {
			oldest := time.Now()
			var oldestIP string
			for ip, v := range rl.visitors {
				if v.windowStart.Before(oldest) {
					oldest = v.windowStart
					oldestIP = ip
				}
			}
			if oldestIP != "" {
				delete(rl.visitors, oldestIP)
			}
		}
		rl.mu.Unlock()
	}
}
