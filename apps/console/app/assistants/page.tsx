import { PageShell } from "../../components/page-shell";

export default function AssistantsPage() {
  return (
    <PageShell
      title="Assistants"
      description="Bind AI assistants to accounts and credentials."
    >
      <div className="list">
        <div className="list-item">
          <div>
            <strong>No assistants connected</strong>
            <p className="muted">Bind assistants once credentials are issued.</p>
          </div>
          <span className="badge">Ready</span>
        </div>
      </div>
    </PageShell>
  );
}
