'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { register } from '@/lib/auth';
import { estimateEntropy, strengthLabel, DEFAULT_OPTIONS } from '@/lib/password-generator';

const STRENGTH_COLORS: Record<string, string> = {
  weak: 'bg-red-500',
  fair: 'bg-yellow-500',
  strong: 'bg-blue-500',
  excellent: 'bg-green-500',
};

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
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Your master password encrypts everything locally. We never see it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'deriving' ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
            <p className="text-sm text-[var(--muted-foreground)]">
              Deriving encryption keys... This may take a few seconds.
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Argon2id is running to make your password extremely hard to crack.
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
                    <div className="flex-1 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${STRENGTH_COLORS[strength.level]}`}
                        style={{ width: `${Math.min(100, (password.length / 24) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${STRENGTH_COLORS[strength.level].replace('bg-', 'text-')}`}>
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

            <Button type="submit" disabled={loading} className="w-full">
              Create Account
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          Already have an account?{' '}
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
