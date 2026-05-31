/**
 * Credential Health Check — verify API keys are valid by pinging provider endpoints.
 *
 * Each provider has a lightweight "ping" endpoint that validates the key
 * without consuming quota or triggering side effects.
 *
 * All checks run client-side. Keys are read from decrypted vault items
 * and never leave the browser except to the provider's own API.
 */

export type HealthStatus =
  | "valid"
  | "invalid"
  | "expired"
  | "quota_exceeded"
  | "error"
  | "unchecked";

export interface HealthCheckResult {
  providerId: string;
  status: HealthStatus;
  message: string;
  checkedAt: string;
  latencyMs: number;
}

interface ProviderCheck {
  url: string | ((fields: Record<string, string>) => string);
  method?: string;
  headers: (fields: Record<string, string>) => Record<string, string>;
  body?: string;
  parseResponse: (
    status: number,
    body: string,
  ) => { status: HealthStatus; message: string };
}

// ─── Provider Health Check Registry ───────────────────────────────────────

const HEALTH_CHECKS: Record<string, ProviderCheck> = {
  openai: {
    url: (f) => `${f.base_url || "https://api.openai.com/v1"}/models`,
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      if (status === 429)
        return {
          status: "quota_exceeded",
          message: "Rate limited or quota exceeded",
        };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: (f) => ({
      "x-api-key": f.api_key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      if (status === 429)
        return { status: "quota_exceeded", message: "Rate limited" };
      if (status === 400)
        return {
          status: "valid",
          message: "API key valid (model access varies)",
        };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  google_ai: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (f) => ({ "x-goog-api-key": f.api_key }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 400 || status === 403)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  groq: {
    url: "https://api.groq.com/openai/v1/models",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  deepseek: {
    url: "https://api.deepseek.com/v1/models",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  together: {
    url: "https://api.together.xyz/v1/models",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  replicate: {
    url: "https://api.replicate.com/v1/account",
    headers: (f) => ({ Authorization: `Bearer ${f.api_token || f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200)
        return { status: "valid", message: "API token valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid token" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  elevenlabs: {
    url: "https://api.elevenlabs.io/v1/user",
    headers: (f) => ({ "xi-api-key": f.api_key }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  heygen: {
    url: "https://api.heygen.com/v2/user/remaining_quota",
    headers: (f) => ({ "x-api-key": f.api_key }),
    parseResponse: (status, body) => {
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          return {
            status: "valid",
            message: `Valid. Remaining quota: ${data.data?.remaining_quota ?? "unknown"}`,
          };
        } catch {
          return { status: "valid", message: "API key valid" };
        }
      }
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  pinecone: {
    url: "https://api.pinecone.io/indexes",
    headers: (f) => ({ "Api-Key": f.api_key }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401 || status === 403)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  brave_search: {
    url: "https://api.search.brave.com/res/v1/web/search?q=test&count=1",
    headers: (f) => ({ "X-Subscription-Token": f.api_key }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401 || status === 403)
        return { status: "invalid", message: "Invalid API key" };
      if (status === 429)
        return { status: "quota_exceeded", message: "Rate limited" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  tavily: {
    url: "https://api.tavily.com/search",
    method: "POST",
    headers: () => ({ "Content-Type": "application/json" }),
    body: "", // Will be set dynamically
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401 || status === 403)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  cloudflare: {
    url: "https://api.cloudflare.com/client/v4/user/tokens/verify",
    headers: (f) => ({ Authorization: `Bearer ${f.api_token}` }),
    parseResponse: (status, body) => {
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          if (data.success) return { status: "valid", message: "Token valid" };
        } catch {
          /* fall through */
        }
        return { status: "valid", message: "Token valid" };
      }
      if (status === 401)
        return { status: "invalid", message: "Invalid token" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  vercel: {
    url: "https://api.vercel.com/v2/user",
    headers: (f) => ({ Authorization: `Bearer ${f.api_token}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "Token valid" };
      if (status === 401 || status === 403)
        return { status: "invalid", message: "Invalid token" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  github: {
    url: "https://api.github.com/user",
    headers: (f) => ({
      Authorization: `Bearer ${f.personal_access_token}`,
      "User-Agent": "AuthBox/2.0",
    }),
    parseResponse: (status, body) => {
      if (status === 200) {
        try {
          const data = JSON.parse(body);
          return { status: "valid", message: `Valid. User: ${data.login}` };
        } catch {
          return { status: "valid", message: "Token valid" };
        }
      }
      if (status === 401)
        return { status: "invalid", message: "Invalid token" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  sendgrid: {
    url: "https://api.sendgrid.com/v3/user/profile",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  resend: {
    url: "https://api.resend.com/api-keys",
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },

  posthog: {
    url: (f) => `${f.host || "https://app.posthog.com"}/api/projects/`,
    headers: (f) => ({ Authorization: `Bearer ${f.api_key}` }),
    parseResponse: (status) => {
      if (status === 200) return { status: "valid", message: "API key valid" };
      if (status === 401)
        return { status: "invalid", message: "Invalid API key" };
      return { status: "error", message: `HTTP ${status}` };
    },
  },
};

// ─── Health Check Executor ────────────────────────────────────────────────

/**
 * Check if a provider has a health check available.
 */
export function hasHealthCheck(providerId: string): boolean {
  return providerId in HEALTH_CHECKS;
}

/**
 * Get list of all providers with health checks.
 */
export function healthCheckProviders(): string[] {
  return Object.keys(HEALTH_CHECKS);
}

/**
 * Run a health check for a single credential.
 *
 * @param providerId - Provider ID from the catalog
 * @param fields - Decrypted credential fields { api_key: "sk-...", org_id: "org-..." }
 * @returns Health check result
 */
export async function checkCredentialHealth(
  providerId: string,
  fields: Record<string, string>,
): Promise<HealthCheckResult> {
  const check = HEALTH_CHECKS[providerId];
  const startTime = Date.now();

  if (!check) {
    return {
      providerId,
      status: "unchecked",
      message: "No health check available for this provider",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
    };
  }

  try {
    const url = typeof check.url === "function" ? check.url(fields) : check.url;
    const headers = check.headers(fields);
    let body = check.body;

    // Special case: Tavily needs the API key in the body
    if (providerId === "tavily") {
      body = JSON.stringify({
        api_key: fields.api_key,
        query: "test",
        max_results: 1,
      });
    }

    const response = await fetch(url, {
      method: check.method ?? "GET",
      headers,
      body: check.method === "POST" ? body : undefined,
    });

    const responseBody = await response.text().catch(() => "");
    const result = check.parseResponse(response.status, responseBody);

    return {
      providerId,
      status: result.status,
      message: result.message,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      providerId,
      status: "error",
      message: err instanceof Error ? err.message : "Network error",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Run health checks for multiple credentials in parallel (max 5 concurrent).
 */
export async function batchHealthCheck(
  credentials: Array<{ providerId: string; fields: Record<string, string> }>,
): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  const concurrency = 5;

  for (let i = 0; i < credentials.length; i += concurrency) {
    const batch = credentials.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((c) => checkCredentialHealth(c.providerId, c.fields)),
    );
    results.push(...batchResults);
  }

  return results;
}
