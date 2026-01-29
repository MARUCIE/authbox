import { PageShell } from "../../../../components/page-shell";

export default function CredentialRotatePage({
  params
}: {
  params: { id: string };
}) {
  return (
    <PageShell
      title="Rotate credential"
      description="Trigger a rotation and update downstream bindings."
    >
      <p className="muted">Credential ID: {params.id}</p>
    </PageShell>
  );
}
