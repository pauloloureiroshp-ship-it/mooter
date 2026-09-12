// Wave 34 — `mooter audit fan-out`. node:test + tsx.
//
// Every test injects a mock worker + mock IO + fixed nowMs, so there is NO
// network, NO Ollama, NO cloud, and the only filesystem write is into a temp dir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

// ── 0 fontes → 0 achados ─────────────────────────────────────────────────────
//
// Medido a 2026-08-26 e 2026-09-11: apontado ao fastify (que nao tem install.sh,
// tools/router/*, packages/*), os 6 facets liam 0 ficheiros, o prompt ia na
// mesma ao Ollama e o worker devolvia achados a citar ficheiros inexistentes —
// ok:true, exit 0. Estes testes mordem nisso: o worker inventa de proposito,
// e a asserçao e que a invençao nunca chega ao output.

// IO de um repo que nao tem NADA do que os probes procuram.
function emptyIO(): FacetIO & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read: (p: string) => { reads.push(p); return null; },
    list: () => [],
    exists: () => false,
  };
}

const FABRICATED = "FABRICATED: install.sh lacks set -eu; classify.js has no sha gate";

// Worker que responde sempre com um achado inventado e conta as chamadas.
function inventingWorker(): { fn: WorkerFn; calls: () => number } {
  let n = 0;
  const fn: WorkerFn = async (req) => {
    n++;
    return { text: FABRICATED, backend: req.backend, model: req.model, cost_usd: 0, ok: true };
  };
  return { fn, calls: () => n };
}

test("0 fontes em todos os facets: worker nunca e chamado, todos ok:false, exit 1 sem --strict", async () => {
  const io = emptyIO();
  const worker = inventingWorker();
  const res = await runAudit(["fan-out", "--no-write"], { root: "/not-mooter", nowMs: NOW, worker: worker.fn, io });

  assert.equal(worker.calls(), 0, "nenhum prompt vazio chega ao LLM");
  assert.equal(res.exitCode, 1, "nada foi auditado — 0 diria «auditado, tudo bem»");
  assert.match(res.output, /6 facet\(s\), 0 ok/);
  assert.match(res.output, /local 0 · cloud 0/, "0 workers despachados, nao 6");
  assert.match(res.output, /0 source\(s\) read/);
  assert.match(res.output, /no facet read any source — nothing was audited/);
  assert.doesNotMatch(res.output, /FABRICATED/, "texto inventado nunca aparece");

  const strict = await runAudit(["fan-out", "--no-write", "--strict"], { root: "/not-mooter", nowMs: NOW, worker: worker.fn, io });
  assert.equal(strict.exitCode, 1, "--strict morde tambem");
  assert.equal(worker.calls(), 0);

  const json = await runAudit(["fan-out", "--no-write", "--json"], { root: "/not-mooter", nowMs: NOW, worker: worker.fn, io });
  assert.equal(json.exitCode, 1, "JSON continua a sair, mas com exit 1");
  const parsed = JSON.parse(json.output) as { facets: Array<{ ok: boolean; sources: number; text: string; error?: string }>; localCount: number };
  assert.equal(parsed.facets.length, FACET_NAMES.length);
  assert.ok(parsed.facets.every((f) => f.ok === false && f.sources === 0 && f.text === ""), "todos ok:false, text vazio");
  assert.ok(parsed.facets.every((f) => /0 source\(s\) read/.test(f.error ?? "")), "erro diz 0 fontes");
  assert.equal(parsed.localCount, 0);
  assert.doesNotMatch(json.output, /FABRICATED/);
});

test("0 fontes: o relatorio markdown diz «0 source(s)» + «no finding», nunca o texto do worker", async () => {
  const io = emptyIO();
  const worker = inventingWorker();
  const report = await runFanOut({ root: "/not-mooter", facets: [FACETS.install, FACETS.packages], io, worker: worker.fn, nowMs: NOW });
  assert.equal(worker.calls(), 0);
  const md = renderMarkdown(report, { facetsRequested: ["install", "packages"] });
  assert.match(md, /## install {2}· {2}0 source\(s\)/);
  assert.match(md, /## packages {2}· {2}0 source\(s\)/);
  assert.equal((md.match(/⚠️ no finding — 0 source\(s\) read/g) ?? []).length, 2, "um aviso por facet");
  assert.doesNotMatch(md, /FABRICATED/);
  assert.equal(report.localCount, 0, "0 workers locais correram");
});

test("parcial: facet com fontes corre o worker, facets sem fontes nao; exit 0 sem --strict, 1 com --strict", async () => {
  const io = mockIO({ "install.sh": "#!/bin/sh\nset -eu\n" });
  const worker = inventingWorker();
  const args = ["fan-out", "--no-write", "--facets", "install,classify,routing"];
  const res = await runAudit(args, { root: "/repo", nowMs: NOW, worker: worker.fn, io });
  assert.equal(worker.calls(), 1, "so o facet com fontes chega ao worker");
  assert.equal(res.exitCode, 0, "run parcial mantem exit 0 sem --strict");
  assert.match(res.output, /3 facet\(s\), 1 ok/);
  assert.match(res.output, /local 1 · cloud 0/);
  assert.match(res.output, /✓ install/);
  assert.match(res.output, /⚠ classify — 0 source\(s\) read/);
  assert.match(res.output, /⚠ routing — 0 source\(s\) read/);
  assert.doesNotMatch(res.output, /nothing was audited/);

  const strict = await runAudit([...args, "--strict"], { root: "/repo", nowMs: NOW, worker: worker.fn, io });
  assert.equal(strict.exitCode, 1, "--strict morde no facet a 0 fontes");
});

test("par positivo: com fontes o worker corre, ok:true, exit 0 — o texto do worker aparece", async () => {
  const io = mockIO({ "install.sh": "#!/bin/sh\nset -eu\n", "install.ps1": "Write-Host hi" });
  const worker = inventingWorker();
  const res = await runAudit(["fan-out", "--no-write", "--facets", "install", "--json"], { root: "/repo", nowMs: NOW, worker: worker.fn, io });
  assert.equal(worker.calls(), 1);
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output) as { facets: Array<{ ok: boolean; sources: number; text: string }>; localCount: number };
  assert.equal(parsed.facets[0].ok, true);
  assert.equal(parsed.facets[0].sources, 2);
  assert.equal(parsed.facets[0].text, FABRICATED, "com evidencia, o achado do worker e o achado");
  assert.equal(parsed.localCount, 1);
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

// ── Contra-exemplos do adversario (PR #506, 2026-09-11) ─────────────────────
//
// Tres reproducoes contra e63af6d3 em que a guarda «0 fontes → 0 worker»
// ainda deixava passar invencao. Cada teste abaixo FALHA nesse commit e
// passa no seguinte; a prova esta na mensagem do commit que os traz.

// IO parametrizavel: `content` e o que TODAS as leituras devolvem; `list`
// devolve `pkgs` para packages/; `exists` e sempre verdadeiro.
function uniformIO(content: string | null, pkgs: string[] = ["cli", "workflow"]): FacetIO & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read: (p: string) => { reads.push(p); return content; },
    list: (d: string) => (d.endsWith("packages") ? pkgs : []),
    exists: () => true,
  };
}

test("objeccao 1a · packages: package.json que existe mas nao se le → sources 0, worker nao corre", async () => {
  // `dirs` contava existencia; a leitura devolvia null e era descartada, mas
  // `sources` recebia `dirs.length` → 2 fontes, evidencia so com cabecalho,
  // 1 chamada Ollama, ok:true.
  const io = uniformIO(null);
  const input = FACETS.packages.gather("/repo", io);
  assert.equal(input.sources, 0, "existir nao e fonte: nenhum package.json foi lido");
  assert.ok(io.reads.length >= 2, "as leituras foram tentadas (e falharam)");
  assert.doesNotMatch(input.evidence, /^- /m, "nenhuma linha de evidencia por pacote");

  const worker = inventingWorker();
  const report = await runFanOut({ root: "/repo", facets: [FACETS.packages], io, worker: worker.fn, nowMs: NOW });
  assert.equal(worker.calls(), 0, "evidencia sem conteudo nunca chega ao LLM");
  assert.equal(report.facets[0].ok, false);
  assert.equal(report.facets[0].sources, 0);
  assert.doesNotMatch(report.facets[0].text, /FABRICATED/);
});

test("objeccao 1b · ficheiro vazio (ou so whitespace) nao e fonte, em TODOS os facets", async () => {
  for (const blank of ["", "  \n\t\n"]) {
    const io = uniformIO(blank);
    for (const name of FACET_NAMES) {
      const input = FACETS[name].gather("/repo", io);
      assert.equal(input.sources, 0, `${name}: conteudo ${JSON.stringify(blank)} contou como fonte`);
    }
    const worker = inventingWorker();
    const report = await runFanOut({ root: "/repo", facets: FACET_NAMES.map((n) => FACETS[n]), io, worker: worker.fn, nowMs: NOW });
    assert.equal(worker.calls(), 0, `conteudo ${JSON.stringify(blank)}: worker chamado`);
    assert.ok(report.facets.every((f) => f.ok === false && f.sources === 0));
    assert.equal(report.localCount, 0);
  }
});

test("objeccao 1c · misto: so o ficheiro com conteudo conta — sources e o que entrou na evidencia", () => {
  // install.sh com conteudo, install.ps1 vazio → 1, nao 2.
  const half = FACETS.install.gather("/repo", mockIO({ "install.sh": "#!/bin/sh\nset -eu\n", "install.ps1": "   " }));
  assert.equal(half.sources, 1);
  assert.match(half.evidence, /# install\.ps1\n\(empty\)/, "a evidencia diz (empty), nao um cabecalho vazio");

  // packages: um package.json legivel, outro ilegivel → 1, nao 2.
  const reads: string[] = [];
  const io: FacetIO = {
    read: (p: string) => { reads.push(p); return p.split(sep).join("/").endsWith("packages/cli/package.json") ? '{"name":"@mooter/cli"}' : null; },
    list: (d: string) => (d.endsWith("packages") ? ["cli", "workflow"] : []),
    exists: () => true,
  };
  const pk = FACETS.packages.gather("/repo", io);
  assert.equal(pk.sources, 1, "so o package.json lido conta");
  assert.equal((pk.evidence.match(/^- /gm) ?? []).length, 1, "uma linha de evidencia por fonte contada");
  assert.match(pk.summary, /1 of 2/);

  // package.json com conteudo mas JSON invalido: foi lido, entra na evidencia
  // como «unparseable» — e fonte (o auditor deve ve-lo).
  const bad = FACETS.packages.gather("/repo", uniformIO("{not json", ["cli"]));
  assert.equal(bad.sources, 1);
  assert.match(bad.evidence, /unparseable/);
});

test("objeccao 2 · todos os facets a 0 fontes + --max-cost 1: ZERO chamadas cloud, custo 0, sintese saltada", async () => {
  // Antes: `if (maxCost > 0)` ignorava os achados; com tudo a 0 fontes fazia
  // 0 chamadas locais e 1 cloud (paga), e a sintese inventada ia para o md.
  let cloudCalls = 0;
  const worker: WorkerFn = async (req) => {
    if (req.backend === "claude-api") cloudCalls++;
    return { text: FABRICATED, backend: req.backend, model: req.model, cost_usd: req.backend === "claude-api" ? 0.01 : 0, ok: true };
  };
  const io = emptyIO();
  const report = await runFanOut({ root: "/not-mooter", facets: FACET_NAMES.map((n) => FACETS[n]), io, worker, maxCostUsd: 1, nowMs: NOW });
  assert.equal(cloudCalls, 0, "sintese sem achados nao e chamada");
  assert.equal(report.cloudCount, 0);
  assert.equal(report.totalCostUsd, 0);
  assert.equal(report.synthesis, "(synthesis skipped — no facet produced a finding)");
  const md = renderMarkdown(report, { facetsRequested: FACET_NAMES });
  assert.match(md, /## Synthesis\n\n\(synthesis skipped — no facet produced a finding\)/);
  assert.doesNotMatch(md, /FABRICATED/);

  // Pela CLI, com --strict e --json: exit 1, cloud 0, «(free)».
  const cli = await runAudit(["fan-out", "--no-write", "--max-cost", "1", "--strict"], { root: "/not-mooter", nowMs: NOW, worker, io });
  assert.equal(cloudCalls, 0);
  assert.equal(cli.exitCode, 1);
  assert.match(cli.output, /local 0 · cloud 0 · \$0\.0000 \(free\)/);

  // Mesma regra quando ha fontes mas TODOS os workers locais falharam
  // (ex.: Ollama em baixo): nada para sintetizar → nao se paga a sintese.
  cloudCalls = 0;
  const downWorker: WorkerFn = async (req) => {
    if (req.backend === "claude-api") cloudCalls++;
    return { text: "", backend: req.backend, model: req.model, cost_usd: 0, ok: false, error: "ollama unreachable" };
  };
  const down = await runFanOut({ root: "/repo", facets: [FACETS.install], io: mockIO({ "install.sh": "x" }), worker: downWorker, maxCostUsd: 1, nowMs: NOW });
  assert.equal(cloudCalls, 0, "worker local falhou em tudo → sintese nao corre");
  assert.equal(down.cloudCount, 0);
  assert.equal(down.synthesis, "(synthesis skipped — no facet produced a finding)");

  // Par positivo: basta UM facet ok para a sintese correr (1 chamada cloud).
  cloudCalls = 0;
  const one = await runFanOut({ root: "/repo", facets: [FACETS.install, FACETS.classify], io: mockIO({ "install.sh": "x" }), worker, maxCostUsd: 1, nowMs: NOW });
  assert.equal(cloudCalls, 1);
  assert.equal(one.cloudCount, 1);
  assert.equal(one.synthesis, FABRICATED);
});

test("objeccao 3 · --facets que resolve para lista vazia → exit 1 «no facets selected», nada corre, nada se escreve", async () => {
  // Antes: `--facets ","` → [] → `nothingAudited` exigia length > 0 → exit 0
  // mesmo com --strict; e com --max-cost 1 ainda pagava a sintese.
  // O caso literal do adversario (",") vai primeiro: e nele que e63af6d3 morde.
  const dir = mkdtempSync(join(tmpdir(), "mooter-audit-empty-"));
  try {
    const out = join(dir, "should-not-exist.md");
    for (const csv of [",", " , ,", ""]) {
      const worker = inventingWorker();
      const res = await runAudit(["fan-out", "--facets", csv, "--strict", "--max-cost", "1", "--out", out], { root: "/repo", nowMs: NOW, worker: worker.fn, io: mockIO({ "install.sh": "x" }) });
      assert.equal(res.exitCode, 1, `--facets ${JSON.stringify(csv)} devolveu exit ${res.exitCode}`);
      assert.match(res.output, /no facets selected/);
      assert.match(res.output, /install/, "lista os validos");
      assert.equal(worker.calls(), 0, "nem local nem cloud");
      assert.equal(existsSync(out), false, "relatorio nao e escrito");
      assert.doesNotMatch(res.output, /audit fan-out —/, "nao ha cabecalho de run");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Unidade: so a flag AUSENTE expande para «todos»; um csv explicito e lido
  // como esta — "" incluido (antes, "" expandia para os 6 em silencio).
  assert.deepEqual(selectFacets(","), { facets: [], unknown: [] });
  assert.deepEqual(selectFacets(" , ,"), { facets: [], unknown: [] });
  assert.deepEqual(selectFacets(""), { facets: [], unknown: [] }, "\"\" explicito nao expande para «todos»");
  assert.equal(selectFacets(undefined).facets.length, FACET_NAMES.length, "flag ausente continua a ser «todos»");
});

// ── ronda 2 do adversario (codex, sobre 5ef8a35a) ───────────────────────────

test("ronda 2 · obj. 1 · worker ok:true com texto vazio nao e achado: facet ok:false, sintese NAO corre", async () => {
  // Reproducao do adversario: install.sh = "x", os outros 5 a 0 fontes, worker
  // devolve ok:true e text:"" (o worker Ollama faz isso quando `response` vem
  // vazio). Antes: 1 chamada cloud sobre uma seccao sem texto e cinco «no finding».
  let cloudCalls = 0;
  const worker: WorkerFn = async (req) => {
    if (req.backend === "claude-api") { cloudCalls++; return { text: FABRICATED, backend: req.backend, model: req.model, cost_usd: 0.01, ok: true }; }
    return { text: "   ", backend: req.backend, model: req.model, cost_usd: 0, ok: true };
  };
  const io = mockIO({ "install.sh": "x" });
  io.exists = () => false;
  io.list = () => [];
  const report = await runFanOut({ root: "/r", facets: FACET_NAMES.map((n) => FACETS[n]), io, worker, maxCostUsd: 1, nowMs: NOW });
  const inst = report.facets.find((f) => f.facet === "install")!;
  assert.equal(inst.sources, 1, "a fonte existe — o que falta e o achado");
  assert.equal(inst.ok, false, "sucesso de transporte sem texto nao e achado");
  assert.match(String(inst.error), /no text/);
  assert.equal(cloudCalls, 0, "sem achado nenhum, a sintese paga nao corre");
  assert.equal(report.cloudCount, 0);
  assert.equal(report.synthesis, "(synthesis skipped — no facet produced a finding)");
});

test("ronda 2 · obj. 2 · a fonte conta-se no EXCERTO que vai ao worker, nao no ficheiro inteiro", async () => {
  // install.sh = 3500 espacos + "x": o ficheiro tem conteudo, o excerto (3500
  // chars) nao. Antes: sources 1, evidencia so com espacos, worker chamado.
  const worker = inventingWorker();
  const io = mockIO({ "install.sh": " ".repeat(3500) + "x" });
  io.exists = () => false;
  io.list = () => [];
  const facets = FACET_NAMES.map((n) => FACETS[n]);
  const inst = FACETS.install.gather("/r", io);
  assert.equal(inst.sources, 0, "excerto em branco nao e fonte");
  assert.match(inst.evidence, /# install\.sh\n\(empty\)/);
  const report = await runFanOut({ root: "/r", facets, io, worker: worker.fn, nowMs: NOW });
  assert.equal(worker.calls(), 0, "nenhum facet tinha excerto com conteudo — o worker nao corre");
  assert.ok(report.facets.every((f) => f.sources === 0 && !f.ok));
  // Par positivo: com o `x` DENTRO do excerto, conta e o worker corre.
  const io2 = mockIO({ "install.sh": "x" + " ".repeat(3500) });
  io2.exists = () => false;
  io2.list = () => [];
  assert.equal(FACETS.install.gather("/r", io2).sources, 1);
  // E o corte de 1500 do install.ps1 tambem conta no excerto, nao no ficheiro.
  const io3 = mockIO({ "install.ps1": " ".repeat(1500) + "x" });
  io3.exists = () => false;
  io3.list = () => [];
  assert.equal(FACETS.install.gather("/r", io3).sources, 0);
});

test("ronda 3 · so pontuacao nao e achado: «...!!!» → ok:false, 0 chamadas cloud, exit 1 com --strict", async () => {
  // Reproducao do adversario: install.sh = "x", so o facet install, worker
  // ok:true com "...!!!" → antes: ok:true, 1 sintese, exit 0 com --strict.
  for (const texto of ["...!!!", "\n\t— …", "   "]) {
    let cloudCalls = 0;
    const worker: WorkerFn = async (req) => {
      if (req.backend === "claude-api") { cloudCalls++; return { text: FABRICATED, backend: req.backend, model: req.model, cost_usd: 0.01, ok: true }; }
      return { text: texto, backend: req.backend, model: req.model, cost_usd: 0, ok: true };
    };
    const io = mockIO({ "install.sh": "x" });
    io.exists = () => false;
    io.list = () => [];
    const cli = await runAudit(["fan-out", "--facets", "install", "--max-cost", "1", "--strict", "--json", "--no-write"], { root: "/r", nowMs: NOW, worker, io });
    const j = JSON.parse(cli.output);
    assert.equal(j.facets[0].ok, false, JSON.stringify(texto));
    assert.equal(cloudCalls, 0, "sem achado, a sintese nao corre");
    assert.equal(cli.exitCode, 1);
  }
  // Par positivo: uma letra chega — «ok.» e um achado (curto, mas achado).
  const io = mockIO({ "install.sh": "x" });
  io.exists = () => false;
  io.list = () => [];
  const ok: WorkerFn = async (req) => ({ text: req.backend === "claude-api" ? "sum" : "ok.", backend: req.backend, model: req.model, cost_usd: 0, ok: true });
  const cli = await runAudit(["fan-out", "--facets", "install", "--strict", "--json", "--no-write"], { root: "/r", nowMs: NOW, worker: ok, io });
  assert.equal(JSON.parse(cli.output).facets[0].ok, true);
  assert.equal(cli.exitCode, 0);
});
