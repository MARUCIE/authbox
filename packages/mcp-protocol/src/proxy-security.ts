import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ProxyRequest } from "./tools";

const ALLOWED_PROXY_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);
const MAX_PROXY_BODY_BYTES = 64 * 1024;
const MAX_PROXY_HEADERS = 32;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// RFC 7230 field-value: visible ASCII, obs-text, space and horizontal tab.
// Blocks CR/LF/NUL so a value can never smuggle extra headers downstream.
const HEADER_VALUE_RE = /^[\t\x20-\x7e\x80-\xff]*$/;

const FORBIDDEN_PROXY_HEADERS = new Set([
  "authorization",
  "cookie",
  "host",
  "proxy-authorization",
  "x-api-key",
  "x-goog-api-key",
  "content-length",
  "transfer-encoding",
  "connection",
]);

type HostLookup = (hostname: string) => Promise<string[]>;

export interface ProxySecurityOptions {
  lookupHostname?: HostLookup;
}

export async function sanitizeProxyRequest(
  serviceName: string,
  request: ProxyRequest,
  options: ProxySecurityOptions = {},
): Promise<ProxyRequest> {
  const method = String(request.method ?? "").toUpperCase();
  if (!ALLOWED_PROXY_METHODS.has(method)) {
    throw new Error("Proxy method is not allowed");
  }

  const url = parseProxyURL(request.url);
  const hostname = normalizeHostname(url.hostname);

  assertServiceHostBinding(serviceName, hostname);
  await assertPublicDestination(
    hostname,
    options.lookupHostname ?? defaultLookupHostname,
  );

  if (url.username || url.password) {
    throw new Error("Proxy URL credentials are not allowed");
  }

  const headers = sanitizeHeaders(request.headers);
  const body = sanitizeBody(method, request.body);

  return {
    method,
    url: url.toString(),
    ...(headers ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

function parseProxyURL(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Proxy URL must be an absolute HTTP(S) URL");
  }

  // Credentials are injected into proxied requests, so plaintext HTTP is
  // never acceptable as a destination.
  if (url.protocol !== "https:") {
    throw new Error("Proxy URL must use https");
  }

  return url;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/\.$/, "");
}

function assertServiceHostBinding(serviceName: string, hostname: string): void {
  const serviceHost = serviceNameToHost(serviceName);
  if (!serviceHost) {
    throw new Error("Proxy service_name must be a hostname or URL host");
  }

  if (hostname !== serviceHost && !hostname.endsWith(`.${serviceHost}`)) {
    throw new Error("Proxy URL host must match service_name host");
  }
}

function serviceNameToHost(serviceName: string): string | null {
  const trimmed = String(serviceName ?? "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("://")) {
    try {
      return normalizeHostname(new URL(trimmed).hostname);
    } catch {
      return null;
    }
  }

  if (
    !trimmed.includes(".") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    return null;
  }

  return normalizeHostname(trimmed);
}

async function assertPublicDestination(
  hostname: string,
  lookupHostname: HostLookup,
): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Proxy URL host is not allowed");
  }

  if (isIP(hostname)) {
    if (isBlockedIPAddress(hostname)) {
      throw new Error("Proxy URL IP address is not allowed");
    }
    return;
  }

  const addresses = await lookupHostname(hostname);
  if (addresses.length === 0) {
    throw new Error("Proxy URL host did not resolve");
  }

  for (const address of addresses) {
    if (isBlockedIPAddress(address)) {
      throw new Error("Proxy URL resolved to a private address");
    }
  }
}

async function defaultLookupHostname(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  );
}

function isBlockedIPAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return isBlockedIPv4(address);
  }
  if (isIP(address) === 6) {
    return isBlockedIPv6(address);
  }
  return true;
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Parse an IPv6 address into its eight 16-bit groups.
 * Returns null when the address cannot be parsed (callers treat that as blocked).
 */
function parseIPv6Groups(address: string): number[] | null {
  const zoneIndex = address.indexOf("%");
  const addr = zoneIndex === -1 ? address : address.slice(0, zoneIndex);

  const doubleColon = addr.indexOf("::");
  if (doubleColon !== addr.lastIndexOf("::")) {
    return null;
  }

  const head = doubleColon === -1 ? addr : addr.slice(0, doubleColon);
  const tail = doubleColon === -1 ? "" : addr.slice(doubleColon + 2);

  const parseGroups = (segment: string, isTail: boolean): number[] | null => {
    if (segment === "") {
      return [];
    }
    const parts = segment.split(":");
    const groups: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes(".")) {
        // Embedded IPv4 (e.g. ::ffff:169.254.169.254) must be the last part.
        const isLast = i === parts.length - 1 && (isTail || doubleColon === -1);
        if (!isLast) {
          return null;
        }
        const octets = part.split(".").map((n) => Number.parseInt(n, 10));
        if (
          octets.length !== 4 ||
          octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)
        ) {
          return null;
        }
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) {
          return null;
        }
        groups.push(Number.parseInt(part, 16));
      }
    }
    return groups;
  };

  const headGroups = parseGroups(head, doubleColon === -1);
  const tailGroups = parseGroups(tail, true);
  if (!headGroups || !tailGroups) {
    return null;
  }

  if (doubleColon === -1) {
    return headGroups.length === 8 ? headGroups : null;
  }

  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 1) {
    return null;
  }
  return [...headGroups, ...new Array<number>(missing).fill(0), ...tailGroups];
}

function isBlockedIPv6(address: string): boolean {
  const groups = parseIPv6Groups(address.toLowerCase());
  if (!groups) {
    return true;
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedIPv4 = (hi: number, lo: number) =>
    `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

  const leadingZeros =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // ::  and ::1 (unspecified / loopback) fall out of the IPv4-compatible
  // check below (0.0.0.x is blocked), but keep them explicit.
  if (leadingZeros && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) {
    return true;
  }
  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 — apply IPv4 rules
  // to the embedded address so ::ffff:169.254.169.254 etc. cannot bypass.
  if (leadingZeros && (g5 === 0xffff || g5 === 0)) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 destination.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isBlockedIPv4(embeddedIPv4(g6, g7));
  }
  // 6to4 2002::/16 embeds the IPv4 address in the next two groups.
  if (g0 === 0x2002) {
    return isBlockedIPv4(embeddedIPv4(g1, g2));
  }
  // Teredo 2001:0::/32 embeds the client IPv4 XOR 0xffff in the last groups.
  if (g0 === 0x2001 && g1 === 0) {
    return isBlockedIPv4(embeddedIPv4(g6 ^ 0xffff, g7 ^ 0xffff));
  }
  // Documentation prefix 2001:db8::/32.
  if (g0 === 0x2001 && g1 === 0x0db8) {
    return true;
  }
  // ULA fc00::/7, link-local fe80::/10, multicast ff00::/8.
  if ((g0 & 0xfe00) === 0xfc00) {
    return true;
  }
  if ((g0 & 0xffc0) === 0xfe80) {
    return true;
  }
  if ((g0 & 0xff00) === 0xff00) {
    return true;
  }
  return false;
}

function sanitizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  if (typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("Proxy request headers must be an object");
  }

  const entries = Object.entries(headers);
  if (entries.length > MAX_PROXY_HEADERS) {
    throw new Error("Proxy request has too many headers");
  }

  const sanitized: Record<string, string> = {};
  for (const [name, value] of entries) {
    const normalizedName = name.toLowerCase();
    if (!HEADER_NAME_RE.test(name)) {
      throw new Error(`Proxy header is invalid: ${name}`);
    }
    if (FORBIDDEN_PROXY_HEADERS.has(normalizedName)) {
      throw new Error(`Proxy header is not allowed: ${name}`);
    }
    const stringValue = String(value);
    if (!HEADER_VALUE_RE.test(stringValue)) {
      throw new Error(`Proxy header value is invalid: ${name}`);
    }
    sanitized[name] = stringValue;
  }

  return sanitized;
}

function sanitizeBody(
  method: string,
  body: string | undefined,
): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (typeof body !== "string") {
    throw new Error("Proxy request body must be a string");
  }

  if (method === "GET" || method === "DELETE") {
    throw new Error("Proxy request body is not allowed for this method");
  }

  if (new TextEncoder().encode(body).byteLength > MAX_PROXY_BODY_BYTES) {
    throw new Error("Proxy request body is too large");
  }

  return body;
}
