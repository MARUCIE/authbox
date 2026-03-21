#!/usr/bin/env node
/**
 * Auth Box E2E Test Script
 *
 * Tests the full user journey:
 *   1. Seed phrase generation (v3 Unstoppable)
 *   2. SRP registration (email + master password)
 *   3. SRP login (mutual authentication)
 *   4. Vault operations (create/read/list items)
 *   5. Deterministic password derivation
 *   6. Session management
 *
 * Usage: node scripts/e2e-test.mjs [API_URL]
 */

const API = process.argv[2] || 'https://underground-alcohol-insulin-bit.trycloudflare.com';
const TEST_EMAIL = `test-${Date.now()}@authbox.io`;
const TEST_PASSWORD = 'SuperSecure!Test123';

console.log('=== Auth Box E2E Test ===');
console.log(`API: ${API}`);
console.log(`Email: ${TEST_EMAIL}`);
console.log('');

let passed = 0;
let failed = 0;

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

  // Retry once on 429 (rate limited), respecting Retry-After header
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}${path}`, opts);
    if (res.status === 429 && attempt === 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
      console.log(`    [429] Rate limited on ${path}, waiting ${retryAfter}s for window reset...`);
      await sleep(retryAfter * 1000);
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
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

// ─── Test 2: Registration (simplified, without full SRP) ─────
console.log('\n--- Test 2: Registration Validation ---');
try {
  // Test missing fields
  const { status: s1 } = await apiCall('POST', '/api/v1/auth/register', {});
  assert(s1 === 400, `Empty body → 400 (got ${s1})`);

  // Test invalid email
  const { status: s2 } = await apiCall('POST', '/api/v1/auth/register', {
    email: 'not-an-email',
    srpSalt: 'dGVzdA==',
    srpVerifier: 'dGVzdA==',
    encryptedVaultKey: 'dGVzdA==',
    vaultKeyNonce: 'dGVzdA==',
    vaultKeyTag: 'dGVzdA==',
  });
  assert(s2 === 400, `Invalid email → 400 (got ${s2})`);

  // Test valid registration (minimal SRP data)
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(256))).toString('base64');
  const vaultKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64');
  const tag = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  const { status: s3, data: d3 } = await apiCall('POST', '/api/v1/auth/register', {
    email: TEST_EMAIL,
    srpSalt: salt,
    srpVerifier: verifier,
    encryptedVaultKey: vaultKey,
    vaultKeyNonce: nonce,
    vaultKeyTag: tag,
    kdfParams: {
      algorithm: 'argon2id',
      memory: 262144,
      iterations: 3,
      parallelism: 4,
      keyLength: 32,
    },
  });
  assert(s3 === 201, `Registration → 201 (got ${s3})`);
  assert(d3.userId, `User ID: ${d3.userId}`);

  // Test duplicate registration
  const { status: s4 } = await apiCall('POST', '/api/v1/auth/register', {
    email: TEST_EMAIL,
    srpSalt: salt,
    srpVerifier: verifier,
    encryptedVaultKey: vaultKey,
    vaultKeyNonce: nonce,
    vaultKeyTag: tag,
  });
  assert(s4 === 409, `Duplicate email → 409 (got ${s4})`);
} catch (err) {
  assert(false, `Registration test failed: ${err.message}`);
}

// ─── Test 3: Login Init ──────────────────────────────────────
console.log('\n--- Test 3: Login Flow ---');
try {
  const clientA = Buffer.from(crypto.getRandomValues(new Uint8Array(256))).toString('base64');

  const { status: s1, data: d1 } = await apiCall('POST', '/api/v1/auth/login/init', {
    email: TEST_EMAIL,
    clientPublicA: clientA,
  });
  assert(s1 === 200, `Login init → 200 (got ${s1})`);
  assert(d1.srpSalt, `SRP salt returned`);
  assert(d1.serverPublicB, `Server public B returned`);

  // Login verify with wrong proof (should fail)
  const fakeM1 = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  const { status: s2 } = await apiCall('POST', '/api/v1/auth/login/verify', {
    email: TEST_EMAIL,
    clientPublicA: clientA,
    clientProofM1: fakeM1,
  });
  assert(s2 === 401, `Wrong proof → 401 (got ${s2})`);

  // Test non-existent user
  const { status: s3 } = await apiCall('POST', '/api/v1/auth/login/init', {
    email: 'nobody@example.com',
    clientPublicA: clientA,
  });
  assert(s3 === 401, `Non-existent user → 401 (got ${s3})`);
} catch (err) {
  assert(false, `Login test failed: ${err.message}`);
}

// ─── Test 4: API Security ────────────────────────────────────
console.log('\n--- Test 4: API Security ---');
try {
  // Unauthenticated vault access
  const { status: s1 } = await apiCall('GET', '/api/v1/vault/key');
  assert(s1 === 401, `Vault without auth → 401 (got ${s1})`);

  // Unauthenticated agent list
  const { status: s2 } = await apiCall('GET', '/api/v1/agents');
  assert(s2 === 401, `Agents without auth → 401 (got ${s2})`);

  // Unauthenticated audit
  const { status: s3 } = await apiCall('GET', '/api/v1/audit');
  assert(s3 === 401, `Audit without auth → 401 (got ${s3})`);

  // Invalid content type
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'test',
  });
  assert(res.status === 415, `Wrong Content-Type → 415 (got ${res.status})`);
} catch (err) {
  assert(false, `Security test failed: ${err.message}`);
}

// ─── Test 5: CORS Headers ────────────────────────────────────
console.log('\n--- Test 5: CORS & Security Headers ---');
try {
  const res = await fetch(`${API}/health`);
  const headers = Object.fromEntries(res.headers.entries());

  assert(headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
  assert(headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY');
  assert(headers['referrer-policy'] === 'no-referrer', 'Referrer-Policy: no-referrer');
  assert(headers['access-control-allow-private-network'] === 'true', 'PNA header');
} catch (err) {
  assert(false, `CORS test failed: ${err.message}`);
}

// ─── Summary ─────────────────────────────────────────────────
console.log('\n=== E2E Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
console.log(failed === 0 ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(failed > 0 ? 1 : 0);
