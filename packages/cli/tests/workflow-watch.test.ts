// Wave 32 (Phase E) — `mooter workflow watch` control-plane flags. These need no
// engine/native deps, so they run in the bundled CLI too. Isolated HOME.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runWorkflow } from "../src/commands/workflow.ts";

function withHome<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "mooter-wfw-"));
  process.env.HOME = home;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
  });
}

test("watch without run_id errors", async () => {
  const r = await runWorkflow(["watch"]);
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /run_id is required/);
});

test("watch --pause writes a control intent", async () => {
  await withHome(async () => {
    const r = await runWorkflow(["watch", "wf_test1", "--pause"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /pause intent/);
    const p = join(process.env.HOME!, ".mooter", "workflow-control", "wf_test1.json");
    assert.ok(existsSync(p), "control file written");
    assert.strictEqual(JSON.parse(readFileSync(p, "utf8")).run, "paused");
  });
});

test("watch --resume then --kill update the same control file", async () => {
  await withHome(async () => {
    await runWorkflow(["watch", "wf_test2", "--pause"]);
    await runWorkflow(["watch", "wf_test2", "--resume"]);
    let p = join(process.env.HOME!, ".mooter", "workflow-control", "wf_test2.json");
    assert.strictEqual(JSON.parse(readFileSync(p, "utf8")).run, "running");
    const r = await runWorkflow(["watch", "wf_test2", "--kill"]);
    assert.match(r.output, /kill intent/);
    assert.strictEqual(JSON.parse(readFileSync(p, "utf8")).run, "kill");
  });
});

test("watch --kill-agent marks a single agent", async () => {
  await withHome(async () => {
    const r = await runWorkflow(["watch", "wf_test3", "--kill-agent", "verify:auth"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /agent 'verify:auth'/);
    const p = join(process.env.HOME!, ".mooter", "workflow-control", "wf_test3.json");
    assert.strictEqual(JSON.parse(readFileSync(p, "utf8")).agents["verify:auth"], "kill");
  });
});
