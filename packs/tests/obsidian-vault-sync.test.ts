// obsidian-vault-sync pack tests (Wave 31). Uses a synthetic vault (temp dir with
// .obsidian/ + Johnny-Decimal folders) via MOOTER_VAULT, and a temp MOOTER_HOME.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectVaults, primaryVault } from "../obsidian-vault-sync/vault-detector.ts";
import { renderLearningsNote, writeLearnings, collectLearnings } from "../obsidian-vault-sync/sync-write.ts";
import { parsePreferences, readPreferences } from "../obsidian-vault-sync/sync-read.ts";
import { install, uninstall, sync } from "../obsidian-vault-sync/pack.ts";

let vault: string;
let mhome: string;
const prevVault = process.env.MOOTER_VAULT;
const prevHome = process.env.MOOTER_HOME;

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), "mooter-vault-"));
  mhome = mkdtempSync(join(tmpdir(), "mooter-home-"));
  mkdirSync(join(vault, ".obsidian"), { recursive: true });
  mkdirSync(join(vault, "00-core"), { recursive: true });
  mkdirSync(join(vault, "10-projects"), { recursive: true });
  process.env.MOOTER_VAULT = vault;
  process.env.MOOTER_HOME = mhome;
});
afterEach(() => {
  if (prevVault === undefined) delete process.env.MOOTER_VAULT;
  else process.env.MOOTER_VAULT = prevVault;
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(vault, { recursive: true, force: true });
  rmSync(mhome, { recursive: true, force: true });
});

// ── detector ──────────────────────────────────────────────────────────────────

test("detectVaults finds a vault with .obsidian/ and flags Johnny-Decimal", () => {
  const vaults = detectVaults();
  const v = vaults.find((x) => x.path === vault);
  assert.ok(v, "explicit MOOTER_VAULT should be detected");
  assert.equal(v?.johnny_decimal, true);
});

test("primaryVault returns the explicit MOOTER_VAULT first", () => {
  assert.equal(primaryVault()?.path, vault);
});

test("a directory without .obsidian/ is not a vault", () => {
  const notVault = mkdtempSync(join(tmpdir(), "not-vault-"));
  process.env.MOOTER_VAULT = notVault;
  assert.equal(primaryVault()?.path !== notVault, true);
  rmSync(notVault, { recursive: true, force: true });
});

// ── write direction ───────────────────────────────────────────────────────────

test("renderLearningsNote produces frontmatter + a table", () => {
  const note = renderLearningsNote(
    { registered: 5, active_type: "coding-frontend", usage: { "pastor-frontend": { count: 3, avg_confidence: 0.81, last_used: "2026-06-07T10:00:00.000Z" } } },
    "2026-06-07",
  );
  assert.ok(note.startsWith("---\n"));
  assert.ok(note.includes("coding-frontend"));
  assert.ok(note.includes("pastor-frontend"));
});

test("writeLearnings creates <vault>/Mooter/learnings-<date>.md", () => {
  const res = writeLearnings(vault, "2026-06-07", { registered: 5, active_type: null, usage: {} });
  assert.ok(res.ok);
  assert.ok(res.path && res.path.endsWith(join("Mooter", "learnings-2026-06-07.md")));
  assert.ok(existsSync(res.path!));
});

test("writeLearnings fails gracefully on a missing vault path", () => {
  const res = writeLearnings(join(tmpdir(), "does-not-exist-xyz"), "2026-06-07");
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /not found/);
});

test("collectLearnings reads pastor state from MOOTER_HOME", () => {
  mkdirSync(join(mhome, "pastor"), { recursive: true });
  writeFileSync(
    join(mhome, "pastor", "adapters-active.json"),
    JSON.stringify({ registered: 5, active_type: "coding-data", usage: { "pastor-data": { count: 2, avg_confidence: 0.7, last_used: "2026-06-07T00:00:00.000Z" } } }),
  );
  const l = collectLearnings();
  assert.equal(l.registered, 5);
  assert.equal(l.active_type, "coding-data");
});

// ── read direction ────────────────────────────────────────────────────────────

test("parsePreferences reads known keys, ignores unknown", () => {
  const p = parsePreferences("- preferred_lang: pt\n- autoswap: true\n- bogus_key: x\nprefer_adapter: coding-frontend");
  assert.equal(p.preferred_lang, "pt");
  assert.equal(p.autoswap, true);
  assert.equal(p.prefer_adapter, "coding-frontend");
  assert.equal((p as Record<string, unknown>).bogus_key, undefined);
});

test("readPreferences imports preferences.md → vault-priors.json", () => {
  mkdirSync(join(vault, "Mooter"), { recursive: true });
  writeFileSync(join(vault, "Mooter", "preferences.md"), "- preferred_lang: en\n- autoswap: false\n");
  const res = readPreferences(vault, new Date("2026-06-07T00:00:00.000Z"));
  assert.ok(res.ok);
  assert.equal(res.priors.preferred_lang, "en");
  assert.ok(existsSync(join(mhome, "pastor", "vault-priors.json")));
});

test("readPreferences is a no-op when preferences.md is absent", () => {
  const res = readPreferences(vault);
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /no Mooter\/preferences\.md/);
});

// ── lifecycle ─────────────────────────────────────────────────────────────────

test("install seeds Mooter/ with README + starter preferences (idempotent)", () => {
  const first = install();
  assert.ok(first.ok);
  assert.ok(existsSync(join(vault, "Mooter", "README.md")));
  assert.ok(existsSync(join(vault, "Mooter", "preferences.md")));
  assert.equal(first.created.length, 2);
  const second = install();
  assert.equal(second.created.length, 0); // idempotent
});

test("uninstall is non-destructive", () => {
  install();
  const res = uninstall();
  assert.ok(res.ok);
  assert.ok(existsSync(join(vault, "Mooter", "README.md"))); // notes intact
});

test("sync writes learnings AND imports preferences in one call", () => {
  install();
  const res = sync({ date: "2026-06-07" });
  assert.ok(res.ok);
  assert.ok(res.write?.ok);
  assert.ok(existsSync(join(vault, "Mooter", "learnings-2026-06-07.md")));
  assert.ok(res.read?.ok); // install seeded preferences.md → import succeeds
  assert.ok(existsSync(join(mhome, "pastor", "vault-priors.json")));
});
