// Wave 5 D1 — `mooter adapter` CLI (honest stubs). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAdapterList, runAdapterShow, runAdapterActivate, runAdapterDeactivate } from "../src/commands/adapter.ts";

function home(): string {
  return mkdtempSync(join(tmpdir(), "mooter-adapter-"));
}
function withManifest(h: string, m: Record<string, unknown>): void {
  const dir = join(h, "adapters", String(m.adapter_id));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
}

test("list: empty → honest message + 'Wave 5 D2 ships training'", () => {
  const res = runAdapterList({ mooterHome: home() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /No adapters installed yet/);
  assert.match(res.output, /Wave 5 D2/);
  assert.match(res.output, /docs\/adr\/020/);
});

test("list: with an installed manifest → shows it + 'not benchmarked'", () => {
  const h = home();
  withManifest(h, { adapter_id: "deadbeef00112233", name: "diagram-v1", adapter_type: "lora", quantization: "q4_k_m", domain: "diagram-systems" });
  const res = runAdapterList({ mooterHome: h });
  assert.match(res.output, /diagram-v1 \(lora\/q4_k_m\)/);
  assert.match(res.output, /not benchmarked yet/);
});

test("activate: writes prefs + honest 'D1 stub' warning", () => {
  const h = home();
  const res = runAdapterActivate("deadbeef00112233", { mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Marked deadbeef0011/);
  assert.match(res.output, /runtime selection is stubbed/);
  assert.match(res.output, /still shows baseline/);
  const prefs = JSON.parse(readFileSync(join(h, "preferences.json"), "utf8"));
  assert.equal(prefs.active_adapter_id, "deadbeef00112233");
});

test("list: after activate shows the ✓ + the not-honored-yet warning", () => {
  const h = home();
  withManifest(h, { adapter_id: "deadbeef00112233", name: "diagram-v1", adapter_type: "lora", quantization: "q4_k_m" });
  runAdapterActivate("deadbeef00112233", { mooterHome: h });
  const res = runAdapterList({ mooterHome: h });
  assert.match(res.output, /✓ diagram-v1/);
  assert.match(res.output, /NOT honored until D2/);
});

test("deactivate: clears active_adapter_id", () => {
  const h = home();
  runAdapterActivate("x", { mooterHome: h });
  const res = runAdapterDeactivate({ mooterHome: h });
  assert.match(res.output, /back to baseline/);
  const prefs = JSON.parse(readFileSync(join(h, "preferences.json"), "utf8"));
  assert.equal(prefs.active_adapter_id, undefined);
});

test("show: found → validated view (NIT W5 D1 #1); not found → exit 1", () => {
  const h = home();
  // An unsigned manifest with a (would-be) performance number must NOT render perf.
  withManifest(h, { adapter_id: "abc123def456", name: "x", base_model: "qwen2.5:3b", adapter_type: "lora", quantization: "q8_0", performance: { accuracy_delta: 0.9, benchmark_run_id: "fake" } });
  const out = runAdapterShow("abc123", { mooterHome: h }).output;
  assert.match(out, /Adapter: x/);
  assert.match(out, /signature: ✗ INVALID/, "unsigned manifest flagged");
  assert.match(out, /performance: ◌ not shown \(manifest not validated\)/, "perf hidden for invalid manifest");
  assert.ok(!/90\.0% vs baseline/.test(out), "forged perf number never displayed");
  assert.equal(runAdapterShow("nope", { mooterHome: h }).exitCode, 1);
});
