import Link from "next/link";
import { PageShell } from "../../components/page-shell";
import { APIRequestError, apiEntry, listPlatforms } from "../../lib/api";

export const dynamic = "force-dynamic";

type PlatformsPageProps = {
  searchParams?: Promise<{
    created?: string;
  }>;
};

export default async function PlatformsPage({ searchParams }: PlatformsPageProps) {
  const resolvedSearchParams = await searchParams;
  let platforms = [] as Awaited<ReturnType<typeof listPlatforms>>;
  let errorSummary = "";
  let errorDetail = "";

  try {
    platforms = await listPlatforms();
  } catch (error) {
    if (error instanceof APIRequestError) {
      errorSummary = `${error.status} ${error.code}`;
      errorDetail = error.message;
      if (error.requestId) {
        errorDetail = `${errorDetail} (request_id=${error.requestId})`;
      }
    } else if (error instanceof Error) {
      errorSummary = "INTEGRATION_ERROR";
      errorDetail = error.message;
    } else {
      errorSummary = "INTEGRATION_ERROR";
      errorDetail = "unknown error";
    }
  }

  const entry = apiEntry();
  const created = resolvedSearchParams?.created === "1";

  return (
    <PageShell
      title="Platforms"
      description="Register and monitor external API providers (real API integrated)."
    >
      <div className="list" data-testid="platforms-list">
        <div className="list-item">
          <div>
            <strong>API entry</strong>
            <p className="muted">
              {entry.baseURL} | token configured: {entry.hasToken ? "yes" : "no"} | auth source: {entry.authSource}
            </p>
            {entry.configError ? <p className="muted">{entry.configError}</p> : null}
          </div>
          <Link href="/platforms/new">Add platform</Link>
        </div>
        {created ? (
          <div className="list-item">
            <div>
              <strong>Platform created</strong>
              <p className="muted">Latest create action has been persisted and reloaded.</p>
            </div>
            <span className="badge">Success</span>
          </div>
        ) : null}
        {errorSummary ? (
          <div className="list-item">
            <div>
              <strong>API error: {errorSummary}</strong>
              <p className="muted">{errorDetail}</p>
            </div>
            <span className="badge">Error</span>
          </div>
        ) : null}
        {platforms.length === 0 && !errorSummary ? (
          <div className="list-item">
            <div>
              <strong>No platforms connected</strong>
              <p className="muted">Add a provider to start provisioning accounts.</p>
            </div>
            <span className="badge">Setup</span>
          </div>
        ) : null}
        {platforms.map((platform) => (
          <div key={platform.id} className="list-item">
            <div>
              <strong>
                {platform.name} ({platform.type})
              </strong>
              <p className="muted">
                id={platform.id} status={platform.status}
              </p>
            </div>
            <span className="badge">Synced</span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
