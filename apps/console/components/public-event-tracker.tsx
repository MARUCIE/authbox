"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { emitPublicEvent } from "../lib/public-telemetry-client";
import type { PublicEventName } from "../lib/public-telemetry-events";

const DEFAULT_TENANT_ID = "public";

function normalizeTenantId(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readTenantIdFromLocation(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeTenantId(params.get("tenant_id"));
  } catch {
    return undefined;
  }
}

export function PublicPageViewTracker({
  source,
  persona = "P0_DISCOVERY_USER",
  tenantId
}: {
  source: string;
  persona?: string;
  tenantId?: string;
}) {
  const pathname = usePathname();
  const fallbackTenantId = normalizeTenantId(tenantId) || DEFAULT_TENANT_ID;

  useEffect(() => {
    const resolvedTenantId = readTenantIdFromLocation() || fallbackTenantId;
    void emitPublicEvent({
      event: "PUBLIC_PAGE_VIEW",
      route: pathname || "/",
      source,
      persona,
      tenantId: resolvedTenantId
    });
  }, [fallbackTenantId, pathname, persona, source]);

  return null;
}

export function PublicTrackedLink({
  href,
  event,
  source,
  persona = "P0_DISCOVERY_USER",
  tenantId,
  className,
  children
}: {
  href: string;
  event: PublicEventName;
  source: string;
  persona?: string;
  tenantId?: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const fallbackTenantId = normalizeTenantId(tenantId) || DEFAULT_TENANT_ID;

  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        const resolvedTenantId = readTenantIdFromLocation() || fallbackTenantId;
        void emitPublicEvent({
          event,
          route: pathname || "/",
          source,
          persona,
          tenantId: resolvedTenantId,
          metadata: {
            target: href
          }
        });
      }}
    >
      {children}
    </Link>
  );
}
