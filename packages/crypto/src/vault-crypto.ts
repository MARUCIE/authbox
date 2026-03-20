import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateRandomBytes,
  type EncryptedPayload,
} from './aes-gcm';

export type { EncryptedPayload };

export interface VaultKeyBundle {
  encryptedVaultKey: Uint8Array;
  nonce: Uint8Array;
  tag: Uint8Array;
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const VAULT_KEY_LENGTH = 32;

/**
 * Generate a random 32-byte vault key.
 * This key encrypts all vault items and is itself wrapped by the user's encKey.
 */
export function generateVaultKey(): Uint8Array {
  return generateRandomBytes(VAULT_KEY_LENGTH);
}

/**
 * Encrypt the vault key using the user's encryption key (derived from password).
 * Stored on the server; only decryptable with the user's encKey.
 */
export async function encryptVaultKey(
  encKey: Uint8Array,
  vaultKey: Uint8Array,
): Promise<VaultKeyBundle> {
  const payload = await encryptAES256GCM(encKey, vaultKey);
  return {
    encryptedVaultKey: payload.ciphertext,
    nonce: payload.nonce,
    tag: payload.tag,
  };
}

/**
 * Decrypt the vault key using the user's encryption key.
 */
export async function decryptVaultKey(
  encKey: Uint8Array,
  bundle: VaultKeyBundle,
): Promise<Uint8Array> {
  return decryptAES256GCM(encKey, {
    ciphertext: bundle.encryptedVaultKey,
    nonce: bundle.nonce,
    tag: bundle.tag,
  });
}

/**
 * Encrypt a vault item (JSON string) with the vault key.
 */
export async function encryptVaultItem(
  vaultKey: Uint8Array,
  plaintext: string,
): Promise<EncryptedPayload> {
  return encryptAES256GCM(vaultKey, ENCODER.encode(plaintext));
}

/**
 * Decrypt a vault item back to its JSON string.
 */
export async function decryptVaultItem(
  vaultKey: Uint8Array,
  payload: EncryptedPayload,
): Promise<string> {
  const bytes = await decryptAES256GCM(vaultKey, payload);
  return DECODER.decode(bytes);
}
