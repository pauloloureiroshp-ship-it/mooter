// Wave 33 (B.3) — MiniMax M3 watcher · install planning · state · chip.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { checkAvailability } from "../src/watcher.ts";
import { readState, writeState, pickRepo, planInstall, install, statusChip } from "../src/install.ts";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as typeof fetch;
}

// ── watcher ───────────────────────────────────────────────────────────────────
test("checkAvailability reports not-yet when HF has no M3 GGUF (only M2.7)", async () => {
  const r = await checkAvailability({ fetchImpl: fakeFetch([{ id: "ox-ox/MiniMax-M2.7-GGUF" }]) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.available, false);
  assert.deepStrictEqual(r.repos, []);
});

test("checkAvailability detects a real M3 GGUF repo", async () => {
  const r = await checkAvailability({ fetchImpl: fakeFetch([{ id: "ox-ox/MiniMax-M3-GGUF" }, { id: "x/other" }]) });
  assert.strictEqual(r.available, true);
  assert.deepStrictEqual(r.repos, ["ox-ox/MiniMax-M3-GGUF"]);
});

test("checkAvailability reports ok:false on a network failure (never throws)", async () => {
  const r = await checkAvailability({ fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.available, false);
});

// ── repo pick ─────────────────────────────────────────────────────────────────
test("pickRepo honours the preferred-uploader order", () => {
  assert.strictEqual(pickRepo(["z/MiniMax-M3-GGUF", "ubergarm/MiniMax-M3-GGUF"]), "ubergarm/MiniMax-M3-GGUF");
  assert.strictEqual(pickRepo(["ox-ox/MiniMax-M3-GGUF", "ubergarm/MiniMax-M3-GGUF"]), "ox-ox/MiniMax-M3-GGUF");
  assert.strictEqual(pickRepo([]), null);
});

// ── install + state ───────────────────────────────────────────────────────────
test("planInstall refuses until weights are marked available", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-mm-");
  const p = planInstall(home);
  assert.strictEqual(p.ready, false);
  assert.match(p.note, /not available yet/);
});

test("install runs the ollama-create plan once available, and sets installed", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-mm2-");
  writeState({ available: true, repo: "ox-ox/MiniMax-M3-GGUF" }, home);
  const cmds: string[] = [];
  const r = install(home, { run: true, exec: (c) => cmds.push(c) });
  assert.strictEqual(r.installed, true);
  assert.ok(cmds.some((c) => c.includes("ollama create minimax-m3")));
  assert.strictEqual(readState(home).installed, true);
});

test("statusChip prompts install only when available and not installed", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-mm3-");
  assert.strictEqual(statusChip(home), null);
  writeState({ available: true, repo: "ox-ox/MiniMax-M3-GGUF" }, home);
  assert.match(statusChip(home)!, /MiniMax M3/);
  writeState({ installed: true }, home);
  assert.strictEqual(statusChip(home), null);
});
