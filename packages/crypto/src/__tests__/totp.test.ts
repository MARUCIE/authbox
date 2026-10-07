import { describe, it, expect } from "vitest";
import {
  totpCode,
  totpSecondsRemaining,
  formatCode,
  parseOtpauth,
  toOtpauthURI,
  base32Decode,
  base32Encode,
  type OTPAlgorithm,
} from "../totp.js";

const enc = (s: string) => new TextEncoder().encode(s);

// RFC 6238 Appendix B seeds (raw ASCII bytes, repeated to the hash block size).
const SEEDS: Record<OTPAlgorithm, Uint8Array> = {
  SHA1: enc("12345678901234567890"),
  SHA256: enc("12345678901234567890123456789012"),
  SHA512: enc("1234567890123456789012345678901234567890123456789012345678901234"),
};

describe("TOTP — RFC 6238 Appendix B vectors (cross-platform parity with TOTP.swift)", () => {
  // [unixTime, SHA1, SHA256, SHA512] — all 8-digit, per the RFC test table.
  const vectors: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];

  for (const [t, sha1, sha256, sha512] of vectors) {
    it(`t=${t} matches all three algorithms`, () => {
      const date = new Date(t * 1000);
      expect(totpCode({ secret: SEEDS.SHA1, digits: 8, algorithm: "SHA1" }, date)).toBe(sha1);
      expect(totpCode({ secret: SEEDS.SHA256, digits: 8, algorithm: "SHA256" }, date)).toBe(sha256);
      expect(totpCode({ secret: SEEDS.SHA512, digits: 8, algorithm: "SHA512" }, date)).toBe(sha512);
    });
  }
});

describe("TOTP — Google/Microsoft Authenticator default profile", () => {
  it("produces the canonical 6-digit code at t=59", () => {
    // Same secret + default profile (SHA1, 6 digits, 30s) the iOS test uses.
    const code = totpCode({ secret: SEEDS.SHA1 }, new Date(59 * 1000));
    expect(code).toBe("287082");
  });

  it("formats the code into two groups", () => {
    expect(formatCode("287082")).toBe("287 082");
    expect(formatCode("12345678")).toBe("1234 5678");
  });

  it("reports seconds remaining within the period", () => {
    const remaining = totpSecondsRemaining({ secret: SEEDS.SHA1 }, new Date(59 * 1000));
    expect(remaining).toBeGreaterThanOrEqual(1);
    expect(remaining).toBeLessThanOrEqual(30);
  });
});

describe("base32 (RFC 4648)", () => {
  it("decodes the 'foobar' vector", () => {
    expect(base32Decode("MZXW6YTBOI")).toEqual(enc("foobar"));
  });

  it("round-trips encode/decode", () => {
    const bytes = SEEDS.SHA1;
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("rejects invalid characters", () => {
    expect(base32Decode("!!!!")).toBeNull();
  });
});

describe("parseOtpauth", () => {
  it("parses an otpauth:// URI and extracts issuer/account", () => {
    const p = parseOtpauth(
      "otpauth://totp/GitHub:alice@acme.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub",
    );
    expect(p).not.toBeNull();
    expect(p!.issuer).toBe("GitHub");
    expect(p!.account).toBe("alice@acme.com");
  });

  it("parses a bare base32 secret", () => {
    const p = parseOtpauth("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(p).not.toBeNull();
    expect(p!.secret.length).toBeGreaterThan(0);
  });

  it("round-trips through toOtpauthURI preserving the code", () => {
    const original = parseOtpauth(
      "otpauth://totp/Example:alice@google.com?secret=" +
        base32Encode(SEEDS.SHA1) +
        "&issuer=Example",
    )!;
    const reparsed = parseOtpauth(toOtpauthURI(original))!;
    expect(reparsed.issuer).toBe("Example");
    expect(reparsed.account).toBe("alice@google.com");
    expect(totpCode(reparsed, new Date(59 * 1000))).toBe("287082");
  });

  it("returns null for a non-otpauth, non-base32 string", () => {
    expect(parseOtpauth("https://example.com")).toBeNull();
  });

  it("rejects hostile digits/period instead of minting NaN codes or crashing", () => {
    const base = "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP";
    expect(parseOtpauth(`${base}&digits=abc`)).toBeNull();
    expect(parseOtpauth(`${base}&digits=10`)).toBeNull();
    expect(parseOtpauth(`${base}&digits=0`)).toBeNull();
    expect(parseOtpauth(`${base}&period=0`)).toBeNull();
    expect(parseOtpauth(`${base}&period=-30`)).toBeNull();
    expect(parseOtpauth(`${base}&period=999999`)).toBeNull();
    // Sane values still parse.
    expect(parseOtpauth(`${base}&digits=8&period=60`)).not.toBeNull();
  });

  it("survives malformed %-encoding in the label instead of throwing", () => {
    const p = parseOtpauth("otpauth://totp/%E0%A4%A?secret=JBSWY3DPEHPK3PXP");
    expect(p).not.toBeNull();
    expect(p!.secret.length).toBeGreaterThan(0);
  });
});

describe("base32Decode canonical-form checks", () => {
  it("rejects embedded padding", () => {
    expect(base32Decode("JB=SW")).toBeNull();
  });

  it("rejects non-zero leftover trailing bits (truncated/typo'd secret)", () => {
    // "MZXW7" leaves trailing bits set (valid canonical form is "MZXW6");
    // silently accepting it would produce valid-looking but wrong codes.
    expect(base32Decode("MZXW6")).not.toBeNull();
    expect(base32Decode("MZXW7")).toBeNull();
  });

  it("still accepts trailing padding, spaces, and dashes", () => {
    expect(base32Decode("MZXW 6YTB-OI======")).toEqual(
      new TextEncoder().encode("foobar"),
    );
  });
});
