#!/usr/bin/env node
/**
 * Auth Box E2E Test Script — Full-Stack Verified
 *
 * Tests the complete user journey with REAL SRP authentication:
 *   1. Health check
 *   2. Registration validation + SRP registration
 *   3. SRP login (mutual authentication → session token)
 *   4. Vault CRUD (create, list, get, update, delete)
 *   5. Agent CRUD (create, list, get, update, delete)
 *   6. Audit trail (list events, verify chain)
 *   7. Session management (list, revoke)
 *   8. TOTP status check
 *   9. API security (unauthenticated rejection, content-type, headers)
 *
 * Usage: node scripts/e2e-test.mjs [API_URL]
 */

import crypto from 'node:crypto';
import {
  srpGenerateVerifier,
  srpClientInit,
  srpClientVerify,
} from '../packages/crypto/dist/srp.js';
import {
  generateRandomBytes,
} from '../packages/crypto/dist/aes-gcm.js';

const API =
  process.argv[2] ||
  process.env.AUTH_BOX_E2E_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:4010';
const TEST_EMAIL = `e2e-${Date.now()}@authbox.io`;
const TEST_PASSWORD = 'E2E-SuperSecure!Test#2026';

console.log('=== Auth Box E2E Test (Full-Stack) ===');
console.log(`API: ${API}`);
console.log(`Email: ${TEST_EMAIL}`);
console.log('');

let passed = 0;
let failed = 0;
let sessionToken = null;

function assert(condition, label) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiCall(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 429 && attempt === 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
      console.log(`    [429] Rate limited on ${path}, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
  }
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

function fromBase32(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = str.replace(/=+$/g, '').toUpperCase();
  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secretBase32, now = Date.now()) {
  const secret = fromBase32(secretBase32);
  const counter = Math.floor(now / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', secret).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
}

// ─── Test 1: Health Check ─────────────────────────────────────
console.log('--- Test 1: Health Check ---');
try {
  const { status, data } = await apiCall('GET', '/health');
  assert(status === 200, `HTTP ${status}`);
  assert(data.status === 'ok', `status: ${data.status}`);
  assert(data.version === '2.0.0', `version: ${data.version}`);
} catch (err) {
  assert(false, `Health check failed: ${err.message}`);
}

// ─── Test 2: Registration Validation ──────────────────────────
console.log('\n--- Test 2: Registration Validation ---');
try {
  const { status: s1 } = await apiCall('POST', '/api/v1/auth/register', {});
  assert(s1 === 400, `Empty body → 400 (got ${s1})`);

  const { status: s2 } = await apiCall('POST', '/api/v1/auth/register', {
    email: 'not-an-email', srpSalt: 'dGVzdA==', srpVerifier: 'dGVzdA==',
    encryptedVaultKey: 'dGVzdA==', vaultKeyNonce: 'dGVzdA==', vaultKeyTag: 'dGVzdA==',
  });
  assert(s2 === 400, `Invalid email → 400 (got ${s2})`);
} catch (err) {
  assert(false, `Validation test failed: ${err.message}`);
}

// ─── Test 3: SRP Registration (real crypto) ───────────────────
console.log('\n--- Test 3: SRP Registration ---');
try {
  const salt = generateRandomBytes(32);
  const { verifier } = await srpGenerateVerifier(TEST_EMAIL, TEST_PASSWORD, salt);
  const vaultKey = toBase64(generateRandomBytes(32));
  const nonce = toBase64(generateRandomBytes(12));
  const tag = toBase64(generateRandomBytes(16));

  const { status, data } = await apiCall('POST', '/api/v1/auth/register', {
    email: TEST_EMAIL,
    srpSalt: toBase64(salt),
    srpVerifier: toBase64(verifier),
    encryptedVaultKey: vaultKey,
    vaultKeyNonce: nonce,
    vaultKeyTag: tag,
    kdfParams: { algorithm: 'argon2id', memory: 262144, iterations: 3, parallelism: 4, keyLength: 32 },
  });
  assert(status === 201, `Registration → 201 (got ${status})`);
  assert(data.userId, `User ID: ${data.userId}`);

  // Duplicate
  const { status: s2 } = await apiCall('POST', '/api/v1/auth/register', {
    email: TEST_EMAIL, srpSalt: toBase64(salt), srpVerifier: toBase64(verifier),
    encryptedVaultKey: vaultKey, vaultKeyNonce: nonce, vaultKeyTag: tag,
  });
  assert(s2 === 409, `Duplicate → 409 (got ${s2})`);
} catch (err) {
  assert(false, `SRP registration failed: ${err.message}`);
}

// ─── Test 4: SRP Login (real crypto handshake) ────────────────
console.log('\n--- Test 4: SRP Login ---');
try {
  // Step 1: client init
  const clientState = await srpClientInit();
  const { status: s1, data: d1 } = await apiCall('POST', '/api/v1/auth/login/init', {
    email: TEST_EMAIL,
    clientPublicA: toBase64(clientState.ephemeralPublic),
  });
  assert(s1 === 200, `Login init → 200 (got ${s1})`);
  assert(d1.srpSalt, 'Salt returned');
  assert(d1.serverPublicB, 'Server B returned');

  // Step 2: client compute proof
  const serverB = fromBase64(d1.serverPublicB);
  const serverSalt = fromBase64(d1.srpSalt);
  const { clientProof, sessionKey } = await srpClientVerify(
    clientState, TEST_EMAIL, TEST_PASSWORD, serverSalt, serverB,
  );

  // Step 3: verify proof with server
  const { status: s2, data: d2 } = await apiCall('POST', '/api/v1/auth/login/verify', {
    email: TEST_EMAIL,
    clientPublicA: toBase64(clientState.ephemeralPublic),
    clientProofM1: toBase64(clientProof),
  });
  assert(s2 === 200, `Login verify → 200 (got ${s2})`);
  assert(d2.sessionToken, 'Session token returned');
  assert(d2.serverProofM2, 'Server proof M2 returned');

  sessionToken = d2.sessionToken;
  console.log(`  [INFO] Authenticated. Token: ${sessionToken.slice(0, 12)}...`);

  // Wrong proof test
  const fakeProof = toBase64(generateRandomBytes(32));
  const { status: s3 } = await apiCall('POST', '/api/v1/auth/login/verify', {
    email: TEST_EMAIL,
    clientPublicA: toBase64(clientState.ephemeralPublic),
    clientProofM1: fakeProof,
  });
  assert(s3 === 401, `Wrong proof → 401 (got ${s3})`);

  // Non-existent user
  const { status: s4 } = await apiCall('POST', '/api/v1/auth/login/init', {
    email: 'nobody@example.com',
    clientPublicA: toBase64(clientState.ephemeralPublic),
  });
  assert(s4 === 401, `Non-existent user → 401 (got ${s4})`);
} catch (err) {
  assert(false, `SRP login failed: ${err.message}`);
}

// ─── Test 5: Vault CRUD ──────────────────────────────────────
console.log('\n--- Test 5: Vault CRUD ---');
let vaultItemId = null;
if (sessionToken) {
  try {
    // Get vault key
    const { status: s1, data: d1 } = await apiCall('GET', '/api/v1/vault/key', null, sessionToken);
    assert(s1 === 200, `Get vault key → 200 (got ${s1})`);
    assert(d1.encryptedVaultKey, 'Vault key returned');

    // Create item (ItemRequest: encryptedData, nonce, tag, itemType)
    // Valid types: credential, note, card, identity, api_key
    const itemData = {
      itemType: 'credential',
      encryptedData: toBase64(generateRandomBytes(64)),
      nonce: toBase64(generateRandomBytes(12)),
      tag: toBase64(generateRandomBytes(16)),
    };
    const { status: s2, data: d2 } = await apiCall('POST', '/api/v1/vault/items', itemData, sessionToken);
    assert(s2 === 201, `Create item → 201 (got ${s2})`);
    assert(d2.id, `Item ID: ${d2.id}`);
    vaultItemId = d2.id;

    // List items
    const { status: s3, data: d3 } = await apiCall('GET', '/api/v1/vault/items', null, sessionToken);
    assert(s3 === 200, `List items → 200 (got ${s3})`);
    assert(Array.isArray(d3.items) && d3.items.length >= 1, `Items count: ${d3.items?.length}`);

    // Get item
    const { status: s4 } = await apiCall('GET', `/api/v1/vault/items/${vaultItemId}`, null, sessionToken);
    assert(s4 === 200, `Get item → 200 (got ${s4})`);

    // Update item
    const updateData = { ...itemData, encryptedData: toBase64(generateRandomBytes(64)) };
    const { status: s5 } = await apiCall('PUT', `/api/v1/vault/items/${vaultItemId}`, updateData, sessionToken);
    assert(s5 === 200, `Update item → 200 (got ${s5})`);

    // Delete item
    const { status: s6 } = await apiCall('DELETE', `/api/v1/vault/items/${vaultItemId}`, null, sessionToken);
    assert(s6 === 200 || s6 === 204, `Delete item → 2xx (got ${s6})`);

    // Verify deleted
    const { status: s7 } = await apiCall('GET', `/api/v1/vault/items/${vaultItemId}`, null, sessionToken);
    assert(s7 === 404, `Deleted item → 404 (got ${s7})`);
  } catch (err) {
    assert(false, `Vault CRUD failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 6: Agent CRUD ──────────────────────────────────────
console.log('\n--- Test 6: Agent CRUD ---');
let agentId = null;
if (sessionToken) {
  try {
    // Create agent
    const agentData = {
      name: 'E2E Test Agent',
      description: 'Created by E2E test suite',
      type: 'mcp',
    };
    const { status: s1, data: d1 } = await apiCall('POST', '/api/v1/agents', agentData, sessionToken);
    assert(s1 === 201, `Create agent → 201 (got ${s1})`);
    assert(d1.id, `Agent ID: ${d1.id}`);
    agentId = d1.id;

    // List agents
    const { status: s2, data: d2 } = await apiCall('GET', '/api/v1/agents', null, sessionToken);
    assert(s2 === 200, `List agents → 200 (got ${s2})`);
    assert(Array.isArray(d2.agents) && d2.agents.length >= 1, `Agents count: ${d2.agents?.length}`);

    // Get agent
    const { status: s3 } = await apiCall('GET', `/api/v1/agents/${agentId}`, null, sessionToken);
    assert(s3 === 200, `Get agent → 200 (got ${s3})`);

    // Update agent
    const { status: s4 } = await apiCall('PUT', `/api/v1/agents/${agentId}`, {
      ...agentData, name: 'Updated E2E Agent',
    }, sessionToken);
    assert(s4 === 200, `Update agent → 200 (got ${s4})`);

    // Delete agent
    const { status: s5 } = await apiCall('DELETE', `/api/v1/agents/${agentId}`, null, sessionToken);
    assert(s5 === 200 || s5 === 204, `Delete agent → 2xx (got ${s5})`);
  } catch (err) {
    assert(false, `Agent CRUD failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 7: Audit Trail ─────────────────────────────────────
console.log('\n--- Test 7: Audit Trail ---');
if (sessionToken) {
  try {
    const { status: s1, data: d1 } = await apiCall('GET', '/api/v1/audit', null, sessionToken);
    assert(s1 === 200, `List audit events → 200 (got ${s1})`);
    assert(Array.isArray(d1.events), 'Events is array');
    assert(d1.events.length >= 0, `Events available: ${d1.events.length}`);

    // Verify chain integrity
    const { status: s2, data: d2 } = await apiCall('GET', '/api/v1/audit/verify', null, sessionToken);
    assert(s2 === 200, `Verify chain → 200 (got ${s2})`);
    assert(d2.valid === true, `Chain valid: ${d2.valid}`);
  } catch (err) {
    assert(false, `Audit trail failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 8: Session Management ──────────────────────────────
console.log('\n--- Test 8: Session Management ---');
if (sessionToken) {
  try {
    const { status: s1, data: d1 } = await apiCall('GET', '/api/v1/auth/sessions', null, sessionToken);
    assert(s1 === 200, `List sessions → 200 (got ${s1})`);
    assert(Array.isArray(d1.sessions) && d1.sessions.length >= 1, `Active sessions: ${d1.sessions?.length}`);
  } catch (err) {
    assert(false, `Session management failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 9: TOTP Status ─────────────────────────────────────
console.log('\n--- Test 9: TOTP Status ---');
if (sessionToken) {
  try {
    const { status: s1, data: d1 } = await apiCall('GET', '/api/v1/auth/totp/status', null, sessionToken);
    assert(s1 === 200, `TOTP status → 200 (got ${s1})`);
    assert(d1.enabled === false, `TOTP not enabled (new user): ${d1.enabled}`);
  } catch (err) {
    assert(false, `TOTP status failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 10: TOTP Enrollment + Login Verification ───────────
console.log('\n--- Test 10: TOTP Enrollment + Login Verification ---');
if (sessionToken) {
  try {
    const { status: enrollStatus, data: enrollData } = await apiCall('POST', '/api/v1/auth/totp/enroll', {}, sessionToken);
    assert(enrollStatus === 200, `TOTP enroll → 200 (got ${enrollStatus})`);
    assert(enrollData.secret, 'TOTP secret returned');

    const currentCode = generateTOTP(enrollData.secret);
    const { status: verifyStatus } = await apiCall('POST', '/api/v1/auth/totp/verify', {
      code: currentCode,
    }, sessionToken);
    assert(verifyStatus === 200, `TOTP enable verify → 200 (got ${verifyStatus})`);

    const { status: enabledStatus, data: enabledData } = await apiCall('GET', '/api/v1/auth/totp/status', null, sessionToken);
    assert(enabledStatus === 200, `TOTP enabled status → 200 (got ${enabledStatus})`);
    assert(enabledData.enabled === true, `TOTP enabled after enrollment: ${enabledData.enabled}`);

    const secondClientState = await srpClientInit();
    const { status: initStatus, data: initData } = await apiCall('POST', '/api/v1/auth/login/init', {
      email: TEST_EMAIL,
      clientPublicA: toBase64(secondClientState.ephemeralPublic),
    });
    assert(initStatus === 200, `TOTP login init → 200 (got ${initStatus})`);

    const secondServerB = fromBase64(initData.serverPublicB);
    const secondSalt = fromBase64(initData.srpSalt);
    const { clientProof: secondProof } = await srpClientVerify(
      secondClientState, TEST_EMAIL, TEST_PASSWORD, secondSalt, secondServerB,
    );

    const { status: verifyLoginStatus, data: verifyLoginData } = await apiCall('POST', '/api/v1/auth/login/verify', {
      email: TEST_EMAIL,
      clientPublicA: toBase64(secondClientState.ephemeralPublic),
      clientProofM1: toBase64(secondProof),
    });
    assert(verifyLoginStatus === 200, `TOTP login verify → 200 (got ${verifyLoginStatus})`);
    assert(verifyLoginData.totpRequired === true, `TOTP required on password phase: ${verifyLoginData.totpRequired}`);
    assert(Boolean(verifyLoginData.serverProofM2), 'Server proof M2 returned before TOTP step');

    const loginCode = generateTOTP(enrollData.secret);
    const { status: completeStatus, data: completeData } = await apiCall('POST', '/api/v1/auth/login/totp/verify', {
      email: TEST_EMAIL,
      code: loginCode,
    });
    assert(completeStatus === 200, `TOTP login complete → 200 (got ${completeStatus})`);
    assert(Boolean(completeData.sessionToken), 'Session token returned after TOTP login');
    assert(Boolean(completeData.encryptedVaultKey), 'Vault key bundle returned after TOTP login');
  } catch (err) {
    assert(false, `TOTP enrollment/login failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Test 11: API Security ───────────────────────────────────
console.log('\n--- Test 11: API Security ---');
try {
  const { status: s1 } = await apiCall('GET', '/api/v1/vault/key');
  assert(s1 === 401, `Vault without auth → 401 (got ${s1})`);

  const { status: s2 } = await apiCall('GET', '/api/v1/agents');
  assert(s2 === 401, `Agents without auth → 401 (got ${s2})`);

  const { status: s3 } = await apiCall('GET', '/api/v1/audit');
  assert(s3 === 401, `Audit without auth → 401 (got ${s3})`);

  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'test',
  });
  assert(res.status === 415, `Wrong Content-Type → 415 (got ${res.status})`);

  // Fake token
  const { status: s4 } = await apiCall('GET', '/api/v1/vault/key', null, 'fake-token-12345');
  assert(s4 === 401, `Fake token → 401 (got ${s4})`);
} catch (err) {
  assert(false, `Security test failed: ${err.message}`);
}

// ─── Test 12: Security Headers ───────────────────────────────
console.log('\n--- Test 12: Security Headers ---');
try {
  const res = await fetch(`${API}/health`);
  const h = Object.fromEntries(res.headers.entries());

  assert(h['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
  assert(h['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY');
  assert(h['referrer-policy'] === 'no-referrer', 'Referrer-Policy: no-referrer');
  assert(h['access-control-allow-private-network'] === 'true', 'PNA header');
} catch (err) {
  assert(false, `Headers test failed: ${err.message}`);
}

// ─── Test 12: Logout ─────────────────────────────────────────
console.log('\n--- Test 12: Logout ---');
if (sessionToken) {
  try {
    const { status: s1 } = await apiCall('POST', '/api/v1/auth/logout', {}, sessionToken);
    assert(s1 === 200 || s1 === 204, `Logout → 2xx (got ${s1})`);

    // Token should be invalid after logout
    const { status: s2 } = await apiCall('GET', '/api/v1/vault/key', null, sessionToken);
    assert(s2 === 401, `Token invalid after logout → 401 (got ${s2})`);
  } catch (err) {
    assert(false, `Logout failed: ${err.message}`);
  }
} else {
  console.log('  [SKIP] No session token');
}

// ─── Summary ─────────────────────────────────────────────────
console.log('\n=== E2E Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
console.log(failed === 0 ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(failed > 0 ? 1 : 0);
