'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  generatePassword,
  estimateEntropy,
  strengthLabel,
  DEFAULT_OPTIONS,
  type GeneratorOptions,
} from '@/lib/password-generator';

export interface PasswordFormData {
  name: string;
  username: string;
  password: string;
  uri: string;
  notes: string;
  favorite: boolean;
}

interface PasswordFormProps {
  initial?: Partial<PasswordFormData>;
  onSubmit: (data: PasswordFormData) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function PasswordForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: PasswordFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [uri, setUri] = useState(initial?.uri ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generator options
  const [genOptions, setGenOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);

  const entropy = estimateEntropy(genOptions);
  const strength = strengthLabel(entropy);

  function handleGenerate() {
    const generated = generatePassword(genOptions);
    setPassword(generated);
    setShowGenerator(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit({ name, username, password, uri, notes, favorite });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  const strengthColors: Record<string, string> = {
    weak: 'bg-red-500',
    fair: 'bg-yellow-500',
    strong: 'bg-blue-500',
    excellent: 'bg-green-500',
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-name" className="text-sm font-medium">
          Name
        </label>
        <Input
          id="pw-name"
          placeholder="e.g. GitHub, Gmail"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      {/* URI */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-uri" className="text-sm font-medium">
          Website URL
        </label>
        <Input
          id="pw-uri"
          type="url"
          placeholder="https://github.com/login"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
        />
      </div>

      {/* Username */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-username" className="text-sm font-medium">
          Username / Email
        </label>
        <Input
          id="pw-username"
          placeholder="user@example.com"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-password" className="text-sm font-medium">
          Password
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="pw-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter or generate a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-1"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowGenerator(!showGenerator)}
            className="shrink-0"
          >
            Generate
          </Button>
        </div>

        {/* Password strength indicator */}
        {password && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${strengthColors[strengthLabel(estimateEntropy({ ...DEFAULT_OPTIONS, length: password.length })).level]}`}
                style={{
                  width: `${Math.min(100, (password.length / 24) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-[var(--muted-foreground)]">
              {password.length} chars
            </span>
          </div>
        )}

        {/* Generator panel */}
        {showGenerator && (
          <div className="rounded-lg border border-[var(--border)] p-4 mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Password Generator</span>
              <span className={`text-xs font-medium ${strengthColors[strength.level].replace('bg-', 'text-')}`}>
                {strength.label} ({entropy} bits)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-[var(--muted-foreground)] shrink-0">
                Length: {genOptions.length}
              </label>
              <input
                type="range"
                min="8"
                max="64"
                value={genOptions.length}
                onChange={(e) =>
                  setGenOptions({ ...genOptions, length: parseInt(e.target.value) })
                }
                className="flex-1"
                aria-label="Password length"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              {(['lowercase', 'uppercase', 'digits', 'symbols'] as const).map(
                (key) => (
                  <label key={key} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={genOptions[key]}
                      onChange={(e) =>
                        setGenOptions({ ...genOptions, [key]: e.target.checked })
                      }
                    />
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                ),
              )}
            </div>

            <Button type="button" onClick={handleGenerate} className="w-full" size="sm">
              Use Generated Password
            </Button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-notes" className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id="pw-notes"
          placeholder="Optional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="flex w-full rounded-lg border border-[var(--input)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        />
      </div>

      {/* Favorite */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={favorite}
          onChange={(e) => setFavorite(e.target.checked)}
        />
        Mark as favorite
      </label>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
