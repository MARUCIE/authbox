package config

import (
	"log/slog"
	"net/url"
	"os"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr       string
	DBDSN          string
	RedisURL       string
	Environment    string
	Version        string
	SessionTTL     time.Duration
	AllowedOrigins []string
}

func Load() Config {
	return Config{
		HTTPAddr:       getEnv("AUTH_BOX_HTTP_ADDR", ":8080"),
		DBDSN:          getEnv("AUTH_BOX_DB_DSN", ""),
		RedisURL:       getEnv("AUTH_BOX_REDIS_URL", ""),
		Environment:    getEnv("AUTH_BOX_ENV", "local"),
		Version:        getEnv("AUTH_BOX_VERSION", "0.1.0"),
		SessionTTL:     7 * 24 * time.Hour,
		AllowedOrigins: parseOrigins(getEnv("AUTH_BOX_ALLOWED_ORIGINS", "http://localhost:3000")),
	}
}

// parseOrigins splits a comma-separated origin list and validates each entry.
// Only origins with http:// or https:// scheme are accepted; wildcards and
// malformed URLs are rejected with a warning.
func parseOrigins(s string) []string {
	parts := strings.Split(s, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if p == "*" {
			slog.Warn("wildcard CORS origin is insecure with AllowCredentials; skipping")
			continue
		}
		u, err := url.Parse(p)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			slog.Warn("invalid CORS origin, skipping", "origin", p)
			continue
		}
		origins = append(origins, p)
	}
	return origins
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
