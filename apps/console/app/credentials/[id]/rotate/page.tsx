import { PageShell } from "../../../../components/page-shell";

export default async function CredentialRotatePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell
      title="Rotate credential"
      description="Trigger a rotation and update downstream bindings."
    >
      <p className="muted">Credential ID: {id}</p>
    </PageShell>
  );
}
