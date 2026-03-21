/**
 * In-memory vault cache for the service worker.
 *
 * The decrypted vault lives only in the service worker's memory. It is
 * populated on unlock and cleared on lock or when the auto-lock alarm fires.
 *
 * Crypto integration: uses @authbox/crypto for Argon2id key derivation,
 * AES-256-GCM vault key decryption, and per-item decryption.
 */

import { deriveKeys, decryptVaultKey, decryptVaultItem } from '@authbox/crypto';
import type { LoginItem, VaultItem, EncryptedVaultItem, ItemType } from '@authbox/shared';
import { API_BASE } from './config';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── State ───────────────────────────────────────────────────────────────────

export interface VaultCacheState {
  locked: boolean;
  items: VaultItem[];
  sessionToken: string | null;
}

const MAX_CACHE_ITEMS = 10000;

let state: VaultCacheState = {
  locked: true,
  items: [],
  sessionToken: null,
};

// ── API calls (extension talks directly to the Go API) ──────────────────────

interface VaultKeyData {
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  vaultKeyTag: string;
  srpSalt: string;
  kdfParams: {
    algorithm: string;
    memory: number;
    iterations: number;
    parallelism: number;
    keyLength: number;
  };
}

async function fetchVaultKey(token: string): Promise<VaultKeyData> {
  const res = await fetch(`${API_BASE}/api/v1/vault/key`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch vault key: ${res.status}`);
  return res.json();
}

async function fetchVaultItems(token: string): Promise<EncryptedVaultItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/vault/items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch vault items: ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

// ── SRP Login (extension needs its own session) ─────────────────────────────

interface LoginInitResponse {
  srpSalt: string;
  serverPublicB: string;
}

interface LoginVerifyResponse {
  sessionToken: string;
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  vaultKeyTag: string;
}

/**
 * Attempt to unlock the vault with the master password.
 *
 * Flow:
 *   1. If we already have a session token, use it to fetch the vault key.
 *      Otherwise, perform a full SRP login to get a token.
 *   2. Derive keys from the password + salt (Argon2id + HKDF).
 *   3. Decrypt the vault key using the encryption sub-key.
 *   4. Fetch all encrypted vault items from the API.
 *   5. Decrypt each item in memory.
 */
export async function unlock(password: string): Promise<boolean> {
  try {
    let token = state.sessionToken;

    // If no session, we need the user to provide email too.
    // For the extension, the popup passes the session token via chrome.storage.
    if (!token) {
      // Try to get session token from extension storage
      const stored = await chrome.storage.session.get('authbox_session');
      token = stored.authbox_session ?? null;
    }

    if (!token) {
      // No session available -- user must log in through the popup first
      state = { locked: true, items: [], sessionToken: null };
      return false;
    }

    // Fetch vault key + items in parallel (items don't depend on key data)
    const [vaultKeyData, encryptedItems] = await Promise.all([
      fetchVaultKey(token),
      fetchVaultItems(token),
    ]);

    // Derive keys from password + salt
    const salt = fromBase64(vaultKeyData.srpSalt);
    const keys = await deriveKeys(password, salt);

    // Decrypt the vault key
    const vaultKey = await decryptVaultKey(keys.encKey, {
      encryptedVaultKey: fromBase64(vaultKeyData.encryptedVaultKey),
      nonce: fromBase64(vaultKeyData.vaultKeyNonce),
      tag: fromBase64(vaultKeyData.vaultKeyTag),
    });

    // Decrypt each item
    let decryptedItems: VaultItem[] = [];
    for (const item of encryptedItems) {
      try {
        const plaintext = await decryptVaultItem(vaultKey, {
          ciphertext: fromBase64(item.encryptedData),
          nonce: fromBase64(item.nonce),
          tag: fromBase64(item.tag),
        });
        const parsed = JSON.parse(plaintext) as VaultItem;
        // Ensure server metadata is preserved
        parsed.id = item.id;
        parsed.itemType = item.itemType as ItemType;
        parsed.revision = item.revision;
        parsed.createdAt = item.createdAt;
        parsed.updatedAt = item.updatedAt;
        decryptedItems.push(parsed);
      } catch {
        // Skip items that fail to decrypt (corrupted or wrong key)
        console.warn(`[vault-cache] Failed to decrypt item ${item.id}`);
      }
    }

    // Cap cache to prevent memory exhaustion on large vaults
    if (decryptedItems.length > MAX_CACHE_ITEMS) {
      console.warn(`[vault-cache] Truncated cache from ${decryptedItems.length} to ${MAX_CACHE_ITEMS} items`);
      decryptedItems = decryptedItems.slice(0, MAX_CACHE_ITEMS);
    }

    state = {
      locked: false,
      items: decryptedItems,
      sessionToken: token,
    };

    // Store the session token for persistence across service worker restarts
    await chrome.storage.session.set({ authbox_session: token });

    return true;
  } catch (err) {
    console.error('[vault-cache] Unlock failed:', err);
    state = { locked: true, items: [], sessionToken: state.sessionToken };
    return false;
  }
}

/** Lock the vault and wipe in-memory plaintext. */
export function lock(): void {
  state = { locked: true, items: [], sessionToken: state.sessionToken };
}

/** Check whether the vault is currently unlocked. */
export function isUnlocked(): boolean {
  return !state.locked;
}

/** Return the current item count. */
export function itemCount(): number {
  return state.items.length;
}

/** Store a session token (called after popup login). */
export async function setSessionToken(token: string): Promise<void> {
  state.sessionToken = token;
  await chrome.storage.session.set({ authbox_session: token });
}

/** Clear the session (full logout). */
export async function clearSession(): Promise<void> {
  state = { locked: true, items: [], sessionToken: null };
  await chrome.storage.session.remove('authbox_session');
}

/**
 * Search cached items by query string against name, username, and URI.
 * When a URI is provided, also matches against stored URIs by domain.
 */
export function search(
  query: string,
  uri?: string,
): Array<{ id: string; name: string; username: string; uri: string[] }> {
  if (state.locked) return [];

  // Filter to LoginItems only (they have username/password/uri)
  const loginItems = state.items.filter(
    (item): item is LoginItem => item.itemType === ('login' as ItemType),
  );

  // Extract domain from URI for matching
  let uriDomain: string | null = null;
  if (uri) {
    try {
      uriDomain = new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      uriDomain = uri.toLowerCase();
    }
  }

  const q = query.toLowerCase();

  return loginItems
    .filter((item) => {
      // URI-based matching (highest priority for autofill)
      if (uriDomain) {
        const uriMatch = item.uri.some((u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, '') === uriDomain;
          } catch {
            return u.toLowerCase().includes(uriDomain!);
          }
        });
        if (uriMatch) return true;
      }

      // Text query matching
      if (q) {
        return (
          item.name.toLowerCase().includes(q) ||
          item.username.toLowerCase().includes(q) ||
          item.uri.some((u) => u.toLowerCase().includes(q))
        );
      }

      // If URI was provided but didn't match, and no text query, exclude
      return !uriDomain;
    })
    .map(({ id, name, username, uri: itemUri }) => ({
      id,
      name,
      username,
      uri: itemUri,
    }));
}

/** Get a single item by ID (for autofill). */
export function getItem(itemId: string): LoginItem | undefined {
  if (state.locked) return undefined;
  return state.items.find(
    (item): item is LoginItem =>
      item.id === itemId && item.itemType === ('login' as ItemType),
  );
}
