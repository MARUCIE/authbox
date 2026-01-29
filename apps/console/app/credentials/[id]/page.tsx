import { PageShell } from "../../../components/page-shell";

export default function CredentialDetailPage({
  params
}: {
  params: { id: string };
}) {
  return (
    <PageShell
      title="Credential detail"
      description="Inspect credential status and rotation history."
    >
      <p className="muted">Credential ID: {params.id}</p>
    </PageShell>
  );
}
