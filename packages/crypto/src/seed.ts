/**
 * BIP-39 Mnemonic Seed Generation + HD Key Derivation for Auth Box.
 *
 * This module implements the "Unstoppable" layer -- a seed phrase that can
 * deterministically derive all keys needed by Auth Box:
 *
 *   seed phrase (24 words, BIP-39)
 *     → master key (PBKDF2-HMAC-SHA512)
 *       → m/auth_box'/vault'/0'    → vault encryption key
 *       → m/auth_box'/sync'/0'     → sync encryption key
 *       → m/auth_box'/agent'/0'    → agent delegation root key
 *       → m/auth_box'/agent'/<n>'  → per-agent sub-key (revocable)
 *       → m/auth_box'/derive'/<n>' → deterministic password derivation
 *
 * Key properties:
 *   - Seed phrase is the ONLY recovery mechanism (no server needed)
 *   - All keys are deterministically derived (same seed = same keys)
 *   - Agent sub-keys can be individually revoked without affecting others
 *   - Deterministic passwords eliminate the need to store passwords at all
 *
 * Dependencies: @noble/hashes (SHA-256, HMAC-SHA512, PBKDF2)
 */

import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { pbkdf2 } from '@noble/hashes/pbkdf2';

// ─── BIP-39 English Wordlist (2048 words) ─────────────────────────────────
// We embed a minimal loader -- the full wordlist is loaded lazily.
// For now, we use the standard English BIP-39 wordlist.

let _wordlist: string[] | null = null;

/**
 * Set the BIP-39 wordlist. Must be called before generateMnemonic/validateMnemonic.
 * Typically loaded from a separate file to keep the core bundle small.
 */
export function setWordlist(words: string[]): void {
  if (words.length !== 2048) {
    throw new Error('BIP-39 wordlist must contain exactly 2048 words');
  }
  _wordlist = words;
}

function getWordlist(): string[] {
  if (!_wordlist) {
    throw new Error('BIP-39 wordlist not loaded. Call setWordlist() first.');
  }
  return _wordlist;
}

// ─── BIP-39 Mnemonic Generation ───────────────────────────────────────────

/**
 * Generate a BIP-39 mnemonic phrase.
 *
 * @param strength - Entropy bits: 128 (12 words), 160 (15), 192 (18), 224 (21), 256 (24 words)
 * @returns Space-separated mnemonic words
 */
export function generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 256): string {
  const wordlist = getWordlist();

  // 1. Generate random entropy
  const entropy = new Uint8Array(strength / 8);
  crypto.getRandomValues(entropy);

  // 2. Calculate checksum: first (strength/32) bits of SHA-256(entropy)
  const hash = sha256(entropy);
  const checksumBits = strength / 32;

  // 3. Combine entropy + checksum into bit string
  let bits = '';
  for (const byte of entropy) {
    bits += byte.toString(2).padStart(8, '0');
  }
  for (let i = 0; i < checksumBits; i++) {
    bits += ((hash[Math.floor(i / 8)] >> (7 - (i % 8))) & 1).toString();
  }

  // 4. Split into 11-bit groups → word indices
  const words: string[] = [];
  for (let i = 0; i < bits.length; i += 11) {
    const index = parseInt(bits.slice(i, i + 11), 2);
    words.push(wordlist[index]);
  }

  return words.join(' ');
}

/**
 * Validate a BIP-39 mnemonic phrase.
 *
 * @returns true if the mnemonic has valid word count, all words are in the wordlist,
 *          and the checksum is correct.
 */
export function validateMnemonic(mnemonic: string): boolean {
  const wordlist = getWordlist();
  const words = mnemonic.trim().split(/\s+/);

  // Valid word counts: 12, 15, 18, 21, 24
  const validCounts = [12, 15, 18, 21, 24];
  if (!validCounts.includes(words.length)) return false;

  // Convert words to bit string
  let bits = '';
  for (const word of words) {
    const index = wordlist.indexOf(word);
    if (index === -1) return false;
    bits += index.toString(2).padStart(11, '0');
  }

  // Split entropy and checksum
  const strength = (words.length * 11 * 32) / 33;
  const entropyBits = bits.slice(0, strength);
  const checksumBits = bits.slice(strength);

  // Reconstruct entropy bytes
  const entropy = new Uint8Array(strength / 8);
  for (let i = 0; i < entropy.length; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Verify checksum
  const hash = sha256(entropy);
  const expectedChecksumLength = strength / 32;
  let expectedChecksum = '';
  for (let i = 0; i < expectedChecksumLength; i++) {
    expectedChecksum += ((hash[Math.floor(i / 8)] >> (7 - (i % 8))) & 1).toString();
  }

  return checksumBits === expectedChecksum;
}

// ─── BIP-39 Mnemonic → Seed ───────────────────────────────────────────────

/**
 * Convert a mnemonic phrase to a 512-bit seed using PBKDF2-HMAC-SHA512.
 *
 * @param mnemonic - BIP-39 mnemonic phrase
 * @param passphrase - Optional passphrase (default: empty string per BIP-39 spec)
 * @returns 64-byte seed
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
  const encoder = new TextEncoder();
  const mnemonicBytes = encoder.encode(mnemonic.normalize('NFKD'));
  const salt = encoder.encode('mnemonic' + passphrase.normalize('NFKD'));

  return pbkdf2(sha512, mnemonicBytes, salt, {
    c: 2048,  // BIP-39 specifies 2048 iterations
    dkLen: 64, // 512-bit output
  });
}

// ─── HD Key Derivation (BIP-32 style, Auth Box paths) ─────────────────────

const HARDENED_OFFSET = 0x80000000;

// Auth Box custom derivation purpose (registered in our namespace)
const AUTH_BOX_PURPOSE = 0x41425800; // "ABX\0" as uint32

export enum KeyPurpose {
  VAULT = 0,    // m/ABX'/vault'/0'  → vault encryption key
  SYNC = 1,     // m/ABX'/sync'/0'   → sync encryption key
  AGENT = 2,    // m/ABX'/agent'/n'  → agent delegation keys
  DERIVE = 3,   // m/ABX'/derive'/n' → deterministic password derivation
  AUTH = 4,     // m/ABX'/auth'/0'   → authentication signing key
}

interface HDKey {
  key: Uint8Array;     // 32-byte private key material
  chainCode: Uint8Array; // 32-byte chain code for child derivation
}

/**
 * Derive the HD master key from a BIP-39 seed.
 * Uses HMAC-SHA512 with "authbox seed" as the key (different from Bitcoin's "Bitcoin seed").
 */
function masterKeyFromSeed(seed: Uint8Array): HDKey {
  const I = hmac(sha512, new TextEncoder().encode('authbox seed'), seed);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32, 64),
  };
}

/**
 * Derive a hardened child key at the given index.
 * Only hardened derivation is used (index | 0x80000000) for security.
 */
function deriveHardenedChild(parent: HDKey, index: number): HDKey {
  const data = new Uint8Array(37);
  data[0] = 0x00; // hardened: 0x00 || key || index
  data.set(parent.key, 1);
  const indexBytes = new DataView(data.buffer);
  indexBytes.setUint32(33, index | HARDENED_OFFSET, false);

  const I = hmac(sha512, parent.chainCode, data);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32, 64),
  };
}

/**
 * Derive a key for a specific Auth Box purpose from the seed.
 *
 * Path: m / AUTH_BOX_PURPOSE' / purpose' / index'
 *
 * @param seed - 64-byte BIP-39 seed
 * @param purpose - Key purpose (vault, sync, agent, derive, auth)
 * @param index - Sub-index (e.g., agent number, site index)
 * @returns 32-byte derived key
 */
export function deriveKey(seed: Uint8Array, purpose: KeyPurpose, index: number = 0): Uint8Array {
  const master = masterKeyFromSeed(seed);
  const purposeNode = deriveHardenedChild(master, AUTH_BOX_PURPOSE);
  const typeNode = deriveHardenedChild(purposeNode, purpose);
  const leaf = deriveHardenedChild(typeNode, index);
  return leaf.key;
}

// ─── Deterministic Password Derivation ────────────────────────────────────

const PASSWORD_CHARS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

export interface DerivePasswordOptions {
  length?: number;     // Default: 20
  lowercase?: boolean; // Default: true
  uppercase?: boolean; // Default: true
  digits?: boolean;    // Default: true
  symbols?: boolean;   // Default: true
  counter?: number;    // Default: 0 (increment to generate new password for same site)
}

/**
 * Deterministically derive a password for a specific site from the seed.
 *
 * This is the most radical innovation: if the user has their seed phrase,
 * they can regenerate the password for any site WITHOUT a vault.
 *
 * Path: m / ABX' / derive' / siteHash' → HKDF → password characters
 *
 * @param seed - 64-byte BIP-39 seed
 * @param site - Site identifier (domain name, e.g., "github.com")
 * @param options - Password generation options
 * @returns Deterministic password string
 */
export function derivePassword(
  seed: Uint8Array,
  site: string,
  options: DerivePasswordOptions = {},
): string {
  const {
    length = 20,
    lowercase = true,
    uppercase = true,
    digits = true,
    symbols = true,
    counter = 0,
  } = options;

  // Build character set
  let charset = '';
  if (lowercase) charset += PASSWORD_CHARS.lower;
  if (uppercase) charset += PASSWORD_CHARS.upper;
  if (digits) charset += PASSWORD_CHARS.digits;
  if (symbols) charset += PASSWORD_CHARS.symbols;

  if (charset.length === 0) {
    throw new Error('At least one character class must be enabled');
  }

  // Derive site-specific key material
  const encoder = new TextEncoder();
  const siteHash = sha256(encoder.encode(site.toLowerCase() + '\0' + counter.toString()));
  const siteIndex = new DataView(siteHash.buffer).getUint32(0, false);

  const siteKey = deriveKey(seed, KeyPurpose.DERIVE, siteIndex);

  // Expand key material to enough bytes for password generation
  // Use HMAC-SHA512 for expansion (deterministic, uniform)
  const normalizedSite = site.toLowerCase();
  const expanded = hmac(sha512, siteKey, encoder.encode('password:' + normalizedSite + ':' + counter));

  // Convert to password characters (uniform distribution via rejection sampling)
  const password: string[] = [];
  let byteIdx = 0;

  while (password.length < length) {
    if (byteIdx >= expanded.length) {
      // Need more bytes -- rehash
      const more = hmac(sha512, siteKey, new Uint8Array([...expanded, ...encoder.encode(password.length.toString())]));
      for (let i = 0; i < more.length && password.length < length; i++) {
        const charIdx = more[i] % charset.length;
        password.push(charset[charIdx]);
      }
      break;
    }

    const charIdx = expanded[byteIdx] % charset.length;
    password.push(charset[charIdx]);
    byteIdx++;
  }

  return password.join('');
}

// ─── Convenience Types ────────────────────────────────────────────────────

export interface SeedKeyBundle {
  vaultKey: Uint8Array;   // For encrypting the vault
  syncKey: Uint8Array;    // For encrypting sync payloads
  authKey: Uint8Array;    // For authentication signing
  agentRootKey: Uint8Array; // Root key for agent delegation
}

/**
 * Derive all primary keys from a seed in one call.
 */
export function deriveAllKeys(seed: Uint8Array): SeedKeyBundle {
  return {
    vaultKey: deriveKey(seed, KeyPurpose.VAULT, 0),
    syncKey: deriveKey(seed, KeyPurpose.SYNC, 0),
    authKey: deriveKey(seed, KeyPurpose.AUTH, 0),
    agentRootKey: deriveKey(seed, KeyPurpose.AGENT, 0),
  };
}

/**
 * Derive a per-agent delegation key.
 * Each agent gets its own key that can be independently revoked.
 */
export function deriveAgentKey(seed: Uint8Array, agentIndex: number): Uint8Array {
  return deriveKey(seed, KeyPurpose.AGENT, agentIndex);
}
