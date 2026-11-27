import { describe, expect, it } from 'vitest';
import { collectPages } from './paginate.js';

const source = Array.from({ length: 1234 }, (_, i) => i);
const page = async (limit: number, offset: number) => source.slice(offset, offset + limit);

describe('collectPages', () => {
  it('collects every page, including an exact multiple of the page size', async () => {
    expect(await collectPages(page, 500)).toEqual(source);
    expect((await collectPages(async (l, o) => source.slice(0, 1000).slice(o, o + l), 500)).length).toBe(1000);
    expect(await collectPages(async () => [], 500)).toEqual([]);
  });

  it('refuses to return a truncated list', async () => {
    await expect(collectPages(async (l) => new Array(l).fill(0), 500, 2000)).rejects.toThrow(/More than 2000/);
  });
});
