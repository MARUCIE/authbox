// Limits for the unauthenticated public telemetry endpoint. Anyone can post to
// it, and every string becomes a counter key, a kept event and a line in the
// event log, so each field is cut to a fixed size.

export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_ROUTE_LENGTH = 256;
export const MAX_LABEL_LENGTH = 64;
export const MAX_METADATA_ENTRIES = 20;
export const MAX_METADATA_VALUE_LENGTH = 256;

export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return Array.from(trimmed).slice(0, max).join("");
}

export function normalizeMetadata(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const entries: Array<[string, string]> = [];
  for (const [rawKey, value] of Object.entries(input)) {
    if (entries.length >= MAX_METADATA_ENTRIES) {
      break;
    }
    const key = clip(rawKey, MAX_LABEL_LENGTH);
    if (!key || value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      entries.push([key, Array.from(String(value)).slice(0, MAX_METADATA_VALUE_LENGTH).join("")]);
    }
  }

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** A client timestamp is kept only if it parses; otherwise the server's time is used. */
export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 40) {
    return undefined;
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : new Date(at).toISOString();
}

/**
 * Read a request body as text, giving up (null) as soon as it passes `max`
 * bytes, whether or not the client sent a Content-Length.
 */
export async function readBodyLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) {
    return "";
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
