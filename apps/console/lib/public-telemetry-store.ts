import fs from "node:fs";
import path from "node:path";
import type { PublicEventName } from "./public-telemetry-events";

export type PublicTelemetryEvent = {
  id: string;
  event: PublicEventName;
  route: string;
  source: string;
  persona: string;
  tenant_id: string;
  ts: string;
  metadata?: Record<string, string>;
};

type TelemetryCounters = Record<PublicEventName, number>;
type TelemetryMapCounter = Record<string, number>;

export type PublicTelemetryQuery = {
  windowMinutes?: number;
  source?: string;
  persona?: string;
  route?: string;
  tenantId?: string;
  bucketMinutes?: number;
  recentLimit?: number;
};

type ResolvedTelemetryQuery = {
  windowMinutes: number;
  source?: string;
  persona?: string;
  route?: string;
  tenantId?: string;
  bucketMinutes: number;
  recentLimit: number;
};

export type FunnelAlert = {
  code: string;
  level: "info" | "warn";
  message: string;
  observed: number;
  threshold: number;
  unit: "percent" | "count";
};

const MAX_RECENT_EVENTS = 500;
const telemetryFilePath =
  process.env.AUTH_BOX_CONSOLE_TELEMETRY_FILE ||
  path.join(process.cwd(), "outputs", "telemetry", "public-events.ndjson");
const DEFAULT_WINDOW_MINUTES = 24 * 60;
const DEFAULT_BUCKET_MINUTES = 60;
const DEFAULT_RECENT_LIMIT = 20;
const MINUTES_PER_WEEK = 7 * 24 * 60;
const DEFAULT_TENANT_ID = "public";

function createEmptyCounters(): TelemetryCounters {
  return {
    PUBLIC_PAGE_VIEW: 0,
    PUBLIC_CTA_CLICK: 0,
    PUBLIC_COMPARE_CLICK: 0,
    ONBOARDING_ENTRY_VIEW: 0,
    PLATFORM_CREATE_SUCCESS: 0
  };
}

const counters: TelemetryCounters = createEmptyCounters();

const routeCounters: TelemetryMapCounter = {};
const sourceCounters: TelemetryMapCounter = {};
const tenantCounters: TelemetryMapCounter = {};
const events: PublicTelemetryEvent[] = [];
let loadedFromDisk = false;

function normalizeRoute(route?: string): string {
  if (!route) {
    return "/";
  }
  if (route.startsWith("/")) {
    return route;
  }
  return `/${route}`;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function incrementMapValue(map: TelemetryMapCounter, key: string) {
  map[key] = (map[key] || 0) + 1;
}

function incrementCounters(counterMap: TelemetryCounters, eventName: PublicEventName) {
  counterMap[eventName] += 1;
}

function applyEvent(eventRecord: PublicTelemetryEvent) {
  incrementCounters(counters, eventRecord.event);
  incrementMapValue(routeCounters, eventRecord.route);
  incrementMapValue(sourceCounters, eventRecord.source);
  incrementMapValue(tenantCounters, eventRecord.tenant_id);

  events.push(eventRecord);
  if (events.length > MAX_RECENT_EVENTS) {
    events.shift();
  }
}

function ensureLoadedFromDisk() {
  if (loadedFromDisk) {
    return;
  }
  loadedFromDisk = true;

  try {
    if (!fs.existsSync(telemetryFilePath)) {
      return;
    }

    const payload = fs.readFileSync(telemetryFilePath, "utf-8");
    if (!payload.trim()) {
      return;
    }

    const lines = payload.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<PublicTelemetryEvent>;
        if (
          !parsed ||
          !parsed.event ||
          !parsed.route ||
          !parsed.source ||
          !parsed.persona ||
          !parsed.ts
        ) {
          continue;
        }

        applyEvent({
          id: parsed.id || crypto.randomUUID(),
          event: parsed.event,
          route: parsed.route,
          source: parsed.source,
          persona: parsed.persona,
          tenant_id: parsed.tenant_id || DEFAULT_TENANT_ID,
          ts: parsed.ts,
          metadata: parsed.metadata
        });
      } catch {
        // Skip malformed persisted lines.
      }
    }
  } catch {
    // Telemetry should not break request flow.
  }
}

function persistEvent(eventRecord: PublicTelemetryEvent) {
  try {
    fs.mkdirSync(path.dirname(telemetryFilePath), { recursive: true });
    fs.appendFileSync(telemetryFilePath, `${JSON.stringify(eventRecord)}\n`, "utf-8");
  } catch {
    // Ignore persistence failures to keep business flow unaffected.
  }
}

export function recordPublicEvent(input: {
  event: PublicEventName;
  route?: string;
  source?: string;
  persona?: string;
  tenantId?: string;
  metadata?: Record<string, string>;
  ts?: string;
}): PublicTelemetryEvent {
  ensureLoadedFromDisk();

  const eventRecord: PublicTelemetryEvent = {
    id: crypto.randomUUID(),
    event: input.event,
    route: normalizeRoute(input.route),
    source: input.source || "unknown",
    persona: input.persona || "unknown",
    tenant_id: input.tenantId || DEFAULT_TENANT_ID,
    ts: input.ts || new Date().toISOString(),
    metadata: input.metadata
  };

  applyEvent(eventRecord);
  persistEvent(eventRecord);

  return eventRecord;
}

export function getPublicTelemetrySnapshot() {
  ensureLoadedFromDisk();

  return {
    counters: { ...counters },
    routeCounters: { ...routeCounters },
    sourceCounters: { ...sourceCounters },
    tenantCounters: { ...tenantCounters },
    recentEvents: [...events]
  };
}

export function getDualFunnelMetrics() {
  ensureLoadedFromDisk();
  return buildDualFunnelMetrics(counters);
}

export function getTelemetryPersistenceInfo() {
  ensureLoadedFromDisk();

  return {
    file_path: telemetryFilePath,
    loaded_from_disk: loadedFromDisk,
    file_exists: fs.existsSync(telemetryFilePath),
    recent_events_in_memory: events.length
  };
}

function normalizeTextFilter(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePositiveInt(
  value: number | undefined,
  fallback: number,
  minValue: number,
  maxValue: number
): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return Math.min(maxValue, Math.max(minValue, Math.floor(value)));
}

function resolveTelemetryQuery(input?: PublicTelemetryQuery): ResolvedTelemetryQuery {
  return {
    windowMinutes: normalizePositiveInt(
      input?.windowMinutes,
      DEFAULT_WINDOW_MINUTES,
      1,
      MINUTES_PER_WEEK
    ),
    source: normalizeTextFilter(input?.source),
    persona: normalizeTextFilter(input?.persona),
    route: normalizeTextFilter(input?.route),
    tenantId: normalizeTextFilter(input?.tenantId),
    bucketMinutes: normalizePositiveInt(
      input?.bucketMinutes,
      DEFAULT_BUCKET_MINUTES,
      1,
      24 * 60
    ),
    recentLimit: normalizePositiveInt(input?.recentLimit, DEFAULT_RECENT_LIMIT, 1, 200)
  };
}

function parseEventTime(ts: string): number | null {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

function buildDualFunnelMetrics(counterMap: TelemetryCounters) {
  const seoViews = counterMap.PUBLIC_PAGE_VIEW;
  const seoCtaClicks = counterMap.PUBLIC_CTA_CLICK;
  const onboardingEntries = counterMap.ONBOARDING_ENTRY_VIEW;
  const platformCreates = counterMap.PLATFORM_CREATE_SUCCESS;

  return {
    seo_funnel: {
      page_views: seoViews,
      cta_clicks: seoCtaClicks,
      cta_ctr_percent: toPercent(seoCtaClicks, seoViews)
    },
    product_funnel: {
      onboarding_entries: onboardingEntries,
      platform_create_success: platformCreates,
      completion_rate_percent: toPercent(platformCreates, onboardingEntries)
    }
  };
}

function aggregateFromEvents(inputEvents: PublicTelemetryEvent[]) {
  const aggregateCounters = createEmptyCounters();
  const aggregateRouteCounters: TelemetryMapCounter = {};
  const aggregateSourceCounters: TelemetryMapCounter = {};
  const aggregateTenantCounters: TelemetryMapCounter = {};

  for (const eventItem of inputEvents) {
    incrementCounters(aggregateCounters, eventItem.event);
    incrementMapValue(aggregateRouteCounters, eventItem.route);
    incrementMapValue(aggregateSourceCounters, eventItem.source);
    incrementMapValue(aggregateTenantCounters, eventItem.tenant_id);
  }

  return {
    counters: aggregateCounters,
    routeCounters: aggregateRouteCounters,
    sourceCounters: aggregateSourceCounters,
    tenantCounters: aggregateTenantCounters
  };
}

function buildTopEntries(map: TelemetryMapCounter, limit: number) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function buildTrend(
  filteredEvents: PublicTelemetryEvent[],
  bucketMinutes: number
): Array<{
  bucket_start: string;
  bucket_epoch_ms: number;
  metrics: ReturnType<typeof buildDualFunnelMetrics>;
  counters: TelemetryCounters;
}> {
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketMap = new Map<number, TelemetryCounters>();

  for (const eventItem of filteredEvents) {
    const tsMs = parseEventTime(eventItem.ts);
    if (tsMs === null) {
      continue;
    }
    const bucketStart = Math.floor(tsMs / bucketMs) * bucketMs;
    const current = bucketMap.get(bucketStart) || createEmptyCounters();
    incrementCounters(current, eventItem.event);
    bucketMap.set(bucketStart, current);
  }

  return Array.from(bucketMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStart, bucketCounters]) => ({
      bucket_start: new Date(bucketStart).toISOString(),
      bucket_epoch_ms: bucketStart,
      metrics: buildDualFunnelMetrics(bucketCounters),
      counters: bucketCounters
    }));
}

function parseThreshold(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function buildFunnelAlerts(input: {
  counters: TelemetryCounters;
  metrics: ReturnType<typeof buildDualFunnelMetrics>;
}): {
  has_warning: boolean;
  thresholds: {
    min_cta_ctr_percent: number;
    min_product_completion_percent: number;
    min_seo_views_for_evaluation: number;
    min_onboarding_for_evaluation: number;
  };
  items: FunnelAlert[];
} {
  const minCtaCtrPercent = parseThreshold(
    process.env.AUTH_BOX_FUNNEL_MIN_CTA_CTR_PERCENT,
    3
  );
  const minProductCompletionPercent = parseThreshold(
    process.env.AUTH_BOX_FUNNEL_MIN_COMPLETION_PERCENT,
    20
  );
  const minSeoViewsForEvaluation = parseThreshold(
    process.env.AUTH_BOX_FUNNEL_MIN_SEO_VIEWS_FOR_EVALUATION,
    10
  );
  const minOnboardingForEvaluation = parseThreshold(
    process.env.AUTH_BOX_FUNNEL_MIN_ONBOARDING_FOR_EVALUATION,
    5
  );

  const items: FunnelAlert[] = [];

  if (input.counters.PUBLIC_PAGE_VIEW < minSeoViewsForEvaluation) {
    items.push({
      code: "SEO_SAMPLE_LOW",
      level: "info",
      message: "SEO views are below evaluation threshold.",
      observed: input.counters.PUBLIC_PAGE_VIEW,
      threshold: minSeoViewsForEvaluation,
      unit: "count"
    });
  } else if (input.metrics.seo_funnel.cta_ctr_percent < minCtaCtrPercent) {
    items.push({
      code: "SEO_CTR_BELOW_THRESHOLD",
      level: "warn",
      message: "SEO CTA CTR is below configured threshold.",
      observed: input.metrics.seo_funnel.cta_ctr_percent,
      threshold: minCtaCtrPercent,
      unit: "percent"
    });
  }

  if (input.counters.ONBOARDING_ENTRY_VIEW < minOnboardingForEvaluation) {
    items.push({
      code: "PRODUCT_SAMPLE_LOW",
      level: "info",
      message: "Onboarding entries are below evaluation threshold.",
      observed: input.counters.ONBOARDING_ENTRY_VIEW,
      threshold: minOnboardingForEvaluation,
      unit: "count"
    });
  } else if (
    input.metrics.product_funnel.completion_rate_percent < minProductCompletionPercent
  ) {
    items.push({
      code: "PRODUCT_COMPLETION_BELOW_THRESHOLD",
      level: "warn",
      message: "Platform creation completion is below configured threshold.",
      observed: input.metrics.product_funnel.completion_rate_percent,
      threshold: minProductCompletionPercent,
      unit: "percent"
    });
  }

  return {
    has_warning: items.some((item) => item.level === "warn"),
    thresholds: {
      min_cta_ctr_percent: minCtaCtrPercent,
      min_product_completion_percent: minProductCompletionPercent,
      min_seo_views_for_evaluation: minSeoViewsForEvaluation,
      min_onboarding_for_evaluation: minOnboardingForEvaluation
    },
    items
  };
}

export function getPublicTelemetryAnalytics(input?: PublicTelemetryQuery) {
  ensureLoadedFromDisk();

  const query = resolveTelemetryQuery(input);
  const nowMs = Date.now();
  const lowerSource = query.source?.toLowerCase();
  const lowerPersona = query.persona?.toLowerCase();
  const lowerTenantId = query.tenantId?.toLowerCase();
  const normalizedRoute = query.route ? normalizeRoute(query.route) : undefined;
  const thresholdMs = nowMs - query.windowMinutes * 60 * 1000;

  const filteredEvents = events.filter((eventItem) => {
    const tsMs = parseEventTime(eventItem.ts);
    if (tsMs === null || tsMs < thresholdMs) {
      return false;
    }
    if (lowerSource && eventItem.source.toLowerCase() !== lowerSource) {
      return false;
    }
    if (lowerPersona && eventItem.persona.toLowerCase() !== lowerPersona) {
      return false;
    }
    if (lowerTenantId && eventItem.tenant_id.toLowerCase() !== lowerTenantId) {
      return false;
    }
    if (normalizedRoute && eventItem.route !== normalizedRoute) {
      return false;
    }
    return true;
  });

  const aggregates = aggregateFromEvents(filteredEvents);
  const metrics = buildDualFunnelMetrics(aggregates.counters);
  const alerts = buildFunnelAlerts({
    counters: aggregates.counters,
    metrics
  });

  return {
    query,
    metrics,
    counters: aggregates.counters,
    topRoutes: buildTopEntries(aggregates.routeCounters, 10).map((item) => ({
      route: item.name,
      count: item.count
    })),
    topSources: buildTopEntries(aggregates.sourceCounters, 10).map((item) => ({
      source: item.name,
      count: item.count
    })),
    topTenants: buildTopEntries(aggregates.tenantCounters, 10).map((item) => ({
      tenant_id: item.name,
      count: item.count
    })),
    recentEvents: filteredEvents.slice(-query.recentLimit),
    trend: buildTrend(filteredEvents, query.bucketMinutes),
    alerts,
    event_count: filteredEvents.length
  };
}
