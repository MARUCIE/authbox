import { sha256 } from '@noble/hashes/sha256';

/**
 * SRP-6a client implementation using native BigInt.
 *
 * SRP (Secure Remote Password) lets the client prove knowledge of the password
 * without ever sending it over the wire. The server stores only a verifier
 * derived from the password, not the password itself.
 *
 * Group: 2048-bit from RFC 5054, Group 14.
 * Hash: SHA-256 throughout.
 */

// RFC 5054, 2048-bit group 14
// prettier-ignore
const N_HEX =
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
  'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8' +
  '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B' +
  'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748' +
  '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6' +
  'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6' +
  '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73';

const N = BigInt('0x' + N_HEX);
const g = 2n;

const ENCODER = new TextEncoder();

export interface SRPClientState {
  ephemeralSecret: Uint8Array; // 'a' (private, 32 bytes)
  ephemeralPublic: Uint8Array; // 'A = g^a mod N' (256 bytes)
}

// --- Utility functions ---

function bigintToBytes(n: bigint, length: number): Uint8Array {
  const hex = n.toString(16).padStart(length * 2, '0');
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex.length === 0 ? 0n : BigInt('0x' + hex);
}

/** Modular exponentiation: base^exp mod mod */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) {
      result = (result * base) % mod;
    }
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function hashSHA256(...inputs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const inp of inputs) total += inp.length;
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const inp of inputs) {
    combined.set(inp, offset);
    offset += inp.length;
  }
  return sha256(combined);
}

/**
 * Compute the SRP 'x' value: x = H(salt || H(identity || ":" || password))
 * where H = SHA-256.
 */
function computeX(
  email: string,
  password: string,
  salt: Uint8Array,
): bigint {
  const innerHash = hashSHA256(ENCODER.encode(email + ':' + password));
  const xHash = hashSHA256(salt, innerHash);
  return bytesToBigint(xHash);
}

/**
 * Compute the SRP multiplier k = H(N || PAD(g))
 * PAD pads g to the same byte length as N.
 */
function computeK(): bigint {
  const nBytes = bigintToBytes(N, 256);
  const gBytes = bigintToBytes(g, 256);
  return bytesToBigint(hashSHA256(nBytes, gBytes));
}

/**
 * Compute the scrambling parameter u = H(PAD(A) || PAD(B))
 */
function computeU(A: bigint, B: bigint): bigint {
  const aBytes = bigintToBytes(A, 256);
  const bBytes = bigintToBytes(B, 256);
  return bytesToBigint(hashSHA256(aBytes, bBytes));
}

const N_BYTE_LENGTH = 256; // 2048 bits

// --- Public API ---

/**
 * Generate SRP verifier for registration.
 * verifier = g^x mod N
 */
export async function srpGenerateVerifier(
  email: string,
  password: string,
  salt: Uint8Array,
): Promise<{ salt: Uint8Array; verifier: Uint8Array }> {
  const x = computeX(email, password, salt);
  const verifier = modPow(g, x, N);
  return {
    salt: new Uint8Array(salt),
    verifier: bigintToBytes(verifier, N_BYTE_LENGTH),
  };
}

/**
 * Login step 1: generate client ephemeral key pair.
 * a = random 32 bytes, A = g^a mod N
 *
 * Retries if A mod N === 0 (SRP safety check, astronomically unlikely).
 */
export async function srpClientInit(): Promise<SRPClientState> {
  let a: bigint;
  let A: bigint;

  // Safety: A mod N must not be 0
  do {
    const aBytes = crypto.getRandomValues(new Uint8Array(32));
    a = bytesToBigint(aBytes);
    A = modPow(g, a, N);
  } while (A === 0n);

  return {
    ephemeralSecret: bigintToBytes(a, 32),
    ephemeralPublic: bigintToBytes(A, N_BYTE_LENGTH),
  };
}

/**
 * Login step 2: compute client proof M1 and session key K.
 *
 * Given the server's (salt, B):
 * 1. Compute x, u, k
 * 2. S = (B - k * g^x) ^ (a + u*x) mod N
 * 3. K = H(S)
 * 4. M1 = H(A || B || K)
 *
 * Throws if B mod N === 0 (server misbehaving).
 */
export async function srpClientVerify(
  state: SRPClientState,
  email: string,
  password: string,
  salt: Uint8Array,
  serverPublicB: Uint8Array,
): Promise<{ clientProof: Uint8Array; sessionKey: Uint8Array }> {
  const a = bytesToBigint(state.ephemeralSecret);
  const A = bytesToBigint(state.ephemeralPublic);
  const B = bytesToBigint(serverPublicB);

  // Safety check
  if (B % N === 0n) {
    throw new Error('SRP: server public key B is invalid (B mod N === 0)');
  }

  const u = computeU(A, B);
  if (u === 0n) {
    throw new Error('SRP: scrambling parameter u is zero');
  }

  const x = computeX(email, password, salt);
  const k = computeK();

  // S = (B - k * g^x) ^ (a + u*x) mod N
  const gx = modPow(g, x, N);
  const kgx = (k * gx) % N;
  // Ensure non-negative: add N before subtracting
  const base = ((B - kgx) % N + N) % N;
  const exp = a + u * x;
  const S = modPow(base, exp, N);

  const sBytes = bigintToBytes(S, N_BYTE_LENGTH);
  const sessionKey = hashSHA256(sBytes);

  // M1 = H(A || B || K)
  const aBytes = bigintToBytes(A, N_BYTE_LENGTH);
  const bBytes = bigintToBytes(B, N_BYTE_LENGTH);
  const clientProof = hashSHA256(aBytes, bBytes, sessionKey);

  return { clientProof, sessionKey };
}
