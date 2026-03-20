export default function AuditLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="h-7 w-36 rounded bg-[var(--muted)]" />
          <div className="h-4 w-72 rounded bg-[var(--muted)] mt-2" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-[var(--muted)]" />
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-5 w-16 rounded-full bg-[var(--muted)]" />
                <div className="h-4 w-28 rounded bg-[var(--muted)]" />
                <div className="h-3 w-20 rounded bg-[var(--muted)]" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-10 rounded bg-[var(--muted)]" />
                <div className="h-3 w-20 rounded bg-[var(--muted)]" />
                <div className="h-3 w-24 rounded bg-[var(--muted)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
