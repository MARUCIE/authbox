import type { ReactNode } from "react";
import { PublicPageViewTracker, PublicTrackedLink } from "./public-event-tracker";

export function MarketingPage({
  eyebrow = "Public",
  title,
  description,
  bullets,
  children,
  source = "public_marketing",
  tenantId = "public"
}: {
  eyebrow?: string;
  title: string;
  description: string;
  bullets?: string[];
  children?: ReactNode;
  source?: string;
  tenantId?: string;
}) {
  const onboardingHref = `/platforms/new?source=${encodeURIComponent(source)}&tenant_id=${encodeURIComponent(
    tenantId
  )}`;

  return (
    <section className="page">
      <PublicPageViewTracker source={source} tenantId={tenantId} />
      <div className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="muted">{description}</p>
        </div>
      </div>

      {bullets && bullets.length > 0 ? (
        <div className="panel">
          <div className="list">
            {bullets.map((item) => (
              <div key={item} className="list-item">
                <div>
                  <strong>{item}</strong>
                </div>
                <span className="badge">Key</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {children}

      <div className="panel">
        <div className="list-item">
          <div>
            <strong>Start onboarding</strong>
            <p className="muted">Jump into Console onboarding and create your first platform.</p>
          </div>
          <PublicTrackedLink
            href={onboardingHref}
            event="PUBLIC_CTA_CLICK"
            source={`${source}_cta`}
            tenantId={tenantId}
          >
            Go to /platforms/new
          </PublicTrackedLink>
        </div>
      </div>
    </section>
  );
}
