import { PageShell } from "../../../components/page-shell";

export default function AccountDetailPage({
  params
}: {
  params: { id: string };
}) {
  return (
    <PageShell
      title="Account detail"
      description="Review account status and bound credentials."
    >
      <p className="muted">Account ID: {params.id}</p>
    </PageShell>
  );
}
