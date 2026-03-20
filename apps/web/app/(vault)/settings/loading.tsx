export default function SettingsLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Page header */}
      <div>
        <div className="h-7 w-32 rounded surface-highest" />
        <div className="h-4 w-64 rounded surface-highest mt-2" />
      </div>

      {/* Sessions section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-5 w-36 rounded surface-highest" />
            <div className="h-4 w-56 rounded surface-highest mt-1.5" />
          </div>
          <div className="h-8 w-44 rounded-lg surface-highest" />
        </div>

        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-md surface-highest" />
                  <div className="h-4 w-32 rounded surface-highest" />
                  <div className="h-3 w-24 rounded surface-highest" />
                </div>
                <div className="flex gap-4 pl-10">
                  <div className="h-3 w-28 rounded surface-highest" />
                  <div className="h-3 w-28 rounded surface-highest" />
                  <div className="h-3 w-24 rounded surface-highest" />
                </div>
              </div>
              <div className="h-8 w-16 rounded-lg surface-highest" />
            </div>
          ))}
        </div>
      </section>

      {/* 2FA section */}
      <section className="space-y-4">
        <div>
          <div className="h-5 w-56 rounded surface-highest" />
          <div className="h-4 w-72 rounded surface-highest mt-1.5" />
        </div>
        <div className="rounded-lg border border-[var(--border)] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md surface-highest" />
              <div>
                <div className="h-4 w-36 rounded surface-highest" />
                <div className="h-3 w-24 rounded surface-highest mt-1.5" />
              </div>
            </div>
            <div className="h-9 w-24 rounded-lg surface-highest" />
          </div>
        </div>
      </section>
    </div>
  );
}
