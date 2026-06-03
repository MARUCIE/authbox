import { describe, it, expect } from "vitest";
import { parseOTPImport, parseMigration } from "../otp-migration.js";
import { totpCode, toOtpauthURI } from "../totp.js";

const enc = (s: string) => new TextEncoder().encode(s);

// --- In-test protobuf encoder (the decode's mirror image) ---
// Proving the decoder with an encoder we hand-wrote here, plus an RFC 6238 code
// anchor, makes the proof non-coincident: a bug would have to corrupt both the
// wire format AND the HMAC the same way to pass.

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
  return out;
}
const tag = (field: number, wire: number) => varint((field << 3) | wire);
const varintField = (field: number, value: number) => [...tag(field, 0), ...varint(value)];
const lenField = (field: number, bytes: Iterable<number>) => {
  const arr = [...bytes];
  return [...tag(field, 2), ...varint(arr.length), ...arr];
};

const bytesToBase64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

interface OtpParamSpec {
  secret: Uint8Array;
  name?: string;
  issuer?: string;
  algorithm?: number; // 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5
  digits?: number; // 1 six, 2 eight
  type?: number; // 1 HOTP, 2 TOTP
}

function encodeOtpParameters(spec: OtpParamSpec): number[] {
  const out: number[] = [];
  out.push(...lenField(1, spec.secret));
  if (spec.name !== undefined) out.push(...lenField(2, enc(spec.name)));
  if (spec.issuer !== undefined) out.push(...lenField(3, enc(spec.issuer)));
  if (spec.algorithm !== undefined) out.push(...varintField(4, spec.algorithm));
  if (spec.digits !== undefined) out.push(...varintField(5, spec.digits));
  if (spec.type !== undefined) out.push(...varintField(6, spec.type));
  return out;
}

function migrationURI(specs: OtpParamSpec[]): string {
  const payload: number[] = [];
  for (const spec of specs) payload.push(...lenField(1, encodeOtpParameters(spec)));
  const data = encodeURIComponent(bytesToBase64(payload));
  return `otpauth-migration://offline?data=${data}`;
}

// The RFC 6238 SHA1 seed "12345678901234567890" → default 6-digit code at t=59 is 287082.
const RFC_SECRET = enc("12345678901234567890");

describe("OTP migration — Google Authenticator otpauth-migration:// (parity with OTPMigration.swift)", () => {
  it("decodes a single TOTP account and the code matches the RFC 6238 anchor", () => {
    const uri = migrationURI([
      { secret: RFC_SECRET, name: "alice@example.com", issuer: "Acme", algorithm: 1, digits: 1, type: 2 },
    ]);
    const accounts = parseOTPImport(uri);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("Acme");
    expect(accounts[0].account).toBe("alice@example.com");
    expect(accounts[0].digits).toBe(6);
    expect(accounts[0].algorithm).toBe("SHA1");
    expect(accounts[0].period).toBe(30);
    // The protobuf-decoded secret produces the canonical RFC 6238 code — proof
    // the bytes survived base64 + wire-format decode intact.
    expect(totpCode(accounts[0], new Date(59 * 1000))).toBe("287082");
  });

  it("decodes multiple accounts in one payload", () => {
    const uri = migrationURI([
      { secret: RFC_SECRET, name: "a@x.com", issuer: "Acme", algorithm: 1, digits: 1, type: 2 },
      { secret: enc("foobar"), name: "b@y.com", issuer: "Beta", algorithm: 2, digits: 2, type: 2 },
    ]);
    const accounts = parseOTPImport(uri);

    expect(accounts).toHaveLength(2);
    expect(accounts[0].issuer).toBe("Acme");
    expect(accounts[1].issuer).toBe("Beta");
    expect(accounts[1].algorithm).toBe("SHA256");
    expect(accounts[1].digits).toBe(8);
  });

  it("skips HOTP accounts (Auth Box is time-based)", () => {
    const uri = migrationURI([
      { secret: RFC_SECRET, name: "totp@x.com", issuer: "Acme", algorithm: 1, digits: 1, type: 2 },
      { secret: enc("counter"), name: "hotp@x.com", issuer: "Legacy", algorithm: 1, digits: 1, type: 1 },
    ]);
    const accounts = parseOTPImport(uri);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("Acme");
  });

  it("skips MD5 accounts (unsupported algorithm)", () => {
    const uri = migrationURI([
      { secret: RFC_SECRET, name: "ok@x.com", issuer: "Acme", algorithm: 1, digits: 1, type: 2 },
      { secret: enc("md5seed"), name: "md5@x.com", issuer: "Old", algorithm: 4, digits: 1, type: 2 },
    ]);
    const accounts = parseOTPImport(uri);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("Acme");
  });

  it("defaults to SHA1/6-digit when the optional enums are absent", () => {
    // Google omits algorithm/digits/type for the common default profile.
    const uri = migrationURI([{ secret: RFC_SECRET, name: "default@x.com", type: 2 }]);
    const accounts = parseOTPImport(uri);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].algorithm).toBe("SHA1");
    expect(accounts[0].digits).toBe(6);
    expect(totpCode(accounts[0], new Date(59 * 1000))).toBe("287082");
  });

  it("returns empty for malformed migration data", () => {
    expect(parseOTPImport("otpauth-migration://offline?data=%%%not-base64%%%")).toEqual([]);
    expect(parseOTPImport("otpauth-migration://offline")).toEqual([]);
    expect(parseMigration("otpauth-migration://offline?data=")).toEqual([]);
  });

  it("preserves a literal '+' in the base64 data (URLSearchParams would corrupt it)", () => {
    // Force a payload whose base64 is likely to contain '+' / '/' and pass it
    // un-percent-encoded, the way some exporters emit it.
    const uri = migrationURI([
      { secret: enc("ûÿ¾ï"), name: "n", issuer: "I", algorithm: 1, digits: 1, type: 2 },
    ]).replace(/%2B/gi, "+");
    const accounts = parseOTPImport(uri);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("I");
  });
});

describe("OTP import — single & multiline otpauth://", () => {
  it("parses a single otpauth:// URI", () => {
    const uri = toOtpauthURI({ secret: RFC_SECRET, issuer: "GitHub", account: "octocat" });
    const accounts = parseOTPImport(uri);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe("GitHub");
    expect(totpCode(accounts[0], new Date(59 * 1000))).toBe("287082");
  });

  it("parses a newline-separated list and skips invalid lines", () => {
    const a = toOtpauthURI({ secret: RFC_SECRET, issuer: "A", account: "a" });
    const b = toOtpauthURI({ secret: enc("foobar"), issuer: "B", account: "b" });
    // '!' is outside the base32 alphabet, so this line can't be mistaken for a
    // bare secret (a hyphenated word like "not-a-uri" decodes to "NOTAURI"!).
    const raw = `${a}\n   \n!!! not valid !!!\n${b}`;
    const accounts = parseOTPImport(raw);
    expect(accounts).toHaveLength(2);
    expect(accounts.map((p) => p.issuer)).toEqual(["A", "B"]);
  });

  it("returns empty for blank input", () => {
    expect(parseOTPImport("")).toEqual([]);
    expect(parseOTPImport("   \n  ")).toEqual([]);
  });
});
