/**
 * Client-side authentication flows using SRP-6a.
 *
 * Registration:
 *   1. Generate salt
 *   2. Derive keys from password (Argon2id -> HKDF -> auth/enc/mac)
 *   3. Generate SRP verifier from auth key
 *   4. Generate random vault key, encrypt with enc key
 *   5. Send (email, salt, verifier, encryptedVaultKey, kdfParams) to server
 *
 * Login:
 *   1. SRP client init (generate ephemeral A)
 *   2. Send (email, A) to server, receive (salt, B)
 *   3. Derive keys from password + salt
 *   4. SRP client verify (compute proof M1)
 *   5. Send M1, receive (sessionToken, M2, encryptedVaultKey, kdfParams)
 *   6. Verify server proof M2
 *   7. Decrypt vault key with enc key
 *   8. Vault is now unlocked
 */
import {
  deriveKeys,
  srpGenerateVerifier,
  srpClientInit,
  srpClientVerify,
  generateVaultKey,
  encryptVaultKey,
  decryptVaultKey,
  generateRandomBytes,
} from '@authbox/crypto';
import { authApi } from './api';

const DEFAULT_KDF_PARAMS = {
  algorithm: 'argon2id' as const,
  memory: 262144,    // 256 MB in KiB
  iterations: 3,
  parallelism: 4,
  keyLength: 32,
};

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface RegisterResult {
  userId: string;
}

export async function register(
  email: string,
  password: string,
): Promise<RegisterResult> {
  // 1. Generate salt
  const salt = generateRandomBytes(32);

  // 2. Derive keys
  const keys = await deriveKeys(password, salt);

  // 3. Generate SRP verifier
  const { verifier } = await srpGenerateVerifier(email, password, salt);

  // 4. Generate and encrypt vault key
  const vaultKey = generateVaultKey();
  const vaultKeyBundle = await encryptVaultKey(keys.encKey, vaultKey);

  // 5. Register with server
  const result = await authApi.register({
    email,
    srpSalt: toBase64(salt),
    srpVerifier: toBase64(verifier),
    encryptedVaultKey: toBase64(vaultKeyBundle.encryptedVaultKey),
    vaultKeyNonce: toBase64(vaultKeyBundle.nonce),
    vaultKeyTag: toBase64(vaultKeyBundle.tag),
    kdfParams: DEFAULT_KDF_PARAMS,
  });

  return { userId: result.userId };
}

export interface LoginResult {
  kind: 'complete';
  sessionToken: string;
  vaultKey: Uint8Array;
}

export interface PendingTOTPLogin {
  kind: 'totp_required';
  email: string;
  encKey: Uint8Array;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult | PendingTOTPLogin> {
  // 1. SRP client init
  const clientState = await srpClientInit();

  // 2. Send A to server
  const initResponse = await authApi.loginInit({
    email,
    clientPublicA: toBase64(clientState.ephemeralPublic),
  });

  // 3. Derive keys with the salt from server
  const salt = fromBase64(initResponse.srpSalt);
  const keys = await deriveKeys(password, salt);

  // 4. SRP client verify
  const serverPublicB = fromBase64(initResponse.serverPublicB);
  const { clientProof } = await srpClientVerify(
    clientState,
    email,
    password,
    salt,
    serverPublicB,
  );

  // 5. Send proof to server
  const verifyResponse = await authApi.loginVerify({
    email,
    clientPublicA: toBase64(clientState.ephemeralPublic),
    clientProofM1: toBase64(clientProof),
  });

  if (verifyResponse.totpRequired) {
    return {
      kind: 'totp_required',
      email,
      encKey: keys.encKey,
    };
  }

  if (!verifyResponse.sessionToken || !verifyResponse.encryptedVaultKey || !verifyResponse.vaultKeyNonce || !verifyResponse.vaultKeyTag) {
    throw new Error('Login response missing vault credentials');
  }

  // 6. Decrypt vault key
  const vaultKey = await decryptVaultKey(keys.encKey, {
    encryptedVaultKey: fromBase64(verifyResponse.encryptedVaultKey),
    nonce: fromBase64(verifyResponse.vaultKeyNonce),
    tag: fromBase64(verifyResponse.vaultKeyTag),
  });

  return {
    kind: 'complete',
    sessionToken: verifyResponse.sessionToken,
    vaultKey,
  };
}

export async function verifyLoginTOTP(
  pending: PendingTOTPLogin,
  code: string,
): Promise<LoginResult> {
  const verifyResponse = await authApi.loginVerifyTOTP({
    email: pending.email,
    code,
  });

  const vaultKey = await decryptVaultKey(pending.encKey, {
    encryptedVaultKey: fromBase64(verifyResponse.encryptedVaultKey),
    nonce: fromBase64(verifyResponse.vaultKeyNonce),
    tag: fromBase64(verifyResponse.vaultKeyTag),
  });

  return {
    kind: 'complete',
    sessionToken: verifyResponse.sessionToken,
    vaultKey,
  };
}

/**
 * Unlock vault from local session (vault key is re-derived from password).
 * Used when the session is still valid but the vault is locked (e.g., after idle timeout).
 */
export async function unlockVault(
  password: string,
  encryptedVaultKey: string,
  vaultKeyNonce: string,
  vaultKeyTag: string,
  srpSalt: string,
): Promise<Uint8Array> {
  const salt = fromBase64(srpSalt);
  const keys = await deriveKeys(password, salt);

  return decryptVaultKey(keys.encKey, {
    encryptedVaultKey: fromBase64(encryptedVaultKey),
    nonce: fromBase64(vaultKeyNonce),
    tag: fromBase64(vaultKeyTag),
  });
}
