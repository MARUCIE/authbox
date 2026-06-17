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

interface ApiOptions extends RequestInit {
  token?: string;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const apiBase = resolveApiBase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${apiBase}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText, code: 'UNKNOWN' }));
    throw new ApiError(res.status, body.code ?? 'UNKNOWN', body.error ?? res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// Auth API
export const authApi = {
  register(body: {
    email: string;
    srpSalt: string;
    srpVerifier: string;
    encryptedVaultKey: string;
    vaultKeyNonce: string;
    vaultKeyTag: string;
    kdfParams: {
      algorithm: string;
      memory: number;
      iterations: number;
      parallelism: number;
      keyLength: number;
    };
  }) {
    return request<{ userId: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  loginInit(body: { email: string; clientPublicA: string }) {
    return request<{ srpSalt: string; serverPublicB: string }>('/api/v1/auth/login/init', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  loginVerify(body: { email: string; clientPublicA: string; clientProofM1: string }) {
    return request<{
      sessionToken?: string;
      serverProofM2: string;
      encryptedVaultKey?: string;
      vaultKeyNonce?: string;
      vaultKeyTag?: string;
      kdfParams?: {
        algorithm: string;
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
      };
      totpRequired?: boolean;
    }>('/api/v1/auth/login/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  loginVerifyTOTP(body: { email: string; code: string }) {
    return request<{
      sessionToken: string;
      serverProofM2: string;
      encryptedVaultKey: string;
      vaultKeyNonce: string;
      vaultKeyTag: string;
      kdfParams: {
        algorithm: string;
        memory: number;
        iterations: number;
        parallelism: number;
        keyLength: number;
      };
    }>('/api/v1/auth/login/totp/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  logout(token: string) {
    return request<void>('/api/v1/auth/logout', {
      method: 'POST',
      token,
    });
  },
};

// Vault API
export const vaultApi = {
  getVaultKey(token: string) {
    return request<{
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
    }>('/api/v1/vault/key', { token });
  },

  syncPull(token: string, after?: string) {
    const params = after ? `?after=${encodeURIComponent(after)}` : '';
    return request<{
      items: Array<{
        id: string;
        vaultId: string;
        itemType: string;
        encryptedData: string;
        nonce: string;
        tag: string;
        revision: number;
        createdAt: string;
        updatedAt: string;
      }>;
      syncToken: string;
    }>(`/api/v1/vault/sync${params}`, { token });
  },

  syncPush(
    token: string,
    body: {
      items: Array<{
        id: string;
        itemType: string;
        encryptedData: string;
        nonce: string;
        tag: string;
        uriHash?: string;
        revision: number;
      }>;
    },
  ) {
    return request<{ accepted: number; conflicts: string[] }>('/api/v1/vault/sync', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  createItem(
    token: string,
    body: {
      itemType: string;
      encryptedData: string;
      nonce: string;
      tag: string;
      uriHash?: string;
    },
  ) {
    return request<{ id: string; vaultId?: string }>('/api/v1/vault/items', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  updateItem(
    token: string,
    itemId: string,
    body: {
      encryptedData: string;
      nonce: string;
      tag: string;
    },
  ) {
    return request<{ status: string }>(`/api/v1/vault/items/${itemId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    });
  },

  deleteItem(token: string, itemId: string) {
    return request<void>(`/api/v1/vault/items/${itemId}`, {
      method: 'DELETE',
      token,
    });
  },

  getItem(token: string, itemId: string) {
    return request<{
      id: string;
      vaultId: string;
      itemType: string;
      encryptedData: string;
      nonce: string;
      tag: string;
      revision: number;
      createdAt: string;
      updatedAt: string;
    }>(`/api/v1/vault/items/${itemId}`, { token });
  },
};

// Agent API
export const agentApi = {
  create(
    token: string,
    body: { name: string; description?: string; agentType: string },
  ) {
    return request<{
      id: string;
      name: string;
      agentType: string;
      apiKey: string;
      status: string;
      createdAt: string;
    }>('/api/v1/agents', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  list(token: string) {
    return request<{
      agents: Array<{
        id: string;
        name: string;
        description: string;
        agentType: string;
        status: string;
        lastActiveAt: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('/api/v1/agents', { token });
  },

  get(token: string, id: string) {
    return request<{
      id: string;
      name: string;
      description: string;
      agentType: string;
      status: string;
      lastActiveAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>(`/api/v1/agents/${id}`, { token });
  },

  update(
    token: string,
    id: string,
    body: { name?: string; description?: string; status?: string },
  ) {
    return request<{ status: string }>(`/api/v1/agents/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    });
  },

  delete(token: string, id: string) {
    return request<void>(`/api/v1/agents/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  createPolicy(
    token: string,
    agentId: string,
    body: { policyType: string; rules: Record<string, unknown>; scopeFilter?: Record<string, unknown>; priority?: number },
  ) {
    return request<{ id: string; policyType: string; createdAt: string }>(`/api/v1/agents/${agentId}/policies`, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  listPolicies(token: string, agentId: string) {
    return request<{
      policies: Array<{
        id: string;
        policyType: string;
        rules: Record<string, unknown>;
        scopeFilter: Record<string, unknown> | null;
        priority: number;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/v1/agents/${agentId}/policies`, { token });
  },

  updatePolicy(
    token: string,
    agentId: string,
    policyId: string,
    body: { rules?: Record<string, unknown>; scopeFilter?: Record<string, unknown>; priority?: number; enabled?: boolean },
  ) {
    return request<{ status: string }>(`/api/v1/agents/${agentId}/policies/${policyId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    });
  },

  deletePolicy(token: string, agentId: string, policyId: string) {
    return request<void>(`/api/v1/agents/${agentId}/policies/${policyId}`, {
      method: 'DELETE',
      token,
    });
  },
};

// Connection API
export const connectionApi = {
  create(
    token: string,
    body: {
      provider: string;
      displayName: string;
      providerAccountId?: string;
      accessTokenEnc: string;
      accessTokenNonce: string;
      accessTokenTag: string;
      refreshTokenEnc?: string;
      refreshTokenNonce?: string;
      refreshTokenTag?: string;
      tokenExpiresAt?: string;
      scopes?: string[];
      metadata?: Record<string, unknown>;
    },
  ) {
    return request<{ id: string; provider: string; createdAt: string }>('/api/v1/connections', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  list(token: string) {
    return request<{
      connections: Array<{
        id: string;
        provider: string;
        providerAccountId: string;
        displayName: string;
        scopes: string[];
        status: string;
        tokenExpiresAt: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('/api/v1/connections', { token });
  },

  get(token: string, id: string) {
    return request<{
      id: string;
      provider: string;
      providerAccountId: string;
      displayName: string;
      accessTokenEnc: string;
      accessTokenNonce: string;
      accessTokenTag: string;
      refreshTokenEnc: string | null;
      refreshTokenNonce: string | null;
      refreshTokenTag: string | null;
      scopes: string[];
      status: string;
      tokenExpiresAt: string | null;
      metadata: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }>(`/api/v1/connections/${id}`, { token });
  },

  update(
    token: string,
    id: string,
    body: {
      displayName?: string;
      accessTokenEnc?: string;
      accessTokenNonce?: string;
      accessTokenTag?: string;
      refreshTokenEnc?: string;
      refreshTokenNonce?: string;
      refreshTokenTag?: string;
      tokenExpiresAt?: string;
      scopes?: string[];
      status?: string;
    },
  ) {
    return request<{ status: string }>(`/api/v1/connections/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(body),
    });
  },

  delete(token: string, id: string) {
    return request<void>(`/api/v1/connections/${id}`, {
      method: 'DELETE',
      token,
    });
  },
};

export const auditApi = {
  listEvents(token: string, limit = 50, offset = 0) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return request<{
      events: Array<{
        id: string;
        actorType: string;
        actorId: string;
        action: string;
        resourceType: string;
        resourceId: string;
        decision: string;
        metadata: Record<string, unknown> | null;
        eventHash: string;
        prevEventHash: string;
        createdAt: string;
      }>;
      limit: number;
      offset: number;
    }>(`/api/v1/audit?${params}`, { token });
  },

  verifyChain(token: string) {
    return request<{ valid: boolean; verified: number }>('/api/v1/audit/verify', {
      token,
    });
  },
};

// Settings API
export const settingsApi = {
  // Session management
  listSessions(token: string) {
    return request<{
      sessions: Array<{
        id: string;
        deviceName: string;
        ipAddress: string;
        createdAt: string;
        lastActiveAt: string;
        expiresAt: string;
      }>;
    }>('/api/v1/auth/sessions', { token });
  },

  revokeSession(token: string, sessionId: string) {
    return request<{ status: string }>(`/api/v1/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      token,
    });
  },

  revokeAllSessions(token: string) {
    return request<{ status: string }>('/api/v1/auth/sessions', {
      method: 'DELETE',
      token,
    });
  },

  // TOTP 2FA
  totpStatus(token: string) {
    return request<{ enabled: boolean }>('/api/v1/auth/totp/status', { token });
  },

  enrollTOTP(token: string) {
    return request<{ secret: string; uri: string }>('/api/v1/auth/totp/enroll', {
      method: 'POST',
      token,
    });
  },

  verifyTOTP(token: string, code: string) {
    return request<{ status: string }>('/api/v1/auth/totp/verify', {
      method: 'POST',
      token,
      body: JSON.stringify({ code }),
    });
  },

  disableTOTP(token: string, code: string) {
    return request<{ status: string }>('/api/v1/auth/totp/disable', {
      method: 'POST',
      token,
      body: JSON.stringify({ code }),
    });
  },
};

// Wallet API (watch-only). Private keys are derived in the browser from the seed
// and never sent here; this client only ever transmits xpub + public addresses.
type WalletAccountDTO = {
  id: string;
  coin: string;
  network: string;
  scriptType?: string;
  accountIndex: number;
  derivationPath: string;
  xpub: string;
  label: string;
  cachedBalance: string;
  createdAt: string;
  updatedAt: string;
};

export const walletApi = {
  createAccount(
    token: string,
    body: {
      coin: 'btc' | 'eth';
      network?: 'mainnet' | 'testnet';
      scriptType?: 'p2wpkh' | 'p2pkh';
      accountIndex?: number;
      derivationPath: string;
      xpub: string;
      label?: string;
    },
  ) {
    return request<WalletAccountDTO>('/api/v1/wallet/accounts', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  listAccounts(token: string) {
    return request<{ accounts: WalletAccountDTO[] }>('/api/v1/wallet/accounts', { token });
  },

  deleteAccount(token: string, id: string) {
    return request<{ deleted: boolean }>(`/api/v1/wallet/accounts/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  addAddress(
    token: string,
    accountId: string,
    body: { address: string; derivationPath: string; change: 0 | 1; addressIndex: number; publicKey: string },
  ) {
    return request<{ id: string; address: string; cachedBalance: string }>(
      `/api/v1/wallet/accounts/${accountId}/addresses`,
      { method: 'POST', token, body: JSON.stringify(body) },
    );
  },

  listAddresses(token: string, accountId: string) {
    return request<{
      addresses: Array<{
        id: string;
        address: string;
        derivationPath: string;
        change: number;
        addressIndex: number;
        publicKey: string;
        cachedBalance: string;
      }>;
    }>(`/api/v1/wallet/accounts/${accountId}/addresses`, { token });
  },

  balance(token: string, accountId: string) {
    return request<{ coin: string; network: string; confirmed: string; unconfirmed: string }>(
      `/api/v1/wallet/accounts/${accountId}/balance`,
      { token },
    );
  },

  // Relay a client-built+signed raw transaction to the public node. The tx is
  // assembled and signed entirely client-side (packages/crypto wallet-tx.ts); the
  // server only forwards rawTxHex and returns the txid. Mainnet sends must pass the
  // UI's explicit double-confirm gate before reaching here.
  broadcast(
    token: string,
    body: { coin: 'btc' | 'eth'; network?: 'mainnet' | 'testnet'; rawTxHex: string },
  ) {
    return request<{ coin: string; network: string; txid: string }>('/api/v1/wallet/broadcast', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  },

  // --- Transaction-prep reads (feed packages/crypto wallet-tx.ts before signing) ---

  btcUtxos(token: string, address: string, network?: 'mainnet' | 'testnet') {
    const q = new URLSearchParams({ address, ...(network ? { network } : {}) });
    return request<{ utxos: Array<{ txid: string; vout: number; value: string }> }>(
      `/api/v1/wallet/btc/utxos?${q}`,
      { token },
    );
  },

  btcFees(token: string, network?: 'mainnet' | 'testnet') {
    const q = new URLSearchParams(network ? { network } : {});
    return request<{
      fastestFee: number;
      halfHourFee: number;
      hourFee: number;
      economyFee: number;
      minimumFee: number;
    }>(`/api/v1/wallet/btc/fees?${q}`, { token });
  },

  ethNonce(token: string, address: string, network?: 'mainnet' | 'testnet') {
    const q = new URLSearchParams({ address, ...(network ? { network } : {}) });
    return request<{ nonce: string }>(`/api/v1/wallet/eth/nonce?${q}`, { token });
  },

  ethGas(token: string, network?: 'mainnet' | 'testnet') {
    const q = new URLSearchParams(network ? { network } : {});
    return request<{ gasPrice: string; suggestedPriorityFee: string }>(
      `/api/v1/wallet/eth/gas?${q}`,
      { token },
    );
  },
};

export { ApiError };
