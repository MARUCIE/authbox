import Link from "next/link";

const quickActions = [
  {
    title: "Connect a platform",
    description: "Register API providers and validate credentials.",
    href: "/platforms/new"
  },
  {
    title: "Create an account",
    description: "Provision a new external account for a team.",
    href: "/accounts/new"
  },
  {
    title: "Issue credentials",
    description: "Generate API keys or OAuth tokens with scopes.",
    href: "/credentials"
  }
];

const statusCards = [
  { label: "Active platforms", value: "0", badge: "Ready" },
  { label: "Managed accounts", value: "0", badge: "Idle" },
  { label: "Active credentials", value: "0", badge: "Secure" }
];

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        {statusCards.map((card) => (
          <div key={card.label} className="hero-card">
            <p className="eyebrow">Status</p>
            <h2>{card.value}</h2>
            <p className="muted">{card.label}</p>
            <span className="badge">{card.badge}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Quick start</p>
            <h1>Auth Box Console</h1>
            <p className="muted">
              Orchestrate multi-platform accounts, credentials, and assistant
              access from a single console.
            </p>
          </div>
        </div>
        <div className="list">
          {quickActions.map((action) => (
            <div key={action.title} className="list-item">
              <div>
                <strong>{action.title}</strong>
                <p className="muted">{action.description}</p>
              </div>
              <Link href={action.href}>Open</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
