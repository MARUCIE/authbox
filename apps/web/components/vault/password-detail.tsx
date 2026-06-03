'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { parseOtpauth, totpCode, totpSecondsRemaining, formatCode } from '@authbox/crypto';
import { Button } from '@/components/ui/button';
import type { DecryptedVaultItem } from '@/lib/vault-store';

interface PasswordDetailProps {
  item: DecryptedVaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Only allow http/https URLs to prevent javascript: protocol XSS. */
function isSafeURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Live TOTP code with a per-second countdown — the web mirror of the iOS
 * `TOTPCodeView`. The code is a pure function of the current time (re-derived
 * each tick via the proven `@authbox/crypto` engine), never stored or stale.
 */
function TotpRow({
  raw,
  copiedField,
  onCopy,
}: {
  raw: string;
  copiedField: string | null;
  onCopy: (value: string, field: string) => void;
}) {
  const params = useMemo(() => parseOtpauth(raw), [raw]);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!params) return null;
  const code = totpCode(params, now);
  const remaining = totpSecondsRemaining(params, now);

  return (
    <div className="group">
      <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
        One-Time Password{params.issuer ? ` -- ${params.issuer}` : ''}
      </label>
      <div className="flex items-center gap-2 mt-1">
        <p className="flex-1 text-lg font-mono text-blue-600 dark:text-blue-400 tabular-nums">
          {formatCode(code)}
        </p>
        <span
          className={`text-xs tabular-nums w-7 text-right ${remaining <= 5 ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]'}`}
        >
          {remaining}s
        </span>
        <button
          onClick={() => onCopy(code, 'totp')}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] transition-colors opacity-0 group-hover:opacity-100"
        >
          {copiedField === 'totp' ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function PasswordDetail({ item, onEdit, onDelete, onClose }: PasswordDetailProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = item.data;

  const copyToClipboard = useCallback(async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);

      // Auto-clear clipboard after 30 seconds (unconditional write to avoid
      // readText permission prompt and timing-based oracle).
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
      }, 30_000);
    } catch {
      // Clipboard API may fail in insecure contexts
    }
  }, []);

  const fields = [
    { label: 'Username', value: data.username, field: 'username', sensitive: false },
    { label: 'Password', value: data.password, field: 'password', sensitive: true },
    { label: 'Website', value: data.uri, field: 'uri', sensitive: false, isLink: true },
    { label: 'Notes', value: data.notes, field: 'notes', sensitive: false, multiline: true },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold">{item.name}</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {item.itemType} -- rev {item.revision}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg"
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 py-4 space-y-4 overflow-y-auto">
        {fields.map(({ label, value, field, sensitive, isLink, multiline }) => {
          if (!value) return null;

          const displayValue = sensitive && !showPassword
            ? '\u2022'.repeat(12)
            : value;

          return (
            <div key={field} className="group">
              <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                {label}
              </label>
              <div className="flex items-start gap-2 mt-1">
                <div className="flex-1 min-w-0">
                  {isLink ? (
                    isSafeURL(value) ? (
                      <a
                        href={value}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 underline break-all"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="text-sm break-all">{value}</span>
                    )
                  ) : multiline ? (
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {displayValue}
                    </p>
                  ) : (
                    <p className="text-sm font-mono break-all">{displayValue}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {sensitive && (
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  )}
                  <button
                    onClick={() => copyToClipboard(value, field)}
                    className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                  >
                    {copiedField === field ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* One-time password (2FA) */}
        {(() => {
          const totpRaw =
            typeof data.otpAuth === 'string'
              ? data.otpAuth
              : typeof data.totpSecret === 'string'
                ? data.totpSecret
                : undefined;
          return totpRaw ? (
            <TotpRow raw={totpRaw} copiedField={copiedField} onCopy={copyToClipboard} />
          ) : null;
        })()}

        {/* Metadata */}
        <div className="pt-4 border-t border-[var(--border)] space-y-2">
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>Created</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>Updated</span>
            <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
        <Button onClick={onEdit} variant="outline" className="flex-1">
          Edit
        </Button>
        {confirmDelete ? (
          <div className="flex gap-2 flex-1">
            <Button
              onClick={onDelete}
              variant="destructive"
              className="flex-1"
            >
              Confirm
            </Button>
            <Button
              onClick={() => setConfirmDelete(false)}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setConfirmDelete(true)}
            variant="ghost"
            className="flex-1 text-[var(--destructive)]"
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
