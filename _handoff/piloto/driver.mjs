#!/usr/bin/env node
// driver.mjs — PILOTO DE CONVICÇÃO v1.1 (protocolo congelado em 0737767c).
// Dispara cada braço em sessão headless limpa, zero teclado humano (§2).
//
//   A — TECTO    : claude -p, modelo fixo claude-fable-5, hooks OFF (sem Mooter)
//   B — MOOTER   : claude -p, settings por omissão (mooter-first, T0-T3 auto)
//   C — ESTÁTICO : claude -p, modelo fixo claude-sonnet-5, hooks OFF
//
// Uso (SÓ quando o Paulo autorizar o run — NUNCA nesta sessão de preparação):
//   PILOTO_GO=1 node driver.mjs --task T1            # 9 runs (3 braços × 3 execuções)
//   PILOTO_GO=1 node driver.mjs --task T2            # idem, tarefa repo sorteada
//   node driver.mjs --dry                            # valida pré-condições, corre nada
//
// Recusa arrancar se: PILOTO_GO≠1 · T1_SPEC.md com <<TODO · T2 sem sorteio registado.
// Tudo o que não consegue medir escreve "n/d" — nunca inventa (doutrina honest-copy).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomInt } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const RUNS_DIR = join(HERE, "runs");
const DECISIONS_LOG = join(process.env.USERPROFILE || "", ".claude", "tools", "router", "decisions.log");
const PRECOS = JSON.parse(readFileSync(join(HERE, "precos.json"), "utf8"));

const EXECUCOES = 3;               // §2.1 — 3 execuções por braço por tarefa
const MAX_FOLLOWUPS = 2;           // §2.2 — "continue" ×2 máx.
const TIMEOUT_MS = 30 * 60 * 1000; // tecto por tentativa (30 min) — tecto de tentativas fixado aqui

const ARMS = {
  A: { nome: "TECTO",    args: ["--model", "claude-fable-5"],  settings: join(HERE, "settings.no-mooter.json") },
  B: { nome: "MOOTER",   args: [],                             settings: null }, // mooter-first: hooks por omissão
  C: { nome: "ESTATICO", args: ["--model", "claude-sonnet-5"], settings: join(HERE, "settings.no-mooter.json") },
};

// ---------- pré-condições (falham ALTO, nunca meio-correm) ----------

function precondicoes(task) {
  const erros = [];
  if (process.env.PILOTO_GO !== "1") erros.push("PILOTO_GO≠1 — este driver não corre sem autorização explícita do Paulo.");
  const spec = readFileSync(join(HERE, "T1_SPEC.md"), "utf8");
  if (task === "T1" && spec.includes("<<TODO")) erros.push("T1_SPEC.md ainda tem <<TODO — colar o §5 da v1.0 primeiro.");
  if (task === "T2") {
    const cand = readFileSync(join(HERE, "T2_CANDIDATAS.md"), "utf8");
    if (!/SORTEIO REGISTADO/.test(cand)) erros.push("T2_CANDIDATAS.md sem sorteio registado.");
  }
  try { execFileSync("claude", ["--version"], { encoding: "utf8", shell: true }); }
  catch { erros.push("claude CLI não encontrado no PATH."); }
  return erros;
}

// ---------- tarefa ----------

function tarefa(task) {
  if (task === "T1") {
    const spec = readFileSync(join(HERE, "T1_SPEC.md"), "utf8");
    const prompt = (spec.match(/## Prompt[^\n]*\n\n```\n([\s\S]*?)```/) || [])[1];
    const artefacto = (spec.match(/Caminho relativo na worktree do run: `([^`]+)`/) || [])[1];
    if (!prompt || !artefacto) throw new Error("T1_SPEC.md ilegível — prompt ou caminho do artefacto em falta.");
    return { id: "T1", prompt: prompt.trim(), done: (wt) => existsSync(join(wt, artefacto)) };
  }
  // T2: bloco da candidata sorteada, campos PROMPT / TEST_CMD
  const cand = readFileSync(join(HERE, "T2_CANDIDATAS.md"), "utf8");
  const sorteada = (cand.match(/SORTEIO REGISTADO[\s\S]*?candidata sorteada: \*\*C(\d)\*\*/) || [])[1];
  if (!sorteada) throw new Error("Sorteio não legível em T2_CANDIDATAS.md.");
  const bloco = cand.split(/^## C/m).find((b) => b.startsWith(sorteada));
  const prompt = (bloco.match(/### PROMPT \(idêntico nos 3 braços\)\n\n```\n([\s\S]*?)```/) || [])[1];
  const testCmd = (bloco.match(/TEST_CMD: `([^`]+)`/) || [])[1];
  if (!prompt || !testCmd) throw new Error(`Candidata C${sorteada} sem PROMPT/TEST_CMD.`);
  return {
    id: `T2-C${sorteada}`, prompt: prompt.trim(),
    done: (wt) => spawnSync(testCmd, { cwd: wt, shell: true, timeout: 120000 }).status === 0,
  };
}

// ---------- worktree limpa por run (§2.3) ----------

function worktreeLimpa(runId, baseSha) {
  const wt = join(REPO, "..", `piloto-run-${runId}`);
  execFileSync("git", ["-C", REPO, "worktree", "add", "--detach", wt, baseSha], { encoding: "utf8" });
  // caches limpos: worktree nasce sem node_modules nem .tmp; nada herdado do repo principal
  return wt;
}

function desmontarWorktree(wt) {
  try { execFileSync("git", ["-C", REPO, "worktree", "remove", "--force", wt], { encoding: "utf8" }); }
  catch { /* fica para limpeza manual; registado no log */ }
}

// ---------- medição ----------

function gpuEstado() {
  try {
    const out = execFileSync("ollama", ["ps"], { encoding: "utf8", timeout: 10000, shell: true });
    return out.trim().split("\n").length > 1 ? "warm" : "cold";
  } catch { return "n/d"; }
}

function offsetDecisions() {
  try { return statSync(DECISIONS_LOG).size; } catch { return null; }
}

function sliceDecisions(desde, sessionIds) {
  if (desde === null) return { linhas: [], nota: "n/d — decisions.log ausente" };
  try {
    const buf = readFileSync(DECISIONS_LOG);
    const novas = buf.subarray(desde).toString("utf8").split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    return {
      da_sessao: novas.filter((e) => sessionIds.includes(e.session_id)),
      janela_completa: novas, // inclui possível ruído de outras sessões — declarado, não escondido
      nota: "atribuição por session_id é a fiável; a janela completa vai junto para auditoria",
    };
  } catch (e) { return { linhas: [], nota: `n/d — ${e.message}` }; }
}

function custoProxy(modelUsage) {
  // §5: proxy preço-de-lista API. Modelo fora da tabela => n/d (nunca inventar).
  if (!modelUsage) return { total_usd: "n/d", detalhe: "modelUsage ausente do output do CLI" };
  let total = 0; const detalhe = {}; let incompleto = false;
  for (const [modelo, u] of Object.entries(modelUsage)) {
    const chave = Object.keys(PRECOS.por_modelo).find((k) => modelo.toLowerCase().includes(k));
    if (!chave) { detalhe[modelo] = "n/d — fora da tabela precos.json"; incompleto = true; continue; }
    const p = PRECOS.por_modelo[chave];
    const usd = ((u.inputTokens || 0) * p.input + (u.outputTokens || 0) * p.output) / 1e6;
    detalhe[modelo] = { tier: p.tier, inputTokens: u.inputTokens ?? "n/d", outputTokens: u.outputTokens ?? "n/d", usd: +usd.toFixed(4) };
    total += usd;
  }
  return { total_usd: incompleto ? `≥${total.toFixed(4)} (incompleto)` : +total.toFixed(4), detalhe };
}

function mixTiers(modelUsage) {
  // Mix de tiers de B é o resultado PRIMÁRIO (§6 / G17). Tokens locais (T0) não
  // aparecem em modelUsage — o slice do decisions.log complementa; discrepância é declarada.
  if (!modelUsage) return "n/d";
  const porTier = {};
  for (const [modelo, u] of Object.entries(modelUsage)) {
    const chave = Object.keys(PRECOS.por_modelo).find((k) => modelo.toLowerCase().includes(k));
    const tier = chave ? PRECOS.por_modelo[chave].tier : `n/d(${modelo})`;
    porTier[tier] = (porTier[tier] || 0) + (u.inputTokens || 0) + (u.outputTokens || 0);
  }
  const total = Object.values(porTier).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(porTier).map(([t, n]) => [t, { tokens: n, pct: +(100 * n / total).toFixed(1) }]));
}

// ---------- uma tentativa headless ----------

function tentativa(arm, prompt, cwd, sessionId, resume) {
  const args = ["-p", prompt, "--output-format", "json", "--dangerously-skip-permissions", ...ARMS[arm].args];
  if (ARMS[arm].settings) args.push("--settings", ARMS[arm].settings);
  args.push(resume ? "--resume" : "--session-id", sessionId);
  const t0 = Date.now();
  const r = spawnSync("claude", args, { cwd, encoding: "utf8", timeout: TIMEOUT_MS, shell: true, maxBuffer: 64 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* transcrição crua fica na mesma */ }
  return { wall_ms: Date.now() - t0, exit: r.status, timeout: r.error?.code === "ETIMEDOUT" || null, stdout: r.stdout, stderr: r.stderr, json };
}

// ---------- run completo de um braço ----------

function run(arm, task, execucao, baseSha, log) {
  const runId = `${task.id}-${arm}-e${execucao}-${Date.now()}`;
  const dir = join(RUNS_DIR, runId);
  mkdirSync(dir, { recursive: true });
  const sessionId = randomUUID();
  const wt = worktreeLimpa(runId, baseSha);
  const gpu = gpuEstado();
  const off = offsetDecisions();
  const t0 = Date.now();
  const tentativas = [];
  const sessionIds = [sessionId];

  let done = false;
  for (let i = 0; i <= MAX_FOLLOWUPS && !done; i++) {
    const prompt = i === 0 ? task.prompt : "continue"; // follow-ups pré-escritos (§2.2)
    const t = tentativa(arm, prompt, wt, sessionId, i > 0);
    tentativas.push({ n: i, prompt: i === 0 ? "(prompt da tarefa)" : prompt, wall_ms: t.wall_ms, exit: t.exit, timeout: t.timeout });
    writeFileSync(join(dir, `tentativa-${i}.stdout.json`), t.stdout || "");
    if (t.stderr) writeFileSync(join(dir, `tentativa-${i}.stderr.txt`), t.stderr);
    if (t.json?.session_id && !sessionIds.includes(t.json.session_id)) sessionIds.push(t.json.session_id);
    done = task.done(wt);
  }

  const ultima = tentativas.length ? JSON.parse(readFileSync(join(dir, `tentativa-${tentativas.length - 1}.stdout.json`), "utf8").trim() || "null") : null;
  const modelUsage = ultima?.modelUsage ?? null;
  const meta = {
    runId, braço: arm, braço_nome: ARMS[arm].nome, tarefa: task.id, execucao,
    base_sha: baseSha, session_ids: sessionIds, gpu_no_arranque: gpu,
    wall_ms_total: Date.now() - t0, tentativas, criterio_paragem: done ? "cumprido" : "TECTO ATINGIDO — incompleto (registado, sem resgate humano)",
    usage: ultima?.usage ?? "n/d", custo_proxy: custoProxy(modelUsage), mix_tiers: mixTiers(modelUsage),
    custo_marginal_subscricao: "≈0 nos planos actuais — dito abertamente (§5.2)",
    energia_local: "n/d — sem medição de Wh nesta bateria (§5.3)",
    decisions_slice: sliceDecisions(off, sessionIds),
    intervencoes_humanas: 0,
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  // artefactos ficam NA worktree; copiar antes de desmontar
  execFileSync("git", ["-C", wt, "add", "-N", "."], { encoding: "utf8" }); // torna novos ficheiros visíveis ao diff
  const diff = execFileSync("git", ["-C", wt, "diff", "--binary", "HEAD"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(join(dir, "artefacto.diff"), diff);
  desmontarWorktree(wt);
  appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), runId, braço: arm, done }) + "\n");
  return meta;
}

// ---------- main ----------

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const idxTask = argv.indexOf("--task");
const taskId = (idxTask >= 0 ? argv[idxTask + 1] || "" : "").toUpperCase();
if (!dry && !["T1", "T2"].includes(taskId)) { console.error("uso: driver.mjs --task T1|T2 (ou --dry)"); process.exit(2); }

const erros = precondicoes(taskId || "T1");
if (dry) {
  console.log(erros.length ? `DRY: bloqueado por:\n- ${erros.join("\n- ")}` : "DRY: pré-condições OK (PILOTO_GO à parte).");
  process.exit(0);
}
if (erros.length) { console.error(`RECUSADO:\n- ${erros.join("\n- ")}`); process.exit(1); }

mkdirSync(RUNS_DIR, { recursive: true });
const log = join(RUNS_DIR, "driver.log");
const baseSha = execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const task = tarefa(taskId);
appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "inicio", tarefa: task.id, base_sha: baseSha }) + "\n");

for (let e = 1; e <= EXECUCOES; e++) {
  // ordem por moeda registada (§2.4): permutação de A/B/C por sorteios crypto, lançamentos gravados
  const ordem = []; const lancamentos = [];
  const resto = ["A", "B", "C"];
  while (resto.length) { const i = randomInt(resto.length); lancamentos.push(i); ordem.push(resto.splice(i, 1)[0]); }
  appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "ordem", execucao: e, ordem, lancamentos_crypto: lancamentos }) + "\n");
  for (const arm of ordem) {
    console.log(`execução ${e} · braço ${arm} (${ARMS[arm].nome}) · ${task.id}`);
    run(arm, task, e, baseSha, log);
  }
}
console.log(`FIM. Resultados em ${RUNS_DIR}. Próximo passo: dod_harness.mjs (T1) e baralhar.mjs.`);
