'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { unlockVault as unlockVaultCrypto } from '@/lib/auth';
import { useVaultStore } from '@/lib/vault-store';
import { vaultApi } from '@/lib/api';

export default function UnlockPage() {
  const router = useRouter();
  const sessionToken = useVaultStore((s) => s.sessionToken);
  const unlockVault = useVaultStore((s) => s.unlockVault);
  const clearSession = useVaultStore((s) => s.clearSession);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = sessionToken ?? sessionStorage.getItem('authbox_session');
      if (!token) {
        router.push('/login');
        return;
      }

      const vaultKeyData = await vaultApi.getVaultKey(token);
      const vaultKey = await unlockVaultCrypto(
        password,
        vaultKeyData.encryptedVaultKey,
        vaultKeyData.vaultKeyNonce,
        vaultKeyData.vaultKeyTag,
        vaultKeyData.srpSalt,
      );

      unlockVault(vaultKey);
      router.push('/passwords');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to unlock. Check your master password.',
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    sessionStorage.removeItem('authbox_session');
    router.push('/login');
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'var(--surface-highest)' }}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--secondary)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Vault Locked
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
          Your session is active but the vault is locked. Enter your master password to decrypt.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoFocus
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
          {loading ? 'Decrypting...' : 'Unlock Vault'}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full py-2.5 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Sign out instead
        </button>
      </form>
    </>
  );
}
