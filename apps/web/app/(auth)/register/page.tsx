'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { register } from '@/lib/auth';
import { estimateEntropy, strengthLabel, DEFAULT_OPTIONS } from '@/lib/password-generator';

const STRENGTH_COLORS: Record<string, string> = {
  weak: 'var(--destructive)',
  fair: 'var(--secondary)',
  strong: 'var(--primary)',
  excellent: 'var(--tertiary)',
};

const CEREMONY_STEPS = [
  { label: 'Deriving keys with Argon2id...', icon: 'lock' },
  { label: 'Generating vault encryption key...', icon: 'key' },
  { label: 'Computing SRP verifier...', icon: 'shield' },
  { label: 'Securing your vault...', icon: 'check' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'deriving'>('form');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError('Master password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setStep('deriving');

    try {
      await register(email, password);
      router.push('/login?registered=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
      setStep('form');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Create Your Vault
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
          Your master password is the only key. We never see it, store it, or transmit it.
        </p>
      </div>

      {step === 'deriving' ? (
          <div className="flex flex-col gap-4 py-6">
            <p className="text-xs font-medium uppercase tracking-widest text-center mb-2" style={{ color: 'var(--primary)' }}>
              Encryption Ceremony
            </p>
            {CEREMONY_STEPS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                  style={{ background: 'var(--surface-highest)' }}
                >
                  {i < 3 ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-transparent"
                         style={{ borderTopColor: 'var(--primary)' }} />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="var(--tertiary)">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.label}</span>
              </div>
            ))}
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-highest)' }}>
              <div className="h-full rounded-full animate-pulse" style={{ background: 'var(--primary)', width: '65%' }} />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                Master Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="At least 12 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
              {password && (() => {
                const entropy = estimateEntropy({ ...DEFAULT_OPTIONS, length: password.length });
                const strength = strengthLabel(entropy);
                return (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-highest)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (password.length / 24) * 100)}%`,
                          background: STRENGTH_COLORS[strength.level],
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: STRENGTH_COLORS[strength.level] }}>
                      {strength.label}
                    </span>
                  </div>
                );
              })()}
              <p className="text-xs text-[var(--muted-foreground)]">
                This is the only password you need to remember. It encrypts your
                entire vault. We cannot recover it if you forget it.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm Master Password
              </label>
              <Input
                id="confirm"
                type="password"
                placeholder="Re-enter your master password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--destructive)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gradient py-3 rounded-lg font-medium text-sm disabled:opacity-50"
            >
              Create Account
            </button>
          </form>
        )}

        {/* Security Notice */}
        <div className="mt-6 flex items-start gap-2 rounded-lg p-3" style={{ background: 'var(--surface-highest)' }}>
          <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--secondary)">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Your master password cannot be recovered. Write it down and store it safely.
          </p>
        </div>

        <p className="text-sm text-center mt-6" style={{ color: 'var(--muted-foreground)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-medium" style={{ color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
    </>
  );
}
