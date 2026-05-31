import { PageShell } from "../../../components/page-shell";

export default async function AssistantDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell
      title="Assistant detail"
      description="Review bindings, scopes, and usage."
    >
      <p className="muted">Assistant ID: {id}</p>
    </PageShell>
  );
}
