import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-low) 100%)' }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--primary-container)' }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="var(--primary)">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        </div>
        <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Auth Box
        </span>
      </Link>

      {/* Card with glassmorphism */}
      <div className="w-full max-w-md glass rounded-2xl p-1">
        <div className="rounded-xl p-6" style={{ background: 'var(--surface-container)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
