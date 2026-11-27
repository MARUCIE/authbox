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

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Proxy URL must use http or https");
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
 * Expand an IPv6 address into its eight 16-bit groups, including a trailing
 * dotted IPv4 part (::ffff:10.0.0.1). Returns null for anything malformed.
 */
function parseIPv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  // Rewrite a dotted IPv4 tail as two hex groups so one parser handles both.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split(".").map((p) => Number.parseInt(p, 10));
    const hex = (n: number) => n.toString(16);
    text = `${text.slice(0, lastColon + 1)}${hex((a << 8) | b)}:${hex((c << 8) | d)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const explicit = head.length + rest.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null;

  const groups = [...head, ...Array<string>(8 - explicit).fill("0"), ...rest].map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN,
  );
  return groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

function embeddedIPv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * Block every IPv6 range that can reach a non-public host, including the
 * forms that carry an IPv4 address inside (mapped, compatible, NAT64, 6to4):
 * a plain AAAA record such as ::ffff:169.254.169.254 must not slip past the
 * IPv4 checks just because it is written as IPv6.
 */
function isBlockedIPv6(address: string): boolean {
  const g = parseIPv6(address);
  if (!g) return true;

  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);

  // ::/96 (unspecified, loopback, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped).
  if (zeroUpTo(6) || (zeroUpTo(5) && g[5] === 0xffff)) {
    return isBlockedIPv4(embeddedIPv4(g[6], g[7]));
  }
  // 64:ff9b::/96 well-known NAT64 prefix carries an IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIPv4(embeddedIPv4(g[6], g[7]));
  }
  // 2002::/16 6to4 carries an IPv4 address in groups 1-2.
  if (g[0] === 0x2002) {
    return isBlockedIPv4(embeddedIPv4(g[1], g[2]));
  }
  return (
    (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) || // 64:ff9b:1::/48 local NAT64
    (g[0] === 0x100 && zeroUpTo(4)) || // 100::/64 discard
    (g[0] === 0x2001 && g[1] === 0) || // 2001::/32 Teredo
    (g[0] === 0x2001 && g[1] === 0xdb8) || // 2001:db8::/32 documentation
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 deprecated site local
    (g[0] & 0xff00) === 0xff00 // ff00::/8 multicast
  );
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
    sanitized[name] = String(value);
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
