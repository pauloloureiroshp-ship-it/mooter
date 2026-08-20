// Wave 34 — `mooter audit fan-out`. node:test + tsx.
//
// Every test injects a mock worker + mock IO + fixed nowMs, so there is NO
// network, NO Ollama, NO cloud, and the only filesystem write is into a temp dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { FACETS, FACET_NAMES, selectFacets, type FacetIO } from "../src/audit/facets.ts";
import { runFanOut, type WorkerFn, type WorkerResult } from "../src/audit/orchestrator.ts";
import { renderMarkdown, reportPath, writeReport } from "../src/audit/report.ts";
import { runAudit } from "../src/commands/audit.ts";

const NOW = 1_800_000_000_000;

// A mock IO whose `read` is a spy (records every path read) and never writes.
function mockIO(files: Record<string, string>): FacetIO & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read: (p: string) => {
      reads.push(p);
      // match by suffix so tests don't depend on the absolute root.
      // Normaliza o separador: no Windows o `join()` produz `\` e o sufixo
      // POSIX das chaves nunca casava — o facet lia zero ficheiros e o teste
      // acusava `sources: 0`, como se o codigo estivesse errado.
      const posix = p.split(sep).join("/");
      const hit = Object.keys(files).find((k) => posix.endsWith(k));
      return hit ? files[hit] : null;
    },
    list: (d: string) => (d.endsWith("packages") ? ["cli", "workflow"] : []),
    exists: () => true,
  };
}

// A mock worker that echoes the backend and never touches the network.
const echoWorker: WorkerFn = async (req): Promise<WorkerResult> => ({
  text: `FINDING for ${req.model} via ${req.backend}`,
  backend: req.backend,
  model: req.model,
  cost_usd: req.backend === "claude-api" ? 0.01 : 0,
  ok: true,
});

test("install facet probes the installer scripts and yields a $0 local finding", async () => {
  const io = mockIO({ "install.sh": "#!/bin/sh\nset -eu\n", "install.ps1": "Write-Host hi" });
  const report = await runFanOut({ root: "/repo", facets: [FACETS.install], io, worker: echoWorker, nowMs: NOW });
  assert.equal(report.facets.length, 1);
  assert.equal(report.facets[0].facet, "install");
  assert.equal(report.facets[0].sources, 2, "both install.sh + install.ps1 read");
  assert.equal(report.facets[0].ok, true);
  assert.equal(report.facets[0].cost_usd, 0, "local worker is free");
  assert.equal(report.facets[0].backend, "ollama");
});

test("classify facet is READ-ONLY — it only reads, never writes classify.js", async () => {
  const io = mockIO({ "tools/router/classify.js": "// classifier", "tools/router/classify.js.sha256": "abc123" });
  // FacetIO has no write method at all, so a write is impossible by construction.
  assert.equal("write" in io, false, "FacetIO exposes no write capability");
  const input = FACETS.classify.gather("/repo", io);
  assert.equal(input.sources, 1);
  // every recorded access was a read of a classify path — nothing else touched.
  assert.ok(io.reads.every((p) => p.includes("classify")), "only classify paths read");
  assert.match(FACETS.classify.prompt(input), /do NOT suggest editing/i);
});

test("selectFacets: default = all 6; unknown names are reported", () => {
  const all = selectFacets(undefined);
  assert.equal(all.facets.length, FACET_NAMES.length);
  assert.equal(all.unknown.length, 0);
  const picked = selectFacets("install,bogus,classify");
  assert.deepEqual(picked.facets.map((f) => f.name), ["install", "classify"]);
  assert.deepEqual(picked.unknown, ["bogus"]);
});

test("runFanOut local-only: maxCost 0 → no synthesis, no cloud call, $0", async () => {
  const calls: string[] = [];
  const spyWorker: WorkerFn = async (req) => {
    calls.push(req.backend);
    return echoWorker(req);
  };
  const io = mockIO({ "install.sh": "x", "tools/router/classify.js": "y" });
  const report = await runFanOut({
    root: "/repo",
    facets: [FACETS.install, FACETS.classify],
    maxCostUsd: 0,
    io,
    worker: spyWorker,
    nowMs: NOW,
  });
  assert.equal(report.synthesis, null, "no synthesis when local-only");
  assert.equal(report.cloudCount, 0);
  assert.equal(report.localCount, 2);
  assert.equal(report.totalCostUsd, 0);
  assert.ok(!calls.includes("claude-api"), "no cloud worker call was made");
});

test("runFanOut with maxCost > 0 runs exactly one cloud synthesis", async () => {
  const io = mockIO({ "install.sh": "x" });
  const report = await runFanOut({
    root: "/repo",
    facets: [FACETS.install],
    maxCostUsd: 5,
    io,
    worker: echoWorker,
    nowMs: NOW,
  });
  assert.ok(report.synthesis && report.synthesis.includes("via claude-api"));
  assert.equal(report.cloudCount, 1, "exactly one cloud call (the synthesis)");
  assert.ok(report.totalCostUsd > 0);
});

test("report writer: renderMarkdown is pure + writeReport emits audit/fan_out_<ts>.md", async () => {
  const io = mockIO({ "install.sh": "x" });
  const report = await runFanOut({ root: "/repo", facets: [FACETS.install], io, worker: echoWorker, nowMs: NOW });
  const md = renderMarkdown(report, { facetsRequested: ["install"] });
  assert.match(md, /# Mooter Audit — fan-out/);
  assert.match(md, /## install/);
  assert.match(md, /local-only run/, "synthesis note when no cloud call");
  // Mesmo motivo: `reportPath` usa `join()`, e no Windows isso da `audit\fan_out_…`.
  assert.match(reportPath("/repo", NOW).split(sep).join("/"), /audit\/fan_out_.*\.md$/);

  // the one filesystem-touching assertion — into a temp dir, never the repo.
  const dir = mkdtempSync(join(tmpdir(), "mooter-audit-"));
  try {
    const path = writeReport(dir, report, { facetsRequested: ["install"] }, NOW);
    assert.ok(path.startsWith(dir));
    const written = readFileSync(path, "utf8");
    assert.match(written, /# Mooter Audit/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runAudit CLI: --max-cost 0 → exit 0, never calls the cloud", async () => {
  const calls: string[] = [];
  const spyWorker: WorkerFn = async (req) => {
    calls.push(req.backend);
    return echoWorker(req);
  };
  const io = mockIO({ "install.sh": "x" });
  const res = await runAudit(["fan-out", "--facets", "install", "--max-cost", "0", "--no-write"], {
    root: "/repo",
    nowMs: NOW,
    worker: spyWorker,
    io,
  });
  assert.equal(res.exitCode, 0);
  assert.ok(!calls.includes("claude-api"), "default run makes zero cloud calls");
  assert.match(res.output, /audit fan-out/);
});

test("runAudit CLI: unknown facet → exit 1 + lists valid facets; help → exit 0", async () => {
  const bad = await runAudit(["fan-out", "--facets", "nope"], { root: "/repo", nowMs: NOW, worker: echoWorker, io: mockIO({}) });
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /Unknown facet/);
  assert.match(bad.output, /install/);

  const help = await runAudit([], {});
  assert.equal(help.exitCode, 0);
  assert.match(help.output, /parallel local-first codebase audit/);

  const unknownSub = await runAudit(["bogus"], {});
  assert.equal(unknownSub.exitCode, 1);
});
