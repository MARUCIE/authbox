/**
 * Arweave Vault E2E Tests
 *
 * Tests the "Unstoppable" layer:
 *   1. Identity hash derivation (deterministic)
 *   2. Encrypt → blob format → decrypt roundtrip (no Arweave needed)
 *   3. Arweave read-only API (cost estimation, archive lookup)
 *   4. Full seed → vault key → archive → retrieve simulation
 */

import { describe, it, expect } from 'vitest';
import {
  deriveIdentityHash,
  estimateArchiveCost,
  findVaultArchives,
  setArweaveGateway,
} from './arweave-vault';
import { encryptAES256GCM, decryptAES256GCM, generateRandomBytes } from './aes-gcm';
import { sha256 } from '@noble/hashes/sha256';
import {
  setWordlist,
  generateMnemonic,
  mnemonicToSeed,
  deriveAllKeys,
} from './seed';
import { ENGLISH_WORDLIST } from './wordlist-en';

// ─── Setup ────────────────────────────────────────────────────────────────

// Initialize BIP-39 wordlist
setWordlist(ENGLISH_WORDLIST);

const liveArweaveEnabled = process.env.AUTHBOX_LIVE_ARWEAVE === '1';

// ─── Test 1: Identity Hash Derivation ─────────────────────────────────────

describe('deriveIdentityHash', () => {
  it('should be deterministic — same key always produces same hash', () => {
    const vaultKey = new Uint8Array(32);
    vaultKey.fill(42); // deterministic test key

    const hash1 = deriveIdentityHash(vaultKey);
    const hash2 = deriveIdentityHash(vaultKey);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('should be double-SHA-256 (prevents key recovery from public tag)', () => {
    const vaultKey = new Uint8Array(32);
    vaultKey.fill(42);

    const firstHash = sha256(vaultKey);
    const expectedDoubleHash = sha256(firstHash);
    const expectedHex = Array.from(expectedDoubleHash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    expect(deriveIdentityHash(vaultKey)).toBe(expectedHex);
  });

  it('should produce different hashes for different keys', () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);

    expect(deriveIdentityHash(key1)).not.toBe(deriveIdentityHash(key2));
  });
});

// ─── Test 2: Encrypt/Decrypt Roundtrip (blob format) ──────────────────────

describe('vault blob encrypt/decrypt roundtrip', () => {
  it('should encrypt then decrypt vault data correctly', async () => {
    const vaultKey = generateRandomBytes(32);
    const vaultData = new TextEncoder().encode(
      JSON.stringify({
        items: [
          { id: '1', name: 'GitHub', username: 'user@test.com', password: 'hunter2' },
          { id: '2', name: 'Gmail', username: 'user@gmail.com', password: 'p@ssw0rd!' },
        ],
      }),
    );

    // Encrypt (same flow as archiveVault)
    const encrypted = await encryptAES256GCM(vaultKey, vaultData);

    // Build blob: nonce(12) + tag(16) + ciphertext
    const blob = new Uint8Array(
      encrypted.nonce.length + encrypted.tag.length + encrypted.ciphertext.length,
    );
    blob.set(encrypted.nonce, 0);
    blob.set(encrypted.tag, encrypted.nonce.length);
    blob.set(encrypted.ciphertext, encrypted.nonce.length + encrypted.tag.length);

    // Verify blob structure
    expect(encrypted.nonce.length).toBe(12);
    expect(encrypted.tag.length).toBe(16);
    expect(blob.length).toBe(12 + 16 + vaultData.length);

    // Decrypt (same flow as retrieveVault)
    const nonceLen = 12;
    const tagLen = 16;
    const nonce = blob.slice(0, nonceLen);
    const tag = blob.slice(nonceLen, nonceLen + tagLen);
    const ciphertext = blob.slice(nonceLen + tagLen);

    const decrypted = await decryptAES256GCM(vaultKey, { ciphertext, nonce, tag });

    // Verify roundtrip
    const result = JSON.parse(new TextDecoder().decode(decrypted));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].password).toBe('hunter2');
    expect(result.items[1].name).toBe('Gmail');
  });

  it('should fail decryption with wrong key', async () => {
    const correctKey = generateRandomBytes(32);
    const wrongKey = generateRandomBytes(32);
    const data = new TextEncoder().encode('secret vault data');

    const encrypted = await encryptAES256GCM(correctKey, data);

    await expect(
      decryptAES256GCM(wrongKey, encrypted),
    ).rejects.toThrow();
  });

  it('should fail decryption with tampered ciphertext', async () => {
    const key = generateRandomBytes(32);
    const data = new TextEncoder().encode('secret vault data');
    const encrypted = await encryptAES256GCM(key, data);

    // Tamper with ciphertext
    encrypted.ciphertext[0] ^= 0xff;

    await expect(
      decryptAES256GCM(key, encrypted),
    ).rejects.toThrow();
  });
});

// ─── Test 3: Full Seed → Vault Key → Roundtrip ───────────────────────────

describe('unstoppable recovery flow', () => {
  it('should derive identical vault key from same seed phrase', async () => {
    const mnemonic = generateMnemonic(256);
    const seed1 = await mnemonicToSeed(mnemonic);
    const seed2 = await mnemonicToSeed(mnemonic);

    const keys1 = deriveAllKeys(seed1);
    const keys2 = deriveAllKeys(seed2);

    // Same seed → same vault key (deterministic)
    expect(Buffer.from(keys1.vaultKey).toString('hex'))
      .toBe(Buffer.from(keys2.vaultKey).toString('hex'));
  });

  it('should complete full archive → retrieve simulation', async () => {
    // 1. Generate seed phrase
    const mnemonic = generateMnemonic(256);
    expect(mnemonic.split(' ')).toHaveLength(24);

    // 2. Derive vault key from seed
    const seed = await mnemonicToSeed(mnemonic);
    const keys = deriveAllKeys(seed);

    // 3. Create vault data
    const vault = JSON.stringify({
      version: 1,
      items: [
        { site: 'example.com', user: 'admin', pass: 'TopSecret123!' },
      ],
    });
    const vaultData = new TextEncoder().encode(vault);

    // 4. Encrypt with vault key (simulates archiveVault)
    const encrypted = await encryptAES256GCM(keys.vaultKey, vaultData);
    const blob = new Uint8Array(
      encrypted.nonce.length + encrypted.tag.length + encrypted.ciphertext.length,
    );
    blob.set(encrypted.nonce, 0);
    blob.set(encrypted.tag, encrypted.nonce.length);
    blob.set(encrypted.ciphertext, encrypted.nonce.length + encrypted.tag.length);

    // 5. Derive identity hash (would be used as Arweave tag)
    const identityHash = deriveIdentityHash(keys.vaultKey);
    expect(identityHash).toHaveLength(64);

    // 6. Simulate: "Auth Box disappears, user only has seed phrase"
    const recoverySeed = await mnemonicToSeed(mnemonic);
    const recoveryKeys = deriveAllKeys(recoverySeed);

    // 7. Same identity hash (would find the blob on Arweave)
    const recoveryIdentity = deriveIdentityHash(recoveryKeys.vaultKey);
    expect(recoveryIdentity).toBe(identityHash);

    // 8. Decrypt with recovered key (simulates retrieveVault)
    const nonce = blob.slice(0, 12);
    const tag = blob.slice(12, 28);
    const ciphertext = blob.slice(28);
    const decrypted = await decryptAES256GCM(
      recoveryKeys.vaultKey,
      { ciphertext, nonce, tag },
    );

    const recovered = JSON.parse(new TextDecoder().decode(decrypted));
    expect(recovered.items[0].pass).toBe('TopSecret123!');
  });
});

// ─── Test 4: Arweave Read-Only API ────────────────────────────────────────

const describeArweaveLive = liveArweaveEnabled ? describe : describe.skip;

describeArweaveLive('arweave read-only API', () => {
  it('should estimate archive cost for 1KB vault', async () => {
    const cost = await estimateArchiveCost(1024);
    expect(cost).toBeDefined();
    // Cost should be a numeric string (AR tokens)
    expect(parseFloat(cost)).toBeGreaterThan(0);
    expect(parseFloat(cost)).toBeLessThan(1); // 1KB should cost << 1 AR
  }, 15000);

  it('should return empty results for random identity', async () => {
    const randomKey = generateRandomBytes(32);
    const archives = await findVaultArchives(randomKey);
    expect(archives).toEqual([]);
  }, 15000);
});
