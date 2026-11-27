import { NextResponse } from "next/server";
import { isPublicEventName } from "../../../../lib/public-telemetry-events";
import { recordPublicEvent } from "../../../../lib/public-telemetry-store";
import {
  MAX_BODY_BYTES,
  MAX_LABEL_LENGTH,
  MAX_ROUTE_LENGTH,
  clip,
  normalizeMetadata,
  normalizeTimestamp
} from "../../../../lib/public-telemetry-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicEventRequestBody = {
  event?: string;
  route?: string;
  source?: string;
  persona?: string;
  tenant_id?: string;
  metadata?: unknown;
  ts?: string;
};

export async function POST(request: Request) {
  const tooLarge = NextResponse.json(
    { code: "PAYLOAD_TOO_LARGE", message: "Telemetry events are limited to 8 KB." },
    { status: 413 }
  );
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return tooLarge;
  }

  let payload: PublicEventRequestBody;

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      return tooLarge;
    }
    payload = JSON.parse(text) as PublicEventRequestBody;
  } catch {
    return NextResponse.json(
      { code: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const event = typeof payload?.event === "string" ? payload.event : "";
  if (!isPublicEventName(event)) {
    return NextResponse.json(
      { code: "INVALID_EVENT", message: "Unsupported telemetry event." },
      { status: 400 }
    );
  }

  const recorded = recordPublicEvent({
    event,
    route: clip(payload.route, MAX_ROUTE_LENGTH) ?? "/",
    source: clip(payload.source, MAX_LABEL_LENGTH) ?? "unknown",
    persona: clip(payload.persona, MAX_LABEL_LENGTH) ?? "unknown",
    tenantId: clip(payload.tenant_id, MAX_LABEL_LENGTH),
    metadata: normalizeMetadata(payload.metadata),
    ts: normalizeTimestamp(payload.ts)
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
