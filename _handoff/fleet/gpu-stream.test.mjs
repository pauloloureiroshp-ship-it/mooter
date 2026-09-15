// gpu-stream.test.mjs — pure tests (no GPU, no spawn assertions on CI).
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseGpuLine, getGpuSample, _injectSample, stopGpuStream } from "./gpu-stream.mjs";

test("parseGpuLine parses a well-formed nvidia-smi CSV row", () => {
  const s = parseGpuLine(" 37, 61, 8123, 24564, 16441 ");
  assert.equal(s.utilPct, 37);
  assert.equal(s.tempC, 61);
  assert.equal(s.usedMb, 8123);
  assert.equal(s.totalMb, 24564);
  assert.equal(s.freeMb, 16441);
  assert.ok(Number.isFinite(s.at));
});

test("parseGpuLine rejects garbage and short rows (honest null)", () => {
  assert.equal(parseGpuLine(""), null);
  assert.equal(parseGpuLine("NVIDIA-SMI has failed"), null);
  assert.equal(parseGpuLine("1, 2, 3"), null);
});

test("getGpuSample: fresh sample is served, stale sample is null (honest n/d)", () => {
  const now = Date.now();
  _injectSample({ utilPct: 10, tempC: 50, usedMb: 100, totalMb: 24564, freeMb: 24000, at: now });
  const fresh = getGpuSample({ now });
  assert.equal(fresh.freeMb, 24000);
  const stale = getGpuSample({ now: now + 10 * 60_000 });
  assert.equal(stale, null);
  stopGpuStream();
});
