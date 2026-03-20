'use client';

import { useEffect, useState, useCallback } from 'react';
import { useVaultStore } from '@/lib/vault-store';
import { auditApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

const DECISION_STYLES: Record<string, string> = {
  allowed:
    'bg-[var(--success-bg,#dcfce7)] text-[var(--success-fg,#166534)] border border-[var(--success-border,#bbf7d0)]',
  denied:
    'bg-[var(--destructive-bg,#fef2f2)] text-[var(--destructive-fg,#991b1b)] border border-[var(--destructive-border,#fecaca)]',
  error:
    'bg-[var(--warning-bg,#fffbeb)] text-[var(--warning-fg,#92400e)] border border-[var(--warning-border,#fde68a)]',
};

const ACTOR_LABELS: Record<string, string> = {
  user: 'User',
  agent: 'Agent',
  system: 'System',
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
    return h.slice(0, 12) + '...';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Tamper-proof, hash-chain verified log of all vault access and agent
            activity.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={verifyChain}
          disabled={verifying || !sessionToken}
        >
          {verifying ? 'Verifying...' : 'Verify Chain'}
        </Button>
      </div>

      {/* Chain verification banner */}
      {chain && (
        <div
          className={`rounded-lg p-4 text-sm ${
            chain.valid
              ? 'bg-[var(--success-bg,#dcfce7)] text-[var(--success-fg,#166534)] border border-[var(--success-border,#bbf7d0)]'
              : 'bg-[var(--destructive-bg,#fef2f2)] text-[var(--destructive-fg,#991b1b)] border border-[var(--destructive-border,#fecaca)]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">
                {chain.valid ? 'Chain Intact' : 'Chain Broken'}
              </span>
              <span className="ml-2">
                {chain.verified} event{chain.verified !== 1 ? 's' : ''} verified
              </span>
            </div>
            <span className="text-xs opacity-70">
              Checked: {formatTime(chain.checkedAt)}
            </span>
          </div>
          {!chain.valid && (
            <p className="mt-1 text-xs">
              The audit chain has been tampered with or is inconsistent. Please
              investigate.
            </p>
          )}
        </div>
      )}

      {/* Event list */}
      <div className="space-y-2">
        {events.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-12 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">
              No audit events recorded yet.
            </p>
          </div>
        )}

        {events.map((ev) => (
          <button
            key={ev.id}
            onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
            className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-[var(--accent)] ${
              selected?.id === ev.id
                ? 'border-[var(--ring)] bg-[var(--accent)]'
                : 'border-[var(--border)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Decision badge */}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    DECISION_STYLES[ev.decision] ?? 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }`}
                >
                  {ev.decision}
                </span>

                {/* Action */}
                <span className="font-medium text-sm">{ev.action}</span>

                {/* Resource */}
                <span className="text-xs text-[var(--muted-foreground)]">
                  {ev.resourceType}
                  {ev.resourceId ? `:${ev.resourceId.slice(0, 8)}` : ''}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                <span>
                  {ACTOR_LABELS[ev.actorType] ?? ev.actorType}
                </span>
                <span className="font-mono">{truncHash(ev.eventHash)}</span>
                <span>{formatTime(ev.createdAt)}</span>
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.id === ev.id && (
              <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[var(--muted-foreground)]">Event ID:</span>{' '}
                    <span className="font-mono">{ev.id}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)]">Actor ID:</span>{' '}
                    <span className="font-mono">{ev.actorId.slice(0, 12)}...</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)]">Event Hash:</span>{' '}
                    <span className="font-mono break-all">{ev.eventHash}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted-foreground)]">Prev Hash:</span>{' '}
                    <span className="font-mono break-all">
                      {ev.prevEventHash || '(genesis)'}
                    </span>
                  </div>
                </div>
                {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                  <div>
                    <span className="text-[var(--muted-foreground)]">Metadata:</span>
                    <pre className="mt-1 p-2 rounded bg-[var(--muted)] overflow-auto max-h-32 text-xs font-mono">
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </button>
        ))}

        {/* Load more */}
        {hasMore && events.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadEvents(false)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}

        {loading && events.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="animate-pulse text-sm text-[var(--muted-foreground)]">
              Loading audit log...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
