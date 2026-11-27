/**
 * The web app's instance of the shared API client. Only the base-URL policy
 * is web-specific; endpoints and wire types live in @authbox/api-client.
 */
import { createApiClient } from '@authbox/api-client';

const LOCAL_API_BASE = 'http://localhost:4010';

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiBase(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBase) {
    return normalizeBaseURL(configuredBase);
  }

  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return LOCAL_API_BASE;
  }

  if (process.env.NODE_ENV !== 'production') {
    return LOCAL_API_BASE;
  }

  throw new Error('Missing NEXT_PUBLIC_API_BASE_URL for non-local Auth Box web runtime');
}

export { ApiError } from '@authbox/api-client';

export const { authApi, vaultApi, agentApi, connectionApi, auditApi, settingsApi, walletApi } =
  createApiClient(resolveApiBase);
