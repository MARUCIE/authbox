import Link from "next/link";
import { PublicPageViewTracker, PublicTrackedLink } from "../components/public-event-tracker";
import { compareCards, featureCards, useCaseCards } from "../lib/marketing";

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
  { label: "Authorization lifecycle", value: "End-to-End", badge: "Governed" },
  { label: "Audit integrity", value: "Hash-Chain", badge: "Traceable" },
  { label: "AI access control", value: "Role-Bound", badge: "Secure" }
];

export default function HomePage() {
  const tenantId = "public";

  return (
    <div className="page">
      <PublicPageViewTracker source="public_home" tenantId={tenantId} />
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
            <p className="eyebrow">Public entry</p>
            <h1>API Authorization Governance for AI Workloads</h1>
            <p className="muted">
              Build a traceable authorization lifecycle across platform accounts,
              credentials, assistant bindings, and audit exports.
            </p>
          </div>
        </div>

        <div className="list" style={{ marginBottom: 12 }}>
          <div className="list-item">
            <div>
              <strong>Product overview</strong>
              <p className="muted">Understand how Auth Box differs from secret-only tooling.</p>
            </div>
            <PublicTrackedLink
              href="/product"
              event="PUBLIC_CTA_CLICK"
              source="home_product_overview"
              tenantId={tenantId}
            >
              Open
            </PublicTrackedLink>
          </div>
        </div>

        <div className="list">
          {quickActions.map((action) => (
            <div key={action.title} className="list-item">
              <div>
                <strong>{action.title}</strong>
                <p className="muted">{action.description}</p>
              </div>
              {action.href === "/platforms/new" ? (
                <PublicTrackedLink
                  href={`${action.href}?source=home_quick_actions&tenant_id=${encodeURIComponent(
                    tenantId
                  )}`}
                  event="PUBLIC_CTA_CLICK"
                  source="home_quick_actions"
                  tenantId={tenantId}
                >
                  Open
                </PublicTrackedLink>
              ) : (
                <Link href={action.href}>Open</Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Features</p>
            <h2>Core capability pages</h2>
          </div>
        </div>
        <div className="list">
          {featureCards.map((item) => (
            <div key={item.slug} className="list-item">
              <div>
                <strong>{item.title}</strong>
                <p className="muted">{item.summary}</p>
              </div>
              <Link href={`/features/${item.slug}`}>Read</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Use cases</p>
            <h2>Team-specific journeys</h2>
          </div>
        </div>
        <div className="list">
          {useCaseCards.map((item) => (
            <div key={item.slug} className="list-item">
              <div>
                <strong>{item.title}</strong>
                <p className="muted">{item.summary}</p>
              </div>
              <Link href={`/use-cases/${item.slug}`}>Read</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="page-header">
          <div>
            <p className="eyebrow">Compare</p>
            <h2>Migration-oriented alternatives</h2>
          </div>
        </div>
        <div className="list">
          {compareCards.map((item) => (
            <div key={item.slug} className="list-item">
              <div>
                <strong>{item.title}</strong>
                <p className="muted">{item.summary}</p>
              </div>
              <PublicTrackedLink
                href={`/compare/${item.slug}`}
                event="PUBLIC_COMPARE_CLICK"
                source="home_compare_list"
                tenantId={tenantId}
              >
                Compare
              </PublicTrackedLink>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
