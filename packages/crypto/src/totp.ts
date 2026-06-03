import { hmac } from "@noble/hashes/hmac";
import { sha1 } from "@noble/hashes/sha1";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";

/**
 * RFC 6238 Time-based One-Time Password generation.
 *
 * The web port of the iOS `AuthBoxCrypto/TOTP.swift` engine. Both implement the
 * same standard, so a secret stored in either produces the same rotating code as
 * Google Authenticator and Microsoft Authenticator. Proven against the RFC 6238
 * Appendix B vectors in `totp.test.ts` — the same vectors the Swift suite uses,
 * which makes that test a cross-platform parity proof.
 *
 * Secrets are raw HMAC key bytes (NOT base32); use `base32Decode` / `parseOtpauth`
 * to ingest the base32 secrets and `otpauth://` URIs authenticator QR codes carry.
 */

export type OTPAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface TOTPParams {
  /** Raw HMAC key bytes (NOT base32). */
  secret: Uint8Array;
  digits?: number; // default 6
  period?: number; // seconds, default 30
  algorithm?: OTPAlgorithm; // default SHA1
  issuer?: string;
  account?: string;
}

const HASHES = { SHA1: sha1, SHA256: sha256, SHA512: sha512 } as const;

/** RFC 4226 HOTP for a given counter — the per-step primitive TOTP wraps. */
export function hotpCode(
  secret: Uint8Array,
  counter: number,
  digits = 6,
  algorithm: OTPAlgorithm = "SHA1",
): string {
  // 8-byte big-endian counter.
  const counterBytes = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = Number(c & 0xffn);
    c >>= 8n;
  }

  const mac = hmac(HASHES[algorithm], secret, counterBytes);

  // Dynamic truncation (RFC 4226 §5.3).
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    (((mac[offset] & 0x7f) << 24) |
      (mac[offset + 1] << 16) |
      (mac[offset + 2] << 8) |
      mac[offset + 3]) >>>
    0;

  const modulo = 10 ** digits;
  return (binary % modulo).toString().padStart(digits, "0");
}

/** The current TOTP code, zero-padded to `digits`. */
export function totpCode(params: TOTPParams, date: Date = new Date()): string {
  const period = params.period ?? 30;
  const counter = Math.floor(date.getTime() / 1000 / period);
  return hotpCode(params.secret, counter, params.digits ?? 6, params.algorithm ?? "SHA1");
}

/** Seconds until the current code rolls over (1...period). */
export function totpSecondsRemaining(params: TOTPParams, date: Date = new Date()): number {
  const period = params.period ?? 30;
  const elapsed = Math.floor(date.getTime() / 1000) % period;
  return period - elapsed;
}

/** The code split into two groups for display, e.g. "123 456". */
export function formatCode(code: string): string {
  if (code.length !== 6 && code.length !== 8) return code;
  const mid = code.length / 2;
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

// --- Parsing ---

/**
 * Parse an `otpauth://totp/...` URI (as encoded in an authenticator QR code) OR
 * a bare base32 secret. Returns null if no valid secret is found.
 */
export function parseOtpauth(raw: string): TOTPParams | null {
  const trimmed = raw.trim();

  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    const secret = base32Decode(trimmed);
    if (!secret || secret.length === 0) return null;
    return { secret };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== "totp") return null;

  const secretB32 = url.searchParams.get("secret");
  if (!secretB32) return null;
  const secret = base32Decode(secretB32);
  if (!secret || secret.length === 0) return null;

  const digitsParam = url.searchParams.get("digits");
  const periodParam = url.searchParams.get("period");
  const digits = digitsParam ? parseInt(digitsParam, 10) : 6;
  const period = periodParam ? parseInt(periodParam, 10) : 30;
  const algoRaw = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  const algorithm: OTPAlgorithm =
    algoRaw === "SHA256" || algoRaw === "SHA512" ? algoRaw : "SHA1";

  // Label = "/Issuer:account"; the issuer query param overrides the label prefix.
  let issuer = url.searchParams.get("issuer") || undefined;
  let account: string | undefined;
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (label) {
    const colon = label.indexOf(":");
    if (colon >= 0) {
      if (!issuer) issuer = label.slice(0, colon);
      account = label.slice(colon + 1).trim();
    } else {
      account = label;
    }
  }

  return { secret, digits, period, algorithm, issuer, account };
}

/** Render params back into a canonical `otpauth://totp/...` URI. */
export function toOtpauthURI(params: TOTPParams): string {
  const secretB32 = base32Encode(params.secret);
  const issuer = params.issuer;
  const account = params.account;

  let label = "";
  if (issuer && account) label = `${issuer}:${account}`;
  else if (account) label = account;
  else if (issuer) label = issuer;

  const q = new URLSearchParams();
  q.set("secret", secretB32);
  if (issuer) q.set("issuer", issuer);
  q.set("digits", String(params.digits ?? 6));
  q.set("period", String(params.period ?? 30));
  q.set("algorithm", params.algorithm ?? "SHA1");

  return `otpauth://totp/${encodeURIComponent(label)}?${q.toString()}`;
}

// --- Base32 (RFC 4648, padding optional) ---

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode an RFC 4648 base32 string (case-insensitive, padding/space tolerant). */
export function base32Decode(input: string): Uint8Array | null {
  const cleaned = input
    .toUpperCase()
    .replace(/=/g, "")
    .replace(/ /g, "")
    .replace(/-/g, "");
  if (cleaned.length === 0) return null;

  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE32_ALPHABET.length; i++) lookup[BASE32_ALPHABET[i]] = i;

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const v = lookup[ch];
    if (v === undefined) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Encode raw bytes as an RFC 4648 base32 string (uppercase, no padding). */
export function base32Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}
