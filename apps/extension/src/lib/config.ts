/**
 * Extension configuration — single source of truth for API endpoints.
 *
 * In development: Vite injects import.meta.env.VITE_API_BASE
 * In production: API base must be provided explicitly by env.
 */

// @ts-expect-error Vite injects import.meta.env at build time
const envBase: string | undefined = import.meta.env?.VITE_API_BASE;

function normalizeBaseURL(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolveApiBase(): string {
  if (envBase?.trim()) {
    return normalizeBaseURL(envBase.trim());
  }

  // @ts-expect-error Vite injects import.meta.env at build time
  if (import.meta.env?.DEV) {
    return 'http://localhost:4010';
  }

  return '';
}

export const API_BASE = resolveApiBase();

export function getApiBase(): string {
  if (!API_BASE) {
    throw new Error('Missing VITE_API_BASE for production extension build');
  }

  return API_BASE;
}

// @ts-expect-error Vite injects import.meta.env at build time
const envVault: string | undefined = import.meta.env?.VITE_VAULT_URL;

export const VAULT_URL = envVault || (
  // @ts-expect-error Vite injects import.meta.env at build time
  import.meta.env?.DEV ? 'http://localhost:3010' : 'https://authbox.io'
);

export const AUTO_LOCK_MINUTES = 15;
