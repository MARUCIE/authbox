import { PageShell } from "../../../components/page-shell";

export default function PlatformDetailPage({
  params
}: {
  params: { id: string };
}) {
  return (
    <PageShell
      title="Platform detail"
      description="Inspect status, configuration, and audit history."
    >
      <p className="muted">Platform ID: {params.id}</p>
    </PageShell>
  );
}
