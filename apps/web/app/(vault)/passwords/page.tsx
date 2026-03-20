'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useVaultStore, type DecryptedVaultItem } from '@/lib/vault-store';
import { syncVault, createVaultItem, updateVaultItem, deleteVaultItem, searchVaultItems } from '@/lib/vault-service';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/vault/search-bar';
import { Dialog } from '@/components/vault/dialog';
import { PasswordForm, type PasswordFormData } from '@/components/vault/password-form';
import { PasswordDetail } from '@/components/vault/password-detail';
import { ImportDialog } from '@/components/vault/import-dialog';

type ViewMode = 'list' | 'detail' | 'create' | 'edit';

export default function PasswordsPage() {
  const items = useVaultStore((s) => s.items);
  const status = useVaultStore((s) => s.status);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Sync vault on mount when unlocked
  useEffect(() => {
    if (status === 'unlocked') {
      setSyncing(true);
      syncVault()
        .catch((err) => setError(err instanceof Error ? err.message : 'Sync failed'))
        .finally(() => setSyncing(false));
    }
  }, [status]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    const all = query ? searchVaultItems(query) : Array.from(items.values());
    return all
      .filter((item) => item.itemType === 'login')
      .sort((a, b) => {
        // Favorites first, then alphabetical
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [items, query]);

  const selectedItem = selectedId ? items.get(selectedId) : null;

  const handleCreate = useCallback(async (data: PasswordFormData) => {
    await createVaultItem('login', data.name, {
      username: data.username,
      password: data.password,
      uri: data.uri,
      notes: data.notes,
    }, { favorite: data.favorite });
    setViewMode('list');
  }, []);

  const handleEdit = useCallback(async (data: PasswordFormData) => {
    if (!selectedId) return;
    await updateVaultItem(selectedId, data.name, {
      username: data.username,
      password: data.password,
      uri: data.uri,
      notes: data.notes,
    }, { favorite: data.favorite });
    setViewMode('detail');
  }, [selectedId]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    await deleteVaultItem(selectedId);
    setSelectedId(null);
    setViewMode('list');
  }, [selectedId]);

  if (status !== 'unlocked') {
    return (
      <div className="rounded-lg border border-[var(--border)] p-8 text-center">
        <p className="text-[var(--muted-foreground)]">Vault is locked.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)]">
      {/* Left: List */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Passwords</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
              {syncing ? ' -- syncing...' : ''}
            </p>
          </div>
          <Button onClick={() => setViewMode('create')}>
            Add Password
          </Button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <SearchBar value={query} onChange={setQuery} />
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline"
            >
              dismiss
            </button>
          </div>
        )}

        {/* Item list */}
        {filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center flex-1 flex flex-col items-center justify-center">
            {query ? (
              <>
                <h3 className="text-lg font-medium mb-2">No results</h3>
                <p className="text-sm text-[var(--muted-foreground)]">
                  No passwords match &quot;{query}&quot;
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No passwords yet</h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-4">
                  Add your first password or import from another manager.
                </p>
                <div className="flex gap-3">
                  <Button onClick={() => setViewMode('create')}>
                    Add Password
                  </Button>
                  <Button variant="outline" onClick={() => setShowImport(true)}>
                    Import
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {filteredItems.map((item) => (
              <PasswordListItem
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onClick={() => {
                  setSelectedId(item.id);
                  setViewMode('detail');
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: Detail panel (visible when item selected) */}
      {selectedItem && viewMode === 'detail' && (
        <aside className="w-96 shrink-0 border-l border-[var(--border)] pl-6">
          <PasswordDetail
            item={selectedItem}
            onEdit={() => setViewMode('edit')}
            onDelete={handleDelete}
            onClose={() => {
              setSelectedId(null);
              setViewMode('list');
            }}
          />
        </aside>
      )}

      {/* Create dialog */}
      <Dialog
        open={viewMode === 'create'}
        onClose={() => setViewMode('list')}
        title="Add Password"
      >
        <PasswordForm
          onSubmit={handleCreate}
          onCancel={() => setViewMode('list')}
          submitLabel="Add"
        />
      </Dialog>

      {/* Edit dialog */}
      {selectedItem && (
        <Dialog
          open={viewMode === 'edit'}
          onClose={() => setViewMode('detail')}
          title="Edit Password"
        >
          <PasswordForm
            initial={{
              name: selectedItem.name,
              username: selectedItem.data.username ?? '',
              password: selectedItem.data.password ?? '',
              uri: selectedItem.data.uri ?? '',
              notes: selectedItem.data.notes ?? '',
              favorite: selectedItem.favorite,
            }}
            onSubmit={handleEdit}
            onCancel={() => setViewMode('detail')}
            submitLabel="Save Changes"
          />
        </Dialog>
      )}

      {/* Import dialog */}
      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onComplete={() => {
          // Re-sync to pick up the newly imported items
          syncVault().catch(() => {});
        }}
      />
    </div>
  );
}

// Extracted list item for cleaner render
function PasswordListItem({
  item,
  selected,
  onClick,
}: {
  item: DecryptedVaultItem;
  selected: boolean;
  onClick: () => void;
}) {
  const data = item.data;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-[var(--primary)] bg-[var(--accent)]'
          : 'border-[var(--border)] hover:bg-[var(--accent)]'
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--muted)] text-sm font-medium shrink-0">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{item.name}</p>
          {item.favorite && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400">*</span>
          )}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] truncate">
          {data.username ?? 'No username'}
        </p>
      </div>
    </button>
  );
}
