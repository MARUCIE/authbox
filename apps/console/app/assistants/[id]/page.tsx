import { PageShell } from "../../../components/page-shell";

export default function AssistantDetailPage({
  params
}: {
  params: { id: string };
}) {
  return (
    <PageShell
      title="Assistant detail"
      description="Review bindings, scopes, and usage."
    >
      <p className="muted">Assistant ID: {params.id}</p>
    </PageShell>
  );
}
