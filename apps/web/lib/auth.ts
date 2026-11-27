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
 *   1-6. SRP handshake incl. server-proof check: srpLogin in
 *        @authbox/api-client/login (shared with the extension)
 *   7. Decrypt vault key with enc key
 *   8. Vault is now unlocked
 */
import {
  deriveKeys,
  srpGenerateVerifier,
  generateVaultKey,
  encryptVaultKey,
  decryptVaultKey,
  generateRandomBytes,
  toBase64,
  fromBase64,
} from "@authbox/crypto";
import { srpLogin } from "@authbox/api-client/login";
import { authApi } from "./api";

const DEFAULT_KDF_PARAMS = {
  algorithm: "argon2id" as const,
  memory: 262144, // 256 MB in KiB
  iterations: 3,
  parallelism: 4,
  keyLength: 32,
};

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
  kind: "complete";
  sessionToken: string;
  vaultKey: Uint8Array;
}

export interface PendingTOTPLogin {
  kind: "totp_required";
  email: string;
  encKey: Uint8Array;
  /** Single-use challenge from the SRP step; binds the TOTP step to this client. */
  loginChallenge: string;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult | PendingTOTPLogin> {
  const outcome = await srpLogin(authApi, email, password);

  if (outcome.kind === "totp_required") {
    return {
      kind: "totp_required",
      email,
      encKey: outcome.encKey,
      loginChallenge: outcome.loginChallenge,
    };
  }

  const vaultKey = await decryptVaultKey(outcome.encKey, {
    encryptedVaultKey: fromBase64(outcome.session.encryptedVaultKey),
    nonce: fromBase64(outcome.session.vaultKeyNonce),
    tag: fromBase64(outcome.session.vaultKeyTag),
  });

  return {
    kind: "complete",
    sessionToken: outcome.session.sessionToken,
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
    loginChallenge: pending.loginChallenge,
  });

  const vaultKey = await decryptVaultKey(pending.encKey, {
    encryptedVaultKey: fromBase64(verifyResponse.encryptedVaultKey),
    nonce: fromBase64(verifyResponse.vaultKeyNonce),
    tag: fromBase64(verifyResponse.vaultKeyTag),
  });

  return {
    kind: "complete",
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
