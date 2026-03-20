'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/vault/dialog';
import {
  autoDetectAndParse,
  type ImportFormat,
  type LoginImportItem,
  type ImportResult,
} from '@/lib/import-parsers';
import { createVaultItem } from '@/lib/vault-service';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: (count: number) => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

const FORMAT_OPTIONS: { value: ImportFormat | 'auto'; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto-detect', description: 'Detect format from file content' },
  { value: 'chrome', label: 'Chrome', description: 'Passwords exported from Chrome (CSV)' },
  { value: 'bitwarden', label: 'Bitwarden', description: 'JSON or CSV export from Bitwarden' },
  { value: '1password', label: '1Password', description: 'CSV export from 1Password' },
];

export function ImportDialog({ open, onClose, onComplete }: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [parsedItems, setParsedItems] = useState<LoginImportItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, errors: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFormat('auto');
    setParsedItems([]);
    setSelectedItems(new Set());
    setParseError(null);
    setImportProgress({ done: 0, total: 0, errors: 0 });
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);

    try {
      const text = await file.text();
      const result: ImportResult = autoDetectAndParse(
        text,
        format === 'auto' ? undefined : format,
      );

      if (result.errors.length > 0) {
        setParseError(result.errors.join('; '));
        return;
      }

      if (result.items.length === 0) {
        setParseError(`No login items found. ${result.skipped} entries skipped.`);
        return;
      }

      setParsedItems(result.items);
      // Select all by default
      setSelectedItems(new Set(result.items.map((_, i) => i)));
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to read file');
    }

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleImport() {
    const itemsToImport = parsedItems.filter((_, i) => selectedItems.has(i));
    if (itemsToImport.length === 0) return;

    setStep('importing');
    setImportProgress({ done: 0, total: itemsToImport.length, errors: 0 });

    let errors = 0;
    for (let i = 0; i < itemsToImport.length; i++) {
      const item = itemsToImport[i];
      try {
        await createVaultItem('login', item.name, {
          username: item.username,
          password: item.password,
          uri: item.uri,
          notes: item.notes,
        });
      } catch {
        errors++;
      }
      setImportProgress({ done: i + 1, total: itemsToImport.length, errors });
    }

    setStep('done');
    onComplete(itemsToImport.length - errors);
  }

  function toggleItem(index: number) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedItems.size === parsedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(parsedItems.map((_, i) => i)));
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Import Passwords">
      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="import-format" className="text-sm font-medium">
              Source Format
            </label>
            <select
              id="import-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImportFormat | 'auto')}
              className="flex h-10 w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} -- {opt.description}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-8 text-center">
            <p className="text-sm text-[var(--muted-foreground)] mb-3">
              Select a CSV or JSON file exported from your password manager
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileSelect}
              className="hidden"
              id="import-file"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
          </div>

          {parseError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
              {parseError}
            </div>
          )}

          <div className="rounded-lg bg-[var(--muted)] p-3">
            <p className="text-xs text-[var(--muted-foreground)]">
              Your file is parsed entirely in the browser. No data is sent to the server
              until items are encrypted with your vault key and you confirm the import.
            </p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted-foreground)]">
              {parsedItems.length} items found, {selectedItems.size} selected
            </p>
            <button onClick={toggleAll} className="text-xs text-[var(--primary)] hover:underline">
              {selectedItems.size === parsedItems.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
            {parsedItems.map((item, i) => (
              <label
                key={i}
                className={`flex items-center gap-3 p-2.5 border-b border-[var(--border)] last:border-b-0 text-sm cursor-pointer hover:bg-[var(--accent)] ${
                  selectedItems.has(i) ? '' : 'opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.has(i)}
                  onChange={() => toggleItem(i)}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] truncate">
                    {item.username}{item.uri ? ` -- ${item.uri}` : ''}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button onClick={handleImport} disabled={selectedItems.size === 0}>
              Import {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col gap-4 items-center py-4">
          <p className="text-sm font-medium">
            Encrypting and importing...
          </p>
          <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all"
              style={{
                width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {importProgress.done} / {importProgress.total}
            {importProgress.errors > 0 ? ` (${importProgress.errors} errors)` : ''}
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-4 items-center py-4">
          <p className="text-lg font-semibold">Import Complete</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {importProgress.done - importProgress.errors} of {importProgress.total} items imported successfully.
            {importProgress.errors > 0 && ` ${importProgress.errors} failed.`}
          </p>
          <Button onClick={handleClose}>Done</Button>
        </div>
      )}
    </Dialog>
  );
}
