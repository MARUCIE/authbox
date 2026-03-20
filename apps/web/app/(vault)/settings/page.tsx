'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useVaultStore } from '@/lib/vault-store';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import QRCode from 'qrcode';

interface SessionItem {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

type TwoFAState = 'idle' | 'enrolling' | 'verifying' | 'enabled';

export default function SettingsPage() {
  const { sessionToken } = useVaultStore();

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [sessionError, setSessionError] = useState('');

  // TOTP state
  const [twoFAState, setTwoFAState] = useState<TwoFAState>('idle');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingSessions(true);
    setSessionError('');
    try {
      const data = await settingsApi.listSessions(sessionToken);
      setSessions(data.sessions);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }, [sessionToken]);

  // Check current 2FA status on mount
  const checkTotpStatus = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await settingsApi.totpStatus(sessionToken);
      if (data.enabled) {
        setTwoFAState('enabled');
      }
    } catch {
      // Endpoint may not exist yet; stay at 'idle'
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      loadSessions();
      checkTotpStatus();
    }
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render QR code when TOTP URI is available
  useEffect(() => {
    if (totpURI && qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, totpURI, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        // QR rendering failed silently; user can still copy URI manually
      });
    }
  }, [totpURI]);

  // Session actions
  async function handleRevoke(sessionId: string) {
    if (!sessionToken) return;
    setRevokingId(sessionId);
    setSessionError('');
    try {
      await settingsApi.revokeSession(sessionToken, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAll() {
    if (!sessionToken) return;
    setRevokingAll(true);
    setSessionError('');
    try {
      await settingsApi.revokeAllSessions(sessionToken);
      await loadSessions();
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  }

  // TOTP actions
  async function handleEnroll() {
    if (!sessionToken) return;
    setTwoFAState('enrolling');
    setTotpError('');
    setTotpSuccess('');
    try {
      const data = await settingsApi.enrollTOTP(sessionToken);
      setTotpSecret(data.secret);
      setTotpURI(data.uri);
      setTwoFAState('verifying');
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Failed to start 2FA enrollment');
      setTwoFAState('idle');
    }
  }

  async function handleVerify() {
    if (!sessionToken || totpCode.length !== 6) return;
    setVerifying(true);
    setTotpError('');
    try {
      await settingsApi.verifyTOTP(sessionToken, totpCode);
      setTwoFAState('enabled');
      setTotpSuccess('Two-factor authentication has been enabled.');
      setTotpCode('');
      setTotpSecret('');
      setTotpURI('');
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisable() {
    if (!sessionToken || disableCode.length !== 6) return;
    setDisabling(true);
    setTotpError('');
    try {
      await settingsApi.disableTOTP(sessionToken, disableCode);
      setTwoFAState('idle');
      setTotpSuccess('Two-factor authentication has been disabled.');
      setDisableCode('');
    } catch (err) {
      setTotpError(err instanceof Error ? err.message : 'Invalid code. Could not disable 2FA.');
    } finally {
      setDisabling(false);
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Manage sessions, two-factor authentication, and account security.
        </p>
      </div>

      {/* ── Session Management ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Active Sessions</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Devices and browsers that are currently signed in to your account.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevokeAll}
            disabled={revokingAll || !sessionToken || sessions.length === 0}
          >
            {revokingAll ? 'Revoking...' : 'Revoke All Other Sessions'}
          </Button>
        </div>

        {sessionError && (
          <div className="rounded-lg border border-[var(--destructive-border,#fecaca)] bg-[var(--destructive-bg,#fef2f2)] p-3 text-sm text-[var(--destructive-fg,#991b1b)]">
            {sessionError}
          </div>
        )}

        <div className="space-y-2">
          {loadingSessions && sessions.length === 0 && (
            <div className="flex justify-center py-12">
              <div className="animate-pulse text-sm text-[var(--muted-foreground)]">
                Loading sessions...
              </div>
            </div>
          )}

          {!loadingSessions && sessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                No active sessions found.
              </p>
            </div>
          )}

          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--accent)]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-xs font-mono">
                    D
                  </span>
                  <span className="font-medium text-sm">
                    {session.deviceName || 'Unknown Device'}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono">
                    {session.ipAddress}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--muted-foreground)] pl-10">
                  <span>Created: {formatTime(session.createdAt)}</span>
                  <span>Last active: {formatTime(session.lastActiveAt)}</span>
                  <span>Expires: {formatTime(session.expiresAt)}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRevoke(session.id)}
                disabled={revokingId === session.id}
              >
                {revokingId === session.id ? 'Revoking...' : 'Revoke'}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Two-Factor Authentication ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Add a second layer of security using a TOTP authenticator app.
          </p>
        </div>

        {totpError && (
          <div className="rounded-lg border border-[var(--destructive-border,#fecaca)] bg-[var(--destructive-bg,#fef2f2)] p-3 text-sm text-[var(--destructive-fg,#991b1b)]">
            {totpError}
          </div>
        )}

        {totpSuccess && (
          <div className="rounded-lg border border-[var(--success-border,#bbf7d0)] bg-[var(--success-bg,#dcfce7)] p-3 text-sm text-[var(--success-fg,#166534)]">
            {totpSuccess}
          </div>
        )}

        {/* State: idle -- 2FA is off */}
        {twoFAState === 'idle' && (
          <div className="rounded-lg border border-[var(--border)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--muted)] text-sm font-mono font-bold">
                  2F
                </span>
                <div>
                  <p className="font-medium text-sm">TOTP Authenticator</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Status: Not enabled
                  </p>
                </div>
              </div>
              <Button onClick={handleEnroll} disabled={!sessionToken}>
                Enable 2FA
              </Button>
            </div>
          </div>
        )}

        {/* State: enrolling -- loading */}
        {twoFAState === 'enrolling' && (
          <div className="rounded-lg border border-[var(--border)] p-6 flex justify-center">
            <div className="animate-pulse text-sm text-[var(--muted-foreground)]">
              Generating TOTP secret...
            </div>
          </div>
        )}

        {/* State: verifying -- show secret + code input */}
        {twoFAState === 'verifying' && (
          <div className="rounded-lg border border-[var(--border)] p-6 space-y-5">
            <div>
              <p className="font-medium text-sm mb-2">
                1. Add this account to your authenticator app
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mb-3">
                Scan the QR code below with your authenticator app (Google Authenticator,
                Authy, 1Password, etc.), or copy the secret for manual entry.
              </p>

              <div className="flex justify-center mb-4">
                <canvas
                  ref={qrCanvasRef}
                  className="rounded-lg border border-[var(--border)]"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">
                    Secret (Base32)
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-[var(--muted)] px-3 py-2 text-sm font-mono break-all select-all">
                      {totpSecret}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(totpSecret)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--muted-foreground)] block mb-1">
                    OTPAuth URI
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-[var(--muted)] px-3 py-2 text-xs font-mono break-all select-all max-h-16 overflow-auto">
                      {totpURI}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(totpURI)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="font-medium text-sm mb-2">
                2. Enter the 6-digit code from your authenticator
              </p>
              <div className="flex items-center gap-3 max-w-xs">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono text-center tracking-widest"
                />
                <Button
                  onClick={handleVerify}
                  disabled={verifying || totpCode.length !== 6}
                >
                  {verifying ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTwoFAState('idle');
                  setTotpSecret('');
                  setTotpURI('');
                  setTotpCode('');
                  setTotpError('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* State: enabled -- 2FA is on */}
        {twoFAState === 'enabled' && (
          <div className="rounded-lg border border-[var(--border)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--success-bg,#dcfce7)] text-sm font-mono font-bold text-[var(--success-fg,#166534)]">
                  2F
                </span>
                <div>
                  <p className="font-medium text-sm">TOTP Authenticator</p>
                  <p className="text-xs text-[var(--success-fg,#166534)]">
                    Status: Enabled
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-sm text-[var(--muted-foreground)] mb-3">
                To disable 2FA, enter a valid code from your authenticator app.
              </p>
              <div className="flex items-center gap-3 max-w-xs">
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="font-mono text-center tracking-widest"
                />
                <Button
                  variant="outline"
                  onClick={handleDisable}
                  disabled={disabling || disableCode.length !== 6}
                >
                  {disabling ? 'Disabling...' : 'Disable 2FA'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
