import { describe, expect, it } from 'vitest';
import {
  decryptVaultKey,
  deriveKeys,
  encryptVaultKey,
  fromBase64,
  generateRandomBytes,
  generateVaultKey,
  srpGenerateVerifier,
  toBase64,
} from '@authbox/crypto';
import { createApiClient } from './client.js';
import { srpLogin } from './login.js';

type Auth = Parameters<typeof srpLogin>[0];

// A server that answers with a valid-looking B but cannot know the session
// key, so its M2 is wrong. The client must refuse before reading anything else.
const forgedServer = (extra: object = {}): Auth => ({
  loginInit: async () => ({
    srpSalt: toBase64(generateRandomBytes(32)),
    serverPublicB: toBase64(new Uint8Array(256).fill(7)),
  }),
  loginVerify: async () => ({ serverProofM2: toBase64(generateRandomBytes(32)), sessionToken: 'stolen', ...extra }),
});

describe('srpLogin against a server that cannot prove the password', () => {
  it('rejects a wrong server proof', async () => {
    await expect(srpLogin(forgedServer(), 'a@example.com', 'pw')).rejects.toThrow(
      'SRP server proof verification failed',
    );
  }, 60_000);

  it('rejects a response with no server proof', async () => {
    await expect(
      srpLogin(forgedServer({ serverProofM2: '' }), 'a@example.com', 'pw'),
    ).rejects.toThrow('Login response missing SRP server proof');
  }, 60_000);
});

// Real-boundary check: set AUTHBOX_API_URL to a running services/api.
const apiUrl = process.env.AUTHBOX_API_URL;
describe.skipIf(!apiUrl)('srpLogin against a live API', () => {
  it('registers, logs in, verifies M2 and decrypts the vault key', async () => {
    const api = createApiClient(() => apiUrl!);
    const email = `api-client-${Date.now()}@example.com`;
    const password = 'correct horse battery staple';
    const salt = generateRandomBytes(32);
    const keys = await deriveKeys(password, salt);
    const { verifier } = await srpGenerateVerifier(email, password, salt);
    const vaultKey = generateVaultKey();
    const bundle = await encryptVaultKey(keys.encKey, vaultKey);
    await api.authApi.register({
      email,
      srpSalt: toBase64(salt),
      srpVerifier: toBase64(verifier),
      encryptedVaultKey: toBase64(bundle.encryptedVaultKey),
      vaultKeyNonce: toBase64(bundle.nonce),
      vaultKeyTag: toBase64(bundle.tag),
      kdfParams: { algorithm: 'argon2id', memory: 262144, iterations: 3, parallelism: 4, keyLength: 32 },
    });

    const outcome = await srpLogin(api.authApi, email, password);
    expect(outcome.kind).toBe('complete');
    if (outcome.kind !== 'complete') return;
    const decrypted = await decryptVaultKey(outcome.encKey, {
      encryptedVaultKey: fromBase64(outcome.session.encryptedVaultKey),
      nonce: fromBase64(outcome.session.vaultKeyNonce),
      tag: fromBase64(outcome.session.vaultKeyTag),
    });
    expect(Buffer.from(decrypted).equals(Buffer.from(vaultKey))).toBe(true);

    const items = await api.vaultApi.listItems(outcome.session.sessionToken, 10, 0);
    expect(items.items).toEqual([]);

    await expect(srpLogin(api.authApi, email, 'wrong password')).rejects.toMatchObject({ status: 401 });
  }, 120_000);
});
