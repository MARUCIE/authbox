export default function PasswordsLoading() {
  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)] animate-pulse">
      {/* Left: List skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="h-7 w-40 rounded surface-highest" />
            <div className="h-4 w-20 rounded surface-highest mt-1.5" />
          </div>
          <div className="h-9 w-32 rounded-lg surface-highest" />
        </div>

        {/* Search bar */}
        <div className="h-10 w-full rounded-lg surface-highest mb-4" />

        {/* List items */}
        <div className="space-y-1 flex-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"
            >
              <div className="h-9 w-9 rounded-lg surface-highest shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 w-32 rounded surface-highest" />
                <div className="h-3 w-24 rounded surface-highest mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
