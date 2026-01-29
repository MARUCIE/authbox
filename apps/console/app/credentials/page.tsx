import { PageShell } from "../../components/page-shell";

export default function CredentialsPage() {
  return (
    <PageShell
      title="Credentials"
      description="Issue, rotate, and revoke API credentials."
    >
      <div className="list">
        <div className="list-item">
          <div>
            <strong>No credentials issued</strong>
            <p className="muted">Create credentials for managed accounts.</p>
          </div>
          <span className="badge">Secure</span>
        </div>
      </div>
    </PageShell>
  );
}
