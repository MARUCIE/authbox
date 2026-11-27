/**
 * Vault service: orchestrates client-side encryption/decryption with API sync.
 *
 * All vault items are encrypted with the vault key BEFORE leaving the client.
 * The server only ever stores encrypted blobs (zero-knowledge).
 *
 * Flow: User action -> encrypt with vaultKey -> API call -> update store
 * Flow: Sync pull -> receive encrypted blobs -> decrypt with vaultKey -> populate store
 */
import { encryptVaultItem, decryptVaultItem, toBase64, fromBase64 } from '@authbox/crypto';
import type { VaultItem, ItemType } from '@authbox/shared';
import { vaultApi, ApiError } from './api';
import { useVaultStore, type DecryptedVaultItem } from './vault-store';
import { collectPages } from '@authbox/api-client';

function getStoreState() {
  return useVaultStore.getState();
}

/** Items per request when loading the vault (the API allows up to 500). */
const ITEM_PAGE_SIZE = 500;

/**
 * Bumped by every sync start and every local create/update/delete. A sync
 * applies its result only if nothing else started or changed since, so a
 * slower, older sync cannot overwrite a newer one or wipe a just-added item.
 */
let vaultGeneration = 0;

/**
 * Load every encrypted item from the server, decrypt it, and replace the
 * store's items. A full reload also drops items deleted on another device.
 */
export async function syncVault(): Promise<void> {
  const { sessionToken, vaultKey } = getStoreState();
  if (!sessionToken || !vaultKey) {
    throw new Error('Vault is locked');
  }

  const generation = ++vaultGeneration;
  const previous = getStoreState().items;
  const encrypted = await collectPages(
    async (limit, offset) => (await vaultApi.listItems(sessionToken, limit, offset)).items,
    ITEM_PAGE_SIZE,
  );
  const decryptedItems = new Map<string, DecryptedVaultItem>();

  for (const item of encrypted) {
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
        vaultId: '',
        itemType: item.itemType,
        revision: item.version,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        name: parsed.name ?? 'Untitled',
        data: parsed.data ?? {},
        favorite: parsed.favorite ?? false,
        folderId: parsed.folderId,
      });
    } catch (err) {
      // Keep the copy we already had rather than dropping the item.
      console.error(`Failed to decrypt item ${item.id}:`, err);
      const kept = previous.get(item.id);
      if (kept) decryptedItems.set(item.id, kept);
    }
  }

  // The vault may have been locked, or a newer sync or local edit may have
  // landed, while the pages were loading.
  if (getStoreState().vaultKey !== vaultKey || generation !== vaultGeneration) return;
  useVaultStore.setState({
    items: decryptedItems,
    lastSync: new Date().toISOString(),
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

  vaultGeneration++;
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

  vaultGeneration++;
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
  vaultGeneration++;
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
