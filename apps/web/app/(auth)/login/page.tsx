'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { login } from '@/lib/auth';
import { useVaultStore } from '@/lib/vault-store';

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
  const [step, setStep] = useState<'form' | 'authenticating' | 'decrypting'>(
    'form',
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStep('authenticating');

    try {
      const result = await login(email, password);

      setStep('decrypting');

      // Store session and vault key in memory
      setSession(result.sessionToken, ''); // userId comes from session
      unlockVault(result.vaultKey);

      // Session token lives only in Zustand memory -- no sessionStorage.
      // Page refresh requires re-login (security: prevents XSS token theft).

      router.push('/passwords');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Check your credentials.',
      );
      setStep('form');
    } finally {
      setLoading(false);
    }
  }

  const statusMessages: Record<string, { title: string; detail: string }> = {
    authenticating: {
      title: 'Authenticating...',
      detail: 'SRP mutual authentication in progress. The server never sees your password.',
    },
    decrypting: {
      title: 'Decrypting vault...',
      detail: 'Deriving encryption keys and unlocking your vault locally.',
    },
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your master password to unlock your vault.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {justRegistered && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            Account created successfully. Sign in with your master password.
          </div>
        )}

        {step !== 'form' ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
            <p className="text-sm font-medium">
              {statusMessages[step]?.title}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] text-center">
              {statusMessages[step]?.detail}
            </p>
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
                placeholder="Your master password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--destructive)]">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              Unlock Vault
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          New here?{' '}
          <Link href="/register" className="font-medium underline">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
