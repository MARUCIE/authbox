import { PageShell } from "../../../components/page-shell";

export default async function CredentialDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell
      title="Credential detail"
      description="Inspect credential status and rotation history."
    >
      <p className="muted">Credential ID: {id}</p>
    </PageShell>
  );
}
