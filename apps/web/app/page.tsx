import Link from 'next/link';

const PILLARS = [
  {
    title: 'Zero-Knowledge Passwords',
    description:
      'AES-256-GCM encryption. SRP-6a mutual authentication. Your master password never leaves your device.',
    detail: 'Argon2id (64MB, 3 iter) + HKDF sub-keys',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: 'Authorization Lifecycle',
    description:
      'OAuth tokens, API keys, service accounts -- centralized management with auto-refresh and instant revocation.',
    detail: 'Encrypted token storage + expiry alerts',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
      </svg>
    ),
  },
  {
    title: 'AI Agent Gateway',
    description:
      'MCP protocol lets AI assistants securely access credentials under policy-controlled, fully audited access.',
    detail: 'WebSocket MCP + Policy Engine + Audit Chain',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Generate Seed', desc: '24 words generated on your device. No email needed.' },
  { step: '02', title: 'Derive Keys', desc: 'All encryption keys derived from your seed phrase.' },
  { step: '03', title: 'Use Anywhere', desc: 'Browser, extension, or AI agent via MCP protocol.' },
  { step: '04', title: 'Recover Anytime', desc: '24 words = full recovery. Even without us.' },
];

const UNSTOPPABLE_PROMISES = [
  {
    title: 'No Email Required',
    desc: 'Create a vault in 45 seconds. No signup, no account, no email.',
    icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0',
  },
  {
    title: 'Survive Without Us',
    desc: 'If Auth Box disappears tomorrow, your vault still works. Your seed phrase is the only key.',
    icon: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622',
  },
  {
    title: 'Passwords Without Storage',
    desc: 'Derive passwords deterministically from your seed + site name. Vault can be empty.',
    icon: 'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z',
  },
  {
    title: 'Import Everything',
    desc: 'Migrate from 13 password managers: Apple, Google, Chrome, Firefox, 1Password, Bitwarden, and more.',
    icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
  },
];

const TRUST_BADGES = [
  'End-to-End Encrypted',
  'Open Source',
  'SOC 2 Type II',
  'No Data Mining',
];

const ENCRYPTION_STEPS = [
  { label: 'Master Password', color: 'var(--secondary)' },
  { label: 'Argon2id KDF', color: 'var(--primary)' },
  { label: 'Master Key', color: 'var(--primary)' },
  { label: 'HKDF Derivation', color: 'var(--primary)' },
];

const DERIVED_KEYS = [
  { label: 'Auth Key', desc: 'SRP-6a login', color: 'var(--tertiary)' },
  { label: 'Encryption Key', desc: 'Vault key wrap', color: 'var(--tertiary)' },
  { label: 'MAC Key', desc: 'Integrity check', color: 'var(--tertiary)' },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section
        className="relative flex flex-col items-center justify-center px-6 py-32"
        style={{ background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-low) 100%)' }}
      >
        <div className="max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-medium"
               style={{ background: 'var(--surface-highest)', color: 'var(--primary)' }}>
            <span className="pulse-secure" />
            Zero-Knowledge Architecture
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight"
              style={{ fontFamily: 'var(--font-heading)' }}>
            Your Keys.{' '}
            <span style={{ color: 'var(--primary)' }}>Your Identity.</span>
            <br />
            Unstoppable.
          </h1>

          <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto" style={{ color: 'var(--muted-foreground)' }}>
            24 words. That&apos;s all you need. No email, no account, no server dependency.
            Even if we disappear, your passwords survive.
          </p>

          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/create" className="btn-gradient px-8 py-3.5 text-base font-medium rounded-lg">
              Get Started Free
            </Link>
            <Link
              href="#security"
              className="px-8 py-3.5 text-base font-medium rounded-lg border-ghost transition-colors"
              style={{ color: 'var(--muted-foreground)' }}
            >
              View Security Model
            </Link>
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="px-6 py-24" style={{ background: 'var(--surface-low)' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Three Pillars of Digital Identity
          </h2>
          <p className="text-center mb-16" style={{ color: 'var(--muted-foreground)' }}>
            One vault. Complete control. Zero compromise.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-xl p-8 transition-all hover:translate-y-[-2px]"
                style={{
                  background: 'var(--surface-container)',
                  boxShadow: 'var(--shadow-ambient)',
                }}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg mb-5"
                  style={{ background: 'var(--primary-container)', color: 'var(--primary)' }}
                >
                  {pillar.icon}
                </div>
                <h3 className="text-lg font-semibold mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
                  {pillar.title}
                </h3>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--muted-foreground)' }}>
                  {pillar.description}
                </p>
                <div className="hash-block inline-block">{pillar.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-24" style={{ background: 'var(--surface)' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16" style={{ fontFamily: 'var(--font-heading)' }}>
            How It Works
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="text-center relative">
                <div
                  className="text-4xl font-bold mb-3"
                  style={{ fontFamily: 'var(--font-heading)', color: 'var(--primary)', opacity: 0.3 }}
                >
                  {item.step}
                </div>
                <h3 className="text-sm font-semibold mb-2">{item.title}</h3>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.desc}</p>
                {i < 3 && (
                  <div
                    className="hidden md:block absolute top-8 -right-4 w-8 text-center"
                    style={{ color: 'var(--outline)' }}
                  >
                    &rarr;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="px-6 py-12" style={{ background: 'var(--surface-low)' }}>
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-6">
          {TRUST_BADGES.map((badge) => (
            <div
              key={badge}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
              style={{ background: 'var(--surface-highest)', color: 'var(--tertiary)' }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {badge}
            </div>
          ))}
        </div>
      </section>

      {/* Unstoppable Promise */}
      <section className="px-6 py-24" style={{ background: 'var(--surface)' }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            The Unstoppable Promise
          </h2>
          <p className="text-center mb-16" style={{ color: 'var(--muted-foreground)' }}>
            What makes Auth Box different from every other password manager.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {UNSTOPPABLE_PROMISES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl p-6 flex gap-4"
                style={{ background: 'var(--surface-container)', boxShadow: 'var(--shadow-ambient)' }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                  style={{ background: 'var(--primary-container)' }}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Encryption Visualization */}
      <section id="security" className="px-6 py-24" style={{ background: 'var(--surface)' }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Encryption Architecture
          </h2>
          <p className="text-center mb-16" style={{ color: 'var(--muted-foreground)' }}>
            Your master password derives three independent keys. The server never sees any of them.
          </p>

          {/* Key Derivation Flow */}
          <div className="flex flex-col items-center gap-3 mb-8">
            {ENCRYPTION_STEPS.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center">
                <div
                  className="rounded-lg px-6 py-3 text-sm font-medium text-center"
                  style={{ background: 'var(--surface-highest)', color: step.color, minWidth: '200px' }}
                >
                  {step.label}
                </div>
                {i < ENCRYPTION_STEPS.length - 1 && (
                  <div className="h-6 w-px" style={{ background: 'var(--outline-variant)' }} />
                )}
              </div>
            ))}
          </div>

          {/* Branch to 3 keys */}
          <div className="flex justify-center mb-4">
            <div className="h-6 w-px" style={{ background: 'var(--outline-variant)' }} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {DERIVED_KEYS.map((key) => (
              <div
                key={key.label}
                className="rounded-xl p-5 text-center"
                style={{ background: 'var(--surface-container)' }}
              >
                <div className="text-sm font-semibold mb-1" style={{ color: key.color }}>
                  {key.label}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {key.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 text-center" style={{ background: 'var(--surface-lowest)' }}>
        <p className="text-sm font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Auth Box v2
        </p>
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          Zero Knowledge Identity Gateway
        </p>
        <div className="flex justify-center gap-6 mt-6">
          <Link href="/create" className="text-xs hover:underline" style={{ color: 'var(--primary)' }}>
            Get Started
          </Link>
          <Link href="/login" className="text-xs hover:underline" style={{ color: 'var(--muted-foreground)' }}>
            Sign In
          </Link>
          <Link href="#security" className="text-xs hover:underline" style={{ color: 'var(--muted-foreground)' }}>
            Security
          </Link>
        </div>
        <p className="text-xs mt-8" style={{ color: 'var(--outline)', lineHeight: '2.2' }}>
          Maurice | maurice_wen@proton.me
        </p>
      </footer>
    </main>
  );
}
