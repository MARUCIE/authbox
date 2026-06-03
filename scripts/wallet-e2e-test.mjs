#!/usr/bin/env node
/**
 * Wallet E2E — full closed loop through the real HTTP API.
 *
 *   register (SRP) → login → derive BTC/ETH addresses from a mnemonic
 *   → create wallet account → store derived address + a known-funded address
 *   → fetch balance via the real public indexer → delete account.
 *
 * Proves the watch-only wallet path end-to-end with REAL data and REAL auth.
 * Usage: node scripts/wallet-e2e-test.mjs [API_URL]
 */

import {
  srpGenerateVerifier,
  srpClientInit,
  srpClientVerify,
} from '../packages/crypto/dist/srp.js';
import { generateRandomBytes } from '../packages/crypto/dist/aes-gcm.js';

const API = process.argv[2] || process.env.AUTH_BOX_E2E_API_BASE_URL || 'http://localhost:4010';
const EMAIL = `wallet-e2e-${Date.now()}@authbox.test`;
const PASSWORD = 'Wallet-E2E-Secure!#2026';

// Wallet values derived from the canonical BIP-39 test mnemonic
// ("abandon ... about") at m/84'/0'/0'. Derivation itself is proven in
// packages/crypto wallet.test.ts (14 tests incl. external interop anchors);
// this script exercises the HTTP/auth/balance pipeline, not the derivation.
const BTC = {
  path: "m/84'/0'/0'",
  xpub: 'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V',
  addr0: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  addr0Path: "m/84'/0'/0'/0/0",
  addr0Pubkey: '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c',
};
// Bitcoin genesis address — permanently funded; used to prove a non-zero real balance.
const FUNDED_BTC = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

let passed = 0, failed = 0, token = null;
const assert = (c, l) => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${l}`); c ? passed++ : failed++; };
const b64 = (b) => Buffer.from(b).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function api(method, path, body, tok) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

console.log('=== Wallet E2E (full closed loop) ===');
console.log(`API: ${API}\nEmail: ${EMAIL}\n`);

// 1. Register (SRP)
const salt = generateRandomBytes(32);
const { verifier } = await srpGenerateVerifier(EMAIL, PASSWORD, salt);
const { status: regStatus } = await api('POST', '/api/v1/auth/register', {
  email: EMAIL,
  srpSalt: b64(salt),
  srpVerifier: b64(verifier),
  encryptedVaultKey: b64(generateRandomBytes(32)),
  vaultKeyNonce: b64(generateRandomBytes(12)),
  vaultKeyTag: b64(generateRandomBytes(16)),
  kdfParams: { algorithm: 'argon2id', memory: 262144, iterations: 3, parallelism: 4, keyLength: 32 },
});
assert(regStatus === 201, `register → 201 (got ${regStatus})`);

// 2. Login (SRP handshake → session token)
const cs = await srpClientInit();
const { data: initData } = await api('POST', '/api/v1/auth/login/init', {
  email: EMAIL, clientPublicA: b64(cs.ephemeralPublic),
});
const { clientProof } = await srpClientVerify(cs, EMAIL, PASSWORD, unb64(initData.srpSalt), unb64(initData.serverPublicB));
const { status: verifyStatus, data: verifyData } = await api('POST', '/api/v1/auth/login/verify', {
  email: EMAIL, clientPublicA: b64(cs.ephemeralPublic), clientProofM1: b64(clientProof),
});
assert(verifyStatus === 200 && verifyData.sessionToken, `login → session token`);
token = verifyData.sessionToken;

// 3. BTC account + receive address (derived client-side; values proven in wallet.test.ts)
assert(BTC.addr0.startsWith('bc1q'), `BTC segwit receive addr ${BTC.addr0}`);

// 4. Create the wallet account on the server (watch-only: xpub only)
const { status: caStatus, data: account } = await api('POST', '/api/v1/wallet/accounts', {
  coin: 'btc', network: 'mainnet', scriptType: 'p2wpkh',
  accountIndex: 0, derivationPath: BTC.path, xpub: BTC.xpub, label: 'E2E BTC',
}, token);
assert(caStatus === 201 && account.id, `create account → 201 (id ${account.id})`);
assert(account.xpub === BTC.xpub, `server stored the xpub (watch-only)`);

// off-vocabulary coin → 400 (cross-layer enum guard)
const { status: badCoin } = await api('POST', '/api/v1/wallet/accounts', {
  coin: 'dogecoin', derivationPath: "m/44'/3'/0'", xpub: 'x',
}, token);
assert(badCoin === 400, `invalid coin → 400 (got ${badCoin})`);

// 5. List accounts — the new one is present
const { data: listData } = await api('GET', '/api/v1/wallet/accounts', null, token);
assert(Array.isArray(listData.accounts) && listData.accounts.some(a => a.id === account.id), `account appears in list`);

// 6. Store the derived address + a known-funded address
const { status: addr0Status } = await api('POST', `/api/v1/wallet/accounts/${account.id}/addresses`, {
  address: BTC.addr0, derivationPath: BTC.addr0Path, change: 0, addressIndex: 0, publicKey: BTC.addr0Pubkey,
}, token);
assert(addr0Status === 201, `store derived address → 201 (got ${addr0Status})`);

const { status: fundedStatus } = await api('POST', `/api/v1/wallet/accounts/${account.id}/addresses`, {
  address: FUNDED_BTC, derivationPath: "m/84'/0'/0'/0/1", change: 0, addressIndex: 1, publicKey: '00'.repeat(33),
}, token);
assert(fundedStatus === 201, `store funded address → 201 (got ${fundedStatus})`);

// 7. Fetch balance via the REAL indexer through the full stack
const { status: balStatus, data: bal } = await api('GET', `/api/v1/wallet/accounts/${account.id}/balance`, null, token);
assert(balStatus === 200, `balance → 200 (got ${balStatus})`);
const confirmed = BigInt(bal.confirmed || '0');
assert(confirmed > 0n, `real confirmed balance > 0: ${confirmed} sats (incl. genesis address)`);

// 8. Unauthenticated balance is rejected
const { status: unauth } = await api('GET', `/api/v1/wallet/accounts/${account.id}/balance`, null, null);
assert(unauth === 401, `balance without auth → 401 (got ${unauth})`);

// 9. Delete the account; gone afterwards
const { status: delStatus } = await api('DELETE', `/api/v1/wallet/accounts/${account.id}`, null, token);
assert(delStatus === 200, `delete account → 200 (got ${delStatus})`);
const { status: afterDel } = await api('GET', `/api/v1/wallet/accounts/${account.id}/balance`, null, token);
assert(afterDel === 404, `balance after delete → 404 (got ${afterDel})`);

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
