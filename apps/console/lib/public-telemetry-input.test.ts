import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clip,
  normalizeMetadata,
  normalizeTimestamp,
  readBodyLimited,
  MAX_METADATA_ENTRIES,
  MAX_METADATA_VALUE_LENGTH
} from "./public-telemetry-input.ts";

test("strings are cut to their limit and blanks dropped", () => {
  assert.equal(clip("x".repeat(500), 64)?.length, 64);
  assert.equal(clip("   ", 64), undefined);
  assert.equal(clip(42, 64), undefined);
});

test("metadata keeps a bounded number of short scalar entries", () => {
  const big: Record<string, unknown> = {};
  for (let i = 0; i < 100; i++) big[`k${i}`] = "v".repeat(1000);
  big.nested = { a: 1 };
  const out = normalizeMetadata(big)!;
  assert.equal(Object.keys(out).length, MAX_METADATA_ENTRIES);
  assert.equal(out.k0.length, MAX_METADATA_VALUE_LENGTH);
  assert.equal(normalizeMetadata(["a"]), undefined);
});

test("timestamps must parse", () => {
  assert.equal(normalizeTimestamp("2026-11-27T08:00:00Z"), "2026-11-27T08:00:00.000Z");
  assert.equal(normalizeTimestamp("not a date"), undefined);
  assert.equal(normalizeTimestamp("x".repeat(100)), undefined);
});

test("a body is cut off once it passes the limit, without a length header", async () => {
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(1024));
    }
  });
  assert.equal(await readBodyLimited(endless, 8 * 1024), null);
  assert.ok(pulled < 20, `read ${pulled} chunks`);
  const small = new Blob(["{\"event\":\"x\"}"]).stream();
  assert.equal(await readBodyLimited(small, 8 * 1024), '{"event":"x"}');
});
