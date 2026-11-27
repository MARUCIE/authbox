import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPages } from './paginate.ts';

const source = Array.from({ length: 1234 }, (_, i) => i);
const page = async (limit: number, offset: number) => source.slice(offset, offset + limit);

test('collects every page, including an exact multiple of the page size', async () => {
  assert.deepEqual(await collectPages(page, 500), source);
  assert.equal((await collectPages(async (l, o) => source.slice(0, 1000).slice(o, o + l), 500)).length, 1000);
  assert.deepEqual(await collectPages(async () => [], 500), []);
});

test('refuses to return a truncated list', async () => {
  await assert.rejects(collectPages(async (l) => new Array(l).fill(0), 500, 2000), /More than 2000/);
});
