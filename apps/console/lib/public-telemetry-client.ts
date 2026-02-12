"use client";

import type { PublicEventName } from "./public-telemetry-events";

type PublicEventPayload = {
  event: PublicEventName;
  route?: string;
  source?: string;
  persona?: string;
  tenantId?: string;
  metadata?: Record<string, string>;
};

const telemetryEndpoint = "/api/telemetry/public-events";

export async function emitPublicEvent(payload: PublicEventPayload): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const { tenantId, ...restPayload } = payload;
  const body = JSON.stringify({
    ...restPayload,
    tenant_id: tenantId,
    ts: new Date().toISOString()
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(telemetryEndpoint, blob);
      return;
    }

    await fetch(telemetryEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store"
    });
  } catch {
    // Intentionally ignore client-side telemetry errors.
  }
}
