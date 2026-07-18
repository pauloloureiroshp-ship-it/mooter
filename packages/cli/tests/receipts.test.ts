import { test } from "node:test";
import assert from "node:assert/strict";

import { loadReceiptsCore, runReceipts, RECEIPTS_USAGE } from "../src/commands/receipts.ts";

test("runReceipts delegates unchanged args to the read-only receipt engine", () => {
  let seen: string[] = [];
  const result = runReceipts(["--json", "--last", "2"], {
    core: {
      command(args) {
        seen = args;
        return '{"read_only":true}\n';
      },
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, '{"read_only":true}');
  assert.deepEqual(seen, ["--json", "--last", "2"]);
});

test("runReceipts help is local and does not load the engine", () => {
  const result = runReceipts(["--help"], { core: null });
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, RECEIPTS_USAGE);
  assert.match(result.output, /--fleet-ledger/);
});

test("missing receipt engine is explicit, never an empty green table", () => {
  const result = runReceipts([], { core: null });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /measurement engine unavailable/);
});

test("source checkout resolves the repo-local receipt engine lazily", () => {
  const core = loadReceiptsCore();
  assert.ok(core);
  assert.equal(typeof core!.command, "function");
});
