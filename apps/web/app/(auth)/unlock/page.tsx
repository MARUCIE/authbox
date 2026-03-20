'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { unlockVault as unlockVaultCrypto } from '@/lib/auth';
import { useVaultStore } from '@/lib/vault-store';
import { vaultApi } from '@/lib/api';

/**
 * Unlock page: for users who have an active session but a locked vault.
 * This happens after idle timeout or page refresh.
 * The session token is still valid, but the vault key needs to be
 * re-derived from the master password.
 */
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

      // Fetch encrypted vault key from server
      const vaultKeyData = await vaultApi.getVaultKey(token);

      // Decrypt vault key locally using salt from the vault key endpoint
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
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Vault Locked</CardTitle>
        <CardDescription>
          Your session is active but the vault is locked. Enter your master
          password to decrypt.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Decrypting...' : 'Unlock'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            className="w-full text-[var(--muted-foreground)]"
          >
            Sign out instead
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
