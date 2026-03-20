import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

export type SubKeyPurpose = 'auth' | 'enc' | 'mac';

const ENCODER = new TextEncoder();

/**
 * Derive a purpose-specific 32-byte sub-key from a master key using HKDF-SHA256.
 *
 * The purpose string is used as the HKDF salt, ensuring domain separation
 * between auth/enc/mac keys even when derived from the same master key.
 */
export function deriveSubKey(
  masterKey: Uint8Array,
  purpose: SubKeyPurpose,
  info?: string,
): Uint8Array {
  const salt = ENCODER.encode(purpose);
  const infoBytes = info ? ENCODER.encode(info) : new Uint8Array(0);
  return hkdf(sha256, masterKey, salt, infoBytes, 32);
}
