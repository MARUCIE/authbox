import { NextResponse } from "next/server";
import { isPublicEventName } from "../../../../lib/public-telemetry-events";
import { recordPublicEvent } from "../../../../lib/public-telemetry-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicEventRequestBody = {
  event?: string;
  route?: string;
  source?: string;
  persona?: string;
  tenant_id?: string;
  metadata?: Record<string, unknown>;
  ts?: string;
};

function normalizeMetadata(input?: Record<string, unknown>) {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      entries.push([key, String(value)]);
    }
  }

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

export async function POST(request: Request) {
  let payload: PublicEventRequestBody;

  try {
    payload = (await request.json()) as PublicEventRequestBody;
  } catch {
    return NextResponse.json(
      { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const event = payload?.event || "";
  if (!isPublicEventName(event)) {
    return NextResponse.json(
      { code: "INVALID_EVENT", message: "Unsupported telemetry event." },
      { status: 400 }
    );
  }

  const recorded = recordPublicEvent({
    event,
    route: typeof payload.route === "string" ? payload.route : "/",
    source: typeof payload.source === "string" ? payload.source : "unknown",
    persona: typeof payload.persona === "string" ? payload.persona : "unknown",
    tenantId: typeof payload.tenant_id === "string" ? payload.tenant_id : undefined,
    metadata: normalizeMetadata(payload.metadata),
    ts: typeof payload.ts === "string" ? payload.ts : undefined
  });

  return NextResponse.json(
    {
      request_id: crypto.randomUUID(),
      status: "accepted",
      event_id: recorded.id
    },
    { status: 202 }
  );
}
