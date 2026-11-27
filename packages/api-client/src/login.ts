/**
 * The SRP-6a login handshake against the Auth Box API. The single
 * implementation used by web and extension; it lives under its own entry
 * point (`@authbox/api-client/login`) so callers can load the crypto it
 * needs lazily.
 *
 *   1. client ephemeral A        -> POST /auth/login/init   -> salt, B
 *   2. Argon2id/HKDF keys from password + salt
 *   3. client proof M1           -> POST /auth/login/verify -> M2, session
 *   4. verify server proof M2 before trusting anything in the response
 */
import {
  deriveKeys,
  fromBase64,
  srpClientInit,
  srpClientVerify,
  srpVerifyServerProof,
  toBase64,
} from '@authbox/crypto';
import type { ApiClient } from './client.js';

export interface LoginSession {
  sessionToken: string;
  encryptedVaultKey: string;
  vaultKeyNonce: string;
  vaultKeyTag: string;
}

export type SrpLoginOutcome =
  | { kind: 'complete'; encKey: Uint8Array; session: LoginSession }
  | {
      kind: 'totp_required';
      encKey: Uint8Array;
      /** Single-use challenge from the SRP step; binds the TOTP step to this client. */
      loginChallenge: string;
    };

export async function srpLogin(
  authApi: Pick<ApiClient['authApi'], 'loginInit' | 'loginVerify'>,
  email: string,
  password: string,
): Promise<SrpLoginOutcome> {
  const clientState = await srpClientInit();
  const clientPublicA = toBase64(clientState.ephemeralPublic);

  const init = await authApi.loginInit({ email, clientPublicA });

  const salt = fromBase64(init.srpSalt);
  const keys = await deriveKeys(password, salt);

  const { clientProof, sessionKey } = await srpClientVerify(
    clientState,
    email,
    password,
    salt,
    fromBase64(init.serverPublicB),
  );

  const verify = await authApi.loginVerify({
    email,
    clientPublicA,
    clientProofM1: toBase64(clientProof),
  });

  if (!verify.serverProofM2) {
    throw new Error('Login response missing SRP server proof');
  }
  if (!srpVerifyServerProof(clientState, clientProof, sessionKey, fromBase64(verify.serverProofM2))) {
    throw new Error('SRP server proof verification failed');
  }

  if (verify.totpRequired) {
    if (!verify.loginChallenge) {
      throw new Error('Login response missing TOTP challenge');
    }
    return { kind: 'totp_required', encKey: keys.encKey, loginChallenge: verify.loginChallenge };
  }

  if (!verify.sessionToken || !verify.encryptedVaultKey || !verify.vaultKeyNonce || !verify.vaultKeyTag) {
    throw new Error('Login response missing vault credentials');
  }

  return {
    kind: 'complete',
    encKey: keys.encKey,
    session: {
      sessionToken: verify.sessionToken,
      encryptedVaultKey: verify.encryptedVaultKey,
      vaultKeyNonce: verify.vaultKeyNonce,
      vaultKeyTag: verify.vaultKeyTag,
    },
  };
}
