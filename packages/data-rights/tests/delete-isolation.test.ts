// Regression for the 2026-08-05 ledger wipe. `packages/cli/tests/data.test.ts`
// isolated itself with `process.env.HOME`, but on Windows `os.homedir()` reads
// USERPROFILE and ignores HOME — so `delete-all --confirm` ran against the real
// `~/.mooter` (232 ledger events destroyed) and the real router decisions.log.
// Isolation must be a mechanism the code under test honours (MOOTER_HOME),
// not an env convention that only holds on POSIX.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteAll } from "../src/delete.ts";

function homeWithState(prefix: string): string {
  const home = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(join(home, ".mooter", "ledger.jsonl"), '{"ts":"2026-08-05T00:00:00.000Z","event":"canary"}\n');
  return home;
}

function withSandboxedEnv<T>(env: Record<string, string>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
  }
}

test("deleteAll targets MOOTER_HOME, never the homedir() fallback", () => {
  const posixHome = homeWithState("mooter-dr-home-");
  const winProfile = homeWithState("mooter-dr-userprofile-");
  const mooterHome = join(mkdtempSync(join(tmpdir(), "mooter-dr-isolated-")), ".mooter");
  mkdirSync(mooterHome, { recursive: true });
  writeFileSync(join(mooterHome, "canary.json"), "{}");

  withSandboxedEnv(
    { HOME: posixHome, USERPROFILE: winProfile, MOOTER_HOME: mooterHome },
    () => {
      // Dry-run: every listed target must live under MOOTER_HOME.
      const dry = deleteAll({ dryRun: true });
      for (const t of dry.skipped) {
        assert.ok(t.startsWith(mooterHome),
          `delete-all aimed outside MOOTER_HOME: ${t} — this is how the real ledger died on 2026-08-05`);
      }

      // Confirmed run: MOOTER_HOME is wiped; both env homes keep their ledgers.
      deleteAll({ confirm: true });
      assert.ok(!existsSync(join(mooterHome, "canary.json")), "isolated state was not wiped");
      assert.ok(existsSync(join(posixHome, ".mooter", "ledger.jsonl")), "HOME ledger must survive");
      assert.ok(existsSync(join(winProfile, ".mooter", "ledger.jsonl")), "USERPROFILE ledger must survive");
    },
  );
});

test("explicit opts.home still wins over MOOTER_HOME", () => {
  const explicit = homeWithState("mooter-dr-explicit-");
  const envHome = join(mkdtempSync(join(tmpdir(), "mooter-dr-env-")), ".mooter");
  mkdirSync(envHome, { recursive: true });
  writeFileSync(join(envHome, "keep.json"), "{}");

  withSandboxedEnv({ MOOTER_HOME: envHome }, () => {
    deleteAll({ confirm: true, home: explicit });
    assert.ok(!existsSync(join(explicit, ".mooter", "ledger.jsonl")), "explicit home was not wiped");
    assert.ok(existsSync(join(envHome, "keep.json")), "MOOTER_HOME must survive when opts.home is explicit");
  });
});
