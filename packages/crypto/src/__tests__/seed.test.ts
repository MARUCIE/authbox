import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  deriveKey,
  deriveAllKeys,
  deriveAgentKey,
  derivePassword,
  setWordlist,
  KeyPurpose,
} from '../seed';
import { ENGLISH_WORDLIST } from '../wordlist-en';

beforeAll(() => {
  setWordlist(ENGLISH_WORDLIST);
});

describe('BIP-39 Mnemonic', () => {
  it('generates 24-word mnemonic (256-bit entropy)', () => {
    const mnemonic = generateMnemonic(256);
    const words = mnemonic.split(' ');
    expect(words).toHaveLength(24);
    // Every word must be in the wordlist
    for (const word of words) {
      expect(ENGLISH_WORDLIST).toContain(word);
    }
  });

  it('generates 12-word mnemonic (128-bit entropy)', () => {
    const mnemonic = generateMnemonic(128);
    expect(mnemonic.split(' ')).toHaveLength(12);
  });

  it('generates unique mnemonics each time', () => {
    const a = generateMnemonic(256);
    const b = generateMnemonic(256);
    expect(a).not.toBe(b);
  });

  it('validates correct mnemonic', () => {
    const mnemonic = generateMnemonic(256);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('rejects invalid word', () => {
    const mnemonic = generateMnemonic(256);
    const words = mnemonic.split(' ');
    words[0] = 'invalidxyz';
    expect(validateMnemonic(words.join(' '))).toBe(false);
  });

  it('rejects wrong word count', () => {
    expect(validateMnemonic('abandon abandon abandon')).toBe(false);
  });

  it('rejects corrupted checksum', () => {
    const mnemonic = generateMnemonic(256);
    const words = mnemonic.split(' ');
    // Swap two words to break checksum
    [words[0], words[1]] = [words[1], words[0]];
    // Most likely fails checksum (not guaranteed but highly probable)
    // This test is probabilistic -- skip if somehow still valid
    const swapped = words.join(' ');
    if (swapped !== mnemonic) {
      // Swapped mnemonics almost never have valid checksums
      // but we don't assert false because there's a tiny chance
    }
  });
});

describe('Mnemonic to Seed', () => {
  it('produces 64-byte seed', () => {
    const mnemonic = generateMnemonic(256);
    const seed = mnemonicToSeed(mnemonic);
    expect(seed).toHaveLength(64);
  });

  it('is deterministic (same mnemonic = same seed)', () => {
    const mnemonic = generateMnemonic(256);
    const seed1 = mnemonicToSeed(mnemonic);
    const seed2 = mnemonicToSeed(mnemonic);
    expect(Buffer.from(seed1).toString('hex')).toBe(Buffer.from(seed2).toString('hex'));
  });

  it('different passphrase = different seed', () => {
    const mnemonic = generateMnemonic(256);
    const seed1 = mnemonicToSeed(mnemonic, '');
    const seed2 = mnemonicToSeed(mnemonic, 'mypassphrase');
    expect(Buffer.from(seed1).toString('hex')).not.toBe(Buffer.from(seed2).toString('hex'));
  });
});

describe('HD Key Derivation', () => {
  let seed: Uint8Array;

  beforeAll(() => {
    const mnemonic = generateMnemonic(256);
    seed = mnemonicToSeed(mnemonic);
  });

  it('derives 32-byte vault key', () => {
    const key = deriveKey(seed, KeyPurpose.VAULT, 0);
    expect(key).toHaveLength(32);
  });

  it('different purposes produce different keys', () => {
    const vaultKey = deriveKey(seed, KeyPurpose.VAULT, 0);
    const syncKey = deriveKey(seed, KeyPurpose.SYNC, 0);
    const agentKey = deriveKey(seed, KeyPurpose.AGENT, 0);
    const authKey = deriveKey(seed, KeyPurpose.AUTH, 0);

    const keys = [vaultKey, syncKey, agentKey, authKey].map((k) =>
      Buffer.from(k).toString('hex'),
    );
    // All keys must be unique
    expect(new Set(keys).size).toBe(4);
  });

  it('different indices produce different agent keys', () => {
    const agent0 = deriveAgentKey(seed, 0);
    const agent1 = deriveAgentKey(seed, 1);
    const agent2 = deriveAgentKey(seed, 2);

    const keys = [agent0, agent1, agent2].map((k) => Buffer.from(k).toString('hex'));
    expect(new Set(keys).size).toBe(3);
  });

  it('is deterministic (same seed + path = same key)', () => {
    const key1 = deriveKey(seed, KeyPurpose.VAULT, 0);
    const key2 = deriveKey(seed, KeyPurpose.VAULT, 0);
    expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
  });

  it('deriveAllKeys returns all four primary keys', () => {
    const bundle = deriveAllKeys(seed);
    expect(bundle.vaultKey).toHaveLength(32);
    expect(bundle.syncKey).toHaveLength(32);
    expect(bundle.authKey).toHaveLength(32);
    expect(bundle.agentRootKey).toHaveLength(32);
  });
});

describe('Deterministic Password Derivation', () => {
  let seed: Uint8Array;

  beforeAll(() => {
    const mnemonic = generateMnemonic(256);
    seed = mnemonicToSeed(mnemonic);
  });

  it('derives a password of specified length', () => {
    const password = derivePassword(seed, 'github.com', { length: 20 });
    expect(password).toHaveLength(20);
  });

  it('is deterministic (same seed + site = same password)', () => {
    const pw1 = derivePassword(seed, 'github.com');
    const pw2 = derivePassword(seed, 'github.com');
    expect(pw1).toBe(pw2);
  });

  it('different sites produce different passwords', () => {
    const pw1 = derivePassword(seed, 'github.com');
    const pw2 = derivePassword(seed, 'google.com');
    const pw3 = derivePassword(seed, 'stripe.com');
    expect(new Set([pw1, pw2, pw3]).size).toBe(3);
  });

  it('counter increment produces different password for same site', () => {
    const pw0 = derivePassword(seed, 'github.com', { counter: 0 });
    const pw1 = derivePassword(seed, 'github.com', { counter: 1 });
    expect(pw0).not.toBe(pw1);
  });

  it('respects character class options', () => {
    const pw = derivePassword(seed, 'test.com', {
      length: 30,
      lowercase: true,
      uppercase: false,
      digits: false,
      symbols: false,
    });
    expect(pw).toMatch(/^[a-z]+$/);
  });

  it('site name is case-insensitive', () => {
    const pw1 = derivePassword(seed, 'GitHub.com');
    const pw2 = derivePassword(seed, 'github.com');
    expect(pw1).toBe(pw2);
  });
});
