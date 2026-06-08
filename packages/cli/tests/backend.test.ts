// Wave 32 (Phase H/I) — `mooter backend` command with injected probe + fetch.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackend } from "../src/commands/backend.ts";
import type { ProbeFns } from "../../../vllm-backend/src/index.ts";

const NO_GPU: ProbeFns = { hasCommand: () => true, hasNvidiaGpu: () => false };
const GPU: ProbeFns = { hasCommand: () => true, hasNvidiaGpu: () => true };

function withHome<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.HOME;
  process.env.HOME = mkdtempSync(join(tmpdir(), "mooter-be-"));
  return fn().finally(() => { if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev; });
}

test("status: Ollama default when vLLM not enabled, no probe of vLLM", async () => {
  await withHome(async () => {
    let probed = false;
    const fetchImpl = (async () => { probed = true; return new Response("", { status: 200 }); }) as any;
    const r = await runBackend(["status"], { fetchImpl });
    assert.match(r.output, /active:   ollama/);
    assert.strictEqual(probed, false);
  });
});

test("install vllm without GPU refuses honestly, exit 1", async () => {
  await withHome(async () => {
    const r = await runBackend(["install", "vllm"], { probe: NO_GPU });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /prereqs MISSING|Staying on Ollama/);
  });
});

test("install vllm with GPU (dry-run) shows the plan and does not enable", async () => {
  await withHome(async () => {
    const r = await runBackend(["install", "vllm"], { probe: GPU });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /pip install vllm/);
    let enabled: unknown;
    try { enabled = JSON.parse(readFileSync(join(process.env.HOME!, ".mooter", "preferences.json"), "utf8")).vllm_enabled; } catch { enabled = undefined; }
    assert.notStrictEqual(enabled, true, "dry-run must not enable vLLM");
  });
});

test("uninstall vllm disables the flag", async () => {
  await withHome(async () => {
    const r = await runBackend(["uninstall", "vllm"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /Back to Ollama-only/);
    const prefs = JSON.parse(readFileSync(join(process.env.HOME!, ".mooter", "preferences.json"), "utf8"));
    assert.strictEqual(prefs.vllm_enabled, false);
  });
});
