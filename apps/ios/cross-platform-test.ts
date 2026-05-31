/**
 * Cross-platform test vector generator.
 * Runs the TypeScript crypto with fixed mnemonics and outputs
 * hex-encoded results that the Swift tests must match exactly.
 */
import {
  setWordlist,
  validateMnemonic,
  mnemonicToSeed,
  deriveKey,
  deriveAllKeys,
  deriveAgentKey,
  derivePassword,
  KeyPurpose,
} from '../../packages/crypto/src/seed';
import { ENGLISH_WORDLIST } from '../../packages/crypto/src/wordlist-en';
import { deriveSubKey } from '../../packages/crypto/src/hkdf';

setWordlist(ENGLISH_WORDLIST);

function toHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fixed test mnemonic (BIP-39 test vector: 12 words)
const M12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Fixed test mnemonic (24 words)
const M24 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

console.log('=== Cross-Platform Test Vectors ===\n');

// --- 12-word mnemonic ---
console.log(`M12_VALID: ${validateMnemonic(M12)}`);
const seed12 = mnemonicToSeed(M12);
console.log(`M12_SEED: ${toHex(seed12)}`);

// --- 24-word mnemonic ---
console.log(`\nM24_VALID: ${validateMnemonic(M24)}`);
const seed24 = mnemonicToSeed(M24);
console.log(`M24_SEED: ${toHex(seed24)}`);

// --- HD Key Derivation from 24-word seed ---
const vaultKey = deriveKey(seed24, KeyPurpose.VAULT, 0);
console.log(`\nVAULT_KEY: ${toHex(vaultKey)}`);

const syncKey = deriveKey(seed24, KeyPurpose.SYNC, 0);
console.log(`SYNC_KEY: ${toHex(syncKey)}`);

const agentKey0 = deriveKey(seed24, KeyPurpose.AGENT, 0);
console.log(`AGENT_KEY_0: ${toHex(agentKey0)}`);

const authKey = deriveKey(seed24, KeyPurpose.AUTH, 0);
console.log(`AUTH_KEY: ${toHex(authKey)}`);

const deriveKey0 = deriveKey(seed24, KeyPurpose.DERIVE, 0);
console.log(`DERIVE_KEY_0: ${toHex(deriveKey0)}`);

// Agent sub-keys
const agent1 = deriveAgentKey(seed24, 1);
console.log(`AGENT_KEY_1: ${toHex(agent1)}`);

const agent5 = deriveAgentKey(seed24, 5);
console.log(`AGENT_KEY_5: ${toHex(agent5)}`);

// --- HKDF sub-keys ---
const masterKey = new Uint8Array(32);
for (let i = 0; i < 32; i++) masterKey[i] = i; // deterministic test input
const hkdfAuth = deriveSubKey(masterKey, 'auth');
console.log(`\nHKDF_AUTH: ${toHex(hkdfAuth)}`);
const hkdfEnc = deriveSubKey(masterKey, 'enc');
console.log(`HKDF_ENC: ${toHex(hkdfEnc)}`);
const hkdfMac = deriveSubKey(masterKey, 'mac');
console.log(`HKDF_MAC: ${toHex(hkdfMac)}`);

// --- Deterministic Passwords ---
const pw1 = derivePassword(seed24, 'github.com');
console.log(`\nPW_GITHUB: ${pw1}`);

const pw2 = derivePassword(seed24, 'google.com');
console.log(`PW_GOOGLE: ${pw2}`);

const pw3 = derivePassword(seed24, 'github.com', { counter: 1 });
console.log(`PW_GITHUB_C1: ${pw3}`);

const pw4 = derivePassword(seed24, 'GitHub.com');
console.log(`PW_GITHUB_UPPER: ${pw4}`);
console.log(`CASE_INSENSITIVE: ${pw1 === pw4}`);

const pw5 = derivePassword(seed24, 'test.com', {
  length: 32,
  lowercase: true,
  uppercase: false,
  digits: false,
  symbols: false,
});
console.log(`PW_TEST_LOWER32: ${pw5}`);

const pw6 = derivePassword(seed24, 'stripe.com', { length: 16 });
console.log(`PW_STRIPE_16: ${pw6}`);

console.log('\n=== Done ===');
