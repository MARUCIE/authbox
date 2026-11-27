import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChrome } from './import-parsers.ts';

test('a password keeps its leading and trailing spaces', () => {
  const { items } = parseChrome('name,url,username,password\nSite,https://a.example,me, p@ss \n');
  assert.equal(items.length, 1);
  assert.equal(items[0].password, ' p@ss ');
  assert.equal(items[0].username, 'me');
});
