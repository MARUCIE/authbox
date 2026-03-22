const LOCAL_API_BASE = "http://localhost:4010";

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, "");
}

function getAPIBaseURL(): string {
  const configured =
    process.env.AUTH_BOX_CONSOLE_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured?.trim()) {
    return normalizeBaseURL(configured.trim());
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCAL_API_BASE;
  }

  throw new Error(
    "Missing AUTH_BOX_CONSOLE_API_BASE_URL or NEXT_PUBLIC_API_BASE_URL for console runtime"
  );
}

const apiToken =
  process.env.AUTH_BOX_CONSOLE_API_TOKEN ||
  process.env.NEXT_PUBLIC_API_TOKEN ||
  "local-admin-token";
const apiAuthSource =
  process.env.AUTH_BOX_CONSOLE_AUTH_SOURCE ||
  process.env.NEXT_PUBLIC_API_AUTH_SOURCE ||
  "console";

export type APIErrorPayload = {
  code: string;
  message: string;
  request_id?: string;
};

export class APIRequestError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, payload: APIErrorPayload) {
    super(payload.message || "API request failed");
    this.name = "APIRequestError";
    this.status = status;
    this.code = payload.code || "INTERNAL_ERROR";
    this.requestId = payload.request_id;
  }
}

export type Platform = {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  config?: {
    base_url?: string;
    auth_type?: string;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  next_page_token?: string;
};

async function parseJSON(res: Response) {
  const text = await res.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${apiToken}`);
  headers.set("X-Auth-Source", apiAuthSource);

  const res = await fetch(`${getAPIBaseURL()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!res.ok) {
    const payload = (await parseJSON(res)) as APIErrorPayload;
    throw new APIRequestError(res.status, payload);
  }

  return (await parseJSON(res)) as T;
}

export async function listPlatforms(): Promise<Platform[]> {
  const payload = await apiFetch<PaginatedResponse<Platform>>("/api/v1/platforms");
  return payload.items || [];
}

export async function createPlatform(input: {
  name: string;
  type: string;
  config?: { base_url?: string; auth_type?: string };
}): Promise<Platform> {
  return await apiFetch<Platform>("/api/v1/platforms", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function apiEntry() {
  try {
    return {
      baseURL: getAPIBaseURL(),
      hasToken: Boolean(apiToken),
      authSource: apiAuthSource
    };
  } catch (error) {
    return {
      baseURL: "UNCONFIGURED",
      hasToken: Boolean(apiToken),
      authSource: apiAuthSource,
      configError:
        error instanceof Error ? error.message : "missing API base configuration"
    };
  }
}
