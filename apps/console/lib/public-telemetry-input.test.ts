import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clip,
  normalizeMetadata,
  normalizeTimestamp,
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
