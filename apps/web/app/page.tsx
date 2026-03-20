import Link from 'next/link';

const PILLARS = [
  {
    icon: '\u{1F511}',
    title: 'Password Vault',
    description:
      'Store and organize all your passwords with AES-256-GCM encryption. Auto-generate strong passwords, autofill with the browser extension.',
    detail: 'Argon2id key derivation -- 256 MB memory-hard',
  },
  {
    icon: '\u{1F517}',
    title: 'Authorization Manager',
    description:
      'Connect OAuth providers (Google, GitHub, Microsoft) and manage access tokens. Auto-refresh and encrypted token storage.',
    detail: 'SRP-6a mutual authentication -- server never sees your password',
  },
  {
    icon: '\u{1F916}',
    title: 'AI Agent Gateway',
    description:
      'Give AI agents controlled access to your credentials via MCP protocol. Policy engine, rate limits, and step-up approval.',
    detail: 'Policy-gated MCP over WebSocket -- audit every access',
  },
];

const TRUST_SIGNALS = [
  'Zero-knowledge: server sees only encrypted blobs',
  'E2E encrypted: decryption happens on your device',
  'Open protocol: MCP standard for AI interoperability',
  'Hash-chain audit: tamper-evident access log',
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-3xl w-full">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Auth Box</h1>
          <p className="text-lg text-[var(--muted-foreground)] mb-8 max-w-xl mx-auto">
            Zero-knowledge password manager, authorization manager, and AI agent
            gateway. Your credentials never leave your device in plaintext.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] px-6 py-3 font-medium hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium hover:bg-[var(--accent)] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Three Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-lg border border-[var(--border)] p-6 hover:bg-[var(--accent)] transition-colors"
            >
              <span className="text-2xl" role="img" aria-label={pillar.title}>
                {pillar.icon}
              </span>
              <h3 className="font-semibold mt-3 mb-2">{pillar.title}</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-3">
                {pillar.description}
              </p>
              <p className="text-xs font-mono text-[var(--muted-foreground)] bg-[var(--muted)] rounded px-2 py-1 inline-block">
                {pillar.detail}
              </p>
            </div>
          ))}
        </div>

        {/* Trust Signals */}
        <div className="border-t border-[var(--border)] pt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {TRUST_SIGNALS.map((signal) => (
              <div
                key={signal}
                className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]"
              >
                <span className="text-green-600 dark:text-green-400 shrink-0 mt-0.5">
                  *
                </span>
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
