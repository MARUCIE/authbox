'use client';

import { useEffect, useState, useCallback } from 'react';
import { useVaultStore } from '@/lib/vault-store';
import { auditApi } from '@/lib/api';

interface AuditEvent {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  decision: string;
  metadata: Record<string, unknown> | null;
  eventHash: string;
  prevEventHash: string;
  createdAt: string;
}

interface ChainStatus {
  valid: boolean;
  verified: number;
  checkedAt: string;
}

const DECISION_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  allowed: { bg: 'var(--tertiary-container)', text: 'var(--tertiary)', label: 'ALLOW' },
  denied: { bg: 'rgba(255, 180, 171, 0.15)', text: 'var(--destructive)', label: 'DENY' },
  error: { bg: 'rgba(255, 183, 125, 0.15)', text: 'var(--secondary)', label: 'STEP-UP' },
};

export default function AuditPage() {
  const { sessionToken } = useVaultStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const limit = 50;

  const loadEvents = useCallback(
    async (reset = false) => {
      if (!sessionToken) return;
      setLoading(true);
      try {
        const nextOffset = reset ? 0 : offset;
        const data = await auditApi.listEvents(sessionToken, limit, nextOffset);
        if (reset) {
          setEvents(data.events);
          setOffset(data.events.length);
        } else {
          setEvents((prev) => [...prev, ...data.events]);
          setOffset((prev) => prev + data.events.length);
        }
        setHasMore(data.events.length === limit);
      } catch {
        // swallow
      } finally {
        setLoading(false);
      }
    },
    [sessionToken, offset],
  );

  const verifyChain = useCallback(async () => {
    if (!sessionToken) return;
    setVerifying(true);
    try {
      const result = await auditApi.verifyChain(sessionToken);
      setChain({
        valid: result.valid,
        verified: result.verified,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      setChain({ valid: false, verified: 0, checkedAt: new Date().toISOString() });
    } finally {
      setVerifying(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      loadEvents(true);
    }
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function truncHash(h: string) {
    if (!h) return '--';
    return h.slice(0, 8) + '...' + h.slice(-4);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Audit Log
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            Tamper-proof, hash-chain verified log of all vault and agent activity.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={verifyChain}
            disabled={verifying || !sessionToken}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--tertiary-container)', color: 'var(--tertiary)' }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            {verifying ? 'Verifying...' : 'Verify Chain'}
          </button>
        </div>
      </div>

      {/* Hash Chain Visualization */}
      {events.length > 0 && (
        <div className="rounded-xl p-4 overflow-x-auto" style={{ background: 'var(--surface-low)' }}>
          <p className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>
            Hash Chain
          </p>
          <div className="flex items-center gap-2 min-w-0">
            {events.slice(0, 6).map((ev, i) => (
              <div key={ev.id} className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
                  className="hash-block hover:opacity-80 transition-opacity cursor-pointer"
                  title={ev.eventHash}
                >
                  #{events.length - i} {truncHash(ev.eventHash)}
                </button>
                {i < Math.min(5, events.length - 1) && (
                  <span style={{ color: 'var(--outline)' }}>&rarr;</span>
                )}
              </div>
            ))}
            {events.length > 6 && (
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                +{events.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chain Verification Banner */}
      {chain && (
        <div
          className="rounded-xl p-4 text-sm flex items-center justify-between"
          style={{
            background: chain.valid ? 'var(--tertiary-container)' : 'rgba(255, 180, 171, 0.15)',
            color: chain.valid ? 'var(--tertiary)' : 'var(--destructive)',
          }}
        >
          <div className="flex items-center gap-2">
            {chain.valid ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            )}
            <span className="font-semibold">
              {chain.valid ? 'Chain Integrity Verified' : 'Chain Broken'}
            </span>
            <span className="font-normal opacity-80">
              -- {chain.verified} event{chain.verified !== 1 ? 's' : ''} checked
            </span>
          </div>
          <span className="text-xs opacity-60">{formatTime(chain.checkedAt)}</span>
        </div>
      )}

      {/* Event Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-container)' }}>
        {/* Table Header */}
        <div
          className="grid grid-cols-[100px_80px_1fr_1fr_80px_120px] gap-4 px-4 py-3 text-xs font-medium uppercase tracking-wider"
          style={{ background: 'var(--surface-high)', color: 'var(--muted-foreground)' }}
        >
          <span>Time</span>
          <span>Actor</span>
          <span>Action</span>
          <span>Resource</span>
          <span>Decision</span>
          <span>Hash</span>
        </div>

        {/* Event Rows */}
        {events.length === 0 && !loading && (
          <div className="p-12 text-center">
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              No audit events recorded yet.
            </p>
          </div>
        )}

        {events.map((ev) => {
          const decision = DECISION_CONFIG[ev.decision] ?? {
            bg: 'var(--surface-highest)',
            text: 'var(--muted-foreground)',
            label: ev.decision.toUpperCase(),
          };

          return (
            <div key={ev.id}>
              <button
                onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
                className="w-full grid grid-cols-[100px_80px_1fr_1fr_80px_120px] gap-4 px-4 py-3 text-sm text-left transition-colors hover:opacity-80"
                style={{
                  background: selected?.id === ev.id ? 'var(--surface-highest)' : 'transparent',
                }}
              >
                <span className="text-xs tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                  {formatTime(ev.createdAt)}
                </span>
                <span className="text-xs">
                  {ev.actorType === 'agent' ? (
                    <span style={{ color: 'var(--primary)' }}>Agent</span>
                  ) : ev.actorType === 'system' ? (
                    <span style={{ color: 'var(--muted-foreground)' }}>System</span>
                  ) : (
                    'User'
                  )}
                </span>
                <span className="font-medium text-xs truncate">{ev.action}</span>
                <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
                  {ev.resourceType}{ev.resourceId ? `:${ev.resourceId.slice(0, 8)}` : ''}
                </span>
                <span
                  className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ background: decision.bg, color: decision.text }}
                >
                  {decision.label}
                </span>
                <span className="hash-block text-[10px] truncate">{truncHash(ev.eventHash)}</span>
              </button>

              {/* Expanded Detail */}
              {selected?.id === ev.id && (
                <div
                  className="px-4 py-4 text-xs space-y-3"
                  style={{ background: 'var(--surface-low)' }}
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>Event ID</span>
                      <p className="font-mono mt-0.5">{ev.id}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>Actor ID</span>
                      <p className="font-mono mt-0.5">{ev.actorId}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>Event Hash</span>
                      <p className="font-mono mt-0.5 break-all" style={{ color: 'var(--primary)' }}>{ev.eventHash}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>Previous Hash</span>
                      <p className="font-mono mt-0.5 break-all">{ev.prevEventHash || '(genesis)'}</p>
                    </div>
                  </div>
                  {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                    <div>
                      <span style={{ color: 'var(--muted-foreground)' }}>Metadata</span>
                      <pre
                        className="mt-1 p-3 rounded-lg overflow-auto max-h-32 font-mono text-xs"
                        style={{ background: 'var(--surface-highest)' }}
                      >
                        {JSON.stringify(ev.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm" style={{ color: 'var(--muted-foreground)' }}>
        <span>
          Showing {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
        {hasMore && events.length > 0 && (
          <button
            onClick={() => loadEvents(false)}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--surface-highest)', color: 'var(--primary)' }}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>

      {loading && events.length === 0 && (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent"
               style={{ borderTopColor: 'var(--primary)' }} />
        </div>
      )}
    </div>
  );
}
