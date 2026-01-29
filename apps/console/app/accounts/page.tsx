import { PageShell } from "../../components/page-shell";

export default function AccountsPage() {
  return (
    <PageShell
      title="Accounts"
      description="Provision and manage external accounts."
    >
      <div className="list">
        <div className="list-item">
          <div>
            <strong>No accounts provisioned</strong>
            <p className="muted">Create your first account to issue credentials.</p>
          </div>
          <span className="badge">Provision</span>
        </div>
      </div>
    </PageShell>
  );
}
