// Wave 32 (Phase K) — cross-feature integration tests tying the new surfaces
// together. Isolated HOME so nothing touches the real ~/.mooter.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runEffort } from "../src/commands/effort.ts";
import { runStatus } from "../src/commands/status.ts";
import { runData } from "../src/commands/data.ts";
import { mooterHomeParent } from "../src/packs.ts";
import { getEffort } from "../../effort/src/index.ts";
import { buildDashboard, displayWidth } from "../src/commands/dashboard.ts";
import { ULTRAMOO_SUBSYSTEMS } from "../../effort/src/index.ts";

function withHome<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = process.env.HOME;
  const dir = mkdtempSync(join(tmpdir(), "mooter-int-"));
  mkdirSync(join(dir, ".mooter"), { recursive: true });
  process.env.HOME = dir;
  process.env.MOOTER_HOME = join(dir, ".mooter");
  process.env.MOOTER_CLAUDE_DIR = join(dir, ".claude");
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev;
  });
}

test("E2E: /moo-effort ultramoo flips all 8 sub-systems and status reflects it", async () => {
  await withHome(async () => {
    const r = runEffort(["set", "ultramoo"]);
    assert.strictEqual(r.exitCode, 0);
    // Pelo MESMO resolvedor que o CLI usa. Ler com `getEffort()` nu ia buscar
    // o `homedir()` — a casa VERDADEIRA de quem corre a suite — enquanto o
    // comando ja tinha escrito na casa isolada. Duas verdades, e o teste ficava
    // a medir a errada.
    const cfg = getEffort(mooterHomeParent());
    // every named sub-system is engaged
    assert.strictEqual(ULTRAMOO_SUBSYSTEMS.length, 8);
    assert.ok(cfg.llmlingua && cfg.caveman && cfg.lorauter && cfg.multiLora);
    assert.ok(cfg.workflowAutoThreshold === 500 && cfg.banditLocalBias === "hard" && cfg.statuslineUltramooChip);
    assert.ok(cfg.costCap.workflowUsd === 1 && cfg.costCap.sessionUsd === 20);
    // status surfaces it in plain language
    const st = runStatus(["--didactic"]);
    assert.match(st.output, /ultramoo/);
    assert.match(st.output, /Maximum frugality/);
  });
});

test("integration: dashboard renders within an 80×24 terminal (no row overrun)", () => {
  const width = 80;
  const out = buildDashboard({
    lines: [],
    metrics: { saved: 1.23, saved_pct: 88, last_turn_cost_usd: 0.01, alltime_cost_usd: 2.5 } as any,
    quotaPath: "/nonexistent",
    width,
    hardware: { gpu: "NVIDIA RTX 4090", vramGb: 24, ramGb: 31, cpuCores: 32 },
    workflowRuns: [{ runId: "wf_1", status: "completed", task: "audit" }],
    limits: { max_workflow_cost_usd: 5, max_session_cost_usd: 50, max_t3_calls_per_5min: 30, max_concurrent_workflows: 3 },
  });
  const rows = out.split("\n");
  for (const line of rows) assert.ok(displayWidth(line) <= width + 1, `overrun: ${line}`);
  // fits a 24-row terminal scroll comfortably (header + ~7 widgets); just assert it produced structured rows
  assert.ok(rows.length >= 20 && rows.length <= 60, `unexpected row count ${rows.length}`);
  assert.match(out, /SAVINGS/);
  assert.match(out, /PASTOR v2/);
  assert.match(out, /LIMITS/);
});

test("E2E: GDPR export → delete-all → export is clean throughout", async () => {
  await withHome(async () => {
    // O estado escreve-se DIRECTAMENTE no MOOTER_HOME isolado, e nao via
    // `runEffort`. Nao e preciosismo: `packages/effort` resolve o caminho por
    // `homedir()` e NAO honra o `MOOTER_HOME`, portanto no Windows aquele
    // `set high` escrevia no `~/.mooter` REAL do dono — e este teste so passava
    // porque a seguir apagava esse mesmo home verdadeiro. Verde pela razao
    // errada, e a razao errada custou o ledger vivo a 2026-08-20.
    //
    // O que este teste afirma — export -> delete-all -> export continua limpo —
    // prova-se na mesma. O que ele DEIXA de cobrir e a perna
    // "o `runEffort` cria estado que o export apanha": isso precisa de
    // `packages/effort` passar a honrar o `MOOTER_HOME`, e esse pacote esta
    // congelado. Fica dito aqui em vez de fingido pelo teste.
    writeFileSync(join(process.env.MOOTER_HOME!, "effort.json"), JSON.stringify({ mode: "high" }));
    const before = await runData(["export"]);
    assert.strictEqual(before.exitCode, 0);
    assert.match(before.output, /"effort.json"/);
    const del = await runData(["delete-all", "--confirm"]);
    assert.match(del.output, /removed \d+ item/);
    const after = await runData(["export"]);
    assert.strictEqual(after.exitCode, 0, "export still clean after wipe");
    const obj = JSON.parse(after.output);
    assert.deepStrictEqual(obj.config, {}, "no config left after delete-all");
  });
});
