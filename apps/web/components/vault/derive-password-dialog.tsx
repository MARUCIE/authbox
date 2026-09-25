'use client';

import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/vault/dialog';
import {
  derivePassword,
  mnemonicToSeed,
  validateMnemonic,
  setWordlist,
  type DerivePasswordOptions,
} from '@authbox/crypto';
import { ENGLISH_WORDLIST } from '@authbox/crypto';

setWordlist(ENGLISH_WORDLIST);

interface DerivePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Deterministic Password Derivation dialog.
 *
 * Derives a password from the user's ACTUAL 24-word seed phrase + site name,
 * entered transiently here (like the wallet send flow) and dropped on close.
 * The account vault key must NOT be used as a seed stand-in: for registered
 * accounts it is random and unrelated to the seed, so passwords "derived"
 * from it would be unrecoverable from the 24 words — the exact failure this
 * feature promises to prevent.
 */
export function DerivePasswordDialog({ open, onClose }: DerivePasswordDialogProps) {
  const [site, setSite] = useState('');
  const [mnemonic, setMnemonic] = useState('');
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

  const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, ' ');
  const mnemonicValid = normalizedMnemonic.length > 0 && validateMnemonic(normalizedMnemonic);

  const derivedPassword = useMemo(() => {
    if (!mnemonicValid || !site.trim()) return '';
    try {
      const seed = mnemonicToSeed(normalizedMnemonic);
      return derivePassword(seed, site.trim(), options);
    } catch {
      return '';
    }
  }, [mnemonicValid, normalizedMnemonic, site, options]);

  const handleClose = useCallback(() => {
    setMnemonic(''); // drop the secret before the dialog unmounts
    setSite('');
    onClose();
  }, [onClose]);

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
    <Dialog open={open} onClose={handleClose} title="Derive Password">
      <div className="flex flex-col gap-5">
        {/* Explanation */}
        <div className="rounded-lg p-3" style={{ background: 'var(--surface-highest)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Generate a deterministic password from your seed phrase + site name.
            Same seed + same site = same password, every time.
            <strong style={{ color: 'var(--primary)' }}> No storage needed.</strong>
          </p>
        </div>

        {/* Seed input — transient, never stored */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Recovery Phrase</label>
          <textarea
            placeholder="Enter your 24-word seed phrase (kept in memory only, cleared on close)"
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            rows={3}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            style={{ background: 'var(--surface-low)', borderColor: 'var(--outline)' }}
          />
          {mnemonic.trim().length > 0 && !mnemonicValid && (
            <p className="text-xs" style={{ color: 'var(--destructive)' }}>
              Invalid recovery phrase. Check spelling and word order.
            </p>
          )}
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

        {(!site.trim() || !mnemonicValid) && (
          <div className="text-center py-4">
            <p className="text-xs" style={{ color: 'var(--outline)' }}>
              Enter your recovery phrase and a site name to derive a password
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
