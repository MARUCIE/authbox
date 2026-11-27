/**
 * Byte⇄text encodings shared by every client. This is the only place in the
 * TypeScript code base that converts between bytes and base64 or hex; apps
 * import from here instead of keeping local helpers (enforced by
 * scripts/check-architecture.mjs).
 *
 * base64 is the standard RFC 4648 alphabet with padding, the format the Go
 * API reads and writes (encoding/base64.StdEncoding).
 */
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes } from '@noble/hashes/utils';

/**
 * String.fromCharCode(...bytes) passes every byte as a call argument, which
 * throws RangeError once a blob passes the engine's argument limit (about
 * 125 KB in V8). Converting in chunks keeps large vault items working.
 */
const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes standard base64. Throws (DOMException) on characters outside the alphabet. */
export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Lowercase hex, two characters per byte. */
export function toHex(bytes: Uint8Array): string {
  return nobleBytesToHex(bytes);
}

/** Parses even-length hex (either case). Throws on anything else. */
export function fromHex(hex: string): Uint8Array {
  return nobleHexToBytes(hex);
}
