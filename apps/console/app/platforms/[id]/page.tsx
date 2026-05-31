import { PageShell } from "../../../components/page-shell";

export default async function PlatformDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell
      title="Platform detail"
      description="Inspect status, configuration, and audit history."
    >
      <p className="muted">Platform ID: {id}</p>
    </PageShell>
  );
}
