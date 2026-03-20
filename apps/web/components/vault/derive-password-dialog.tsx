'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/vault/dialog';
import {
  derivePassword,
  mnemonicToSeed,
  setWordlist,
  type DerivePasswordOptions,
} from '@authbox/crypto';
import { ENGLISH_WORDLIST } from '@authbox/crypto';

setWordlist(ENGLISH_WORDLIST);

interface DerivePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  vaultKey: Uint8Array | null;
}

/**
 * Deterministic Password Derivation dialog.
 *
 * This is the v3 "unstoppable" feature: derive a password from seed + site name.
 * No storage needed — same seed + site always produces the same password.
 * Users can regenerate all passwords from their 24-word seed phrase alone.
 */
export function DerivePasswordDialog({ open, onClose, vaultKey }: DerivePasswordDialogProps) {
  const [site, setSite] = useState('');
  const [length, setLength] = useState(20);
  const [counter, setCounter] = useState(0);
  const [lowercase, setLowercase] = useState(true);
  const [uppercase, setUppercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [copied, setCopied] = useState(false);

  const options: DerivePasswordOptions = useMemo(() => ({
    length,
    counter,
    lowercase,
    uppercase,
    digits,
    symbols,
  }), [length, counter, lowercase, uppercase, digits, symbols]);

  // Derive password when site changes (uses vaultKey as seed proxy)
  const derivedPassword = useMemo(() => {
    if (!vaultKey || !site.trim()) return '';
    try {
      // Use vault key as seed material (derived from the same HD tree)
      // In production, this should use the full 64-byte seed stored in memory
      const seedProxy = new Uint8Array(64);
      seedProxy.set(vaultKey, 0);
      seedProxy.set(vaultKey, 32);
      return derivePassword(seedProxy, site.trim(), options);
    } catch {
      return '';
    }
  }, [vaultKey, site, options]);

  const handleCopy = useCallback(async () => {
    if (!derivedPassword) return;
    try {
      await navigator.clipboard.writeText(derivedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Auto-clear clipboard after 30s
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
      }, 30_000);
    } catch {
      // Clipboard API may fail
    }
  }, [derivedPassword]);

  return (
    <Dialog open={open} onClose={onClose} title="Derive Password">
      <div className="flex flex-col gap-5">
        {/* Explanation */}
        <div className="rounded-lg p-3" style={{ background: 'var(--surface-highest)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Generate a deterministic password from your seed phrase + site name.
            Same seed + same site = same password, every time.
            <strong style={{ color: 'var(--primary)' }}> No storage needed.</strong>
          </p>
        </div>

        {/* Site input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Site / Service</label>
          <Input
            type="text"
            placeholder="e.g. github.com, stripe.com"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            autoFocus
            autoCapitalize="none"
          />
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Length</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-mono w-6 text-right">{length}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Rotation</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCounter(Math.max(0, counter - 1))}
                className="rounded px-2 py-1 text-xs"
                style={{ background: 'var(--surface-highest)' }}
                disabled={counter === 0}
              >
                -
              </button>
              <span className="text-xs font-mono flex-1 text-center">#{counter}</span>
              <button
                onClick={() => setCounter(counter + 1)}
                className="rounded px-2 py-1 text-xs"
                style={{ background: 'var(--surface-highest)' }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Character classes */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'a-z', value: lowercase, set: setLowercase },
            { label: 'A-Z', value: uppercase, set: setUppercase },
            { label: '0-9', value: digits, set: setDigits },
            { label: '!@#', value: symbols, set: setSymbols },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => set(e.target.checked)}
                className="rounded"
              />
              <span className="font-mono">{label}</span>
            </label>
          ))}
        </div>

        {/* Result */}
        {derivedPassword && (
          <div className="rounded-lg p-4" style={{ background: 'var(--surface-low)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                Derived Password
              </span>
              <button
                onClick={handleCopy}
                className="text-xs px-3 py-1 rounded-md transition-colors"
                style={{
                  background: copied ? 'var(--tertiary-container)' : 'var(--surface-highest)',
                  color: copied ? 'var(--tertiary)' : 'var(--primary)',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p
              className="font-mono text-sm break-all select-all"
              style={{ color: 'var(--foreground)', letterSpacing: '0.05em' }}
            >
              {derivedPassword}
            </p>
            <p className="text-[10px] mt-2" style={{ color: 'var(--outline)' }}>
              Deterministic: this password will always be the same for this site + your seed.
              Increment rotation counter to generate a new one.
            </p>
          </div>
        )}

        {!site.trim() && (
          <div className="text-center py-4">
            <p className="text-xs" style={{ color: 'var(--outline)' }}>
              Enter a site name to derive a password
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
