import { NextResponse } from "next/server";
import {
  getPublicTelemetryAnalytics,
  getTelemetryPersistenceInfo
} from "../../../../lib/public-telemetry-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const analytics = getPublicTelemetryAnalytics({
    windowMinutes: parsePositiveInt(searchParams.get("window_minutes")),
    bucketMinutes: parsePositiveInt(searchParams.get("bucket_minutes")),
    recentLimit: parsePositiveInt(searchParams.get("recent_limit")),
    source: searchParams.get("source") || undefined,
    persona: searchParams.get("persona") || undefined,
    tenantId: searchParams.get("tenant_id") || undefined,
    route: searchParams.get("route") || undefined
  });
  const persistence = getTelemetryPersistenceInfo();

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    query: analytics.query,
    persistence,
    metrics: analytics.metrics,
    counters: analytics.counters,
    event_count: analytics.event_count,
    top_routes: analytics.topRoutes,
    top_sources: analytics.topSources,
    top_tenants: analytics.topTenants,
    recent_events: analytics.recentEvents,
    trend: analytics.trend,
    alerts: analytics.alerts
  });
}
