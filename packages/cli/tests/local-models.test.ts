// Wave 49 (Phase 2) — `mooter local-models`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runLocalModels } from "../src/commands/local-models.ts";

test("local-models help: usage lists the four subcommands, no routing claim", async () => {
  const res = await runLocalModels([]);
  assert.equal(res.exitCode, 0);
  for (const sub of ["list", "recommend", "install", "switch-default"]) {
    assert.match(res.output, new RegExp(`\\b${sub}\\b`), `usage mentions ${sub}`);
  }
  assert.match(res.output, /does not change classify\.js routing/i, "honest: no routing change");
});

test("local-models recommend: shows models with an explicit 'advisory' caveat", async () => {
  const res = await runLocalModels(["recommend"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /qwen3\.6:27b/);
  assert.match(res.output, /qwen2\.5-coder:32b/);
  assert.match(res.output, /NOT independently benchmarked by Mooter/i, "honest about benchmark provenance");
});

test("local-models unknown subcommand → exit 1 + usage", async () => {
  const res = await runLocalModels(["bogus"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Unknown subcommand "bogus"/);
});

test("local-models install without a model → exit 1", async () => {
  const res = await runLocalModels(["install"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Usage: mooter local-models install/);
});

test("local-models switch-default prints the env export it relies on (honest wiring)", async () => {
  const res = await runLocalModels(["switch-default", "qwen3.6:27b"]);
  // Either honored (writes config + prints export) or rejected because not installed —
  // both are exit-coded correctly; when honored it must name the env var it relies on.
  if (res.exitCode === 0) {
    assert.match(res.output, /ROUTER_OLLAMA_GENERAL=qwen3\.6:27b/);
    assert.match(res.output, /does not edit classify\.js/i);
  } else {
    assert.match(res.output, /not installed/i);
  }
});
