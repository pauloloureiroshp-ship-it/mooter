#!/usr/bin/env node
// driver.mjs v2 — PILOTO DE CONVICÇÃO v1.1 (protocolo congelado em 0737767c).
// Dispara cada braço em sessão headless limpa, zero teclado humano (§2).
// v2 incorpora as falhas da verificação adversarial de 2026-08-06 (crítico≠autor):
//   Δ prompt por STDIN (nunca argv — shell:true no Windows mutila multi-linha)
//   Δ transcrição COMPLETA via --output-format stream-json --verbose (§2.2)
//   Δ usage/custo/mix agregados sobre TODAS as tentativas, não só a última (§0 b-c)
//   Δ artefacto copiado da worktree ANTES de a desmontar (harness/baralhar precisam dele)
//   Δ worktree com nome opaco (uuid) — a letra do braço não entra em paths que o agente vê
//   Δ warm-up da GPU quando cold (§2.5) · Δ pré-condições nunca crasham cru
//
//   A — TECTO    : claude -p, modelo fixo claude-fable-5, hooks OFF (sem Mooter)
//   B — MOOTER   : claude -p, settings por omissão (mooter-first, T0-T3 auto)
//   C — ESTÁTICO : claude -p, modelo fixo claude-sonnet-5, hooks OFF
//
// Uso (SÓ quando o Paulo autorizar o run — NUNCA na sessão de preparação):
//   PILOTO_GO=1 node driver.mjs --task T1|T2      # 9 runs (3 braços × 3 execuções)
//   node driver.mjs --dry [--task T1|T2]          # valida pré-condições, corre nada
//
// Tudo o que não consegue medir escreve "n/d" — nunca inventa (doutrina honest-copy).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, cpSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomInt } from "node:crypto";
import { tmpdir } from "node:os";
import { comparar as provaBundle, relatorio as relatorioBundle } from "./prova-bundle.mjs";
import { citaArg, bracoSemSaida, achaFicheiro, raizesDeProcura,
         padroesDeFuga, listaCandidatos, quarentena, fugasNovas } from "./guardas.mjs";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const RUNS_DIR = join(HERE, "runs");
// Raiz dos scratchpads por sessão — a segunda morada legítima do artefacto (v2.2 §1).
const TMP_CLAUDE = join(tmpdir(), "claude");
// Onde vão as sobras que um run anterior deixou na HOME (v2.3). Fora de `runs/`
// para não entrarem no baralhar/julgar como se fossem artefacto de alguém.
const QUARENTENA_DIR = join(HERE, "quarentena");
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

// ---------- pré-condições (falham ALTO em lista, nunca crash cru) ----------

function precondicoes(task) {
  const erros = [];
  if (process.env.PILOTO_GO !== "1") erros.push("PILOTO_GO≠1 — este driver não corre sem autorização explícita do Paulo.");
  if (task === "T1") {
    try {
      const spec = readFileSync(join(HERE, "T1_SPEC.md"), "utf8");
      if (spec.includes("<<TODO")) erros.push("T1_SPEC.md ainda tem <<TODO — colar o §5 da v1.0 primeiro.");
    } catch (e) { erros.push(`T1_SPEC.md ilegível: ${e.message}`); }
  }
  if (task === "T2") {
    try {
      const cand = readFileSync(join(HERE, "T2_CANDIDATAS.md"), "utf8");
      if (!/SORTEIO REGISTADO/.test(cand)) erros.push("T2_CANDIDATAS.md sem sorteio registado.");
    } catch (e) { erros.push(`T2_CANDIDATAS.md ilegível: ${e.message}`); }
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
    // v2.2 §1 — o prompt congelado NÃO diz onde pôr o ficheiro (verificado: não
    // contém "moo-ranch" nem "worktree"), portanto exigir `moo-ranch/index.html`
    // era um gate inganhável por construção: 9/9 `TECTO ATINGIDO` na bateria-1
    // enquanto os três braços reportavam `success` com jogos verificados.
    // Passa a procurar o NOME do artefacto na worktree e no scratchpad da sessão.
    const nome = basename(artefacto);
    return {
      id: "T1", prompt: prompt.trim(), artefacto_nome: nome, artefacto_rel: artefacto,
      acha: (wt, sids) => achaFicheiro(raizesDeProcura(wt, sids, TMP_CLAUDE), nome),
      done: (wt, sids) => !!achaFicheiro(raizesDeProcura(wt, sids, TMP_CLAUDE), nome),
    };
  }
  const cand = readFileSync(join(HERE, "T2_CANDIDATAS.md"), "utf8");
  const sorteada = (cand.match(/SORTEIO REGISTADO[\s\S]*?candidata sorteada: \*\*C(\d)\*\*/) || [])[1];
  if (!sorteada) throw new Error("Sorteio não legível em T2_CANDIDATAS.md.");
  const bloco = cand.split(/^## C/m).find((b) => b.startsWith(sorteada));
  const prompt = (bloco.match(/### PROMPT \(idêntico nos 3 braços\)\n\n```\n([\s\S]*?)```/) || [])[1];
  const testCmd = (bloco.match(/TEST_CMD: `([^`]+)`/) || [])[1];
  if (!prompt || !testCmd) throw new Error(`Candidata C${sorteada} sem PROMPT/TEST_CMD.`);
  return {
    id: `T2-C${sorteada}`, prompt: prompt.trim(), artefacto_nome: null, artefacto_rel: null,
    acha: () => null,   // T2 prova-se pelo TEST_CMD, não pela existência de um ficheiro
    done: (wt) => spawnSync(testCmd, { cwd: wt, shell: true, timeout: 120000 }).status === 0,
  };
}

// ---------- worktree limpa por run (§2.3) — nome OPACO: a letra do braço nunca ----------
// ---------- aparece em paths que o agente do braço possa ecoar no artefacto  ----------

function worktreeLimpa(baseSha) {
  const opaco = randomUUID().slice(0, 8);
  const wt = join(REPO, "..", `piloto-wt-${opaco}`);
  execFileSync("git", ["-C", REPO, "worktree", "add", "--detach", wt, baseSha], { encoding: "utf8" });
  neutralizaContexto(wt);
  return wt; // nasce sem node_modules nem .tmp; nada herdado do repo principal
}

/**
 * kit v2.2 · item 2 — G17: a única variável entre braços é o Mooter on/off.
 *
 * A worktree é um checkout do `frugal`, portanto trazia consigo o `CLAUDE.md` e o
 * `AGENTS.md` do Mooter — centenas de linhas de doutrina sobre routing, tiers,
 * delegação e "local-first" — para dentro dos TRÊS braços, incluindo os de
 * controlo. Medir com isso lá dentro é medir doutrina, não produto.
 *
 * Trocados por um `CLAUDE.md` neutro IDÊNTICO nos três, e a pasta `.claude/` do
 * repo (skills, settings de projecto) sai.
 *
 * ⚠️ LIMITE MEDIDO, declarado e não contornado: o `~/.claude/CLAUDE.md` do Paulo
 * continua a carregar. `CLAUDE_CONFIG_DIR` levaria as credenciais atrás e o CLI
 * responde `Not logged in` (medido 2026-08-07, status 1); não há flag que o
 * exclua (`--exclude-dynamic-system-prompt-sections` só o MOVE de sítio). Fica
 * como CONSTANTE dos três braços — não é variável entre eles, mas também não é
 * um ambiente sem doutrina, e o `resultado.md` tem de o dizer.
 */
function neutralizaContexto(wt) {
  const neutro = readFileSync(join(HERE, "CLAUDE.neutro.md"), "utf8");
  writeFileSync(join(wt, "CLAUDE.md"), neutro);
  for (const rel of ["AGENTS.md", "CLAUDE.local.md", ".claude"]) {
    try { rmSync(join(wt, rel), { recursive: true, force: true }); } catch { /* ausente = já neutro */ }
  }
}

function desmontarWorktree(wt, log) {
  try { execFileSync("git", ["-C", REPO, "worktree", "remove", "--force", wt], { encoding: "utf8" }); }
  catch (e) { appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), aviso: `worktree não desmontada: ${wt} — ${e.message.slice(0, 120)}` }) + "\n"); }
}

// ---------- GPU (§2.5: aquecida; cold/warm anotado) ----------

function gpuEstado() {
  try {
    const out = execFileSync("ollama", ["ps"], { encoding: "utf8", timeout: 10000, shell: true });
    return out.trim().split("\n").length > 1 ? "warm" : "cold";
  } catch { return "n/d"; }
}

async function aquecerGpu(log) {
  const estado = gpuEstado();
  if (estado !== "cold") return estado;
  try {
    await fetch("http://localhost:11434/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.MOO_WARM_MODEL || "qwen3:30b", prompt: "ok", stream: false, keep_alive: "30m" }),
      signal: AbortSignal.timeout(180000),
    });
    appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "gpu_warmup", de: "cold" }) + "\n");
    return gpuEstado();
  } catch { return "cold (warm-up falhou — anotado)"; }
}

// ---------- medição ----------

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
      janela_completa: novas, // pode conter ruído de outras sessões/órfãos — declarado, não escondido
      nota: "atribuição por session_id é a fiável; a janela completa vai junto para auditoria",
    };
  } catch (e) { return { linhas: [], nota: `n/d — ${e.message}` }; }
}

function somaModelUsage(porTentativa) {
  // Δ verificação: soma sobre TODAS as tentativas. PRESSUPOSTO DECLARADO: o CLI
  // reporta usage POR INVOCAÇÃO em -p/--resume. Validar no run 1 comparando
  // tentativa-0 vs tentativa-1; se for cumulativo, isto SOBRECONTA — corrigir antes
  // de citar números (nunca publicar sem essa validação; rótulo já é não-publicável).
  const soma = {};
  for (const mu of porTentativa) {
    if (!mu) continue;
    for (const [modelo, u] of Object.entries(mu)) {
      soma[modelo] = soma[modelo] || { inputTokens: 0, outputTokens: 0 };
      soma[modelo].inputTokens += u.inputTokens || 0;
      soma[modelo].outputTokens += u.outputTokens || 0;
    }
  }
  return Object.keys(soma).length ? soma : null;
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
    detalhe[modelo] = { tier: p.tier, inputTokens: u.inputTokens, outputTokens: u.outputTokens, usd: +usd.toFixed(4) };
    total += usd;
  }
  return { total_usd: incompleto ? `≥${total.toFixed(4)} (incompleto)` : +total.toFixed(4), detalhe };
}

function mixTiers(modelUsage) {
  // Mix de tiers de B é o resultado PRIMÁRIO (§6 / G17). Tokens locais (T0) não
  // aparecem em modelUsage — o slice do decisions.log complementa; discrepância declarada.
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
// Δ verificação: prompt entra por STDIN (argv com shell:true no Windows mutila
// multi-linha e rebenta aos 32k chars); transcrição COMPLETA via stream-json (§2.2).

function tentativa(arm, prompt, cwd, sessionId, resume) {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", ...ARMS[arm].args];
  // ⚠️ `citaArg` NÃO é cosmético — ver `guardas.mjs` e `guardas.test.mjs`.
  // Com `shell: true` (obrigatório: o `claude` no Windows é um shim, sem shell dá
  // ENOENT) o Node concatena os argumentos sem os escapar. Este caminho tem um
  // espaço em "Paulo Loureiro", partia-se, e o CLI respondia
  // `Settings file not found: C:\Users\Paulo`. Só os braços A e C passam
  // `--settings`, portanto só ELES morriam: a bateria de 2026-08-07 ia declarar
  // MOOTER 3-0 contra dois braços de controlo que nunca arrancaram.
  if (ARMS[arm].settings) args.push("--settings", citaArg(ARMS[arm].settings));
  args.push(resume ? "--resume" : "--session-id", sessionId);
  const t0 = Date.now();
  const r = spawnSync("claude", args, { cwd, input: prompt, encoding: "utf8", timeout: TIMEOUT_MS, shell: true, maxBuffer: 256 * 1024 * 1024 });
  let resultado = null;
  for (const linha of (r.stdout || "").split("\n").filter(Boolean)) {
    try { const j = JSON.parse(linha); if (j.type === "result") resultado = j; } catch { /* linha parcial (ex. timeout a meio) fica na transcrição crua */ }
  }
  const timeout = r.error?.code === "ETIMEDOUT" || null;
  return { wall_ms: Date.now() - t0, exit: r.status, timeout, stdout: r.stdout, stderr: r.stderr, resultado };
}

// ---------- run completo de um braço ----------

function run(arm, task, execucao, baseSha, log, gpu) {
  const runId = `${task.id}-${arm}-e${execucao}-${Date.now()}`;
  const dir = join(RUNS_DIR, runId);
  mkdirSync(dir, { recursive: true });
  const sessionId = randomUUID();
  const wt = worktreeLimpa(baseSha);
  const off = offsetDecisions();
  const t0 = Date.now();
  const tentativas = [];
  const sessionIds = [sessionId];
  const usagePorTentativa = [];
  const modelUsagePorTentativa = [];
  const saidas = [];   // só o stdout cru, para a guarda do braço vazio
  let orfaosPossiveis = false;

  // ---------- v2.3 · isolamento: quarentena ANTES, retrato para comparar ----------
  // Não tentamos prender o braço dentro da worktree — `CLAUDE_CONFIG_DIR` já provou
  // que a sandbox de OS parte o login. Tiramos é o que a fuga tem de venenoso: o
  // run N não pode NASCER a ver o build do run N-1. O resto detecta-se e declara-se.
  const HOME = homedir();
  const padroes = padroesDeFuga(task.artefacto_rel || "");
  const quarentenados = quarentena(
    listaCandidatos(HOME, padroes),
    join(QUARENTENA_DIR, `${runId}-antes`),
  );
  const homeAntes = listaCandidatos(HOME, padroes).map((c) => c.nome);

  let done = false;
  for (let i = 0; i <= MAX_FOLLOWUPS && !done; i++) {
    const prompt = i === 0 ? task.prompt : "continue"; // follow-ups pré-escritos (§2.2)
    const t = tentativa(arm, prompt, wt, sessionId, i > 0);
    tentativas.push({ n: i, prompt: i === 0 ? "(prompt da tarefa)" : prompt, wall_ms: t.wall_ms, exit: t.exit, timeout: t.timeout });
    writeFileSync(join(dir, `transcricao-${i}.jsonl`), t.stdout || ""); // transcrição completa (§2.2)
    if (t.stderr) writeFileSync(join(dir, `transcricao-${i}.stderr.txt`), t.stderr);
    if (t.timeout) orfaosPossiveis = true; // Windows: kill atinge o cmd.exe, não o neto — declarado
    usagePorTentativa.push(t.resultado?.usage ?? null);
    modelUsagePorTentativa.push(t.resultado?.modelUsage ?? null);
    if (t.resultado?.session_id && !sessionIds.includes(t.resultado.session_id)) sessionIds.push(t.resultado.session_id);
    saidas.push({ stdout: t.stdout });
    done = task.done(wt, sessionIds);
  }
  // Onde é que ele apareceu, de facto. Vai para o meta.json: se a T1 fechar com o
  // artefacto no scratchpad e não na worktree, isso é um facto do run, não uma
  // nota de rodapé — e é o que distingue "cumpriu" de "cumpriu noutro sítio".
  const artefactoEm = task.acha ? task.acha(wt, sessionIds) : null;

  // ---------- v2.3 · isolamento: o que apareceu na HOME é fuga DESTE run ----------
  // Anexada ao run (sai da HOME, para o run seguinte nascer cego) e DECLARADA no
  // meta.json. Nunca invalida em silêncio: o resultado.md decide o que fazer com ela.
  const homeDepois = listaCandidatos(HOME, padroes).map((c) => c.nome);
  const novas = fugasNovas(homeAntes, homeDepois);
  const fugasMovidas = quarentena(
    listaCandidatos(HOME, padroes).filter((c) => novas.includes(c.nome)),
    join(dir, "fuga-para-home"),
  );
  const violacaoIsolamento = novas.length ? {
    houve: true,
    caminhos: novas,
    anexadas: fugasMovidas.map((m) => m.nome),
    nao_anexadas: novas.filter((n) => !fugasMovidas.some((m) => m.nome === n)),
    movidas_para: join(dir, "fuga-para-home"),
    porque: "o braço escreveu na HOME, fora da worktree opaca do §2.3 — anexado ao run e retirado da HOME para o run seguinte não o herdar",
  } : { houve: false, caminhos: [], porque: null };
  if (novas.length) {
    appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "VIOLACAO_ISOLAMENTO", runId, braço: arm, caminhos: novas }) + "\n");
    console.error(`  ⚠ fuga de isolamento em ${runId}: ${novas.join(", ")} (anexada ao run, declarada no meta.json)`);
  }

  // ---------- guarda do braço vazio ----------
  // Zero bytes de transcrição em TODAS as tentativas não é `TECTO ATINGIDO —
  // incompleto`: é um braço que nunca falou com o modelo. Registá-lo como
  // incompleto transforma uma avaria do instrumento numa medição do produto, e
  // o `resultado.md` sai mecanicamente correcto e factualmente falso. O P0-C
  // prova que correu o código certo; isto prova que o braço correu de todo.
  // Aborta a bateria inteira — um braço de controlo morto invalida a comparação,
  // não só a sua própria linha.
  if (bracoSemSaida(saidas)) {
    desmontarWorktree(wt, log);
    const errPath = join(dir, "transcricao-0.stderr.txt");   // só existe se houve stderr
    const primeiroErro = existsSync(errPath)
      ? String(readFileSync(errPath, "utf8").split("\n")[0] || "").trim()
      : "";
    const err = new Error(
      `braço ${arm} (${ARMS[arm].nome}) não produziu um único byte em ${saidas.length} tentativa(s)`
      + (primeiroErro ? ` — stderr: ${primeiroErro}` : ""),
    );
    err.bracoVazio = { arm, nome: ARMS[arm].nome, runId, dir, tentativas: saidas.length, stderr: primeiroErro };
    throw err;
  }

  // Δ verificação: copiar o ARTEFACTO REAL (ficheiros alterados vs base + novos)
  // antes de desmontar — o harness e o baralhar precisam dos ficheiros, não do diff.
  const artDir = join(dir, "artefacto");
  mkdirSync(artDir, { recursive: true });
  try {
    const alterados = execFileSync("git", ["-C", wt, "diff", "--name-only", baseSha], { encoding: "utf8" }).split("\n").filter(Boolean);
    const novos = execFileSync("git", ["-C", wt, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const neutro = readFileSync(join(HERE, "CLAUDE.neutro.md"), "utf8");
    for (const rel of [...new Set([...alterados, ...novos])]) {
      if (rel.startsWith("node_modules")) continue;
      // O CLAUDE.md neutro é ALTERAÇÃO NOSSA (neutralizaContexto), não do braço, e o
      // git vê-o como modificado vs baseSha. Apanhado na T2: aparecia no artefacto
      // dos 9 runs — e como o prompt da C4 diz "Não toques em mais nenhum ficheiro",
      // um juiz cego leria violação em todos. Sai da captura, MAS só se continuar
      // byte-a-byte igual ao neutro: se um braço lhe mexeu, isso é dele e fica.
      if (rel === "CLAUDE.md") {
        try { if (readFileSync(join(wt, rel), "utf8") === neutro) continue; } catch { /* ilegível: captura */ }
      }
      try { cpSync(join(wt, rel), join(artDir, rel), { recursive: true }); } catch { /* apagados/binários exóticos: diff cobre */ }
    }
    execFileSync("git", ["-C", wt, "add", "-N", "."], { encoding: "utf8" });
    writeFileSync(join(dir, "artefacto.diff"), execFileSync("git", ["-C", wt, "diff", "--binary", baseSha], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) { writeFileSync(join(dir, "artefacto.ERRO.txt"), `captura do artefacto falhou: ${e.message}`); }

  // v2.2 §1 — a captura acima só vê o git da WORKTREE. Na bateria-1 os braços B e
  // C fecharam com `ficheiros=0` no artefacto/ apesar de 5-7 MB de transcrição:
  // tinham escrito no scratchpad, que nenhum `git ls-files` alcança. Sem isto o
  // `dod_harness` e o `baralhar` ficam sem material e o piloto mede o vazio.
  if (artefactoEm && !artefactoEm.startsWith(wt)) {
    try {
      const pasta = dirname(artefactoEm);
      cpSync(pasta, join(artDir, "_fora-da-worktree"), {
        recursive: true,
        filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src),
      });
      writeFileSync(join(dir, "artefacto.FORA.txt"),
        `o artefacto não estava na worktree.\norigem: ${artefactoEm}\ncopiado para: artefacto/_fora-da-worktree/\n`);
    } catch (e) {
      writeFileSync(join(dir, "artefacto.FORA.ERRO.txt"), `${artefactoEm}\nfalhou a copiar: ${e.message}`);
    }
  }
  desmontarWorktree(wt, log);

  const modelUsageTotal = somaModelUsage(modelUsagePorTentativa);
  const meta = {
    runId, braço: arm, braço_nome: ARMS[arm].nome, tarefa: task.id, execucao,
    base_sha: baseSha, session_ids: sessionIds, worktree_opaca: wt, gpu_no_arranque: gpu,
    wall_ms_total: Date.now() - t0, tentativas,
    criterio_paragem: done ? "cumprido" : "TECTO ATINGIDO — incompleto (registado, sem resgate humano)",
    // v2.2 §1 — "cumpriu" e "cumpriu ONDE" são factos diferentes; ambos ficam.
    artefacto_encontrado_em: artefactoEm,
    artefacto_onde: artefactoEm ? (artefactoEm.startsWith(wt) ? "worktree" : "fora_da_worktree") : null,
    artefacto_porque: artefactoEm ? null : "nenhum ficheiro com o nome do artefacto na worktree nem no scratchpad da sessão",
    // v2.3 — isolamento: o que se limpou antes, e o que escapou durante.
    violacao_isolamento: violacaoIsolamento,
    quarentena_antes: { movidas: quarentenados.map((m) => m.nome), padroes,
      porque: quarentenados.length ? "sobras de um run anterior tiradas da HOME para este run nascer cego a elas" : null },
    contexto_neutralizado: { claude_md: "neutro (CLAUDE.neutro.md)", agents_md: "removido", dot_claude: "removido",
      limite: "~/.claude/CLAUDE.md do utilizador NÃO removível (CLAUDE_CONFIG_DIR quebra a autenticação) — constante nos 3 braços, não variável entre eles" },
    usage_por_tentativa: usagePorTentativa,
    modelUsage_por_tentativa: modelUsagePorTentativa,
    agregacao: "soma por tentativa — PRESSUPOSTO: usage por invocação em --resume; validar no run 1 (ver somaModelUsage)",
    custo_proxy: custoProxy(modelUsageTotal), mix_tiers: mixTiers(modelUsageTotal),
    custo_marginal_subscricao: "≈0 nos planos actuais — dito abertamente (§5.2)",
    energia_local: "n/d — sem medição de Wh nesta bateria (§5.3)",
    decisions_slice: sliceDecisions(off, sessionIds),
    possivel_processo_orfao: orfaosPossiveis ? "SIM — timeout com shell:true no Windows não mata o neto; verificar claude órfão e janela decisions poluída" : false,
    intervencoes_humanas: 0,
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), runId, braço: arm, done, orfaosPossiveis }) + "\n");
  return meta;
}

// ---------- main ----------

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const idxTask = argv.indexOf("--task");
const taskId = (idxTask >= 0 ? argv[idxTask + 1] || "" : "").toUpperCase();
if (!dry && !["T1", "T2"].includes(taskId)) { console.error("uso: driver.mjs --task T1|T2 (ou --dry)"); process.exit(2); }

const erros = precondicoes(taskId || "T1");

// P0-C — o braço B não corre o repo, corre o runtime INSTALADO
// (`settings.json` liga o UserPromptSubmit a ~/.claude/tools/router/inject_context.js).
// Sem esta prova o meta.json carimba um base_sha que descreve código que NÃO
// correu — o gotcha que já custou 3× (achado #6). Corre no arranque, ANTES do
// --dry sair, para o Paulo poder verificar amanhã sem correr um único braço.
const baseSha = execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const prova = provaBundle(baseSha, process.env.USERPROFILE || process.env.HOME || "");
console.log(relatorioBundle(prova));

if (dry) {
  const bloqueio = !prova.repo_bundle_sha ? "prova de bundle indeterminável (n/d)"
    : (!prova.igual ? "runtime_bundle_sha ≠ repo_bundle_sha" : null);
  const todos = [...erros, ...(bloqueio ? [bloqueio] : [])];
  console.log(todos.length ? `DRY: bloqueado por:\n- ${todos.join("\n- ")}` : "DRY: pré-condições OK (PILOTO_GO à parte).");
  process.exit(0);
}
if (erros.length) { console.error(`RECUSADO:\n- ${erros.join("\n- ")}`); process.exit(1); }

mkdirSync(RUNS_DIR, { recursive: true });
const log = join(RUNS_DIR, "driver.log");
appendFileSync(log, JSON.stringify({
  ts: new Date().toISOString(), evento: "prova_bundle", base_sha: baseSha,
  repo_bundle_sha: prova.repo_bundle_sha, runtime_bundle_sha: prova.runtime_bundle_sha,
  igual: prova.igual, medidos: prova.medidos, total: prova.total,
  divergentes: prova.divergentes, ausentes: prova.ausentes, porque: prova.porque,
}) + "\n");
if (!prova.repo_bundle_sha) {
  console.error("RECUSADO: prova de bundle indeterminável (n/d) — medir antes de correr, nunca assumir.");
  process.exit(1);
}
if (!prova.igual) {
  console.error("RECUSADO: runtime_bundle_sha ≠ repo_bundle_sha — empacota, instala e reinicia o bridge a partir deste sha antes de medir.");
  process.exit(1);
}

const task = tarefa(taskId);
appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "inicio", tarefa: task.id, base_sha: baseSha, runtime_bundle_sha: prova.runtime_bundle_sha }) + "\n");

for (let e = 1; e <= EXECUCOES; e++) {
  // ordem por moeda registada (§2.4): permutação de A/B/C por sorteios crypto, lançamentos gravados
  const ordem = []; const lancamentos = [];
  const resto = ["A", "B", "C"];
  while (resto.length) { const i = randomInt(resto.length); lancamentos.push(i); ordem.push(resto.splice(i, 1)[0]); }
  appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "ordem", execucao: e, ordem, lancamentos_crypto: lancamentos }) + "\n");
  const gpu = await aquecerGpu(log); // §2.5: GPU aquecida; estado anotado por execução
  for (const arm of ordem) {
    console.log(`execução ${e} · braço ${arm} (${ARMS[arm].nome}) · ${task.id}`);
    try { run(arm, task, e, baseSha, log, gpu); }
    catch (err) {
      appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "RUN_FALHOU", execucao: e, braço: arm, erro: err.message.slice(0, 300) }) + "\n");
      // Um braço que não correu não é uma linha falhada entre outras: contamina
      // a comparação toda. Pára a bateria em vez de seguir e produzir um
      // `resultado.md` que parece limpo e mede o instrumento (2026-08-07).
      if (err.bracoVazio) {
        appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), evento: "BATERIA_ABORTADA", motivo: "braco_sem_saida", ...err.bracoVazio }) + "\n");
        console.error(`\nRECUSADO: ${err.message}`);
        console.error(`Isto não é um braço incompleto — é um braço que não correu. A bateria pára aqui:`);
        console.error(`um braço de controlo morto faz o piloto medir o instrumento, não o produto.`);
        console.error(`Transcrições em ${err.bracoVazio.dir}`);
        process.exit(1);
      }
    }
  }
}
console.log(`FIM. Resultados em ${RUNS_DIR}. Próximo passo: dod_harness.mjs sobre runs/<id>/artefacto/ (T1) e baralhar.mjs sobre os dirs artefacto/.`);
