/**
 * Vault service: orchestrates client-side encryption/decryption with API sync.
 *
 * All vault items are encrypted with the vault key BEFORE leaving the client.
 * The server only ever stores encrypted blobs (zero-knowledge).
 *
 * Flow: User action -> encrypt with vaultKey -> API call -> update store
 * Flow: Sync pull -> receive encrypted blobs -> decrypt with vaultKey -> populate store
 */
import { encryptVaultItem, decryptVaultItem } from '@authbox/crypto';
import type { VaultItem, ItemType } from '@authbox/shared';
import { vaultApi, ApiError } from './api';
import { useVaultStore, type DecryptedVaultItem } from './vault-store';

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getStoreState() {
  return useVaultStore.getState();
}

/**
 * Pull all encrypted items from the server, decrypt them, and populate the store.
 */
export async function syncVault(): Promise<void> {
  const { sessionToken, vaultKey, lastSync } = getStoreState();
  if (!sessionToken || !vaultKey) {
    throw new Error('Vault is locked');
  }

  const response = await vaultApi.syncPull(sessionToken, lastSync ?? undefined);
  const decryptedItems = new Map(getStoreState().items);

  for (const item of response.items) {
    try {
      const plaintext = await decryptVaultItem(vaultKey, {
        ciphertext: fromBase64(item.encryptedData),
        nonce: fromBase64(item.nonce),
        tag: fromBase64(item.tag),
      });

      const parsed = JSON.parse(plaintext) as Omit<
        DecryptedVaultItem,
        'id' | 'vaultId' | 'itemType' | 'revision' | 'createdAt' | 'updatedAt'
      >;

      decryptedItems.set(item.id, {
        id: item.id,
        vaultId: item.vaultId,
        itemType: item.itemType,
        revision: item.revision,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        name: parsed.name ?? 'Untitled',
        data: parsed.data ?? {},
        favorite: parsed.favorite ?? false,
        folderId: parsed.folderId,
      });
    } catch (err) {
      // Skip items that fail to decrypt (corrupted or wrong key)
      console.error(`Failed to decrypt item ${item.id}:`, err);
    }
  }

  useVaultStore.setState({
    items: decryptedItems,
    lastSync: response.syncToken,
  });
}

/**
 * Create a new vault item: encrypt client-side, then push to API.
 */
export async function createVaultItem(
  itemType: ItemType | string,
  name: string,
  data: Record<string, unknown>,
  options?: { favorite?: boolean; folderId?: string },
): Promise<string> {
  const { sessionToken, vaultKey } = getStoreState();
  if (!sessionToken || !vaultKey) {
    throw new Error('Vault is locked');
  }

  const plaintext = JSON.stringify({
    name,
    data,
    favorite: options?.favorite ?? false,
    folderId: options?.folderId,
  });

  const encrypted = await encryptVaultItem(vaultKey, plaintext);

  const response = await vaultApi.createItem(sessionToken, {
    itemType,
    encryptedData: toBase64(encrypted.ciphertext),
    nonce: toBase64(encrypted.nonce),
    tag: toBase64(encrypted.tag),
  });

  // Add to local store
  const newItem: DecryptedVaultItem = {
    id: response.id,
    vaultId: response.vaultId ?? '',
    itemType,
    name,
    data,
    favorite: options?.favorite ?? false,
    folderId: options?.folderId,
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  useVaultStore.getState().addItem(newItem);
  return response.id;
}

/**
 * Update an existing vault item: encrypt new data, push to API.
 */
export async function updateVaultItem(
  itemId: string,
  name: string,
  data: Record<string, unknown>,
  options?: { favorite?: boolean; folderId?: string },
): Promise<void> {
  const { sessionToken, vaultKey, items } = getStoreState();
  if (!sessionToken || !vaultKey) {
    throw new Error('Vault is locked');
  }

  const existing = items.get(itemId);
  if (!existing) {
    throw new Error('Item not found in local vault');
  }

  const plaintext = JSON.stringify({
    name,
    data,
    favorite: options?.favorite ?? existing.favorite,
    folderId: options?.folderId ?? existing.folderId,
  });

  const encrypted = await encryptVaultItem(vaultKey, plaintext);

  await vaultApi.updateItem(sessionToken, itemId, {
    encryptedData: toBase64(encrypted.ciphertext),
    nonce: toBase64(encrypted.nonce),
    tag: toBase64(encrypted.tag),
  });

  useVaultStore.getState().updateItem(itemId, {
    ...existing,
    name,
    data,
    favorite: options?.favorite ?? existing.favorite,
    folderId: options?.folderId ?? existing.folderId,
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a vault item from both server and local store.
 */
export async function deleteVaultItem(itemId: string): Promise<void> {
  const { sessionToken } = getStoreState();
  if (!sessionToken) {
    throw new Error('Not authenticated');
  }

  await vaultApi.deleteItem(sessionToken, itemId);
  useVaultStore.getState().removeItem(itemId);
}

/**
 * Search vault items by name, username, or URI (client-side, on decrypted data).
 */
export function searchVaultItems(
  query: string,
): DecryptedVaultItem[] {
  const { items } = getStoreState();
  if (!query.trim()) {
    return Array.from(items.values());
  }

  const lower = query.toLowerCase();
  return Array.from(items.values()).filter((item) => {
    if (item.name.toLowerCase().includes(lower)) return true;

    const data = item.data as Record<string, string>;
    if (data.username?.toLowerCase().includes(lower)) return true;
    if (data.uri?.toString().toLowerCase().includes(lower)) return true;
    if (data.service?.toLowerCase().includes(lower)) return true;

    return false;
  });
}

export { ApiError };
