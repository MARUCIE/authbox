package config

import (
	"encoding/base64"
	"log/slog"
	"net/url"
	"os"
	"strconv"
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
	AuthRateLimit  int
	TOTPSecretKey  []byte
}

func Load() Config {
	sessionHours := getEnvInt("AUTH_BOX_SESSION_TTL_HOURS", 168) // default 7 days
	env := getEnv("AUTH_BOX_ENV", "local")
	origins := parseOrigins(getEnv("AUTH_BOX_ALLOWED_ORIGINS", "http://localhost:3000"))
	totpSecretKey := loadTOTPSecretKey(env)

	// Production safety: reject localhost origins (not just warn)
	if env == "production" {
		filtered := make([]string, 0, len(origins))
		for _, o := range origins {
			if strings.Contains(o, "localhost") || strings.Contains(o, "127.0.0.1") {
				slog.Error("SECURITY: rejecting localhost CORS origin in production", "origin", o, "env", env)
				continue
			}
			filtered = append(filtered, o)
		}
		origins = filtered
	}

	return Config{
		HTTPAddr:       getEnv("AUTH_BOX_HTTP_ADDR", ":8080"),
		DBDSN:          getEnv("AUTH_BOX_DB_DSN", ""),
		RedisURL:       getEnv("AUTH_BOX_REDIS_URL", ""),
		Environment:    env,
		Version:        getEnv("AUTH_BOX_VERSION", "0.1.0"),
		SessionTTL:     time.Duration(sessionHours) * time.Hour,
		AllowedOrigins: origins,
		AuthRateLimit:  getEnvInt("AUTH_BOX_AUTH_RATE_LIMIT", 5),
		TOTPSecretKey:  totpSecretKey,
	}
}

func loadTOTPSecretKey(env string) []byte {
	value := getEnv("AUTH_BOX_TOTP_SECRET_KEY", "")
	if value == "" && env != "production" {
		value = "YXV0aGJveC1sb2NhbC1kZXYtdG90cC1rZXktdjEhISE="
		slog.Warn("using local development TOTP secret encryption key; set AUTH_BOX_TOTP_SECRET_KEY outside local development")
	}
	if value == "" {
		slog.Error("AUTH_BOX_TOTP_SECRET_KEY is required in production")
		os.Exit(1)
	}

	key, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(key) != 32 {
		slog.Error("AUTH_BOX_TOTP_SECRET_KEY must be a base64-encoded 32-byte key")
		os.Exit(1)
	}
	return key
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

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(value); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}
