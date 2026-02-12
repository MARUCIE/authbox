import { PageShell } from "../../../components/page-shell";
import {
  getPublicTelemetryAnalytics,
  getTelemetryPersistenceInfo
} from "../../../lib/public-telemetry-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type FunnelMetricsPageProps = {
  searchParams?: {
    window_minutes?: string;
    bucket_minutes?: string;
    recent_limit?: string;
    source?: string;
    persona?: string;
    tenant_id?: string;
    route?: string;
  };
};

function parsePositiveInt(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
}

export default function FunnelMetricsPage({ searchParams }: FunnelMetricsPageProps) {
  const analytics = getPublicTelemetryAnalytics({
    windowMinutes: parsePositiveInt(searchParams?.window_minutes),
    bucketMinutes: parsePositiveInt(searchParams?.bucket_minutes),
    recentLimit: parsePositiveInt(searchParams?.recent_limit),
    source: searchParams?.source,
    persona: searchParams?.persona,
    tenantId: searchParams?.tenant_id,
    route: searchParams?.route
  });
  const persistence = getTelemetryPersistenceInfo();

  return (
    <PageShell
      title="Funnel Metrics"
      description="SEO entry funnel and onboarding conversion funnel from real telemetry events."
    >
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Filters</h2>
        <form method="get" className="list">
          <div className="list-item">
            <label htmlFor="window_minutes">Window (minutes)</label>
            <input
              id="window_minutes"
              name="window_minutes"
              defaultValue={String(analytics.query.windowMinutes)}
            />
          </div>
          <div className="list-item">
            <label htmlFor="bucket_minutes">Bucket (minutes)</label>
            <input
              id="bucket_minutes"
              name="bucket_minutes"
              defaultValue={String(analytics.query.bucketMinutes)}
            />
          </div>
          <div className="list-item">
            <label htmlFor="recent_limit">Recent events</label>
            <input
              id="recent_limit"
              name="recent_limit"
              defaultValue={String(analytics.query.recentLimit)}
            />
          </div>
          <div className="list-item">
            <label htmlFor="source">Source</label>
            <input
              id="source"
              name="source"
              defaultValue={analytics.query.source || ""}
              placeholder="home_quick_actions"
            />
          </div>
          <div className="list-item">
            <label htmlFor="persona">Persona</label>
            <input
              id="persona"
              name="persona"
              defaultValue={analytics.query.persona || ""}
              placeholder="P0_DISCOVERY_USER"
            />
          </div>
          <div className="list-item">
            <label htmlFor="route">Route</label>
            <input
              id="route"
              name="route"
              defaultValue={analytics.query.route || ""}
              placeholder="/product"
            />
          </div>
          <div className="list-item">
            <label htmlFor="tenant_id">Tenant</label>
            <input
              id="tenant_id"
              name="tenant_id"
              defaultValue={analytics.query.tenantId || ""}
              placeholder="public"
            />
          </div>
          <div className="list-item">
            <button type="submit">Apply filters</button>
            <a href="/metrics/funnel">Clear</a>
          </div>
        </form>
      </div>

      <div className="list">
        <div className="list-item">
          <div>
            <strong>SEO funnel</strong>
            <p className="muted">
              views={analytics.metrics.seo_funnel.page_views}, cta_clicks=
              {analytics.metrics.seo_funnel.cta_clicks}
            </p>
          </div>
          <span className="badge">{formatPercent(analytics.metrics.seo_funnel.cta_ctr_percent)}</span>
        </div>
        <div className="list-item">
          <div>
            <strong>Product funnel</strong>
            <p className="muted">
              onboarding={analytics.metrics.product_funnel.onboarding_entries},
              platform_success={analytics.metrics.product_funnel.platform_create_success}
            </p>
          </div>
          <span className="badge">
            {formatPercent(analytics.metrics.product_funnel.completion_rate_percent)}
          </span>
        </div>
        <div className="list-item">
          <div>
            <strong>Persistence</strong>
            <p className="muted">{persistence.file_path}</p>
          </div>
          <span className="badge">{persistence.file_exists ? "Persistent" : "No file yet"}</span>
        </div>
        <div className="list-item">
          <div>
            <strong>Filtered events</strong>
            <p className="muted">
              window={analytics.query.windowMinutes}m, source=
              {analytics.query.source || "all"}, persona={analytics.query.persona || "all"},
              tenant={analytics.query.tenantId || "all"}, route={analytics.query.route || "all"}
            </p>
          </div>
          <span className="badge">{analytics.event_count}</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Alerts</h2>
        <div className="list">
          {analytics.alerts.items.length === 0 ? (
            <div className="list-item">
              <span className="muted">No funnel alerts for current filters.</span>
            </div>
          ) : (
            analytics.alerts.items.map((item) => (
              <div key={item.code} className="list-item">
                <div>
                  <strong>{item.code}</strong>
                  <p className="muted">{item.message}</p>
                </div>
                <span className="badge">
                  {item.observed}/{item.threshold} {item.unit}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Top Routes</h2>
        <div className="list">
          {analytics.topRoutes.length === 0 ? (
            <div className="list-item">
              <span className="muted">No route events yet.</span>
            </div>
          ) : (
            analytics.topRoutes.map(({ route, count }) => (
              <div key={route} className="list-item">
                <strong>{route}</strong>
                <span className="badge">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Top Sources</h2>
        <div className="list">
          {analytics.topSources.length === 0 ? (
            <div className="list-item">
              <span className="muted">No source events yet.</span>
            </div>
          ) : (
            analytics.topSources.map(({ source, count }) => (
              <div key={source} className="list-item">
                <strong>{source}</strong>
                <span className="badge">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Top Tenants</h2>
        <div className="list">
          {analytics.topTenants.length === 0 ? (
            <div className="list-item">
              <span className="muted">No tenant events yet.</span>
            </div>
          ) : (
            analytics.topTenants.map(({ tenant_id, count }) => (
              <div key={tenant_id} className="list-item">
                <strong>{tenant_id}</strong>
                <span className="badge">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Trend</h2>
        <div className="list">
          {analytics.trend.length === 0 ? (
            <div className="list-item">
              <span className="muted">No trend data for current filters.</span>
            </div>
          ) : (
            analytics.trend.map((item) => (
              <div key={item.bucket_epoch_ms} className="list-item">
                <div>
                  <strong>{formatDateTime(item.bucket_start)}</strong>
                  <p className="muted">
                    pv={item.counters.PUBLIC_PAGE_VIEW}, cta={item.counters.PUBLIC_CTA_CLICK},
                    onboarding={item.counters.ONBOARDING_ENTRY_VIEW}, success=
                    {item.counters.PLATFORM_CREATE_SUCCESS}
                  </p>
                </div>
                <span className="badge">
                  CTR {formatPercent(item.metrics.seo_funnel.cta_ctr_percent)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Recent Events</h2>
        <div className="list">
          {analytics.recentEvents.length === 0 ? (
            <div className="list-item">
              <span className="muted">No events recorded yet.</span>
            </div>
          ) : (
            analytics.recentEvents
              .slice()
              .reverse()
              .map((eventItem) => (
              <div key={eventItem.id} className="list-item">
                <div>
                  <strong>{eventItem.event}</strong>
                  <p className="muted">
                    {eventItem.route} | {eventItem.source} | {eventItem.persona} |{" "}
                    {eventItem.tenant_id}
                  </p>
                </div>
                <span className="badge">{formatDateTime(eventItem.ts)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </PageShell>
  );
}
