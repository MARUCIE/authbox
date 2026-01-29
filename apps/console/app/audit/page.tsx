import { PageShell } from "../../components/page-shell";

export default function AuditPage() {
  return (
    <PageShell
      title="Audit log"
      description="Review sensitive operations across the platform."
    >
      <div className="list">
        <div className="list-item">
          <div>
            <strong>No audit events yet</strong>
            <p className="muted">Events will appear once activity starts.</p>
          </div>
          <span className="badge">Trace</span>
        </div>
      </div>
    </PageShell>
  );
}
