import { describe, expect, it } from 'vitest';
import { fromBase64, fromHex, toBase64, toHex } from '../encoding';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) {
    crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  }
  return out;
}

describe('base64', () => {
  it('matches the RFC 4648 test vectors', () => {
    const vectors: Array<[string, string]> = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      const bytes = new TextEncoder().encode(plain);
      expect(toBase64(bytes)).toBe(encoded);
      expect(fromBase64(encoded)).toEqual(bytes);
    }
  });

  it('agrees with Node Buffer on every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(toBase64(all)).toBe(Buffer.from(all).toString('base64'));
    expect(fromBase64(Buffer.from(all).toString('base64'))).toEqual(all);
  });

  // Regression: the per-app helpers used String.fromCharCode(...bytes),
  // which throws RangeError for blobs of a few hundred KB.
  it('round-trips a 2 MB blob without overflowing the call stack', () => {
    const big = randomBytes(2 * 1024 * 1024);
    const encoded = toBase64(big);
    expect(encoded === Buffer.from(big).toString('base64')).toBe(true);
    expect(Buffer.from(fromBase64(encoded)).equals(Buffer.from(big))).toBe(true);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => fromBase64('not base64!')).toThrow();
  });
});

describe('hex', () => {
  it('encodes lowercase and round-trips', () => {
    const bytes = Uint8Array.from([0, 1, 0x0a, 0xab, 0xff]);
    expect(toHex(bytes)).toBe('00010aabff');
    expect(fromHex('00010AABFF')).toEqual(bytes);
  });

  it('rejects odd-length input', () => {
    expect(() => fromHex('abc')).toThrow();
  });
});
