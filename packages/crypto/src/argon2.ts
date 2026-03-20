import { argon2id } from 'hash-wasm';
import { generateRandomBytes } from './aes-gcm';
import { deriveSubKey } from './hkdf';

export interface DerivedKeys {
  authKey: Uint8Array; // For SRP authentication
  encKey: Uint8Array; // For encrypting vault key
  macKey: Uint8Array; // For HMAC (server-side matching)
}

// Argon2id parameters (OWASP recommended for password hashing)
const ARGON2_MEMORY_KIB = 262144; // 256 MB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LENGTH = 32;
const SALT_LENGTH = 32;

const ENCODER = new TextEncoder();

/**
 * Derive three purpose-specific keys from a master password using Argon2id + HKDF.
 *
 * 1. Argon2id stretches the password into a 32-byte master key.
 * 2. HKDF derives domain-separated sub-keys for auth, encryption, and MAC.
 */
export async function deriveKeys(
  password: string,
  salt: Uint8Array,
): Promise<DerivedKeys> {
  const hashHex = await argon2id({
    password: ENCODER.encode(password),
    salt,
    memorySize: ARGON2_MEMORY_KIB,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: 'hex',
  });

  // Convert hex string to Uint8Array
  const masterKey = new Uint8Array(
    hashHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  return {
    authKey: deriveSubKey(masterKey, 'auth'),
    encKey: deriveSubKey(masterKey, 'enc'),
    macKey: deriveSubKey(masterKey, 'mac'),
  };
}

/**
 * Generate a cryptographically secure 32-byte salt for Argon2id.
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}
