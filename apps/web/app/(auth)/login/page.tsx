'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/auth';
import { useVaultStore } from '@/lib/vault-store';

const SRP_STEPS = [
  { label: 'Initiating handshake...', detail: 'Client -> Server: Public value A', icon: 'link' },
  { label: 'Receiving server challenge...', detail: 'Server -> Client: Salt + Public value B', icon: 'download' },
  { label: 'Computing shared secret...', detail: 'Argon2id KDF + SRP-6a computation', icon: 'lock' },
  { label: 'Proving identity...', detail: 'Client -> Server: Proof M1', icon: 'shield' },
  { label: 'Mutual authentication complete', detail: 'Server -> Client: Verifying M2 proof', icon: 'check-double' },
  { label: 'Decrypting vault key...', detail: 'AES-256-GCM unwrap', icon: 'key' },
  { label: 'Loading vault...', detail: 'Syncing encrypted items', icon: 'vault' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get('registered') === 'true';

  const setSession = useVaultStore((s) => s.setSession);
  const unlockVault = useVaultStore((s) => s.unlockVault);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(-1); // -1 = form visible

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setActiveStep(0);

    try {
      // Simulate step progression (actual SRP happens inside login())
      const stepTimer = setInterval(() => {
        setActiveStep((prev) => (prev < SRP_STEPS.length - 2 ? prev + 1 : prev));
      }, 600);

      const result = await login(email, password);

      clearInterval(stepTimer);
      setActiveStep(SRP_STEPS.length - 1); // final step

      setSession(result.sessionToken, '');
      unlockVault(result.vaultKey);

      // Brief pause to show completion
      await new Promise((r) => setTimeout(r, 400));
      router.push('/passwords');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Check your credentials.',
      );
      setActiveStep(-1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Unlock Your Vault
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
          Secure Remote Password protocol -- we verify your identity without ever seeing your password.
        </p>
      </div>

      {justRegistered && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--tertiary-container)', color: 'var(--tertiary)' }}
        >
          Account created successfully. Sign in with your master password.
        </div>
      )}

      {activeStep >= 0 ? (
        /* SRP Handshake Visualization */
        <div className="flex flex-col gap-2.5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-center mb-2" style={{ color: 'var(--primary)' }}>
            SRP-6a Handshake
          </p>
          {SRP_STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            const isPending = i > activeStep;

            return (
              <div
                key={step.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all"
                style={{
                  background: isActive ? 'var(--surface-highest)' : 'transparent',
                  opacity: isPending ? 0.3 : 1,
                }}
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
                  style={{ background: isDone ? 'var(--tertiary-container)' : 'var(--surface-highest)' }}
                >
                  {isDone ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="var(--tertiary)">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-transparent"
                         style={{ borderTopColor: 'var(--primary)' }} />
                  ) : (
                    <div className="h-2 w-2 rounded-full" style={{ background: 'var(--outline-variant)' }} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{step.label}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Login Form */
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
              placeholder="Your master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-gradient py-3 rounded-lg font-medium text-sm disabled:opacity-50"
          >
            Unlock Vault
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          New to Auth Box?{' '}
          <Link href="/register" className="font-medium" style={{ color: 'var(--primary)' }}>
            Create an account
          </Link>
        </p>
        <p className="text-xs mt-3" style={{ color: 'var(--outline)' }}>
          We cannot recover your master password. If lost, vault data is permanently inaccessible.
        </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
