// Run with: npm test (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUri, parseStoredItem, uriMatchesPage } from './item-format.ts';

const meta = { id: 'i1', itemType: 'login', revision: 2, createdAt: 'c', updatedAt: 'u' };

test('reads the payload shape the web app writes', () => {
  const plaintext = JSON.stringify({
    name: 'GitHub',
    data: { username: 'me', password: 'pw', uri: 'github.com', notes: 'n' },
    favorite: true,
  });
  const item = parseStoredItem(plaintext, meta) as unknown as Record<string, unknown>;
  assert.equal(item.name, 'GitHub');
  assert.equal(item.username, 'me');
  assert.equal(item.password, 'pw');
  assert.deepEqual(item.uri, ['https://github.com']);
  assert.equal(item.id, 'i1');
  assert.equal(item.favorite, true);
});

test('a login without a saved address has an empty uri list', () => {
  const item = parseStoredItem(JSON.stringify({ name: 'x', data: { username: 'a', password: 'b' } }), meta);
  assert.deepEqual((item as unknown as { uri: string[] }).uri, []);
});

test('matches by exact origin, never by substring', () => {
  assert.equal(uriMatchesPage('github.com', 'https://github.com/login'), true);
  assert.equal(uriMatchesPage('https://www.github.com', 'https://github.com/'), true);
  assert.equal(uriMatchesPage('github.com', 'https://hub.com/'), false);
  assert.equal(uriMatchesPage('github.com', 'https://b.com/'), false);
  assert.equal(uriMatchesPage('github.com', 'https://github.com.evil.example/'), false);
  assert.equal(uriMatchesPage('https://bank.example', 'http://bank.example/'), false);
  assert.equal(uriMatchesPage('https://app.example:8443', 'https://app.example/'), false);
  assert.equal(uriMatchesPage('not a url at all', 'https://a.com/'), false);
  assert.equal(uriMatchesPage('javascript:alert(1)', 'https://a.com/'), false);
});

test('normalizeUri keeps an existing scheme', () => {
  assert.equal(normalizeUri('http://x.test'), 'http://x.test');
  assert.equal(normalizeUri(' x.test '), 'https://x.test');
  assert.equal(normalizeUri(''), '');
});
