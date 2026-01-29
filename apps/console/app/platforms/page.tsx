import { PageShell } from "../../components/page-shell";

export default function PlatformsPage() {
  return (
    <PageShell
      title="Platforms"
      description="Register and monitor external API providers."
    >
      <div className="list">
        <div className="list-item">
          <div>
            <strong>No platforms connected</strong>
            <p className="muted">Add a provider to start provisioning accounts.</p>
          </div>
          <span className="badge">Setup</span>
        </div>
      </div>
    </PageShell>
  );
}
