import { PageShell } from "../../../components/page-shell";

export default async function AccountDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell
      title="Account detail"
      description="Review account status and bound credentials."
    >
      <p className="muted">Account ID: {id}</p>
    </PageShell>
  );
}
