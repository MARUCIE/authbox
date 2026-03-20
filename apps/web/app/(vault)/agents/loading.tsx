export default function AgentsLoading() {
  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)] animate-pulse">
      {/* Left: Agent list skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="h-7 w-36 rounded bg-[var(--muted)]" />
            <div className="h-4 w-28 rounded bg-[var(--muted)] mt-1.5" />
          </div>
          <div className="h-9 w-36 rounded-lg bg-[var(--muted)]" />
        </div>

        {/* Agent list items */}
        <div className="space-y-1 flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"
            >
              <div className="h-9 w-9 rounded-lg bg-[var(--muted)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-36 rounded bg-[var(--muted)]" />
                  <div className="h-5 w-14 rounded bg-[var(--muted)]" />
                </div>
                <div className="h-3 w-40 rounded bg-[var(--muted)] mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
