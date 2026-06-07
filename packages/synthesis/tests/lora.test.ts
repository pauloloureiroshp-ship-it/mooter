import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listAdapters,
  getAdapter,
  registerAdapter,
  removeAdapter,
  loadAdapter,
  selectAdapterForTask,
  AUTO_SWAP_ENABLED,
  DEFAULT_ADAPTERS,
  type LoraAdapter,
} from "../src/index.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-lora-"));
  process.env.MOOTER_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

const ollamaUp = () => ({ status: 0 });
const ollamaDown = () => ({ status: 1 });

test("empty registry returns the seeded default adapter", () => {
  const adapters = listAdapters();
  assert.equal(adapters.length, DEFAULT_ADAPTERS.length);
  assert.ok(adapters.some((a) => a.name === "pastor-v1-default"));
});

test("registerAdapter persists and getAdapter retrieves; removeAdapter deletes", () => {
  const a: LoraAdapter = {
    name: "pt-pt-brevity",
    base_model: "qwen2.5-coder:7b",
    path: "",
    task_tags: ["pt-pt", "brevity"],
    trained_on: "user",
    registered_at: "2026-06-07T00:00:00.000Z",
    wave_ready: 29,
  };
  registerAdapter(a);
  assert.equal(getAdapter("pt-pt-brevity")?.base_model, "qwen2.5-coder:7b");
  assert.equal(removeAdapter("pt-pt-brevity"), true);
  assert.equal(getAdapter("pt-pt-brevity"), null);
  assert.equal(removeAdapter("pt-pt-brevity"), false);
});

test("routing-stub never auto-selects an adapter (Wave 29)", () => {
  assert.equal(AUTO_SWAP_ENABLED, false);
  assert.equal(selectAdapterForTask({ prompt_class: "T2", task_tags: ["pt-pt"] }), null);
  assert.equal(selectAdapterForTask({}), null);
});

test("loadAdapter: not_found for unknown adapter", () => {
  const r = loadAdapter("nope", { spawn: ollamaUp });
  assert.equal(r.loaded, false);
  assert.equal(r.reason, "not_found");
});

test("loadAdapter: ollama_unreachable when Ollama is down", () => {
  const r = loadAdapter("pastor-v1-default", { spawn: ollamaDown });
  assert.equal(r.reason, "ollama_unreachable");
  assert.equal(r.loaded, false);
});

test("loadAdapter: no_path when registered but not materialised", () => {
  const r = loadAdapter("pastor-v1-default", { spawn: ollamaUp });
  assert.equal(r.reason, "no_path");
});

test("loadAdapter: deferred when materialised but wave_ready > current", () => {
  const file = join(home, "adapter.gguf");
  writeFileSync(file, "stub");
  registerAdapter({
    name: "future-lora",
    base_model: "qwen3:30b",
    path: file,
    task_tags: ["routing"],
    trained_on: "global",
    registered_at: "2026-06-07T00:00:00.000Z",
    wave_ready: 31,
  });
  const r = loadAdapter("future-lora", { spawn: ollamaUp });
  assert.equal(r.reason, "deferred");
  assert.equal(r.wave_ready, 31);
  assert.equal(r.loaded, false);
});

test("loadAdapter: ready when materialised and wave_ready <= current", () => {
  const file = join(home, "ready.gguf");
  writeFileSync(file, "stub");
  registerAdapter({
    name: "now-lora",
    base_model: "qwen3:30b",
    path: file,
    task_tags: ["routing"],
    trained_on: "user",
    registered_at: "2026-06-07T00:00:00.000Z",
    wave_ready: 29,
  });
  const r = loadAdapter("now-lora", { spawn: ollamaUp });
  assert.equal(r.reason, "ready");
  assert.equal(r.loaded, false); // no actual swap in Wave 29
});
