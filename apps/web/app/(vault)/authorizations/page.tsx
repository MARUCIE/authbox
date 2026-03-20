'use client';

import { useEffect, useState, useCallback } from 'react';
import { encryptAES256GCM, generateRandomBytes } from '@authbox/crypto';
import { useVaultStore } from '@/lib/vault-store';
import { connectionApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/vault/dialog';

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

interface ConnectionItem {
  id: string;
  provider: string;
  providerAccountId: string;
  displayName: string;
  scopes: string[];
  status: string;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'detail' | 'create';

const PROVIDERS = [
  { value: 'github', label: 'GitHub', icon: 'GH' },
  { value: 'google', label: 'Google', icon: 'Go' },
  { value: 'slack', label: 'Slack', icon: 'Sl' },
  { value: 'azure', label: 'Azure AD', icon: 'Az' },
  { value: 'aws', label: 'AWS', icon: 'AW' },
  { value: 'openai', label: 'OpenAI', icon: 'OA' },
  { value: 'anthropic', label: 'Anthropic', icon: 'An' },
  { value: 'custom', label: 'Custom API', icon: 'AP' },
];

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950',
  expired: 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950',
  revoked: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950',
  error: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950',
};

export default function AuthorizationsPage() {
  const sessionToken = useVaultStore((s) => s.sessionToken);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const vaultKey = useVaultStore((s) => s.vaultKey);

  // Create form
  const [newProvider, setNewProvider] = useState('github');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [newAccessToken, setNewAccessToken] = useState('');
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [newScopes, setNewScopes] = useState('');

  const fetchConnections = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await connectionApi.list(sessionToken);
      setConnections(res.connections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const selectedConnection = connections.find((c) => c.id === selectedId) ?? null;

  function providerInfo(value: string) {
    return PROVIDERS.find((p) => p.value === value) ?? { value, label: value, icon: value.slice(0, 2).toUpperCase() };
  }

  function isExpiringSoon(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  async function handleCreate() {
    if (!sessionToken || !newDisplayName.trim() || !vaultKey) return;
    setLoading(true);
    setError(null);
    try {
      // Encrypt access token with vault key (AES-256-GCM)
      const tokenText = newAccessToken.trim() || 'empty';
      const tokenBytes = new TextEncoder().encode(tokenText);
      const accessEnc = await encryptAES256GCM(vaultKey, tokenBytes);

      // Encrypt refresh token if provided
      let refreshFields: {
        refreshTokenEnc?: string;
        refreshTokenNonce?: string;
        refreshTokenTag?: string;
      } = {};
      if (newRefreshToken.trim()) {
        const refreshBytes = new TextEncoder().encode(newRefreshToken.trim());
        const refreshEnc = await encryptAES256GCM(vaultKey, refreshBytes);
        refreshFields = {
          refreshTokenEnc: toBase64(refreshEnc.ciphertext),
          refreshTokenNonce: toBase64(refreshEnc.nonce),
          refreshTokenTag: toBase64(refreshEnc.tag),
        };
      }

      const res = await connectionApi.create(sessionToken, {
        provider: newProvider,
        displayName: newDisplayName.trim(),
        providerAccountId: newAccountId.trim() || undefined,
        accessTokenEnc: toBase64(accessEnc.ciphertext),
        accessTokenNonce: toBase64(accessEnc.nonce),
        accessTokenTag: toBase64(accessEnc.tag),
        ...refreshFields,
        scopes: newScopes.split(',').map((s) => s.trim()).filter(Boolean),
      });

      setNewProvider('github');
      setNewDisplayName('');
      setNewAccountId('');
      setNewAccessToken('');
      setNewRefreshToken('');
      setNewScopes('');
      await fetchConnections();
      setSelectedId(res.id);
      setViewMode('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create connection');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(connectionId: string) {
    if (!sessionToken) return;
    try {
      await connectionApi.delete(sessionToken, connectionId);
      setSelectedId(null);
      setViewMode('list');
      setConfirmDelete(false);
      await fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete connection');
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Left: Connection list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Authorizations</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
              {connections.length} connection{connections.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setViewMode('create')}>
            Add Connection
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {connections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center flex-1 flex flex-col items-center justify-center">
            <h3 className="text-lg font-medium mb-2">No connections</h3>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Connect OAuth providers and API services. Auth Box encrypts all tokens client-side.
            </p>
            <Button onClick={() => setViewMode('create')}>Add Connection</Button>
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {connections.map((conn) => {
              const info = providerInfo(conn.provider);
              return (
                <button
                  key={conn.id}
                  onClick={() => { setSelectedId(conn.id); setViewMode('detail'); setConfirmDelete(false); }}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    conn.id === selectedId
                      ? 'border-[var(--primary)] bg-[var(--accent)]'
                      : 'border-[var(--border)] hover:bg-[var(--accent)]'
                  }`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--muted)] text-xs font-medium shrink-0">
                    {info.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{conn.displayName}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[conn.status] ?? ''}`}>
                        {conn.status}
                      </span>
                      {isExpiringSoon(conn.tokenExpiresAt) && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">Expiring soon</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">
                      {info.label}{conn.providerAccountId ? ` -- ${conn.providerAccountId}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      {selectedConnection && viewMode === 'detail' && (
        <aside className="w-96 shrink-0 border-l border-[var(--border)] pl-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium">
                {providerInfo(selectedConnection.provider).icon}
              </div>
              <div>
                <h3 className="font-semibold">{selectedConnection.displayName}</h3>
                <p className="text-xs text-[var(--muted-foreground)]">{providerInfo(selectedConnection.provider).label}</p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedId(null); setViewMode('list'); }}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 py-4 space-y-4 overflow-y-auto">
            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
              <span>Status</span>
              <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[selectedConnection.status] ?? ''}`}>{selectedConnection.status}</span>
            </div>

            {selectedConnection.providerAccountId && (
              <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                <span>Account</span>
                <span className="font-mono">{selectedConnection.providerAccountId}</span>
              </div>
            )}

            {selectedConnection.scopes.length > 0 && (
              <div>
                <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Scopes</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedConnection.scopes.map((scope) => (
                    <span key={scope} className="text-xs px-2 py-0.5 rounded-full bg-[var(--muted)] font-mono">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedConnection.tokenExpiresAt && (
              <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                <span>Token Expires</span>
                <span className={isExpiringSoon(selectedConnection.tokenExpiresAt) ? 'text-yellow-600 dark:text-yellow-400' : ''}>
                  {new Date(selectedConnection.tokenExpiresAt).toLocaleString()}
                </span>
              </div>
            )}

            <div className="pt-4 border-t border-[var(--border)] space-y-2">
              <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                <span>Created</span>
                <span>{new Date(selectedConnection.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                <span>Updated</span>
                <span>{new Date(selectedConnection.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Security notice */}
            <div className="pt-4 border-t border-[var(--border)]">
              <div className="rounded-lg bg-[var(--muted)] p-3">
                <p className="text-xs text-[var(--muted-foreground)]">
                  All tokens are encrypted client-side with AES-256-GCM before being stored.
                  The server never sees plaintext credentials.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
            {confirmDelete ? (
              <div className="flex gap-2 flex-1">
                <Button onClick={() => handleDelete(selectedConnection.id)} variant="destructive" className="flex-1">
                  Confirm Delete
                </Button>
                <Button onClick={() => setConfirmDelete(false)} variant="outline" className="flex-1">
                  Cancel
                </Button>
              </div>
            ) : (
              <Button onClick={() => setConfirmDelete(true)} variant="ghost" className="flex-1 text-[var(--destructive)]">
                Disconnect
              </Button>
            )}
          </div>
        </aside>
      )}

      {/* Create dialog */}
      <Dialog
        open={viewMode === 'create'}
        onClose={() => setViewMode('list')}
        title="Add Connection"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-provider" className="text-sm font-medium">Provider</label>
            <select
              id="conn-provider"
              value={newProvider}
              onChange={(e) => setNewProvider(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-name" className="text-sm font-medium">Display Name</label>
            <Input
              id="conn-name"
              placeholder="e.g. GitHub Personal, Google Work"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-account" className="text-sm font-medium">Account ID (optional)</label>
            <Input
              id="conn-account"
              placeholder="e.g. username or email"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-access-token" className="text-sm font-medium">Access Token</label>
            <Input
              id="conn-access-token"
              type="password"
              placeholder="Paste your access token or API key"
              value={newAccessToken}
              onChange={(e) => setNewAccessToken(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-refresh-token" className="text-sm font-medium">Refresh Token (optional)</label>
            <Input
              id="conn-refresh-token"
              type="password"
              placeholder="Paste refresh token (for OAuth providers)"
              value={newRefreshToken}
              onChange={(e) => setNewRefreshToken(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="conn-scopes" className="text-sm font-medium">Scopes (comma-separated)</label>
            <Input
              id="conn-scopes"
              placeholder="e.g. repo, read:user, write:org"
              value={newScopes}
              onChange={(e) => setNewScopes(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-xs text-[var(--muted-foreground)]">
              Tokens are encrypted client-side with AES-256-GCM before storage.
              The server never sees plaintext credentials.
            </p>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setViewMode('list')}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading || !newDisplayName.trim()}>
              {loading ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
