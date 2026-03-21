export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array; // 12 bytes, randomly generated per encryption
  tag: Uint8Array; // 16-byte GCM authentication tag
}

const AES_GCM_NONCE_LENGTH = 12;
const AES_GCM_TAG_LENGTH = 16;

/**
 * Cast Uint8Array to BufferSource for WebCrypto compatibility.
 * TypeScript 5.7+ tightened Uint8Array<ArrayBufferLike> vs BufferSource typing.
 */
function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/**
 * Import a raw 32-byte key as a WebCrypto CryptoKey for AES-256-GCM.
 */
async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    asBuffer(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * WebCrypto appends the 16-byte auth tag to the ciphertext output.
 * We split it out so callers get an explicit (ciphertext, nonce, tag) tuple.
 */
export async function encryptAES256GCM(
  key: Uint8Array,
  plaintext: Uint8Array,
  additionalData?: Uint8Array,
): Promise<EncryptedPayload> {
  const cryptoKey = await importKey(key);
  const nonce = generateRandomBytes(AES_GCM_NONCE_LENGTH);

  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: asBuffer(nonce),
    tagLength: AES_GCM_TAG_LENGTH * 8, // bits
  };
  if (additionalData) {
    params.additionalData = asBuffer(additionalData);
  }

  const combined = new Uint8Array(
    await crypto.subtle.encrypt(params, cryptoKey, asBuffer(plaintext)),
  );

  // WebCrypto output = ciphertext || tag (last 16 bytes)
  const ciphertext = combined.slice(0, combined.length - AES_GCM_TAG_LENGTH);
  const tag = combined.slice(combined.length - AES_GCM_TAG_LENGTH);

  return { ciphertext, nonce, tag };
}

/**
 * Decrypt an AES-256-GCM payload.
 *
 * Reconstructs the WebCrypto input format (ciphertext || tag) then decrypts.
 * Throws on authentication failure (wrong key, tampered data, wrong nonce).
 */
export async function decryptAES256GCM(
  key: Uint8Array,
  payload: EncryptedPayload,
  additionalData?: Uint8Array,
): Promise<Uint8Array> {
  if (payload.nonce.length !== AES_GCM_NONCE_LENGTH) {
    throw new Error(`Invalid nonce length: expected ${AES_GCM_NONCE_LENGTH}, got ${payload.nonce.length}`);
  }
  if (payload.tag.length !== AES_GCM_TAG_LENGTH) {
    throw new Error(`Invalid tag length: expected ${AES_GCM_TAG_LENGTH}, got ${payload.tag.length}`);
  }
  const cryptoKey = await importKey(key);

  // WebCrypto expects ciphertext || tag as a single buffer
  const combined = new Uint8Array(
    payload.ciphertext.length + payload.tag.length,
  );
  combined.set(payload.ciphertext, 0);
  combined.set(payload.tag, payload.ciphertext.length);

  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: asBuffer(payload.nonce),
    tagLength: AES_GCM_TAG_LENGTH * 8,
  };
  if (additionalData) {
    params.additionalData = asBuffer(additionalData);
  }

  return new Uint8Array(
    await crypto.subtle.decrypt(params, cryptoKey, asBuffer(combined)),
  );
}

/**
 * Generate cryptographically secure random bytes.
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
