package config

import "os"

type Config struct {
	HTTPAddr   string
	DBDSN      string
	RedisURL   string
	Env        string
	Version    string
	AuthTokens string
}

func Load() Config {
	return Config{
		HTTPAddr: getEnv("AUTH_BOX_HTTP_ADDR", ":8080"),
		DBDSN:    getEnv("AUTH_BOX_DB_DSN", ""),
		RedisURL: getEnv("AUTH_BOX_REDIS_URL", ""),
		Env:      getEnv("AUTH_BOX_ENV", "local"),
		Version:  getEnv("AUTH_BOX_VERSION", "0.1.0"),
		AuthTokens: getEnv(
			"AUTH_BOX_AUTH_TOKENS",
			"local-admin-token:actor-platform-admin:platform_admin|security_ops|compliance_auditor|policy_admin,local-security-token:actor-security-ops:security_ops,local-auditor-token:actor-compliance-auditor:compliance_auditor",
		),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
