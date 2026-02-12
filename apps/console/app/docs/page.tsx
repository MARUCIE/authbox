import Link from "next/link";
import { MarketingPage } from "../../components/marketing-page";

export default function DocsPage() {
  return (
    <MarketingPage
      title="Docs"
      description="Documentation map for product, architecture, experience journeys, and API contract."
      bullets={[
        "PRD + UX Map + System Architecture as synchronized PDCA sources",
        "API contract and runbook for implementation details",
        "SOP evidence directories for auditable execution history"
      ]}
    >
      <div className="panel">
        <div className="list">
          <div className="list-item">
            <div>
              <strong>Project docs index</strong>
              <p className="muted">Navigate structured project documentation.</p>
            </div>
            <Link href="/changelog">View changelog</Link>
          </div>
          <div className="list-item">
            <div>
              <strong>Console onboarding</strong>
              <p className="muted">Start with platform provisioning workflow.</p>
            </div>
            <Link href="/platforms/new">Open onboarding</Link>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
