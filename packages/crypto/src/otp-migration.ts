import { parseOtpauth, type TOTPParams, type OTPAlgorithm } from "./totp.js";

/**
 * Importing existing 2FA accounts on the web — the TS port of the iOS
 * `AuthBoxCrypto/OTPImport.swift`.
 *
 * Scan, import, and migrate reduce to one problem: parse a string into
 * `TOTPParams[]`. Handles a Google Authenticator `otpauth-migration://` export
 * (base64 + a minimal dependency-free protobuf reader), a single `otpauth://`
 * URI, or a newline-separated list. Invalid entries are skipped, never fatal.
 */
export function parseOTPImport(raw: string): TOTPParams[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.toLowerCase().startsWith("otpauth-migration://")) {
    return parseMigration(trimmed);
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => parseOtpauth(line.trim()))
    .filter((p): p is TOTPParams => p !== null);
}

/** Decode a Google Authenticator `otpauth-migration://offline?data=...` URI. */
export function parseMigration(raw: string): TOTPParams[] {
  // Extract `data` from the raw query manually: URLSearchParams would turn a
  // literal '+' in the base64 into a space (form-encoding semantics).
  const query = raw.split("?")[1] ?? "";
  const dataKv = query.split("&").find((kv) => kv.startsWith("data="));
  if (!dataKv) return [];

  let dataParam: string;
  try {
    dataParam = decodeURIComponent(dataKv.slice("data=".length));
  } catch {
    return [];
  }

  const bytes = base64ToBytes(dataParam);
  if (!bytes) return [];
  return decodeMigrationPayload(bytes);
}

function base64ToBytes(input: string): Uint8Array | null {
  try {
    let clean = input.replace(/\s/g, "");
    const remainder = clean.length % 4;
    if (remainder > 0) clean += "=".repeat(4 - remainder);
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// --- Protobuf decode (otpauth-migration MigrationPayload) ---

/** `MigrationPayload { repeated OtpParameters otp_parameters = 1; ... }` */
function decodeMigrationPayload(data: Uint8Array): TOTPParams[] {
  const reader = new ProtobufReader(data);
  const out: TOTPParams[] = [];
  let field = reader.nextField();
  while (field !== null) {
    if (field.number === 1 && field.bytes) {
      const params = decodeOtpParameters(field.bytes);
      if (params) out.push(params);
    }
    field = reader.nextField();
  }
  return out;
}

/**
 * `OtpParameters { bytes secret = 1; string name = 2; string issuer = 3;`
 * ` Algorithm algorithm = 4; DigitCount digits = 5; OtpType type = 6; }`
 *
 * Algorithm: 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5 (unsupported → skip).
 * DigitCount: 1 six, 2 eight. OtpType: 1 HOTP (skip — TOTP is time-based), 2 TOTP.
 */
function decodeOtpParameters(data: Uint8Array): TOTPParams | null {
  const reader = new ProtobufReader(data);
  const decoder = new TextDecoder();
  let secret: Uint8Array = new Uint8Array(0);
  let name: string | undefined;
  let issuer: string | undefined;
  let algorithm: OTPAlgorithm = "SHA1";
  let digits = 6;
  let isTotp = true;

  let field = reader.nextField();
  while (field !== null) {
    if (field.number === 1 && field.bytes) {
      secret = field.bytes;
    } else if (field.number === 2 && field.bytes) {
      name = decoder.decode(field.bytes);
    } else if (field.number === 3 && field.bytes) {
      issuer = decoder.decode(field.bytes);
    } else if (field.number === 4 && field.varint !== undefined) {
      const v = Number(field.varint);
      if (v === 1) algorithm = "SHA1";
      else if (v === 2) algorithm = "SHA256";
      else if (v === 3) algorithm = "SHA512";
      else return null; // MD5 / unspecified — unsupported, skip the account
    } else if (field.number === 5 && field.varint !== undefined) {
      digits = Number(field.varint) === 2 ? 8 : 6;
    } else if (field.number === 6 && field.varint !== undefined) {
      isTotp = Number(field.varint) !== 1; // 1 = HOTP
    }
    field = reader.nextField();
  }

  if (secret.length === 0 || !isTotp) return null;
  // The migration payload carries no period; Google Authenticator uses 30s.
  return {
    secret,
    digits,
    period: 30,
    algorithm,
    issuer: issuer && issuer.length > 0 ? issuer : undefined,
    account: name,
  };
}

interface ProtobufField {
  number: number;
  wireType: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

/**
 * Minimal protobuf wire-format reader — only the two wire types the migration
 * payload uses (varint, length-delimited). 32-/64-bit fields are skipped and
 * unknown wire types stop the read, so newer exports degrade gracefully.
 */
class ProtobufReader {
  private readonly data: Uint8Array;
  private index = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  nextField(): ProtobufField | null {
    const key = this.readVarint();
    if (key === null) return null;
    const number = Number(key >> 3n);
    const wireType = Number(key & 0x07n);

    switch (wireType) {
      case 0: {
        const v = this.readVarint();
        return v === null ? null : { number, wireType, varint: v };
      }
      case 2: {
        const len = this.readVarint();
        if (len === null) return null;
        const bytes = this.read(Number(len));
        return bytes === null ? null : { number, wireType, bytes };
      }
      case 5:
        return this.read(4) === null ? null : this.nextField();
      case 1:
        return this.read(8) === null ? null : this.nextField();
      default:
        return null;
    }
  }

  private readVarint(): bigint | null {
    let result = 0n;
    let shift = 0n;
    while (this.index < this.data.length) {
      const byte = this.data[this.index];
      this.index += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
      if (shift >= 64n) return null;
    }
    return null;
  }

  private read(n: number): Uint8Array | null {
    if (n < 0 || this.index + n > this.data.length) return null;
    const sub = this.data.subarray(this.index, this.index + n);
    this.index += n;
    return sub;
  }
}
