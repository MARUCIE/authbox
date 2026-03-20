import { create } from 'zustand';

export type VaultStatus = 'locked' | 'unlocked' | 'loading';

interface VaultState {
  // Auth state
  sessionToken: string | null;
  userId: string | null;

  // Vault state
  status: VaultStatus;
  vaultKey: Uint8Array | null; // Decrypted vault key (in memory only)
  items: Map<string, DecryptedVaultItem>;
  lastSync: string | null;

  // Actions
  setSession: (token: string, userId: string) => void;
  clearSession: () => void;
  unlockVault: (vaultKey: Uint8Array) => void;
  lockVault: () => void;
  setItems: (items: Map<string, DecryptedVaultItem>) => void;
  addItem: (item: DecryptedVaultItem) => void;
  updateItem: (id: string, item: DecryptedVaultItem) => void;
  removeItem: (id: string) => void;
  setLastSync: (token: string) => void;
}

/** Typed data payload for login-type vault items. */
export interface VaultItemData {
  username?: string;
  password?: string;
  uri?: string;
  notes?: string;
  [key: string]: unknown; // allow extension for other item types
}

export interface DecryptedVaultItem {
  id: string;
  vaultId: string;
  itemType: string;
  name: string;
  data: VaultItemData;
  favorite: boolean;
  folderId?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export const useVaultStore = create<VaultState>((set) => ({
  sessionToken: null,
  userId: null,
  status: 'locked',
  vaultKey: null,
  items: new Map(),
  lastSync: null,

  setSession: (token, userId) =>
    set({ sessionToken: token, userId }),

  clearSession: () =>
    set({
      sessionToken: null,
      userId: null,
      status: 'locked',
      vaultKey: null,
      items: new Map(),
      lastSync: null,
    }),

  unlockVault: (vaultKey) =>
    set({ vaultKey, status: 'unlocked' }),

  lockVault: () =>
    set({ vaultKey: null, status: 'locked', items: new Map() }),

  setItems: (items) => set({ items }),

  addItem: (item) =>
    set((state) => {
      const next = new Map(state.items);
      next.set(item.id, item);
      return { items: next };
    }),

  updateItem: (id, item) =>
    set((state) => {
      const next = new Map(state.items);
      next.set(id, item);
      return { items: next };
    }),

  removeItem: (id) =>
    set((state) => {
      const next = new Map(state.items);
      next.delete(id);
      return { items: next };
    }),

  setLastSync: (token) => set({ lastSync: token }),
}));
