import { describe, it, expect } from 'vitest';
import { deriveSubKey } from '../hkdf.js';
import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateRandomBytes,
} from '../aes-gcm.js';
import {
  srpGenerateVerifier,
  srpClientInit,
  srpClientVerify,
} from '../srp.js';
import {
  generateVaultKey,
  encryptVaultKey,
  decryptVaultKey,
  encryptVaultItem,
  decryptVaultItem,
} from '../vault-crypto.js';

// --- HKDF ---

describe('HKDF deriveSubKey', () => {
  const masterKey = generateRandomBytes(32);

  it('produces 32-byte output', () => {
    const key = deriveSubKey(masterKey, 'auth');
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('produces deterministic output for same inputs', () => {
    const a = deriveSubKey(masterKey, 'enc');
    const b = deriveSubKey(masterKey, 'enc');
    expect(a).toEqual(b);
  });

  it('produces different keys for different purposes', () => {
    const authKey = deriveSubKey(masterKey, 'auth');
    const encKey = deriveSubKey(masterKey, 'enc');
    const macKey = deriveSubKey(masterKey, 'mac');
    expect(authKey).not.toEqual(encKey);
    expect(encKey).not.toEqual(macKey);
    expect(authKey).not.toEqual(macKey);
  });

  it('produces different keys for different info strings', () => {
    const a = deriveSubKey(masterKey, 'auth', 'context-1');
    const b = deriveSubKey(masterKey, 'auth', 'context-2');
    expect(a).not.toEqual(b);
  });
});

// --- AES-256-GCM ---

describe('AES-256-GCM', () => {
  const key = generateRandomBytes(32);
  const plaintext = new TextEncoder().encode('hello world');

  it('round-trip: encrypt then decrypt returns original', async () => {
    const encrypted = await encryptAES256GCM(key, plaintext);
    const decrypted = await decryptAES256GCM(key, encrypted);
    expect(decrypted).toEqual(plaintext);
  });

  it('nonce is 12 bytes, tag is 16 bytes', async () => {
    const encrypted = await encryptAES256GCM(key, plaintext);
    expect(encrypted.nonce.length).toBe(12);
    expect(encrypted.tag.length).toBe(16);
  });

  it('different nonces produce different ciphertexts', async () => {
    const a = await encryptAES256GCM(key, plaintext);
    const b = await encryptAES256GCM(key, plaintext);
    // Nonces should differ (random)
    expect(a.nonce).not.toEqual(b.nonce);
    // Ciphertexts should differ because nonces differ
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('wrong key fails to decrypt', async () => {
    const wrongKey = generateRandomBytes(32);
    const encrypted = await encryptAES256GCM(key, plaintext);
    await expect(decryptAES256GCM(wrongKey, encrypted)).rejects.toThrow();
  });

  it('tampered ciphertext fails to decrypt', async () => {
    const encrypted = await encryptAES256GCM(key, plaintext);
    // Flip a bit in ciphertext
    encrypted.ciphertext[0] ^= 0xff;
    await expect(decryptAES256GCM(key, encrypted)).rejects.toThrow();
  });

  it('supports additional authenticated data', async () => {
    const aad = new TextEncoder().encode('metadata');
    const encrypted = await encryptAES256GCM(key, plaintext, aad);
    // Decrypt with correct AAD succeeds
    const decrypted = await decryptAES256GCM(key, encrypted, aad);
    expect(decrypted).toEqual(plaintext);
    // Decrypt with wrong AAD fails
    const wrongAad = new TextEncoder().encode('wrong');
    await expect(decryptAES256GCM(key, encrypted, wrongAad)).rejects.toThrow();
  });

  it('handles empty plaintext', async () => {
    const empty = new Uint8Array(0);
    const encrypted = await encryptAES256GCM(key, empty);
    const decrypted = await decryptAES256GCM(key, encrypted);
    expect(decrypted).toEqual(empty);
  });
});

// --- SRP ---

describe('SRP-6a', () => {
  const email = 'test@example.com';
  const password = 'correct-horse-battery-staple';
  const salt = generateRandomBytes(32);

  it('verifier generation is deterministic for same inputs', async () => {
    const a = await srpGenerateVerifier(email, password, salt);
    const b = await srpGenerateVerifier(email, password, salt);
    expect(a.verifier).toEqual(b.verifier);
  });

  it('verifier is 256 bytes (2048-bit group)', async () => {
    const { verifier } = await srpGenerateVerifier(email, password, salt);
    expect(verifier.length).toBe(256);
  });

  it('different passwords produce different verifiers', async () => {
    const a = await srpGenerateVerifier(email, 'password-a', salt);
    const b = await srpGenerateVerifier(email, 'password-b', salt);
    expect(a.verifier).not.toEqual(b.verifier);
  });

  it('client init produces valid ephemeral pair', async () => {
    const state = await srpClientInit();
    expect(state.ephemeralSecret.length).toBe(32);
    expect(state.ephemeralPublic.length).toBe(256);
    // A should not be all zeros
    expect(state.ephemeralPublic.some((b) => b !== 0)).toBe(true);
  });

  it('client verify rejects B = 0', async () => {
    const state = await srpClientInit();
    const zeroB = new Uint8Array(256); // all zeros = 0 mod N
    await expect(
      srpClientVerify(state, email, password, salt, zeroB),
    ).rejects.toThrow('B is invalid');
  });
});

// --- Vault Crypto ---

describe('Vault key operations', () => {
  it('generateVaultKey produces 32 random bytes', () => {
    const key = generateVaultKey();
    expect(key.length).toBe(32);
    // Two generated keys should differ
    const key2 = generateVaultKey();
    expect(key).not.toEqual(key2);
  });

  it('vault key encrypt/decrypt round-trip', async () => {
    const encKey = generateRandomBytes(32);
    const vaultKey = generateVaultKey();

    const bundle = await encryptVaultKey(encKey, vaultKey);
    const recovered = await decryptVaultKey(encKey, bundle);
    expect(recovered).toEqual(vaultKey);
  });

  it('wrong encKey fails to decrypt vault key', async () => {
    const encKey = generateRandomBytes(32);
    const wrongKey = generateRandomBytes(32);
    const vaultKey = generateVaultKey();

    const bundle = await encryptVaultKey(encKey, vaultKey);
    await expect(decryptVaultKey(wrongKey, bundle)).rejects.toThrow();
  });
});

describe('Vault item operations', () => {
  const vaultKey = generateRandomBytes(32);

  it('encrypt/decrypt round-trip with JSON data', async () => {
    const item = JSON.stringify({
      title: 'GitHub',
      username: 'user@example.com',
      password: 's3cret!',
      url: 'https://github.com',
      notes: 'My GitHub account',
    });

    const encrypted = await encryptVaultItem(vaultKey, item);
    const decrypted = await decryptVaultItem(vaultKey, encrypted);
    expect(decrypted).toBe(item);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(item));
  });

  it('encrypt/decrypt round-trip with unicode content', async () => {
    const item = JSON.stringify({ note: 'Password manager' });
    const encrypted = await encryptVaultItem(vaultKey, item);
    const decrypted = await decryptVaultItem(vaultKey, encrypted);
    expect(decrypted).toBe(item);
  });

  it('different items produce different ciphertexts', async () => {
    const a = await encryptVaultItem(vaultKey, '{"a":1}');
    const b = await encryptVaultItem(vaultKey, '{"b":2}');
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });
});
