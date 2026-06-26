// Wave 5 "Rankings-as-proof" — `mooter rankings build` honest JOIN + command.
//
// The gate the brief demands: valid JSON; unmeasured cell → null (anti-fabrication);
// TES taken verbatim from the calculator (not recomputed by hand); verdict matches
// the router's own choice (decideAgent); deterministic; resilient command paths.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRankings, runRankings } from "../src/commands/rankings.ts";
import { MATRIX_MODELS } from "../../router/src/specialization-matrix.ts";
import { TASK_CATEGORIES } from "../../router/src/task-categories.ts";
import { computeTES } from "../../router/src/tes-calculator.ts";
import { decideAgent } from "../../router/src/decide-agent.ts";

const FIXED_NOW = 1_750_000_000_000; // deterministic stamp for the seed metadata

// ── shape ─────────────────────────────────────────────────────────────────────

test("buildRankings: schema + full coverage of categories and models", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  assert.equal(seed.schema, "mooter-rankings-v1");
  assert.equal(seed.categories.length, TASK_CATEGORIES.length);
  assert.equal(seed.models_total, MATRIX_MODELS.length);
  for (const cat of seed.categories) {
    assert.equal(seed.rows[cat].length, MATRIX_MODELS.length, `every model present in ${cat}`);
  }
  assert.equal(seed.generated_utc, new Date(FIXED_NOW).toISOString());
});

// ── anti-fabrication (the headline invariant) ──────────────────────────────────

test("anti-fabrication: unmeasured cell → score null (NEVER 0); pending price → null (NEVER 0)", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  let measured = 0;
  for (const cat of seed.categories) {
    for (const r of seed.rows[cat]) {
      if (!r.quality.measured) {
        assert.equal(r.quality.score, null, `${r.model}/${cat}: unmeasured must be null`);
        assert.equal(r.quality.source, null);
      } else {
        measured++;
        // measured cells carry a numeric score OR null (qualitative) — never undefined.
        assert.ok(r.quality.score === null || typeof r.quality.score === "number");
        assert.equal(typeof r.quality.source, "string");
      }
      if (r.price.pending) {
        assert.equal(r.price.in_per_mtok, null, `${r.model}: pending price must be null`);
        assert.equal(r.price.out_per_mtok, null);
      }
      // tok/s genuinely not measured yet — must be null, never a placeholder number.
      assert.equal(r.toks.cloud_p50, null);
    }
  }
  assert.ok(measured > 0, "there is at least one measured cell to prove the path");
});

// ── TES is the calculator's, not hand-rolled ───────────────────────────────────

test("TES is taken verbatim from tes-calculator (priced measured cell: opus-4-7 / coding.backend)", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  const row = seed.rows["coding.backend"].find((r) => r.model === "claude-opus-4-7");
  assert.ok(row, "opus-4-7 present in coding.backend");
  const expected = computeTES({
    model: "claude-opus-4-7",
    category: "coding.backend",
    benchmark_score: row!.quality.score,
  });
  assert.equal(row!.tes, expected.tes);
  assert.ok(typeof row!.tes === "number" && row!.tes > 0, "priced+measured → finite TES");
});

test("can't rank what you can't price: opus-4-8 scores higher but pending price → tes null, not recommended", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  const opus48 = seed.rows["coding.backend"].find((r) => r.model === "claude-opus-4-8")!;
  assert.equal(opus48.quality.measured, true);
  assert.ok((opus48.quality.score ?? 0) > 0.88, "opus-4-8 has the higher raw score");
  assert.equal(opus48.price.pending, true, "but its price is pending");
  assert.equal(opus48.tes, null, "so TES is null — never fabricated by dividing by epsilon");
  assert.equal(opus48.verdict.recommended, false, "and the router does not route to an unpriceable model");
});

// ── verdict = the router's own choice, not invented ────────────────────────────

test("verdict.recommended matches decideAgent() for every category (router-truth, read-only)", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  for (const cat of seed.categories) {
    const chosen = decideAgent({ task_category: cat }).chosen_model;
    const recommended = seed.rows[cat].filter((r) => r.verdict.recommended).map((r) => r.model);
    if (chosen === null) {
      assert.equal(recommended.length, 0, `${cat}: no priceable pick → no ✦`);
    } else {
      assert.deepEqual(recommended, [chosen], `${cat}: exactly the router's pick is flagged`);
    }
  }
});

// ── local $0 / subscription $0 are facts of context ────────────────────────────

test("local models → $0 (cost_usd 0); Claude non-Fable tiers → subscription_zero true", () => {
  const seed = buildRankings({ now: FIXED_NOW });
  const rows = seed.rows["coding.backend"];
  const local = rows.find((r) => r.local.is_local);
  assert.ok(local, "there is a local model in the roster");
  assert.equal(local!.local.cost_usd, 0);
  for (const r of rows) {
    if (r.model.startsWith("claude-") && r.tier !== "T5") assert.equal(r.subscription_zero, true);
    if (r.tier === "T5") assert.equal(r.subscription_zero, false, "Fable is opt-in, not standard Max");
    if (!r.local.is_local) assert.equal(r.local.cost_usd, null, "cloud cost is null, never a fake 0");
  }
});

// ── determinism ────────────────────────────────────────────────────────────────

test("buildRankings is deterministic (same inputs → byte-identical rows)", () => {
  const a = JSON.stringify(buildRankings({ now: FIXED_NOW }).rows);
  const b = JSON.stringify(buildRankings({ now: FIXED_NOW }).rows);
  assert.equal(a, b);
});

// ── command surface ─────────────────────────────────────────────────────────────

test("rankings: no args / --help → usage, exit 0", async () => {
  for (const a of [[], ["--help"]]) {
    const res = await runRankings(a);
    assert.equal(res.exitCode, 0);
    assert.match(res.output, /mooter rankings/);
  }
});

test("rankings: unknown subcommand → exit 1 + usage", async () => {
  const res = await runRankings(["frobnicate"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown subcommand 'frobnicate'/);
});

test("rankings build --json → valid JSON seed", async () => {
  const res = await runRankings(["build", "--json"]);
  assert.equal(res.exitCode, 0);
  const seed = JSON.parse(res.output) as { schema: string; categories: string[] };
  assert.equal(seed.schema, "mooter-rankings-v1");
  assert.equal(seed.categories.length, TASK_CATEGORIES.length);
});

test("rankings build --out writes a file to the given path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-rank-"));
  const out = join(dir, "seed.json");
  const res = await runRankings(["build", "--out", out]);
  assert.equal(res.exitCode, 0);
  assert.ok(existsSync(out), "file written");
  const parsed = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(parsed.schema, "mooter-rankings-v1");
});

test("rankings schedule: prints an idempotent, data-only registration (Windows + cron) and never mutates the OS", async () => {
  const res = await runRankings(["schedule"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /schtasks/, "Windows registration shown");
  assert.match(res.output, /crontab/, "cron registration shown");
  assert.match(res.output, /benchmarks refresh --from-hub && mooter rankings build/, "the data-only pipeline");
  assert.match(res.output, /never installs|never acts|data-only|Data-only/i, "explicitly data-only");
});

test("usage tone: no hyperbole (honest)", async () => {
  const { output } = await runRankings([]);
  assert.ok(!/revolutionary|magic|AI-powered|guaranteed best/i.test(output));
});
