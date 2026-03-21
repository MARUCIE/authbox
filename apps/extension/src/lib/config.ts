/**
 * Extension configuration — single source of truth for API endpoints.
 *
 * In development: Vite injects import.meta.env.VITE_API_BASE
 * In production: defaults to the Cloudflare Tunnel URL
 */

// @ts-expect-error Vite injects import.meta.env at build time
const envBase: string | undefined = import.meta.env?.VITE_API_BASE;

export const API_BASE = envBase || 'https://underground-alcohol-insulin-bit.trycloudflare.com';

// @ts-expect-error Vite injects import.meta.env at build time
const envVault: string | undefined = import.meta.env?.VITE_VAULT_URL;

export const VAULT_URL = envVault || 'http://localhost:3010';

export const AUTO_LOCK_MINUTES = 15;
