'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVaultStore, type DecryptedVaultItem } from '@/lib/vault-store';
import { createVaultItem, syncVault } from '@/lib/vault-service';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/vault/search-bar';
import {
  parseAndClassify,
  type GroupedCredential,
  type EnvImportResult,
} from '@/lib/env-import-parser';
import {
  CREDENTIAL_CATEGORIES,
  PROVIDER_TEMPLATES,
  getProvider,
  getCategory,
} from '@authbox/shared';
import {
  checkCredentialHealth,
  hasHealthCheck,
  type HealthCheckResult,
  type HealthStatus,
} from '@/lib/credential-health';

type ViewMode = 'browse' | 'import-upload' | 'import-preview' | 'import-progress' | 'import-done';

export default function ApiKeysPage() {
  const items = useVaultStore((s) => s.items);
  const status = useVaultStore((s) => s.status);

  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Import state
  const [importResult, setImportResult] = useState<EnvImportResult | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [healthResults, setHealthResults] = useState<Map<string, HealthCheckResult>>(new Map());
  const [checkingHealth, setCheckingHealth] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Filter api_key items
  const apiKeyItems = Array.from(items.values()).filter(
    (item) => item.itemType === 'api_key',
  );

  // Search filter
  const filteredItems = query
    ? apiKeyItems.filter((item) => {
        const data = item.data as Record<string, string>;
        const searchStr = `${item.name} ${data?.service ?? ''} ${data?.keyName ?? ''}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
      })
    : apiKeyItems;

  // Group by category
  const groupedItems = filteredItems.reduce(
    (acc, item) => {
      const data = item.data as Record<string, string>;
      const providerId = data?.providerId;
      const provider = providerId ? getProvider(providerId) : null;
      const categoryId = provider?.categoryId ?? data?.categoryId ?? 'uncategorized';
      if (!acc[categoryId]) acc[categoryId] = [];
      acc[categoryId].push(item);
      return acc;
    },
    {} as Record<string, DecryptedVaultItem[]>,
  );

  // Sync on mount
  useEffect(() => {
    if (status === 'unlocked') {
      setSyncing(true);
      syncVault().finally(() => setSyncing(false));
    }
  }, [status]);

  // ── File Handling ─────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      const result = parseAndClassify(content, 'auto');
      setImportResult(result);

      // Auto-select all classified providers
      setSelectedProviders(new Set(result.classified.map((c) => c.providerId)));
      setViewMode('import-preview');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  // ── Import Execution ──────────────────────────────────────────────────

  const executeImport = useCallback(async () => {
    if (!importResult) return;

    const toImport = importResult.classified.filter((c) =>
      selectedProviders.has(c.providerId),
    );
    setViewMode('import-progress');
    setImportProgress({ done: 0, total: toImport.length, errors: 0 });

    let errors = 0;
    for (let i = 0; i < toImport.length; i++) {
      const cred = toImport[i];
      try {
        await createVaultItem('api_key', `${cred.providerName}`, {
          service: cred.providerName,
          providerId: cred.providerId,
          categoryId: cred.categoryId,
          credentials: cred.fields,
          keyName: Object.keys(cred.fields)[0] ?? 'api_key',
          keyValue: Object.values(cred.fields)[0] ?? '',
        });
      } catch {
        errors++;
      }
      setImportProgress({ done: i + 1, total: toImport.length, errors });
    }

    setViewMode('import-done');
  }, [importResult, selectedProviders]);

  const resetImport = useCallback(() => {
    setViewMode('browse');
    setImportResult(null);
    setSelectedProviders(new Set());
    setImportProgress({ done: 0, total: 0, errors: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
    syncVault();
  }, []);

  // ── Health Check ───────────────────────────────────────────────────────

  const runHealthCheck = useCallback(async (item: DecryptedVaultItem) => {
    const data = item.data as Record<string, string>;
    const providerId = data?.providerId;
    if (!providerId || !hasHealthCheck(providerId)) return;

    setCheckingHealth((prev) => new Set(prev).add(item.id));

    const fields = data?.credentials
      ? (typeof data.credentials === 'string' ? JSON.parse(data.credentials) : data.credentials)
      : { api_key: data?.keyValue, ...data };

    const result = await checkCredentialHealth(providerId, fields as Record<string, string>);
    setHealthResults((prev) => new Map(prev).set(item.id, result));
    setCheckingHealth((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }, []);

  const statusColor = (s: HealthStatus): string => {
    switch (s) {
      case 'valid': return 'var(--primary)';
      case 'invalid': return 'var(--destructive)';
      case 'expired': return 'var(--secondary)';
      case 'quota_exceeded': return 'var(--secondary)';
      default: return 'var(--muted-foreground)';
    }
  };

  // ── Toggle Provider Selection ─────────────────────────────────────────

  const toggleProvider = useCallback((providerId: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!importResult) return;
    if (selectedProviders.size === importResult.classified.length) {
      setSelectedProviders(new Set());
    } else {
      setSelectedProviders(new Set(importResult.classified.map((c) => c.providerId)));
    }
  }, [importResult, selectedProviders]);

  // ── Render ────────────────────────────────────────────────────────────

  if (viewMode === 'import-upload') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Import API Keys</h2>
          <Button variant="ghost" onClick={() => setViewMode('browse')}>Cancel</Button>
        </div>

        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-low)]"
          style={{ borderColor: 'var(--outline-variant)' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg className="mx-auto h-12 w-12 mb-4" style={{ color: 'var(--muted-foreground)' }} fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-lg font-medium mb-2">Drop .env or JSON config file</p>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Supports .env, .env.local, .env.production, JSON config files
          </p>
          <p className="text-xs mt-4" style={{ color: 'var(--muted-foreground)' }}>
            70+ providers auto-detected: OpenAI, Anthropic, AWS, Stripe, Telegram...
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".env,.env.local,.env.production,.env.staging,.env.development,.json,.txt"
          className="hidden"
          onChange={handleFileInput}
        />

        <div className="mt-8 p-4 rounded-lg" style={{ background: 'var(--surface-low)' }}>
          <p className="text-sm font-medium mb-2">Security</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            File is parsed locally in your browser. Secrets are encrypted with your vault key
            before being stored. The server never sees plaintext credentials.
          </p>
        </div>
      </div>
    );
  }

  if (viewMode === 'import-preview' && importResult) {
    const { classified, unclassified, stats } = importResult;
    const selectedCount = selectedProviders.size;

    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Review Credentials</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setViewMode('import-upload')}>Back</Button>
            <Button onClick={executeImport} disabled={selectedCount === 0}>
              Import {selectedCount} credential{selectedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex gap-4 mb-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <span>{stats.totalVars} env vars parsed</span>
          <span>{stats.classifiedVars} classified</span>
          <span>{stats.providers} providers</span>
          <span>{stats.categories} categories</span>
          {stats.unclassifiedVars > 0 && (
            <span className="text-[var(--secondary)]">{stats.unclassifiedVars} unrecognized</span>
          )}
        </div>

        {/* Select all toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={selectedProviders.size === classified.length}
              onChange={toggleAll}
              className="rounded"
            />
            Select all ({classified.length})
          </label>
        </div>

        {/* Classified credentials by category */}
        {Object.entries(
          classified.reduce(
            (acc, cred) => {
              if (!acc[cred.categoryId]) acc[cred.categoryId] = [];
              acc[cred.categoryId].push(cred);
              return acc;
            },
            {} as Record<string, GroupedCredential[]>,
          ),
        ).map(([catId, creds]) => (
          <div key={catId} className="mb-6">
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
              {creds[0]?.categoryName ?? catId}
            </h3>
            <div className="space-y-2">
              {creds.map((cred) => (
                <label
                  key={cred.providerId}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: selectedProviders.has(cred.providerId)
                      ? 'var(--primary-container)'
                      : 'var(--surface-low)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedProviders.has(cred.providerId)}
                    onChange={() => toggleProvider(cred.providerId)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{cred.providerName}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {Object.keys(cred.fields).join(', ')}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-highest)', color: 'var(--muted-foreground)' }}>
                    {Object.keys(cred.fields).length} field{Object.keys(cred.fields).length !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Unclassified */}
        {unclassified.length > 0 && (
          <div className="mt-6 p-4 rounded-lg" style={{ background: 'var(--surface-low)' }}>
            <p className="text-sm font-medium mb-2">Unrecognized ({unclassified.length})</p>
            <div className="space-y-1">
              {unclassified.slice(0, 10).map((v) => (
                <p key={v.key} className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>
                  {v.key}
                </p>
              ))}
              {unclassified.length > 10 && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  ...and {unclassified.length - 10} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'import-progress') {
    const { done, total } = importProgress;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface-highest)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
        </div>
        <p className="text-sm">Encrypting and storing... {done}/{total}</p>
      </div>
    );
  }

  if (viewMode === 'import-done') {
    const { done, errors } = importProgress;
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <svg className="mx-auto h-16 w-16 mb-4" style={{ color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <h2 className="text-xl font-bold mb-2">Import Complete</h2>
        <p className="text-sm mb-1">{done - errors} credential{done - errors !== 1 ? 's' : ''} imported successfully</p>
        {errors > 0 && (
          <p className="text-sm" style={{ color: 'var(--destructive)' }}>{errors} failed</p>
        )}
        <Button className="mt-6" onClick={resetImport}>Done</Button>
      </div>
    );
  }

  // ── Browse Mode ───────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">API Keys & Credentials</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setViewMode('import-upload')}>
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Import .env
          </Button>
        </div>
      </div>

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search API keys..."
      />

      {syncing && (
        <p className="text-xs mt-4" style={{ color: 'var(--muted-foreground)' }}>Syncing vault...</p>
      )}

      {apiKeyItems.length === 0 && !syncing ? (
        <div className="mt-12 text-center">
          <svg className="mx-auto h-16 w-16 mb-4" style={{ color: 'var(--muted-foreground)' }} fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
          </svg>
          <p className="text-lg font-medium mb-2">No API keys yet</p>
          <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
            Import a .env file to get started. 70+ AI infrastructure providers supported.
          </p>
          <Button onClick={() => setViewMode('import-upload')}>Import .env File</Button>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {Object.entries(groupedItems).map(([catId, catItems]) => {
            const category = getCategory(catId);
            return (
              <div key={catId}>
                <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--muted-foreground)' }}>
                  {category?.name ?? catId} ({catItems.length})
                </h3>
                <div className="space-y-2">
                  {catItems.map((item) => {
                    const data = item.data as Record<string, string>;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                        style={{ background: 'var(--surface-low)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                            {data?.keyName ?? data?.service ?? ''}
                          </p>
                        </div>
                        {/* Health check */}
                        {data?.providerId && hasHealthCheck(data.providerId) && (
                          checkingHealth.has(item.id) ? (
                            <span className="text-xs px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'var(--surface-highest)' }}>
                              checking...
                            </span>
                          ) : healthResults.has(item.id) ? (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full cursor-pointer"
                              style={{ color: statusColor(healthResults.get(item.id)!.status), background: 'var(--surface-highest)' }}
                              title={`${healthResults.get(item.id)!.message} (${healthResults.get(item.id)!.latencyMs}ms)`}
                              onClick={() => runHealthCheck(item)}
                            >
                              {healthResults.get(item.id)!.status} {healthResults.get(item.id)!.latencyMs}ms
                            </span>
                          ) : (
                            <button
                              className="text-xs px-2 py-0.5 rounded-full transition-colors hover:bg-[var(--surface-highest)]"
                              style={{ color: 'var(--muted-foreground)' }}
                              onClick={() => runHealthCheck(item)}
                            >
                              verify
                            </button>
                          )
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'var(--surface-highest)' }}>
                          {(data?.keyValue ?? '').slice(0, 8)}...
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
