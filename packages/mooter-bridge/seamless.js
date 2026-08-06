'use strict';
/**
 * seamless.js — mooter-bridge v0.2: the seamless dispatch loop (Fase 0 / Marco 1).
 *
 * Adds 4 tools on top of the P0/P1 bridge: mooter_route, mooter_dispatch,
 * mooter_status, mooter_collect. Doctrine unchanged: zero npm deps, stdout is
 * MCP-only, logs to stderr, nothing fabricated — unknown = null, never a guess.
 *
 * Pipeline (per HANDOFF mooter-seamless Fase 0):
 *   dispatch → guard (⇄ + posse + path allowlist) → spawn headless CLI with
 *   cwd = worktree → append `dispatched`/`started` to the ledger → return
 *   {job_id} immediately (never waits) → `done|failed` appended on close.
 *
 * Ledger v1 (single-writer = THIS server process; append-only JSONL):
 *   ~/.mooter/ledger.jsonl
 *   {ts, job_id, wave, cargo, cargo_porque, local, agent, worktree, event, mp_hash, exit_code?, cost_usd?, duration_s?}
 *
 * Guard v0 — DIVERGENCE, on purpose, reported in the BACK: the handoff names
 * `handoff-guard.js`, which does not exist in the repo under that name (closest:
 * tools/handoff-preflight.js = Perfect-Handoff scaffold, not a dispatch gate).
 * guardCheck() below implements the contract the handoff describes (⇄ header,
 * posse/ownership via ledger, worktree allowlist, vault deny) behind one seam —
 * swap in the canonical guard the moment it exists, adapt THIS side, never it.
 *
 * Masterprompt delivery: written to ~/.mooter/jobs/<id>/masterprompt.md and the
 * CLI gets a short fixed bootstrap prompt pointing at that file. Rationale:
 * Windows .cmd shims force shell:true spawns; keeping user content out of the
 * command line kills the whole quoting/injection class. Paths are ours (no user
 * input), quotes are rejected by the guard in every arg we do interpolate.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const { PassThrough } = require('stream');
const telemetry = require('./telemetry.js');
const moo = require('./moo.js');
const kimi = require('./kimi-adapter.js');
const plan = require('./plan.js');
const journal = require('./journal.js');
const wt = require('./worktrees.js');
const contexto = require('./context.js');
const P = require('./paths.js');
const localfirst = require('./localfirst.js');
const oraculo = require('./oraculo.js');
const aprender = require('./aprender.js');
const eta = require('./eta.js');
const estimation = require('./estimativa.js');
const fosso = require('./fosso.js');
const { isTerminal } = require('./terminal.js');

// ── config (env-overridable; defaults follow the handoff) ─────────────────
const VALID_CARGOS = Object.freeze(['MOO', 'MTO', 'MFO', 'MIO', 'MRO', 'MCC', 'MEO']);
/**
 * ⚠️ v1.27 — user_config no manifest pode chegar por preencher.
 *
 * A manifest.json passou a ler `repo_path` de um formulário do host (Claude
 * Desktop) e a passá-lo como `MOOTER_REPO`. Um campo opcional deixado em
 * branco por alguns hosts chega como o placeholder POR EXPANDIR — o mesmo bug
 * que `fleet.js` já documentou para `OLLAMA_HOST` ("Reproduced, then fixed").
 * Tratar isso como "não definido" em vez de um caminho literal `${...}`.
 */
function _repoEnv() {
  const v = process.env.MOOTER_REPO;
  if (!v) return null;
  const t = String(v).trim();
  return (!t || t.indexOf('${') >= 0) ? null : t;
}
const REPO = _repoEnv() || path.resolve(__dirname, '..', '..');
/**
 * Onde vive a cópia de classify.js EMPACOTADA (pack-mcpb.mjs copia-a para
 * `server/classify.js`, ao lado deste ficheiro). Variável de teste
 * (MOOTER_BUNDLE_DIR) segue o mesmo padrão de MOOTER_HOME/MOOTER_REPO — os
 * testes hermeticos não podem escrever nesta pasta do repo.
 */
const BUNDLE_DIR = () => process.env.MOOTER_BUNDLE_DIR || __dirname;

/**
 * O classificador FROZEN, com fallback para a cópia empacotada.
 *
 * `REPO/tools/router/classify.js` só existe quando há um ~/frugal clonado.
 * Quem instalou só o `.mcpb` (o caso comum fora da máquina do Paulo) não tem
 * essa pasta — e até aqui `mooter_route` morria com "classify.js
 * indisponível". `pack-mcpb.mjs` agora copia classify.js + as suas
 * dependências reais (patterns.js, tuning-state.defaults.json) para
 * `server/`, ao lado deste ficheiro: é essa cópia que serve de rede de
 * segurança.
 */
/**
 * ⚠️ O router é o núcleo de valor do produto. Quando ele não corre, o conector
 * continua a responder — e essa é exactamente a degradação silenciosa que o
 * `estranho.test.js` existe para impedir. Este objecto é a única fonte de
 * verdade sobre o que aconteceu ao classificador nesta sessão.
 *
 * Doutrina: `null` é ABSTENÇÃO ("ainda não tentei"), `false` é AFIRMAÇÃO
 * ("tentei e não deu"). Nunca afirmar `false` antes de haver tentativa.
 */
const ROUTER_ESTADO = {
  disponivel: null,
  porque: 'ainda não foi tentado nesta sessão — abstenção, não afirmação',
  classify_ms: null,
  caminho: null,
  tentativas: 0,
};

/**
 * Estado do router, para o painel e para o retorno de `mooter_work`.
 * Puro acessor: NÃO dispara uma tentativa. Se disparasse, deixaria de ser
 * possível distinguir "não tentei" de "tentei e falhou".
 */
function estadoDoRouter() {
  return {
    disponivel: ROUTER_ESTADO.disponivel,
    porque: ROUTER_ESTADO.porque,
    classify_ms: ROUTER_ESTADO.classify_ms,
    caminho: ROUTER_ESTADO.caminho,
    tentativas: ROUTER_ESTADO.tentativas,
  };
}

function requireClassify() {
  try {
    const alvo = path.join(REPO, 'tools', 'router', 'classify.js');
    const mod = require(alvo);
    ROUTER_ESTADO.caminho = alvo;
    return mod;
  } catch (repoError) {
    try {
      const alvo = path.join(BUNDLE_DIR(), 'classify.js');
      const mod = require(alvo);
      ROUTER_ESTADO.caminho = alvo;
      return mod;
    } catch (bundleError) {
      throw new Error('classify.js indisponível em ' + REPO + ' nem em ' + BUNDLE_DIR() + ': '
        + ((bundleError && bundleError.message) || bundleError)
        + ' (sem repo: ' + ((repoError && repoError.message) || repoError) + ')');
    }
  }
}
const MOOTER_HOME = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const LEDGER_PATH = () => path.join(MOOTER_HOME_DIR(), 'ledger.jsonl');
const JOBS_DIR = () => path.join(MOOTER_HOME_DIR(), 'jobs');
let _home = MOOTER_HOME;
function MOOTER_HOME_DIR() { return process.env.MOOTER_HOME || _home; }
const JOB_TIMEOUT_MS = () => Number(process.env.MOOTER_JOB_TIMEOUT_MS) || 30 * 60 * 1000;
const PREP_TIMEOUT_MS = () => Number(process.env.MOOTER_PREP_TIMEOUT_MS) || 20 * 1000;
const COLLECT_LIMIT = 100_000; // chars; above this: excerpt + path (tool-result ~150k cap)

function log(...a) { try { process.stderr.write('[mooter-seamless] ' + a.join(' ') + '\n'); } catch { /* */ } }
function ensureDirs() {
  fs.mkdirSync(JOBS_DIR(), { recursive: true });
}
function nowIso() { return new Date().toISOString(); }
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

// ── ledger (append-only JSONL; this process is the single writer) ─────────
const JOB_DIMENSIONS = new Map();

function normalizarCargo(raw) {
  if (raw == null || String(raw).trim() === '') {
    return {
      ok: true,
      cargo: null,
      porque: 'n/d — cargo não declarado por quem disparou; nunca inferido do texto',
    };
  }
  const cargo = String(raw).trim();
  if (!VALID_CARGOS.includes(cargo)) {
    return {
      ok: false,
      cargo: null,
      error: 'cargo "' + cargo + '" desconhecido; válidos: ' + VALID_CARGOS.join(', '),
      cargos_validos: [...VALID_CARGOS],
    };
  }
  return { ok: true, cargo, porque: 'declarado por quem disparou' };
}

function dimensoesPersistidas(jobId) {
  try {
    const lines = fs.readFileSync(LEDGER_PATH(), 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      let event;
      try { event = JSON.parse(lines[i]); } catch { continue; }
      if (!event || event.job_id !== jobId) continue;
      if (!Object.prototype.hasOwnProperty.call(event, 'cargo')
          && !Object.prototype.hasOwnProperty.call(event, 'local')) continue;
      return {
        cargo: Object.prototype.hasOwnProperty.call(event, 'cargo') ? event.cargo : null,
        cargo_porque: event.cargo_porque || (event.cargo == null
          ? 'n/d — anterior à instrumentação de cargos'
          : 'declarado por quem disparou'),
        local: typeof event.local === 'boolean' ? event.local : event.agent === 'moo',
      };
    }
  } catch { /* ledger ainda não existe */ }
  return null;
}

function enriquecerDimensoesDoJob(payload) {
  const out = { ...(payload || {}) };
  if (!out.job_id) return out;

  let known = JOB_DIMENSIONS.get(out.job_id) || dimensoesPersistidas(out.job_id);
  if (Object.prototype.hasOwnProperty.call(out, 'cargo')) {
    const declared = normalizarCargo(out.cargo);
    if (!declared.ok) throw new Error(declared.error);
    out.cargo = declared.cargo;
    out.cargo_porque = out.cargo_porque || declared.porque;
  } else if (known) {
    out.cargo = known.cargo;
    out.cargo_porque = known.cargo_porque;
  } else {
    out.cargo = null;
    out.cargo_porque = 'n/d — anterior à instrumentação de cargos';
  }

  if (typeof out.local !== 'boolean') {
    out.local = known && typeof known.local === 'boolean'
      ? known.local
      : out.agent === 'moo';
  }
  known = { cargo: out.cargo, cargo_porque: out.cargo_porque, local: out.local };
  JOB_DIMENSIONS.set(out.job_id, known);
  return out;
}

function appendLedgerRecord(payload) {
  ensureDirs();
  const record = { ts: nowIso(), ...enriquecerDimensoesDoJob(payload) };
  const line = JSON.stringify(record);
  fs.appendFileSync(LEDGER_PATH(), line + '\n');
  return { record, line };
}

function recordEtaRefusal(record, porque) {
  try {
    appendLedgerRecord({
      event: 'eta_observacao_recusada', job_id: record.job_id || null,
      agent: record.agent || null, source_event: record.event || null,
      porque: String(porque || 'motivo n/d'),
    });
  } catch (error) {
    log('ETA recusada e o recibo não entrou no ledger: ' + ((error && error.message) || error));
  }
}

function ledgerAppend(ev) {
  const payload = { ...(ev || {}) };
  const desfecho = aprender.classificarDesfecho(payload);
  if (desfecho) {
    Object.assign(payload, aprender.enriquecerCusto(payload));
    payload.desfecho = desfecho;
    if (!Object.prototype.hasOwnProperty.call(payload, 'ttft_ms')) payload.ttft_ms = null;
  }
  const appended = appendLedgerRecord(payload);
  const record = appended.record;
  if (desfecho) {
    try {
      const learned = aprender.persistirSnapshotTerminal(record, {
        dir: path.join(MOOTER_HOME_DIR(), 'aprender'),
      });
      if (learned && learned.ok === false) {
        log('aprendizagem ' + (record.job_id || 'n/d') + ' não persistiu: ' + learned.porque);
      }
    } catch (error) {
      log('aprendizagem ' + (record.job_id || 'n/d') + ' não persistiu: '
        + ((error && error.message) || error));
    }
  }
  try {
    const etaResult = eta.observeTerminal(record, {
      indexPath: path.join(MOOTER_HOME_DIR(), 'eta-index.json'),
      jobDir: record.job_id ? path.join(JOBS_DIR(), record.job_id) : null,
    });
    if (etaResult && etaResult.ok === false) {
      recordEtaRefusal(record, etaResult.porque);
      log('ETA ' + (record.job_id || 'n/d') + ': ' + etaResult.porque);
    }
  } catch (error) {
    const porque = 'observeTerminal falhou: ' + ((error && error.message) || error);
    recordEtaRefusal(record, porque);
    log('ETA ' + (record.job_id || 'n/d') + ' não actualizada: ' + porque);
  }
  return appended.line;
}
function ledgerRead() {
  try {
    return fs.readFileSync(LEDGER_PATH(), 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return aprender.comDesfecho(JSON.parse(l)); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}
/** Tecto do oráculo por medição. Medido: a suite de packages/router leva ~20,5 s. */
const ORACULO_TIMEOUT_MS = Number(process.env.MOOTER_ORACULO_TIMEOUT_MS) > 0
  ? Number(process.env.MOOTER_ORACULO_TIMEOUT_MS) : 180000;

/**
 * D13 (2026-08-01): o oráculo corre POR OMISSÃO em jobs de escrita. Só um `0`
 * explícito o desliga — qualquer outro valor (incluindo o antigo `1`) mantém-no
 * ligado, para que nenhuma configuração existente mude de comportamento ao
 * contrário do esperado. Lido a cada job (função, não constante) para que a
 * variável possa ser mudada sem reiniciar o conector.
 */
function ORACULO_LIGADO() {
  return String(process.env.MOOTER_ORACULO || '').trim() !== '0';
}

/**
 * Escreve o sinal de qualidade onde o learner já o procura.
 *
 * `tools/router/feedback-collector.js:16` define o ficheiro; `auto-feedback.js`
 * lê-o. Escrever no MESMO sítio, com a MESMA forma, é o que faz o oráculo entrar
 * no loop existente em vez de criar um paralelo — a diferença fica declarada no
 * campo `fonte`, para ninguém confundir medição com opinião.
 */
function escreverSinalDeQualidade(evento) {
  try {
    const alvo = process.env.MOOTER_DECISIONS_LOG
      || path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.appendFileSync(alvo, JSON.stringify(evento) + '\n');
    return alvo;
  } catch (e) {
    log('oráculo: não consegui escrever o sinal (' + (e && e.message) + ')');
    return null;
  }
}
/**
 * ⚠️ Um evento de diagnóstico não é um estado.
 *
 * O ledger é ao mesmo tempo a máquina de estados dos jobs e o sítio onde
 * gravamos observações sobre eles. Confundir as duas coisas parte tudo o que
 * lê "o último evento" como se fosse "o estado actual".
 *
 * `eta_observacao_recusada` entrou nesta lista depois de um teste da onda Y1 o
 * apanhar em flagrante: a recusa é escrita DEPOIS do `failed` de um cancel, e
 * o `toolCancel` — que decide idempotência pelo último evento de estado —
 * passou a ver a recusa em vez do `failed` e deixou de ser idempotente. Um
 * evento que só serve para dizer "não consegui medir isto" nunca pode mudar o
 * que o produto pensa que o job está a fazer.
 */
const NON_STATE_EVENTS = new Set(['cross_check', 'step', 'eta_observacao_recusada', 'collected']);
function lastStateRecord(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (!NON_STATE_EVENTS.has(events[i].event)) return events[i];
  }
  return null;
}
function lastStateEvent(events) {
  const record = lastStateRecord(events);
  return record ? record.event : null;
}

function terminalLedgerAgrees(record) {
  if (!isTerminal(record) || !isTerminal(record && record.event)) return false;
  // Builds antigas projectavam nao_verificado como running. Um fecho marcado
  // torna a reparação append-only observável e a segunda chamada idempotente.
  return record.event !== 'nao_verificado' || record.terminal_reconciled === true;
}

function appendTerminalReconciliation(record) {
  const source = record || {};
  const event = source.event === 'nao_verificado'
    ? 'nao_verificado'
    : (source.exit_code === 0 || source.exit_code === '0' ? 'done' : 'failed');
  ledgerAppend({
    job_id: source.job_id, wave: source.wave, agent: source.agent, worktree: source.worktree,
    event, mp_hash: source.mp_hash, exit_code: source.exit_code,
    note: source.note || 'estado terminal reconciliado a partir do exit_code',
    terminal_reconciled: true, reconciled_from_event: source.event || null,
  });
  return event;
}
function activeJobsByWorktree(worktree) {
  // ⚠️ canon(): em Windows o mesmo sítio aparece como C:\Users\PAULOL~1\… e
  // C:\Users\Paulo Loureiro\… — comparar as strings dava worktrees "ocupadas"
  // que estavam livres, e livres que estavam ocupadas.
  const norm = P.chave(worktree);
  const state = new Map(); // job_id → last event
  for (const ev of ledgerRead()) {
    if (!ev.job_id) continue;
    if (ev.worktree && P.chave(ev.worktree) !== norm) continue;
    if (ev.event === 'dispatched' || ev.event === 'started') state.set(ev.job_id, ev.event);
    if (isTerminal(ev)) state.delete(ev.job_id);
  }
  return [...state.keys()];
}

// ── v1.2 · sweeper: jobs orphaned by a connector restart ──────────────────
// The 30-minute watchdog below lives ONLY in this process's memory. Every time
// the desktop app restarts the connector, in-flight timers die with it and the
// job stays `started` in the ledger FOREVER. activeJobsByWorktree() then reads
// that ghost and the WIP guard refuses every future dispatch on that worktree —
// permanently, with no tool to clear it. Measured on 2026-07-25 with a hung
// codex job that locked `frugal-integ`.
// So: on boot, close what this process cannot possibly own.
/**
 * ⚠️ Liveness is proven, not assumed.
 *
 * v1.2 declared a job orphaned whenever THIS process did not know it. The audit
 * caught the consequence: with two Claude Desktop windows, the second server
 * boots, sees the first one's running jobs, marks them `failed`, and frees the
 * WIP guard — so two agents can land in the same worktree. Fatal.
 *
 * Every dispatch now drops `<jobDir>/owner.json` with the owning pid. A job is
 * only an orphan if its owner process is genuinely gone.
 */
/** Um pid existe? `signal 0` não mata nada; EPERM significa "existe e não é meu". */
function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (e) { return !!(e && e.code === 'EPERM'); }
}

/**
 * ⚠️ A2 — nenhum job é declarado morto sem prova.
 *
 * A v1.3.3 usava o pid do PROCESSO DONO (o servidor MCP). Isso responde "quem o
 * lançou ainda vive?", não "o trabalho ainda corre?". Um servidor que reinicia
 * marcava `orphaned-by-restart` no ledger **sem matar nada** — e um Opus com
 * permissão de escrita continuou a escrever depois de declarado morto, deixando
 * um commit de 15 ficheiros sem dono no ledger.
 *
 * Agora guardamos os DOIS pids e verificamos o do trabalho primeiro.
 */
function ownerAlive(job_id) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(JOBS_DIR(), job_id, 'owner.json'), 'utf8'));
    if (!o) return false;
    // 1. o processo do TRABALHO ainda existe? é esta a pergunta que interessa
    if (o.child_pid && pidAlive(o.child_pid)) return true;
    // 2. senão, o servidor que o lançou ainda o tem em memória?
    if (o.pid === process.pid) return REGISTRY.has(job_id);
    return pidAlive(o.pid);
  } catch { return false; }
}

/** O que sabemos do processo de um job, para pôr no ledger sem inventar. */
function jobPids(job_id) {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(JOBS_DIR(), job_id, 'owner.json'), 'utf8'));
    return { server_pid: o.pid || null, child_pid: o.child_pid || null };
  } catch { return { server_pid: null, child_pid: null }; }
}

function sweepOrphans() {
  const swept = [];
  const state = new Map();
  for (const ev of ledgerRead()) {
    if (!ev.job_id) continue;
    if (ev.event === 'dispatched' || ev.event === 'started' || isTerminal(ev)) state.set(ev.job_id, ev);
  }
  for (const [job_id, ev] of state) {
    if (isTerminal(ev)) {
      if (!terminalLedgerAgrees(ev)) {
        appendTerminalReconciliation(ev);
        swept.push(job_id);
      }
      continue;
    }
    if (ev.event !== 'dispatched' && ev.event !== 'started') continue;
    if (REGISTRY.has(job_id)) continue;   // ours and alive
    if (ownerAlive(job_id)) continue;     // someone else's, and still running
    // o pid verificado vai para o ledger: quem ler depois sabe COMO se concluiu
    // que estava morto, em vez de ter de confiar na palavra do sweeper
    const pids = jobPids(job_id);
    ledgerAppend({
      job_id, wave: ev.wave, agent: ev.agent, worktree: ev.worktree,
      event: 'failed', mp_hash: ev.mp_hash, exit_code: 'orphaned-by-restart',
      child_pid: pids.child_pid, pid_verificado: true,
    });
    swept.push(job_id);
  }
  return swept;
}

// ── guard v0 (seam for the canonical guard — see header) ──────────────────
// v1.2: `moo` joins the enum. Until now the router mapped T0 → moo and then
// admitted in its own routing_note that moo "não é dispatchável" — the local
// tier was decoration. The GPU had a model resident and zero jobs.
const KNOWN_AGENTS = ['cc', 'codex', 'gemini', 'moo', 'kimi'];
const LOCAL_AGENTS = new Set(['moo']);
function agentLabel(agent) {
  return agent === 'kimi' ? kimi.PROVIDER_LABEL : agent;
}
function guardCheck({ agent, worktree, masterprompt, wave, allowedTools }) {
  const reasons = [];
  if (!KNOWN_AGENTS.includes(agent)) reasons.push(`agent "${agent}" desconhecido (esperado: ${KNOWN_AGENTS.join('|')})`);
  const mp = String(masterprompt || '');
  if (!mp.trim()) reasons.push('masterprompt vazio');
  else if (!mp.includes('⇄')) reasons.push('masterprompt sem cabeçalho ⇄ (ROUTING/posse) — exigido pela constituição de handoff');
  for (const [k, v] of Object.entries({ wave, allowedTools, agent })) {
    if (v != null && /["\r\n]/.test(String(v))) reasons.push(`arg "${k}" contém aspas/quebra de linha — recusado (higiene de shell)`);
  }
  const wt = String(worktree || '');
  if (!wt) reasons.push('worktree vazio');
  else {
    const norm = path.resolve(wt);
    if (/paulo-vault/i.test(norm)) reasons.push('worktree dentro do vault — PROIBIDO (constituição §5)');
    const root = process.env.MOOTER_WORKTREE_ROOT || path.dirname(path.resolve(REPO));
    // ⚠️ dentroDe() resolve 8.3 e symlinks. Antes, uma worktree em %TEMP% era
    // recusada como "fora da raiz" mesmo estando lá dentro.
    if (!P.dentroDe(norm, root)) {
      reasons.push(`worktree fora da raiz permitida (${root})`);
    }
    if (!fs.existsSync(norm) || !fs.statSync(norm).isDirectory()) {
      reasons.push(`worktree não existe: ${norm}`);
    } else {
      try {
        execFileSync('git', ['-C', norm, 'rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { reasons.push(`worktree não é uma git worktree: ${norm}`); }
      const owners = activeJobsByWorktree(norm);
      if (owners.length) reasons.push(`posse: worktree já tem job ativo (${owners.join(', ')}) — WIP guard`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// ── agent command builders (flags validated against official docs 2026-07-24) ─
/**
 * ⚠️ v1.3.2 — the first line becomes the session title, so make it mean something.
 *
 * The CLI derives a session's title from the start of its prompt. Every Mooter
 * job began with "Lê o ficheiro C:\…\.mooter\jobs\j", so mooter_sessions_list
 * showed EIGHT sessions with the same unusable name and the whole fleet was
 * indistinguishable. One line of context costs nothing and makes the cockpit
 * readable.
 */
function bootstrapPrompt(mpPath, label) {
  // ⚠️ v1.3.4 — UMA LINHA, SEMPRE. Este bug custou três jobs.
  //
  // A v1.3.3 pôs o label numa linha própria (`# label\nLê o ficheiro…`) para dar
  // títulos úteis às sessões. No Windows o spawn é `shell: true`, e o cmd.exe
  // CORTA o argumento na primeira newline: o agente recebia só o cabeçalho, sem
  // nunca ver a instrução de ler o masterprompt. Respondia a pedir o brief.
  //
  // O label continua a vir primeiro (é dele que sai o título da sessão), mas na
  // mesma linha. E o texto é higienizado: sem newlines, sem aspas, sem `|`, `&`,
  // `<`, `>` — tudo o que uma shell interpreta.
  const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/["`|&<>^%]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 70);
  const head = label ? '[' + clean(label) + '] ' : '';
  return `${head}Le o ficheiro ${mpPath} e executa integralmente o masterprompt nele contido. O conteudo do ficheiro sao as tuas instrucoes de wave.`;
}
/**
 * v1.2 — TWO changes that turn the router from advisory into actual policy.
 *
 * 1. `model` is finally passed through. Until v1.1 `mooter_route` returned a
 *    `recommended_model` that NOTHING consumed: `grep -- "--model" *.js` = 0.
 *    Proof from a real job on 2026-07-25: the router said `claude-opus-4-6`,
 *    the CLI ran `claude-opus-4-8` — the subscription default. Every one of the
 *    six sessions measured that day was Opus, and `savedUsd` was negative in
 *    all six, because the saving baseline is all-Opus and everything WAS Opus.
 *    A local-first router that cannot pick the model is a slogan.
 *
 * 2. `stream-json` replaces `json`. Same final numbers, but the job now narrates
 *    itself line by line while it works: real model, tokens, and which file it
 *    is reading. That is what telemetry.js reads. (`--verbose` is required by
 *    the CLI when streaming in print mode.)
 */
/**
 * O que fazer a seguir quando o guard recusa — em vez de uma linha morta.
 *
 * ⚠️ Auditoria E2E 2026-08-01, achado A1. Numa instalação do `.mcpb` com
 * `repo_path` por preencher E sem `MOOTER_WORKTREE_ROOT`, `REPO` cai para o avô
 * da pasta do bundle (`:69`) e a raiz permitida passa a ser `%APPDATA%\Claude`
 * (`:436`) — logo QUALQUER pasta de projecto real é recusada. Medido: a Estranha
 * fez 4 gestos e despachou 0 jobs.
 *
 * O que ela via era uma linha: `⛔ não despachei o job · em <pasta>`. O motivo
 * vivia só no `structuredContent` e NUNCA nomeava `repo_path`. O produto já sabe
 * escrever erros accionáveis — os do kimi trazem `faz_assim` — e faltava
 * exactamente no caminho que decide o onboarding.
 *
 * `MOOTER_WORKTREE_ROOT` desbloqueia sem `repo_path` (é o primeiro operando de
 * `:436`), mas não está exposto no `user_config` do manifest — só em
 * `SEAMLESS.md:81`. Por isso é nomeado aqui: é o escape hatch indescobrível.
 */
function guardFazAssim(reasons) {
  const txt = (reasons || []).join(' · ');
  const passos = [];
  if (/fora da raiz permitida/i.test(txt)) {
    passos.push('preenche "Repositório mooter" (repo_path) nas definições do conector com a pasta do teu projecto — é ela que define a raiz de worktrees permitidas, não só a cópia do classify.js');
    passos.push('ou define a variável de ambiente MOOTER_WORKTREE_ROOT com a pasta-mãe dos teus projectos (sobrepõe-se a repo_path)');
    passos.push('depois reinicia o Claude Desktop para o conector reler a configuração');
  }
  if (/não é uma git worktree/i.test(txt)) {
    passos.push('a pasta tem de ser um repositório git — corre `git init` nela, ou aponta para uma que já o seja');
  }
  if (/worktree já tem job ativo/i.test(txt)) {
    passos.push('espera que o job em curso acabe, ou usa mooter_cancel({job_id}) — uma worktree só aguenta um job de cada vez');
  }
  if (/dentro do vault/i.test(txt)) {
    passos.push('escolhe uma pasta fora do vault — trabalhar dentro do vault é proibido pela constituição §5');
  }
  if (/masterprompt/i.test(txt)) {
    passos.push('o goal não pode ir vazio; descreve o que queres em linguagem normal');
  }
  return passos.length ? passos : ['corre mooter_setup({primeira_vez:true}) para o diagnóstico das 6 verificações'];
}

function buildCommand(agent, jobDir, allowedTools, model, label) {
  const mpPath = path.join(jobDir, 'masterprompt.md');
  const outFile = path.join(jobDir, 'last-message.txt');
  const boot = bootstrapPrompt(mpPath, label);
  if (agent === 'cc') {
    const args = ['-p', boot, '--output-format', 'stream-json', '--verbose'];
    // v1 WITHOUT --bare (D3: subscription auth + Mooter router hooks fire).
    // Docs 2026-07-24: --bare will become the -p default in a future release — revisit then.
    args.push('--allowedTools', allowedTools || 'Read');
    if (model) args.push('--model', String(model));
    return { bin: 'claude', args };
  }
  if (agent === 'codex') {
    // ⚠️ v1.3.2 — allowedTools used to be accepted and silently dropped here,
    // while the sandbox stayed `workspace-write`. A caller asking for read-only
    // got write permission and only the masterprompt's prose stood in the way.
    // Prose is a request, not a guard. Now the permission maps to the flag.
    const readOnly = !allowedTools || /^\s*(read|read-only)\s*$/i.test(String(allowedTools))
      || !/(write|edit|bash)/i.test(String(allowedTools));
    const args = ['exec', boot, '--json', '--sandbox', readOnly ? 'read-only' : 'workspace-write',
      '--output-last-message', outFile];
    if (model) args.push('--model', String(model));
    return { bin: 'codex', args };
  }
  if (agent === 'gemini') {
    const readOnly = !allowedTools || /^\s*(read|read-only)\s*$/i.test(String(allowedTools))
      || !/(write|edit|bash)/i.test(String(allowedTools));
    const args = ['-p', boot, '--output-format', 'json'];
    if (!readOnly) args.push('--approval-mode', 'auto_edit');
    if (model) args.push('--model', String(model));
    return { bin: 'gemini', args };
  }
  if (agent === 'moo') {
    // handled in-process by moo.js — no CLI, no shell, no PATH lottery
    return { bin: '(ollama)', args: ['/api/chat', model || '(auto)'], local: true };
  }
  if (agent === 'kimi') {
    // handled in-process: the API key never enters argv, meta.json or the ledger
    return { bin: '(moonshot)', args: ['/v1/chat/completions', kimi.MODEL], cloud: true };
  }
  throw new Error('unknown agent ' + agent);
}
function quoteArg(a) {
  // our own paths/flags only — guard already rejected quotes in caller args
  return /[\s]/.test(a) ? '"' + a + '"' : a;
}

/**
 * ⚠️ v1.3.4 — a última linha de defesa contra o bug que cortou três jobs.
 *
 * Com `shell: true` no Windows, o cmd.exe termina o comando na primeira newline.
 * Qualquer argumento com `\n` perde tudo o que vem a seguir — silenciosamente,
 * sem erro, e o agente recebe meio prompt. Isto verifica ANTES de despachar.
 */
function assertSingleLineArgs(cmd) {
  for (const a of (cmd.args || [])) {
    if (/[\r\n]/.test(String(a))) {
      throw new Error('argumento com quebra de linha seria truncado pela shell: ' + String(a).slice(0, 60) + '…');
    }
  }
  return true;
}

// ── child-process environment (allowlist — never propagate the full env) ─────
// Each agent only receives the env vars it actually needs. This prevents
// MOONSHOT_API_KEY from leaking to claude/codex/gemini processes, and generally
// reduces the attack surface of all child processes.
const CHILD_ENV_BASE_KEYS = Object.freeze([
  'PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'WINDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME',
  'LANG', 'LC_ALL', 'TERM', 'COLORTERM', 'NO_COLOR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'MOOTER_HOME', 'MOOTER_REPO', 'MOOTER_WORKTREE_ROOT',
  'MOOTER_BUNDLE_DIR', 'MOOTER_ROUTER_DIR', 'MOOTER_DECISIONS_LOG',
  'MOOTER_SESSION_ID', 'MOOTER_TRACKER_PORT', 'MOOTER_CONTEXT_BRIDGE',
]);
const CHILD_ENV_AGENT_KEYS = Object.freeze({
  cc: Object.freeze([
    'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SESSION_ID',
    'CLAUDE_CODE_SESSION_ID', 'MOOTER_CLAUDE_DIR', 'MOOTER_ANTHROPIC_5H_LIMIT',
  ]),
  codex: Object.freeze([
    'OPENAI_API_KEY', 'CODEX_HOME', 'MOOTER_CODEX_HOME', 'MOOTER_CODEX_5H_LIMIT',
  ]),
  gemini: Object.freeze([
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS',
  ]),
  moo: Object.freeze([
    'OLLAMA_HOST', 'MOOTER_MOO_MODEL', 'MOOTER_NUM_CTX_MAX', 'MOOTER_KEEP_ALIVE',
  ]),
  // kimi runs in-process (kimi-adapter.js) — no child process, no env needed here
  git: Object.freeze([]),
});

function childEnvFor(agent) {
  const env = {};
  const agentKeys = CHILD_ENV_AGENT_KEYS[agent] || [];
  for (const key of [...CHILD_ENV_BASE_KEYS, ...agentKeys]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

// ── spawner (injectable for hermetic tests) ───────────────────────────────
/**
 * v1.2 — `stdio[0] = 'ignore'`. This one word resurrects the Codex agent.
 *
 * Node's default is ['pipe','pipe','pipe'], so the child inherited a stdin pipe
 * that NEVER saw EOF. `claude -p` survives only because it gives up after 3s
 * ("no stdin data received in 3s, proceeding without it"). `codex exec` waits
 * forever: stderr reads "Reading additional input from stdin..." and the job
 * hangs until something kills it. Reproduced 2026-07-25 (job-ms0afc3y-aae0,
 * 8+ minutes, no output) and it is a known upstream bug with a unanimous
 * workaround — close stdin (`< /dev/null`). We do it at the source instead.
 */
function realSpawnJob(cmd, cwd, outStream, errStream, agent) {
  const isWin = process.platform === 'win32';
  const opts = { cwd, env: childEnvFor(agent || 'cc'), stdio: ['ignore', 'pipe', 'pipe'] };
  const child = isWin
    ? spawn([cmd.bin, ...cmd.args.map(quoteArg)].join(' '), Object.assign({ shell: true, windowsHide: true }, opts))
    : spawn(cmd.bin, cmd.args, opts);
  if (child.stdout) child.stdout.pipe(outStream);
  if (child.stderr) child.stderr.pipe(errStream);
  return child;
}

/**
 * Killing a job on Windows: `child.kill()` is not enough.
 * With `shell: true` the direct child is cmd.exe, so SIGKILL reaps the SHELL and
 * leaves the real CLI (claude.exe / codex.exe) orphaned and running — while the
 * ledger cheerfully writes `failed`. `taskkill /T` walks the whole process tree.
 */
function killTree(child) {
  if (!child) return false;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
    catch { /* fall through to the plain kill */ }
  }
  try { child.kill('SIGKILL'); return true; } catch { return false; }
}
let spawnJob = realSpawnJob;
function setJobSpawner(fn) { spawnJob = fn; }
let crossCheckRunner = null;
function setCrossCheckRunner(fn) { crossCheckRunner = typeof fn === 'function' ? fn : null; }

// ── job registry (live children in this server instance) ──────────────────
const REGISTRY = new Map(); // job_id → { child, timer, startedAt }

/**
 * v1.2 — reads the NDJSON stream instead of one final JSON blob.
 *
 * Returns the model the job ACTUALLY used, straight from its own stream. That
 * kills the worst bug in v1.1: fleet.js matched jobs to sessions by folder and
 * copied the model of whatever session shared that cwd — on 2026-07-25 a job
 * was labelled with the model of an 18-hour-old session. The stream cannot lie.
 *
 * `moo` reports a MEASURED zero (local inference costs nothing); codex/gemini
 * stay null, because unknown is unknown.
 */
function readJobResult(agent, jobDir, elapsedSeconds) {
  const empty = { cost_usd: null, session_id: null, model_used: null, body: null, telemetry: null };
  try {
    const t = telemetry.readJobTelemetry(path.join(jobDir, 'out.log'), elapsedSeconds);
    if (!t) return empty;
    let cost = t.cost_usd;
    if (cost == null && LOCAL_AGENTS.has(agent)) cost = 0;   // measured, not guessed
    if (cost == null && agent !== 'cc' && agent !== 'moo') cost = null;
    return {
      cost_usd: cost != null ? cost : null,
      session_id: t.session_id || null,
      model_used: t.model || null,
      body: t.finished && t.activity ? null : null,          // body comes from collect, not here
      telemetry: t,
    };
  } catch { return empty; }
}

function ollamaParaLedger(jobTelemetry) {
  const source = jobTelemetry && jobTelemetry.ollama;
  if (!source || typeof source !== 'object') {
    return {
      tok_s: null,
      load_duration_ns: null,
      prompt_eval_duration_ns: null,
      eval_duration_ns: null,
      num_ctx: null,
      porque: 'out.log não contém métricas Ollama para este job',
    };
  }
  const fields = ['tok_s', 'load_duration_ns', 'prompt_eval_duration_ns', 'eval_duration_ns', 'num_ctx'];
  const missing = fields.filter((field) => source[field] == null);
  const out = {};
  for (const field of fields) out[field] = source[field] != null ? source[field] : null;
  out.porque = missing.length
    ? (source.porque || 'out.log não forneceu: ' + missing.join(', '))
    : null;
  return out;
}

function quotaParaLedger(quotaCalibration) {
  const absent = 'o dispatch não recebeu calibragem de quota';
  if (!quotaCalibration || typeof quotaCalibration !== 'object') {
    return {
      pressao_quota: { valor: null, porque: absent },
      calibragem: { politica: null, nivel: null, tecto: null, porque: absent },
    };
  }
  const has = (field) => Object.prototype.hasOwnProperty.call(quotaCalibration, field)
    && quotaCalibration[field] !== undefined;
  const pressaoKnown = has('pressao') && quotaCalibration.pressao != null;
  const missing = ['politica', 'nivel', 'tecto']
    .filter((field) => !has(field) || quotaCalibration[field] == null);
  return {
    pressao_quota: {
      valor: pressaoKnown ? quotaCalibration.pressao : null,
      porque: pressaoKnown
        ? null
        : (quotaCalibration.porque || 'a calibragem não trouxe pressao'),
    },
    calibragem: {
      politica: has('politica') ? quotaCalibration.politica : null,
      nivel: has('nivel') ? quotaCalibration.nivel : null,
      tecto: has('tecto') ? quotaCalibration.tecto : null,
      porque: missing.length
        ? (quotaCalibration.porque || 'a calibragem não trouxe: ' + missing.join(', '))
        : null,
    },
  };
}

function stepsTotalFor(agent, suppliedTotal) {
  if (Number.isInteger(suppliedTotal) && suppliedTotal >= 0) return { steps_total: suppliedTotal, porque: null };
  if (agent === 'moo') return { steps_total: 1, porque: null };
  const signal = agent === 'codex'
    ? 'a contagem de chamadas de ferramenta no out.log'
    : (agent === 'cc' ? 'os eventos tool_use do stream' : 'o stream deste agente');
  return {
    steps_total: null,
    porque: signal + ' mede o passo actual, mas não fornece um total fiável sem steps explícitos',
  };
}

const CODEX_STEP_ITEMS = new Set([
  'command_execution', 'mcp_tool_call', 'web_search', 'file_change', 'tool_call',
]);

function stepSignalsForEvent(agent, event, seen) {
  if (!event || typeof event !== 'object') return [];
  if (agent === 'moo') {
    if (event.type !== 'result' || seen.has('moo-result')) return [];
    seen.add('moo-result');
    return ['generation'];
  }
  if (agent === 'codex') {
    const item = event.item && typeof event.item === 'object' ? event.item : null;
    if (event.type !== 'item.completed' || !item || !CODEX_STEP_ITEMS.has(item.type)) return [];
    const key = item.id ? 'codex:' + item.id : 'codex:' + seen.size;
    if (seen.has(key)) return [];
    seen.add(key);
    return ['tool_call'];
  }
  if (agent !== 'cc') return [];
  const message = event.message && typeof event.message === 'object' ? event.message : null;
  const content = message && Array.isArray(message.content) ? message.content
    : (Array.isArray(event.content) ? event.content : []);
  const signals = [];
  for (const part of content) {
    if (!part || part.type !== 'tool_use') continue;
    const key = part.id ? 'cc:' + part.id : 'cc:' + seen.size;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push('tool_call');
  }
  return signals;
}

function createStreamStepTracker(agent, onAdvance) {
  let pending = '';
  let stepIndex = 0;
  const seen = new Set();
  const inspect = (line) => {
    const source = String(line || '').trim();
    if (!source || source[0] !== '{') return;
    let event;
    try { event = JSON.parse(source); } catch { return; }
    for (const signal of stepSignalsForEvent(agent, event, seen)) onAdvance(++stepIndex, signal);
  };
  return {
    observe(chunk) {
      pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        inspect(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    },
    finish() { inspect(pending); pending = ''; return stepIndex; },
  };
}

/**
 * Separa intenção do chamador de capacidade efectiva. `--allowedTools` no
 * Claude Code preaprova ferramentas; não é o mesmo que `--tools`, que limita
 * as ferramentas disponíveis. Quando o comando não prova o conjunto efectivo,
 * a resposta é n/d com a razão em vez de promover o pedido a facto.
 */
function parseToolList(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const out = [];
  let token = ''; let depth = 0;
  const flush = () => { if (token.trim()) out.push(token.trim()); token = ''; };
  for (const char of raw) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if ((char === ',' || /\s/.test(char)) && depth === 0) flush();
    else token += char;
  }
  flush();
  return [...new Set(out)];
}

function ndPermissions(porque, fonte, extra) {
  return Object.assign({ valor: 'n/d', porque, fonte: fonte || 'comando executado' }, extra || {});
}

function requestedPermissions(meta) {
  if (!meta) return ndPermissions('não há metadados do job', 'meta.json');
  const raw = meta.allowedTools || (meta.agent === 'cc' ? 'Read' : null);
  if (!raw) {
    return ndPermissions('o chamador não declarou allowedTools', 'pedido recebido pelo conector');
  }
  return {
    valor: parseToolList(raw),
    porque: meta.allowedTools
      ? 'lista pedida ao conector em allowedTools'
      : 'default Read aplicado pelo conector ao Claude Code',
    fonte: meta.allowedTools ? 'meta.json.allowedTools' : 'default do buildCommand',
  };
}

function effectivePermissions(meta) {
  const cmd = String((meta && meta.cmd) || '');
  if (!meta || !cmd) return ndPermissions('meta.json não contém o comando executado', 'meta.json.cmd');
  if (meta.agent === 'codex') {
    const m = cmd.match(/--sandbox\s+(\S+)/);
    if (!m) return ndPermissions('o comando Codex não contém --sandbox', 'meta.json.cmd');
    return ndPermissions(
      'o sandbox prova o limite de escrita, mas o comando não declara o conjunto de ferramentas disponível',
      'flag --sandbox no comando executado',
      { sandbox: m[1], read_only: m[1] === 'read-only' },
    );
  }
  if (meta.agent === 'cc') {
    const tools = cmd.match(/(?:^|\s)--tools\s+(\S+)/);
    if (tools) {
      return {
        valor: parseToolList(tools[1].replace(/^"|"$/g, '')),
        porque: '--tools limita o conjunto de ferramentas disponível ao Claude Code',
        fonte: 'flag --tools no comando executado',
      };
    }
    const allowed = cmd.match(/--allowedTools\s+(\S+)/);
    return ndPermissions(
      '--allowedTools apenas permite/preaprova; sem --tools e --disallowedTools não prova tudo o que o agente pode usar',
      'flags do Claude Code no comando executado',
      { allowed_tools: allowed ? parseToolList(allowed[1]) : [], read_only: 'n/d' },
    );
  }
  if (meta.agent === 'moo') {
    return {
      valor: [], read_only: true,
      porque: 'o moo corre via /api/chat e não recebe ferramentas',
      fonte: 'caminho in-process de buildCommand',
    };
  }
  if (meta.agent === 'kimi') {
    return {
      valor: [], read_only: true,
      porque: 'o Kimi corre via API de chat Moonshot e não recebe ferramentas',
      fonte: 'caminho in-process de buildCommand',
    };
  }
  if (meta.agent === 'gemini') {
    return ndPermissions(
      '--approval-mode auto_edit não enumera as ferramentas que o Gemini pode usar',
      'flags do Gemini no comando executado',
      { approval_mode: 'auto_edit', read_only: false },
    );
  }
  return ndPermissions('agente desconhecido; não há contrato de ferramentas', 'meta.json.agent');
}

function permissionReport(meta) {
  const pedido = requestedPermissions(meta);
  const efectivo = effectivePermissions(meta);
  let diferenca;
  if (Array.isArray(pedido.valor) && Array.isArray(efectivo.valor)) {
    const a = [...pedido.valor].sort(); const b = [...efectivo.valor].sort();
    const diferem = JSON.stringify(a) !== JSON.stringify(b);
    diferenca = {
      diferem,
      porque: diferem
        ? 'a lista pedida não coincide com as ferramentas que o comando prova como disponíveis'
        : 'pedido e capacidade efectiva provada coincidem',
    };
  } else {
    diferenca = {
      diferem: 'n/d',
      porque: 'não é possível comparar listas porque a capacidade efectiva é n/d',
    };
  }
  return { pedido, efectivo, diferenca };
}

/**
 * O texto que o job entregou — a fonte ROBUSTA sobre se houve trabalho.
 * Extraída para função própria porque `finish()` e `toolCollect()` precisam
 * exactamente da mesma resposta, e tê-la em dois sítios foi como nasceu o bug
 * de marcar trabalho entregue como `empty-output`.
 */
function jobResultText(agent, jobDir) {
  try {
    if (agent === 'codex') {
      const p = path.join(jobDir, 'last-message.txt');
      if (fs.existsSync(p)) {
        const s = fs.readFileSync(p, 'utf8');
        if (s && s.trim()) return s;
      }
    }
    const tail = telemetry.readTail(path.join(jobDir, 'out.log'), telemetry.TAIL_BYTES) || '';
    const evs = telemetry.parseLines(tail);
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (e && e.result != null && String(e.result).trim()) return String(e.result);
    }
    // último recurso: qualquer texto de assistant no stream
    for (let i = evs.length - 1; i >= 0; i--) {
      const c = evs[i] && evs[i].message && evs[i].message.content;
      if (Array.isArray(c)) {
        const txt = c.filter((b) => b && b.type === 'text' && b.text).map((b) => b.text).join('\n');
        if (txt.trim()) return txt;
      }
    }
    return null;
  } catch { return null; }
}

// kept for callers/tests that still use the old name
function parseCostFromOut(agent, jobDir) {
  const r = readJobResult(agent, jobDir, null);
  return { cost_usd: r.cost_usd, session_id: r.session_id, resultJson: r.telemetry };
}

// ── tools ─────────────────────────────────────────────────────────────────
async function toolRoute(args) {
  const text = String((args && args.text) || '').trim();
  if (!text) return { error: 'text is required' };
  let classify;
  try { classify = requireClassify().classify; }
  catch (e) { return { error: (e && e.message) || String(e) }; }
  let d;
  try { d = classify(text); } catch (e) { return { error: 'classify falhou: ' + ((e && e.message) || e) }; }
  const tierToAgent = { T0: 'moo', T1: 'cc', T2: 'cc', T3: 'cc' };
  return {
    agent: tierToAgent[d.tier] || 'cc',
    tier: d.tier || null,
    confidence: d.confidence != null ? d.confidence : null,
    rationale: d.reasoning || null,
    recommended_model: d.recommended_model || null,
    cli_model: cliModelFor(tierToAgent[d.tier] || 'cc', d.tier, d.recommended_model),
    routing_note: 'classify.js (FROZEN, read-only) decide TIER; codex/gemini são escolha de doutrina de wave, não do classifier. v1.2: T0/moo É dispatchável (Ollama local, $0) e o modelo recomendado É passado ao CLI — o roteamento deixou de ser consultivo.',
  };
}

/**
 * Turn a tier into a flag the CLI accepts.
 *
 * The classifier speaks in product names ("haiku", "sonnet", "claude-opus-4-6").
 * `claude --model` takes an alias or a full name. We map to ALIASES on purpose:
 * an alias always resolves to the current model of that class, so a pinned
 * version cannot rot into an error six weeks from now. Unknown tier → null,
 * and null means "let the CLI decide" — never a fabricated model name.
 */
/**
 * ⚠️ v1.3.2 — TRANSLATE PER VENDOR, OR PASS NOTHING.
 *
 * v1.3.1 fixed "the router never reaches the CLI" and created a worse bug: it
 * reached EVERY CLI with Anthropic vocabulary. Two jobs died on 2026-07-25:
 *   moo   ← "opus"   → Ollama answered with an init line and nothing else, exit 0
 *   codex ← "sonnet" → HTTP 400 "The 'sonnet' model is not supported when using
 *                       Codex with a ChatGPT account."
 * classify.js is FROZEN and only speaks Anthropic — correctly, that is its job.
 * The missing piece was always a translation layer between router and spawn.
 *
 * Rule: a vendor we cannot map gets NO `--model` at all. Letting the CLI pick
 * its own default is honest; improvising a model name is how you pay for a
 * job's startup tokens and then watch it die.
 */
const VENDOR_MODELS = {
  cc: { T1: 'haiku', T2: 'sonnet', T3: 'opus', T5: null },
  // Codex tiers map to OpenAI names. Kept deliberately small: only aliases the
  // CLI is known to accept. Anything else → null → CLI default.
  codex: { T1: null, T2: null, T3: null, T5: null },
  gemini: { T1: null, T2: null, T3: null, T5: null },
  kimi: { T1: kimi.MODEL, T2: kimi.MODEL, T3: kimi.MODEL, T5: null },
  // moo never takes a tier name: the model has to be one that is actually
  // installed on this machine. moo.pickModel() resolves it from /api/ps.
  moo: null,
};

/**
 * ⚠️ v1.3.3 — o back-compat FOI APAGADO, e essa é a correcção.
 *
 * A v1.3.2 escreveu este mapa por vendor, escreveu 6 asserts a prová-lo, e o bug
 * continuou em produção — porque `toolWork` chamava com a assinatura antiga de
 * 2 argumentos. O shim `if (agent não é agente) { agent = 'cc' }` assumia
 * Anthropic e devolvia "sonnet" para um job `moo`. O back-compat protegia um
 * chamador que não existia e criava o chamador que falhava.
 *
 * Agora `agent` é obrigatório. Um chamador que o esqueça parte imediatamente,
 * em vez de receber silenciosamente um modelo do vendor errado.
 */
/**
 * ⚠️ A4 — o tier do MOTOR, derivado do que correu, não do que se pediu.
 *
 * Observado na auditoria: um job `moo` local ($0) apareceu como T0, depois T2,
 * depois T3 em três leituras; um job `cc` em Opus apareceu como T0. O campo
 * `tier` estava a carregar dois significados — a classificação do texto e a
 * escada de custo — e quem lê não tinha como saber qual dos dois estava a ver.
 *
 * Isto responde só a uma pergunta: quanto custa o que correu?
 */
function tierDoMotor(agent, model) {
  if (agent === 'moo') return 'T0';                       // local, $0, sempre
  const m = String(model || '').toLowerCase();
  if (m.includes('haiku')) return 'T1';
  if (m.includes('sonnet')) return 'T2';
  if (m.includes('opus')) return 'T3';
  if (m.includes('fable')) return 'T5';
  return null;                                            // n/d, nunca um palpite
}

function cliModelFor(agent, tier, recommended) {
  if (!['cc', 'codex', 'gemini', 'moo', 'kimi'].includes(String(agent))) {
    throw new TypeError('cliModelFor(agent, tier, recommended): agent obrigatório e válido, recebi ' + JSON.stringify(agent));
  }
  const a = String(agent);
  if (a === 'moo') return null;                    // resolved from what is resident
  const table = VENDOR_MODELS[a];
  if (!table) return null;                         // unknown vendor → CLI decides
  const t = String(tier || '').toUpperCase();
  if (t in table) return table[t];
  if (a !== 'cc') return null;                     // only Anthropic understands the aliases below
  const r = String(recommended || '').toLowerCase();
  if (r.includes('haiku')) return 'haiku';
  if (r.includes('sonnet')) return 'sonnet';
  if (r.includes('opus')) return 'opus';
  return null;
}

const QUOTA_MODEL_ORDER = ['haiku', 'sonnet', 'opus'];

/**
 * Aplica o tecto sem nunca promover um modelo conhecido. No ponto final do
 * dispatch, `null` num job CC significa um default do CLI sem limite explícito;
 * fixar o tecto aí restringe esse default, não afirma qual modelo ele seria.
 */
function applyQuotaCeiling(agent, model, calibration, finalResolution) {
  if (!calibration || !calibration.tecto || agent === 'moo') {
    return { model, applied: false, from: null };
  }
  const ceilingIndex = QUOTA_MODEL_ORDER.indexOf(String(calibration.tecto));
  if (ceilingIndex < 0) return { model, applied: false, from: null };

  const currentIndex = QUOTA_MODEL_ORDER.findIndex((name) => String(model || '').includes(name));
  if (currentIndex >= 0) {
    if (currentIndex <= ceilingIndex) return { model, applied: false, from: null };
    return { model: calibration.tecto, applied: true, from: model };
  }

  // Só o Claude Code aceita estes aliases. Nos outros providers, inventar uma
  // tradução seria trocar um tecto honesto por um comando inválido.
  if (finalResolution === true && agent === 'cc' && !model) {
    return { model: calibration.tecto, applied: true, from: '(default do CLI)' };
  }
  return { model, applied: false, from: null };
}

/**
 * ⚠️ A3 — não despachar leitura para quem não lê.
 *
 * Um goal que dizia "lê o packages/mooter-bridge/worktrees.js" foi para o `moo`
 * (Ollama local, que só gera texto) e voltou `done` com três funções INVENTADAS:
 * `createWorktree`, `removeWorktree`, `updateWorktree`. As reais são `list`,
 * `firstFree`, `create`, `mainRepo`.
 *
 * O conector já sabia — escreve "o moo só gera texto, não lê nem escreve
 * ficheiros" no `allowed_tools_effective`. Só que o diz no `collect`, à terceira
 * chamada, depois de o utilizador já ter lido uma resposta plausível e falsa.
 * Saber e não avisar a tempo é pior do que não saber.
 */
const LEITURA_RE = /\b(l[êe]|abre|analisa|audita|rev[êe]|revisa|inspecciona|inspeciona|verifica|examina|read|analyz[ei]|review|inspect|check)\b/i;
const PATH_RE = /(?:^|[\s"'`(])([\w./\\-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|py|rs|go|java|rb|php|sh|ps1|yml|yaml|toml|html|css|sql))\b/;
const DEICTIC_GOAL_RE = /\b(?:aqui|worktree\s+(?:actual|atual)|current\s+worktree|no\s+repo\s+(?:actual|atual))\b|\b(?:nesta|neste|esta)\s+(?:worktree|pasta|repo(?:sitório|sitorio)?)\b/i;
const WORKTREE_RECOVERY_STEPS = Object.freeze([
  'espera que um dos jobs acima termine',
  'mooter_cancel(sweep:true) — se forem órfãos de um reinício',
  'mooter_work({…, create_worktree:true}) — crio uma pasta nova a partir da branch actual',
]);

function isDeicticGoal(text) {
  return DEICTIC_GOAL_RE.test(String(text || ''));
}

function worktreeSuffix(requested, used, relocated, measuredFreshness) {
  const usedName = path.basename(String(used || requested || 'n/d'));
  if (relocated) {
    const fresh = measuredFreshness || (() => {
      try { return wt.frescura(used, REPO); } catch { return null; }
    })() || {};
    return ' · ⚠ relocado para ' + usedName
      + ' · branch ' + (fresh.branch || 'n/d')
      + ' · último commit há ' + (fresh.commit_age_human || 'n/d')
      + ' · HEAD ' + (fresh.head_short || 'n/d')
      + ' (pedida: ' + path.basename(String(requested || 'n/d')) + ')';
  }
  return ' · em ' + usedName;
}
const ENGINES_SEM_FICHEIROS = new Set(['moo', 'kimi']);

function pedeLeituraDeFicheiro(texto) {
  const t = String(texto || '');
  const m = t.match(PATH_RE);
  const temPath = !!m;
  const temVerbo = LEITURA_RE.test(t);
  if (!temPath && !temVerbo) return null;
  // um verbo de leitura sozinho é fraco; um path é prova suficiente
  if (!temPath && temVerbo && !/\b(ficheiro|arquivo|file|c[óo]digo|repo|pasta)\b/i.test(t)) return null;
  return { path: m ? m[1] : null, verbo: temVerbo };
}

/**
 * prepare continua compatível como alias do pré-digest local. A leitura dos
 * ficheiros é independente e fica ligada por omissão: prepare:false nunca mais
 * retira os olhos ao motor API.
 */
function resolverPreparacao(args) {
  const a = args || {};
  const explicitPreDigest = Object.prototype.hasOwnProperty.call(a, 'pre_digest');
  const explicitReadFiles = Object.prototype.hasOwnProperty.call(a, 'read_files');
  return {
    read_files: explicitReadFiles ? a.read_files !== false : true,
    pre_digest: explicitPreDigest ? a.pre_digest !== false : a.prepare !== false,
    prepare_legacy: !explicitPreDigest && Object.prototype.hasOwnProperty.call(a, 'prepare'),
  };
}

function temContextoDeFicheiros(args, masterprompt) {
  const evidencia = args && args.evidencia;
  if (evidencia && Array.isArray(evidencia.ficheiros_lidos) && evidencia.ficheiros_lidos.length) return true;
  return /## FICHEIROS REAIS \(lidos do disco pelo Mooter, não inventados\)/i.test(String(masterprompt || ''));
}

function recusaContratoDeLeitura(agent, leitura, effective) {
  return {
    error: '❌ contrato recusou o dispatch: a tarefa exige leitura de ficheiros, mas o motor não recebe ferramentas de leitura nem contexto injectado',
    erro: 'capacidade_incompativel',
    requisito: { tipo: 'leitura_de_ficheiros', ficheiro: leitura && leitura.path ? leitura.path : null },
    capacidade_efectiva: effective,
    falta: 'activa read_files para o conector injectar o conteúdo, ou escolhe um motor com ferramentas de leitura',
    agent,
    faz_assim: [
      'mooter_work({goal, agent:"' + agent + '", read_files:true}) — o conector lê e injecta os ficheiros antes do dispatch',
      'mooter_work({goal, agent:"cc"}) — o Claude Code lê os ficheiros com as suas ferramentas',
      'mooter_work({goal, agent:"codex"}) — o Codex lê os ficheiros no sandbox declarado',
    ],
  };
}

/**
 * Guarda mecânico de recusa. Só aceita uma recusa explícita logo no início e
 * ligada a acesso/contexto em falta; menções laterais a incerteza não contam.
 */
function recusaPorFaltaDeContexto(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const lead = source
    .replace(/^(?:[#>*\-\s]+|(?:resposta|resultado|análise|analise|answer|result)\s*:\s*)+/i, '')
    .slice(0, 700);
  const missing = /\b(?:acesso|access|contexto|context|ficheiro|arquivo|file|conte[úu]do|content|dados|data)\b/i;
  if (!missing.test(lead)) return null;
  const explicit = /^(?:desculp[ae],?\s*|sorry,?\s*)?(?:(?:não|nao)\s+(?:consigo|posso|tenho como|sou capaz de|tenho acesso)|(?:i\s+(?:can't|cannot|do not have access|don't have access|am unable to)|unable to)|(?:sem|without)\s+(?:acesso|access|contexto|context)[^.!?]{0,160}\b(?:não|nao|cannot|can't|unable)\b)\b/i;
  if (!explicit.test(lead)) return null;
  if (/\b(?:mas|por[ée]m|contudo|however|but)\b.{0,180}\b(?:com base no|baseado no|conte[úu]do fornecido|segue|here is|based on the provided)\b/i.test(lead)) {
    return null;
  }
  const sentence = (lead.match(/^[^\r\n.!?]{1,240}[.!?]?/) || [lead.slice(0, 240)])[0].trim();
  return 'recusa do agente por falta de contexto: ' + sentence;
}

/**
 * ⚠️ Auditoria E2E 2026-08-01, loophole #1 — o titular dizia feito a trabalho
 * por verificar.
 *
 * Medido sem provocação: um job `cc` escreveu `index.js` e `index.test.js`
 * correctamente, terminou a dizer «Preciso de aprovação para executar
 * `node --test`», e o conector gravou **`done · exit 0`**. Os testes até
 * passavam — mas isso foi sorte, não prova: o agente nunca os correu.
 *
 * A causa estrutural está em `buildCommand` (`:3024`): com `write:true` a lista
 * é `Read,Glob,Grep,Edit,Write` — **`Bash` fica de fora**. Logo TODO job que
 * precise de correr testes, build, lint ou git termina a pedir aprovação. Não é
 * caso raro: é o caminho normal de qualquer tarefa que se queira verificar.
 *
 * Segue-se o precedente que este ficheiro já tinha para a recusa por falta de
 * contexto (`:1096`): sai 0, mas não entregou o que foi pedido ⇒ NÃO é `done`.
 * Aqui o desfecho é `nao_verificado` — distinto de `failed`, porque houve
 * trabalho real; e distinto de `done`, porque ninguém o verificou.
 */
const PEDIDO_APROVACAO_RE = new RegExp(
  '(?:preciso|necessito)\\s+(?:de\\s+)?(?:a\\s+tua\\s+)?(?:aprova[çc][ãa]o|permiss[ãa]o|autoriza[çc][ãa]o)'
  + '|(?:posso|podes\\s+confirmar|queres\\s+que\\s+(?:eu\\s+)?(?:corra|execute))'
  + '|(?:aguardo|a\\s+aguardar)\\s+(?:a\\s+tua\\s+)?(?:aprova[çc][ãa]o|confirma[çc][ãa]o)'
  + '|(?:i\\s+need|requesting|awaiting)\\s+(?:your\\s+)?(?:approval|permission)'
  + '|permission\\s+(?:is\\s+)?required',
  'i');

/** O pedido de aprovação só conta se estiver no FIM — é aí que trava o trabalho. */
function terminouAPedirAprovacao(delivered) {
  const t = String(delivered || '').trim();
  if (!t) return null;
  const cauda = t.slice(-600);
  const m = cauda.match(PEDIDO_APROVACAO_RE);
  if (!m) return null;
  return 'terminou a pedir aprovação («' + m[0].trim().slice(0, 60)
    + '») — o passo pedido não foi executado nem verificado';
}

function classificarEntrega(code, delivered) {
  const producedNothing = !delivered || !String(delivered).trim();
  const refusal = code === 0 && !producedNothing
    ? recusaPorFaltaDeContexto(delivered)
    : null;
  const aguardaAprovacao = code === 0 && !producedNothing && !refusal
    ? terminouAPedirAprovacao(delivered)
    : null;
  return {
    producedNothing,
    refusal,
    aguarda_aprovacao: aguardaAprovacao,
    ok: code === 0 && !producedNothing && !refusal && !aguardaAprovacao,
    evento: (code === 0 && !producedNothing && !refusal && aguardaAprovacao)
      ? 'nao_verificado' : undefined,
    exit_code: refusal ? 'agent-refused-missing-context'
      : (aguardaAprovacao ? 'agent-awaiting-approval'
        : (producedNothing && code === 0 ? 'empty-output' : code)),
  };
}

const EXECUTION_VERB_RE = /\b(corre|executa|roda|run)\b/i;
const EXECUTION_KNOWN_COMMAND_RE = /\b(?:npm\s+(?:test\b|run\s+\S+)|node\s+(?:--test\b|[\w./\\-]+\.test\.js\b)|git\s+\S+|pytest(?:\s|$))/i;
const EXECUTION_NON_GIT_RE = /\b(?:npm\s+(?:test\b|run\s+\S+)|node\s+(?:--test\b|[\w./\\-]+\.test\.js\b)|pytest(?:\s|$))/i;
const EXECUTION_BACKTICK_RE = /`([^`\r\n]{2,200})`/g;

/**
 * Detecta intenção de execução, não apenas os comandos git que o A4 pode
 * correr em segurança. O A4 e este guard são complementares: o primeiro
 * recolhe evidência permitida; este impede entregar ao /api/chat o resto.
 */
function pedeExecucaoDeMotor(texto) {
  const t = String(texto || '');
  const hasVerb = EXECUTION_VERB_RE.test(t);
  const hasKnownCommand = EXECUTION_KNOWN_COMMAND_RE.test(t);
  const hasGit = /\bgit\s+\S+/i.test(t);
  let backtickCommand = null;
  let match;
  EXECUTION_BACKTICK_RE.lastIndex = 0;
  while ((match = EXECUTION_BACKTICK_RE.exec(t)) !== null) {
    const candidate = match[1].trim();
    if (EXECUTION_KNOWN_COMMAND_RE.test(candidate)
      || /^(?:python3?|npx|pnpm|yarn|bun|deno|cargo|go|dotnet|mvn|gradle|bash|sh|pwsh|powershell|cmd)\b\s+\S+/i.test(candidate)) {
      backtickCommand = candidate;
      break;
    }
  }
  if (!hasVerb && !hasKnownCommand && !backtickCommand) return null;
  /**
   * ⚠️ Auditoria E2E 2026-08-01 — o verbo em PROSA deixou de barrar.
   *
   * «correr» é um verbo comuníssimo em prosa descritiva portuguesa. Medido três
   * vezes no mesmo dia, em goals legítimos e sem qualquer comando:
   *   · «diz-me o que CORRE mal na qualidade do código»
   *   · «o hot-swap é código que CORRE de verdade, ou andaime?»
   * Nos dois casos o dispatch foi barrado com `pedido_execucao:{verbo:'corre',
   * comando:null}` — e o primeiro dizia explicitamente «não executes nada».
   *
   * PRIMEIRA TENTATIVA, ERRADA (registada de propósito): exigir sempre um comando
   * identificado. `seamless.test.js:196` apanhou-a de imediato — «corre os testes»
   * é um pedido de execução real e não tem comando literal nenhum. O teste tinha
   * razão; a correcção é que era grosseira. Precedente ondaA: estabelecer quem
   * está errado antes de mexer. Ver G11 — o instrumento era meu, e falhava.
   *
   * A distinção certa não é «tem comando?», é «o verbo tem OBJECTO executável?».
   * `corre os testes` / `roda a suite` → objecto. `corre mal` / `corre de verdade`
   * → advérbio, é prosa. Só o segundo caso é descartado, e apenas quando não há
   * comando nenhum a acompanhar.
   */
  const VERBO_EM_PROSA_RE = /\b(?:corre|corr[ea]m|executa|roda|run|runs)\s+(?:mal|bem|melhor|pior|depressa|devagar|lento|r[áa]pido|de\s+verdade|na\s+realidade|o\s+risco|perigo|deep|silent(?:ly)?|smooth(?:ly)?|fine|well|badly)\b/i;
  if (hasVerb && !hasKnownCommand && !backtickCommand && VERBO_EM_PROSA_RE.test(t)) return null;
  const hasNonGit = EXECUTION_NON_GIT_RE.test(t)
    || !!(backtickCommand && !/^git\s+/i.test(backtickCommand));
  return {
    verbo: (t.match(EXECUTION_VERB_RE) || [])[0] || null,
    comando: backtickCommand || (t.match(EXECUTION_KNOWN_COMMAND_RE) || [])[0] || null,
    apenas_git: hasGit && !hasNonGit,
  };
}

function executionCapability(agent) {
  const commandText = agent === 'moo' ? '(ollama) /api/chat'
    : (agent === 'kimi' ? '(moonshot) /v1/chat/completions' : '(dispatch pendente)');
  const effective = effectivePermissions({ agent, cmd: commandText });
  return {
    supported: !(Array.isArray(effective.valor) && effective.valor.length === 0),
    effective,
  };
}

/**
 * ── A4 · dar olhos de EXECUÇÃO ao motor local ─────────────────────────────
 *
 * Irmão do A3. O A3 lê ficheiros pelo modelo; o A4 corre comandos por ele.
 *
 * Nasceu de um caso medido em 2026-07-26: foram pedidos ao `moo` cinco comandos
 * git. O A3 não disparou — o texto não tinha nenhum path com extensão conhecida
 * e "repositorio" não faz match de `\brepo\b`. Nada foi injectado, e o qwen3:30b
 * devolveu uma tabela com `n/d` na coluna da evidência e PASS/FAIL na coluna do
 * veredicto. Inventou a conclusão a partir de coisa nenhuma.
 *
 * Três invariantes. Cada um foi pago com um erro de uma tentativa anterior:
 *
 *  1. ALLOWLIST SÓ GIT, e só subcomandos que lêem. `npm test` e `node --test`
 *     correm código do repositório: não são leitura, são execução arbitrária
 *     despoletada por uma frase em português. Uma tentativa anterior punha-os
 *     na lista, e bastava MENCIONAR "o npm test da wave anterior" para o
 *     servidor executar o script `test` do package.json.
 *
 *  2. OS ARGUMENTOS DO UTILIZADOR SÃO SAGRADOS. Correr `git show` quando foi
 *     pedido `git show --stat <sha>` é dar evidência errada com selo de
 *     autenticidade — pior do que não dar nenhuma, porque agora tem carimbo.
 *     Se um argumento não passa a validação, o comando INTEIRO é descartado e
 *     dito em voz alta. Nunca uma versão mutilada a fingir que é a pedida.
 *
 *  3. O ESTADO DE EVIDÊNCIA VAI PARA `meta.json`. O guard de saída corre no
 *     `collect`, muito depois de o objecto em memória ter desaparecido: se o
 *     estado só existir na resposta do `work`, o guard lê `undefined` e degrada
 *     tudo, sempre. Um aviso que dispara sempre é ruído, e ruído ensina a
 *     ignorar avisos.
 *
 * A segurança real está em `shell:false` + binário fixo `git`: sem shell, um
 * `;` dentro de um argumento é um byte, não um comando. As proibições abaixo
 * são defesa em profundidade, não a defesa principal.
 */
const GIT_SUB_LEITURA = new Set([
  'show', 'status', 'log', 'diff', 'ls-files', 'rev-parse',
  'branch', 'merge-base', 'shortlog', 'describe', 'blame', 'cat-file',
]);
// flags que fazem o git executar OUTRO programa, escrever ficheiros, ou mudar de repo
const FLAG_PROIBIDA = /^(-c|-C|--exec|--exec-path|--upload-pack|--receive-pack|--output|--ext-diff|--git-dir|--work-tree|--namespace|--config-env)(=|$)/i;
// `git branch` também apaga, move e copia — as flags de escrita saem
const FLAG_PROIBIDA_POR_SUB = {
  branch: /^(-d|-D|-m|-M|-c|-C|-u|--delete|--move|--copy|--set-upstream(-to)?|--unset-upstream|--edit-description|--force)(=|$)/i,
};
const METACARACTER = /[;|&$`<>\r\n]/;
/**
 * Onde acabam os argumentos e começa a frase.
 *
 * "corre git rev-parse HEAD e depois git push" tem de dar `git rev-parse HEAD`,
 * não `git rev-parse HEAD e depois git push origin main` — que é o que uma
 * captura gulosa até ao fim da linha produz, e que o git recusa com
 * "ambiguous argument 'e'". Um pedido em português não traz `;` a separar.
 */
const PALAVRA_DE_LIGACAO = new Set([
  'e', 'ou', 'mas', 'depois', 'então', 'entao', 'também', 'tambem', 'ainda', 'já', 'ja',
  'and', 'or', 'then', 'also', 'after', 'next',
  'diz', 'diz-me', 'conta', 'mostra', 'mostra-me', 'verifica', 'valida', 'confirma',
  'relata', 'cola', 'explica', 'compara', 'resume', 'no', 'na', 'nos', 'nas', 'para',
  'quantos', 'quantas', 'qual', 'quais', 'se', 'que', 'com', 'sem', 'por', 'em',
]);
const A4_MAX_COMANDOS = 6;
// ⚠️ 5s não chega: `git status` numa árvore com centenas de ficheiros por
// rastrear leva mais do que isso, e um timeout aqui vira "sem evidência".
const A4_TIMEOUT_MS = 15000;
const A4_BYTES_POR_COMANDO = 24000;
const A4_BYTES_TOTAL = 64000;

/**
 * Parte uma lista de argumentos preservando o que veio entre aspas.
 *
 * ⚠️ `--format="%H | %an"` é UM argumento, não três. Um tokenizador que parta
 * só por espaços vê `--format="%H`, `|`, `%an"` — e o `|` solto faz o comando
 * inteiro ser recusado por metacaracter. Foi assim que o caso real de 2026-07-26
 * falhou no primeiro teste desta suite: o `git show --stat` era descartado e
 * sobrava o segundo `git show`, com os argumentos errados.
 */
function tokenizarArgs(s) {
  const out = [];
  const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  let m;
  while ((m = re.exec(String(s || '')))) {
    const bruto = m[0];
    const aspado = /["']/.test(bruto);
    out.push({ v: bruto.replace(/["']/g, ''), aspado, bruto });
  }
  return out;
}

/**
 * Encontra os comandos git pedidos no texto, COM os argumentos que o utilizador
 * escreveu. Devolve sempre a lista completa — os recusados vêm com o porquê,
 * para que a recusa apareça no prompt em vez de desaparecer.
 */
function pedeExecucao(texto) {
  const t = String(texto || '');
  // cortar em separadores de frase e em enumerações "(1)" / "(2)", nunca no `|`
  // — um `|` costuma vir dentro de um --format="%H | %an" e não separa nada
  // ⚠️ partir POR `git` em vez de casar com uma regex gulosa: uma captura
  // `git\s+([^\n;]+)` consome até ao fim da linha e o segundo `git` do texto
  // nunca chega a ser visto — "git rev-parse HEAD e depois git push" dava um
  // comando só, malformado, em vez de um bom e um recusado.
  const segmentos = t.split(/\bgit\s+/i).slice(1);
  const achados = [];
  const vistos = new Set();
  for (const seg of segmentos) {
    if (achados.length >= A4_MAX_COMANDOS) break;
    const linha = String(seg || '').split(/\n|;|\(\s*\d+\s*\)/)[0];
    const toks = tokenizarArgs(linha);
    if (!toks.length) continue;

    // ⚠️ o subcomando é o PRIMEIRO token. Se vier uma flag antes dele
    // (`git -c core.pager=id status`), isso é o git a ser instruído a executar
    // outra coisa — recusa-se em voz alta, não se ignora em silêncio.
    const cabeca = toks.shift();
    if (cabeca.v.startsWith('-')) {
      achados.push({ sub: null, args: [], nome: 'git ' + cabeca.v + ' …', recusado: 'argumento proibido antes do subcomando: ' + cabeca.v });
      continue;
    }
    const sub = cabeca.v.toLowerCase();
    if (!GIT_SUB_LEITURA.has(sub)) {
      achados.push({ sub, args: [], nome: 'git ' + sub, recusado: 'subcomando fora da allowlist de leitura' });
      continue;
    }
    const args = [];
    let recusado = null;
    for (const tk of toks) {
      // a frase recomeça: os argumentos deste comando acabaram aqui
      if (tk.v.toLowerCase() === 'git') break;
      if (!tk.aspado && !tk.v.startsWith('-') && PALAVRA_DE_LIGACAO.has(tk.v.toLowerCase())) break;
      if (FLAG_PROIBIDA.test(tk.v)) { recusado = 'argumento proibido: ' + tk.v; break; }
      const porSub = FLAG_PROIBIDA_POR_SUB[sub];
      if (porSub && porSub.test(tk.v)) { recusado = 'argumento que escreve: ' + tk.v; break; }
      if (!tk.aspado && METACARACTER.test(tk.v)) { recusado = 'metacaracter em argumento não citado: ' + tk.v; break; }
      if (tk.v.length > 200) { recusado = 'argumento demasiado longo'; break; }
      args.push(tk.v);
    }
    const nome = ('git ' + sub + ' ' + args.join(' ')).trim();
    // ⚠️ nunca correr uma versão mutilada do que foi pedido
    if (recusado) { achados.push({ sub, args: [], nome: 'git ' + sub + ' …', recusado }); continue; }
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    achados.push({ sub, args, nome, recusado: null });
  }
  return achados.length ? achados : null;
}

/** Corre UM comando já validado. Nunca recebe nada do utilizador sem passar por pedeExecucao. */
function correrGit(args, worktree, maxBytes) {
  const { spawnSync } = require('child_process');
  const r = spawnSync('git', args, {
    cwd: worktree,
    shell: false,                       // ⬅ a defesa principal
    encoding: 'utf8',
    timeout: A4_TIMEOUT_MS,
    maxBuffer: Math.max(4096, maxBytes),
    windowsHide: true,
    // GIT_OPTIONAL_LOCKS=0 impede o `status` de refrescar (e travar) o index.
    // Um conector de LEITURA que deixa um index.lock para trás não é de leitura.
    env: Object.assign(childEnvFor('git'), { GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }),
  });
  if (r.error) return { erro: (r.error.code === 'ETIMEDOUT' ? 'excedeu ' + (A4_TIMEOUT_MS / 1000) + 's' : String(r.error.message || r.error)), saida: null };
  if (r.status !== 0) return { erro: 'saiu ' + r.status + (r.stderr ? ': ' + String(r.stderr).trim().split('\n')[0].slice(0, 160) : ''), saida: null };
  const out = String(r.stdout || '');
  return { erro: null, saida: out.slice(0, maxBytes), truncado: out.length > maxBytes };
}

/** Corre os comandos pedidos e devolve o bloco a injectar no prompt. */
function executarComandos(texto, worktree) {
  const pedidos = pedeExecucao(texto);
  if (!pedidos) return null;
  const executados = [];
  const recusados = [];
  const partes = [];
  let usado = 0;

  for (const p of pedidos) {
    if (p.recusado) { recusados.push({ comando: p.nome, porque: p.recusado }); continue; }
    const resta = A4_BYTES_TOTAL - usado;
    if (resta < 2000) { recusados.push({ comando: p.nome, porque: 'orçamento de bytes esgotado' }); continue; }
    // ⚠️ o subcomando vai À CABEÇA dos argumentos. Sem ele, `git --abbrev-ref HEAD`
    // é o git a ler uma opção global que não existe, e sai 129.
    const r = correrGit([p.sub, ...p.args], worktree, Math.min(A4_BYTES_POR_COMANDO, resta));
    if (r.erro) { recusados.push({ comando: p.nome, porque: r.erro }); continue; }
    usado += r.saida.length;
    executados.push(p.nome);
    partes.push('$ ' + p.nome + '\n```\n' + (r.saida.trim() || '(saída vazia)')
      + (r.truncado ? '\n… [truncado]' : '') + '\n```');
  }

  if (!partes.length) {
    // nada correu: quem chama decide se avisa ou recusa — mas não inventamos um bloco
    return { bloco: null, executados: [], recusados, chars: 0 };
  }

  const cab = [
    '',
    '---',
    '## SAÍDAS REAIS, corridas pelo conector no teu lugar',
    '',
    'Não tens ferramentas para executar comandos. O conector correu-os por ti, nesta pasta,',
    'e o que está abaixo é a saída literal — não é um resumo nem uma reconstrução.',
    '',
    '⚠️ REGRA QUE NÃO SE NEGOCEIA: uma conclusão só pode assentar numa saída que esteja aqui.',
    'Se uma verificação não tem saída em baixo, escreve `n/d` na linha E `n/d` no veredicto.',
    'Nunca PASS, nunca FAIL, nunca "seguro" ou "aprovado" sem a saída correspondente à vista.',
    recusados.length
      ? '\n❌ Não corri (e portanto NÃO tens evidência para isto): '
        + recusados.map((r) => r.comando + ' — ' + r.porque).join(' · ')
      : '',
  ].filter((l) => l !== '').join('\n');

  return { bloco: cab + '\n\n' + partes.join('\n\n') + '\n---\n', executados, recusados, chars: usado };
}

/**
 * A4 · nível 2 do guard de saída. Mecânico: não pede nada ao modelo.
 *
 * Um veredicto é uma afirmação sobre o mundo. Se o motor não tinha ferramentas
 * E o disco não regista evidência nenhuma, a afirmação não pode ter vindo de
 * lado nenhum — e vai marcada. O contrário também importa: quando HÁ evidência,
 * isto cala-se. Um aviso que dispara sempre é ruído, e ruído ensina a ignorar.
 */
const VEREDICTO_RE = /(\bPASS\b|\bFAIL\b|\bNO[-\s]?SHIP\b|\bSHIP\b|\baprovad[oa]\b|\breprovad[oa]\b|seguro para (?:o )?push|pode(?:s)? fazer push|est[áa] (?:tudo )?(?:ok|correcto|correto)\b)/i;

function veredictoSemEvidencia(meta, body) {
  if (!body || !meta) return { degradado: false };
  if (!ENGINES_SEM_FICHEIROS.has(meta.agent)) return { degradado: false };
  const ev = meta.evidencia || null;
  const teveAlgo = !!(ev && ((ev.ficheiros_lidos || []).length || (ev.comandos_corridos || []).length));
  if (teveAlgo) return { degradado: false };
  if (!VEREDICTO_RE.test(String(body))) return { degradado: false };
  const recusados = (ev && ev.comandos_recusados) || [];
  const origem = meta.agent === 'kimi' ? kimi.PROVIDER_LABEL : 'um motor local';
  const aviso = [
    '> ⚠️ **VEREDICTO NÃO VERIFICADO** — o que está abaixo foi escrito por ' + origem,
    '> sem ferramentas, e o conector não lhe injectou ficheiro nem saída de comando nenhuma.',
    recusados.length
      ? '> Comandos que não correram: ' + recusados.map((r) => r.comando + ' (' + r.porque + ')').join(' · ')
      : '> Nenhuma evidência foi recolhida para este job.',
    '> Qualquer PASS, FAIL, SHIP, NO-SHIP ou "seguro" no texto seguinte é especulação, não observação.',
    '',
    '',
  ].join('\n');
  return { degradado: true, texto: aviso + String(body) };
}

/**
 * Ask the FROZEN classifier directly. Returns null if it is unavailable.
 *
 * ⚠️ Até 2026-08-01 este `catch` era `{ return null; }` — engolia a razão e o
 * conector seguia como se nada fosse. Agora cada tentativa deixa rasto em
 * ROUTER_ESTADO: disponível ou não, porquê, e quanto tempo levou A MEDIR (nunca
 * a afirmar). O valor de retorno mantém-se igual — nada a jusante muda.
 */
function classifyOrNull(text) {
  ROUTER_ESTADO.tentativas += 1;
  let classify;
  try {
    ({ classify } = requireClassify());
  } catch (e) {
    ROUTER_ESTADO.disponivel = false;
    ROUTER_ESTADO.porque = 'classify.js não carregou: ' + ((e && e.message) || String(e));
    ROUTER_ESTADO.classify_ms = null;
    ROUTER_ESTADO.caminho = null;
    return null;
  }
  const t0 = process.hrtime.bigint();
  try {
    const d = classify(String(text || ''));
    ROUTER_ESTADO.disponivel = true;
    ROUTER_ESTADO.porque = 'classify.js carregou e classificou; classify_ms é MEDIDO nesta chamada';
    ROUTER_ESTADO.classify_ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e3) / 1e3;
    return d;
  } catch (e) {
    ROUTER_ESTADO.disponivel = false;
    ROUTER_ESTADO.porque = 'classify.js carregou mas rebentou a classificar: ' + ((e && e.message) || String(e));
    ROUTER_ESTADO.classify_ms = null;
    return null;
  }
}

/**
 * Estado do router garantindo que houve pelo menos UMA tentativa. Usado no
 * retorno de `mooter_work`: devolver `null` ali seria abstenção sobre algo que
 * já podia ter sido medido.
 */
function routerParaResposta(text) {
  if (ROUTER_ESTADO.tentativas === 0) classifyOrNull(text);
  return estadoDoRouter();
}

/**
 * Pull a finished job's answer in, so the next agent starts where the last one
 * stopped. This is what makes a handoff REAL: not a slogan about collaboration,
 * but the previous output physically embedded in the next masterprompt — and
 * recorded in the ledger as `handoff_from`, so the panel can draw the arrow
 * without anyone inventing it.
 */
function embedHandoff(masterprompt, fromJobId) {
  if (!fromJobId) return { mp: masterprompt, ok: false };
  try {
    const jobDir = path.join(JOBS_DIR(), fromJobId);
    const meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8'));
    const tail = telemetry.readTail(path.join(jobDir, 'out.log'), telemetry.TAIL_BYTES) || '';
    const evs = telemetry.parseLines(tail);
    let body = null;
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i] && evs[i].result != null) { body = String(evs[i].result); break; }
    }
    if (!body) return { mp: masterprompt, ok: false };
    const who = meta.agent === 'moo'
      ? ('GPU local' + (meta.model ? ' · ' + meta.model : ''))
      : (agentLabel(meta.agent) + (meta.model ? ' · ' + meta.model : ''));
    const block = [
      '',
      '---',
      '## ⇄ PREPARADO PARA TI POR ' + who.toUpperCase() + ' (job ' + fromJobId + ')',
      '',
      'Isto foi produzido antes de tu entrares, para não gastares tokens a redescobrir o óbvio.',
      'Trata como contexto, não como verdade absoluta — se algo estiver errado, corrige e diz.',
      '',
      body.slice(0, 12000),
      '---',
      '',
    ].join('\n');
    return { mp: masterprompt + block, ok: true, from_agent: meta.agent, from_model: meta.model || null };
  } catch { return { mp: masterprompt, ok: false }; }
}

/**
 * O job pago termina primeiro; a verificação local é uma auditoria posterior e
 * nunca atrasa o estado done. O JSON no job torna o retorno recolhível sem
 * transformar o ledger numa segunda fonte de verdade para o conteúdo.
 */
async function runCrossCheckForJob({ job_id, resultado, worktree, wave, agent, jobDir }) {
  let checked;
  try {
    const options = crossCheckRunner
      ? { runner: crossCheckRunner }
      : (spawnJob !== realSpawnJob
        ? { runner: async () => ({ available: false, reason: 'runner local não injectado no teste hermético' }) }
        : undefined);
    checked = await fosso.verificacaoCruzada({ job_id, resultado, worktree }, options);
  } catch (error) {
    checked = {
      job_id, disponivel: false,
      porque: 'a verificação cruzada falhou: ' + ((error && error.message) || 'erro desconhecido'),
      divergencias: [], verificado: 0, custo_usd: 0,
      vram_livre_mb: 'n/d',
      rotulo: 'interpretação do moo local — nunca altera os factos medidos',
      nota: 'sem veredicto: a verificação factual local não terminou',
    };
  }
  try {
    await fs.promises.writeFile(
      path.join(jobDir, 'cross-check.json'),
      JSON.stringify(checked, null, 2) + '\n',
      'utf8',
    );
  } catch (error) {
    log('cross-check ' + job_id + ' não persistiu: ' + ((error && error.message) || error));
  }
  ledgerAppend({
    job_id, wave, agent, worktree, event: 'cross_check',
    disponivel: checked.disponivel === true,
    verificado: Number(checked.verificado) || 0,
    divergencias_count: Array.isArray(checked.divergencias) ? checked.divergencias.length : 0,
    custo_usd: 0,
    vram_livre_mb: checked.vram_livre_mb == null ? 'n/d' : checked.vram_livre_mb,
    rotulo: checked.rotulo || 'interpretação do moo local — nunca altera os factos medidos',
    porque: checked.porque || null,
    note: checked.nota || null,
  });
  if (Array.isArray(checked.divergencias) && checked.divergencias.length) {
    try {
      require('./board.js').registarInterrupcao({
        motivo: 'divergencia', quem_pediu: 'fosso.crossCheck', metrica: 'cross_check',
        o_que: 'job ' + job_id + ' produziu ' + checked.divergencias.length + ' divergência(s) verificável(eis)',
      });
    } catch { /* a verificação continua; o contador ficará n/d se o append falhar */ }
  }
  return checked;
}

function readCrossCheck(jobDir) {
  try { return JSON.parse(fs.readFileSync(path.join(jobDir, 'cross-check.json'), 'utf8')); }
  catch { return null; }
}

function normalizarDecisaoLocal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const decisao = {
    local: raw.local === true,
    porque: String(raw.porque || 'n/d'),
    confianca: String(raw.confianca || 'n/d'),
    forcado_por_quota: raw.forcado_por_quota === true,
  };
  if (raw.local === false && raw.motivo_nao_local) {
    decisao.motivo_nao_local = String(raw.motivo_nao_local);
  }
  return decisao;
}

async function toolDispatch(args) {
  const cargoSelection = normalizarCargo(args && args.cargo);
  if (!cargoSelection.ok) {
    return { error: cargoSelection.error, cargos_validos: cargoSelection.cargos_validos };
  }
  const agent = String((args && args.agent) || '').trim();
  const worktree = String((args && args.worktree) || '').trim();
  let masterprompt = String((args && args.masterprompt) || '');
  const wave = String((args && args.wave) || 'adhoc').trim();
  const allowedTools = args && args.allowedTools ? String(args.allowedTools) : null;
  const stepId = args && args.step ? String(args.step) : null;
  const handoffFrom = args && args.handoff_from ? String(args.handoff_from) : null;
  const chain = args && args.__chain ? args.__chain : null;   // internal: set by mooter_work
  const dispatchNote = args && args.__note ? String(args.__note) : null;
  const prepFrom = args && args.__prep_from ? String(args.__prep_from) : null;
  const createdWorktree = args && args.__worktree_created && typeof args.__worktree_created === 'object'
    ? args.__worktree_created : null;
  const rawLocalDecision = args && args.__local_decisao && typeof args.__local_decisao === 'object'
    ? args.__local_decisao : null;
  const localDecision = normalizarDecisaoLocal(rawLocalDecision);
  const stepProgress = stepsTotalFor(agent, args && args.__steps_total);

  const g = guardCheck({ agent, worktree, masterprompt, wave, allowedTools });
  if (!g.ok) return { error: '❌ guard recusou o dispatch', reasons: g.reasons, faz_assim: guardFazAssim(g.reasons) };
  /**
   * ⚠️ CORRIGIDO na auditoria de 2026-07-31 — o contrato de capacidades chegou
   * a analisar o MASTERPROMPT inteiro em vez do pedido do utilizador:
   *
   *     const leituraExigida = pedeLeituraDeFicheiro(masterprompt);   // ERRADO
   *
   * O masterprompt carrega sempre o bootstrap e o mapa do projecto, e esses
   * mencionam caminhos — `tools/router/classify.js` é o próprio marcador do
   * repo. Resultado medido: um goal inofensivo («Resume em duas frases a ideia
   * principal»), que o matcher isolado classifica como `null`, era recusado com
   * `requisito.ficheiro = "tools/router/classify.js"`. Na prática **todo** o
   * trabalho para `moo` e `kimi` seria bloqueado — amputava o tier local, que é
   * exactamente o diferencial do produto. Um guarda que recusa tudo não protege
   * nada: só desliga a funcionalidade em silêncio.
   *
   * O contrato passa a ler o PEDIDO (`__goal` + `context`, o mesmo texto que o
   * `toolWork` já usa em `pedeLeituraDeFicheiro`), com recurso ao masterprompt
   * apenas quando o goal não viaja — caso em que o dispatch é directo e o
   * chamador é responsável pelo contexto.
   */
  const pedidoDoUtilizador = args && args.__goal
    ? String(args.__goal) + ' ' + String((args && args.context) || '')
    : null;
  const leituraExigida = pedeLeituraDeFicheiro(pedidoDoUtilizador != null ? pedidoDoUtilizador : masterprompt);
  if (leituraExigida && ENGINES_SEM_FICHEIROS.has(agent)
      && !temContextoDeFicheiros(args, masterprompt)) {
    return recusaContratoDeLeitura(agent, leituraExigida, executionCapability(agent).effective);
  }
  if (agent === 'kimi' && !kimi.configuredApiKey()) {
    return { error: kimi.MISSING_KEY_ERROR, agent: 'kimi', agent_label: kimi.PROVIDER_LABEL };
  }
  if (agent === 'kimi' && args && args.model && String(args.model) !== kimi.MODEL) {
    return { error: 'o agente kimi usa apenas o modelo kimi-k3', agent: 'kimi', model: kimi.MODEL };
  }
  const wtNorm = path.resolve(worktree);
  const canWrite = args && typeof args.__escrita === 'boolean'
    ? args.__escrita
    : /(?:write|edit|bash)/i.test(String(allowedTools || ''));

  // handoff: embed the previous job's answer BEFORE hashing, so mp_hash covers
  // what the agent actually receives — otherwise the audit trail is a lie
  let handoff = { ok: false };
  if (handoffFrom) {
    handoff = embedHandoff(masterprompt, handoffFrom);
    masterprompt = handoff.mp;
  }

  // Jobs de leitura só recebem cache válido; nenhum scan caro entra no hot path.
  let projectMap;
  try {
    projectMap = await fosso.mapaParaDispatch(wtNorm, { escrita: canWrite });
  } catch (error) {
    projectMap = {
      injetado: false,
      porque: 'mapa indisponível: ' + ((error && error.message) || 'erro desconhecido'),
      resumo: null,
    };
  }
  if (projectMap.injetado) {
    masterprompt += [
      '',
      '---',
      '## MAPA COMPACTO DO PROJECTO (cache local verificável)',
      projectMap.resumo,
      '---',
    ].join('\n');
  }

  // ── v1.2: the model is decided HERE, and it is decided by the router ──────
  // Explicit arg wins (the human is always allowed to overrule). Otherwise the
  // FROZEN classifier picks the minimum viable tier and we pass it to the CLI.
  // Before this, `recommended_model` was computed and thrown away.
  const classified = classifyOrNull(masterprompt);
  const classifyMeasurement = estadoDoRouter();
  const tier = classified ? (classified.tier || null) : null;
  const model_recommended = classified ? cliModelFor(agent, tier, classified.recommended_model) : null;
  let model = agent === 'kimi'
    ? kimi.MODEL
    : (args && args.model ? String(args.model) : model_recommended);
  const quotaCalibration = args && args.__quota_calibragem && typeof args.__quota_calibragem === 'object'
    ? args.__quota_calibragem : null;
  // BUG v1.18: o tecto corria em toolWork antes desta resolução. Quando o T0
  // local caía para CC, `model` era null e o CLI acabava no seu default sem
  // limite. Este é o último ponto antes de buildCommand/spawn: reaplica aqui.
  const finalCeiling = applyQuotaCeiling(agent, model, quotaCalibration, true);
  if (finalCeiling.applied) {
    model = finalCeiling.model;
    quotaCalibration.desceu_de = finalCeiling.from;
  }
  const dispatchRoutedBy = finalCeiling.applied
    ? 'quota'
    : (args && args.routed_by ? String(args.routed_by) : (args && args.model ? 'user' : (model ? 'classify' : 'cli-default')));

  ensureDirs();
  const job_id = 'job-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex');
  const jobDir = path.join(JOBS_DIR(), job_id);
  fs.mkdirSync(jobDir, { recursive: true });
  const mpPath = path.join(jobDir, 'masterprompt.md');
  fs.writeFileSync(mpPath, masterprompt, 'utf8');
  const mp_hash = sha256(masterprompt);
  // a readable label for the session list: wave · step · what this is about
  const gist = String(masterprompt).split('\n').map((l) => l.trim())
    .find((l) => l && !l.startsWith('⇄') && !l.startsWith('#') && !l.startsWith('---')) || '';
  const label = [wave, stepId, gist.replace(/^[A-ZÇÃÕ\s]{4,}:\s*/, '').slice(0, 60)].filter(Boolean).join(' · ');
  const cmd = buildCommand(agent, jobDir, allowedTools, model, label);
  const commandText = [cmd.bin, ...cmd.args].join(' ');
  const permissions = permissionReport({ agent, cmd: commandText, allowedTools });
  try { assertSingleLineArgs(cmd); }
  catch (e) { return { error: '❌ ' + ((e && e.message) || e), hint: 'isto é um bug do conector, não do teu pedido — reporta-o' }; }
  const jobGoal = args && args.__goal
    ? String(args.__goal)
    : ((String(masterprompt).match(/OBJECTIVO(?: DA WAVE)?:\s*([^\r\n]+)/i) || [])[1] || null);
  const categorySelection = aprender.resolveCategory(jobGoal, args && args.__category);
  const jobCategory = categorySelection.category || aprender.categoryForGoal(jobGoal);
  const jobCategoryFonte = args && (args.__category_fonte === 'declarada' || args.__category_fonte === 'inferida')
    ? args.__category_fonte : categorySelection.category_fonte;
  // Keep rate só é atribuível numa worktree que esta chamada criou de fresco.
  const freshWorktree = !!(canWrite && createdWorktree && createdWorktree.path
    && P.mesmo(createdWorktree.path, wtNorm));
  const gitBase = freshWorktree ? aprender.captureGitBase(wtNorm) : null;
  fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify({
    // ⚠️ A4 · invariante 3 — PRIMEIRO CAMPO, e é de propósito. O guard de saída
    // corre no `collect`, quando este objecto já morreu há muito: se a evidência
    // só existisse na resposta do `work`, o guard leria `undefined` e degradaria
    // tudo, sempre. Ficou em primeiro lugar depois de a Onda 4 acrescentar
    // campos ao meio e o empurrar para fora da janela que o teste A4 inspecciona —
    // o campo que prova que não fabricámos nada não pode depender de ordem.
    evidencia: (args && args.evidencia) || null,
    permissoes_pedidas: permissions.pedido,
    permissoes_efectivas: permissions.efectivo,
    permissoes_diferenca: permissions.diferenca,
    job_id, wave, cargo: cargoSelection.cargo, cargo_porque: cargoSelection.porque,
    agent, worktree: wtNorm, mp_hash, cmd: commandText,
    created_at: nowIso(), depth: 1, model, model_recommended, tier, step: stepId, allowedTools,
    worktree_criada: createdWorktree,
    goal: jobGoal, category: jobCategory, category_fonte: jobCategoryFonte,
    prompt_chars: masterprompt.length,
    escrita: canWrite, preparation: !!chain, git_base: gitBase,
    local_decisao: localDecision,
    steps_total: stepProgress.steps_total,
    steps_total_porque: stepProgress.porque,
    mapa_injectado: projectMap.injetado, mapa_porque: projectMap.porque,
    cross_check_requested: args && args.__cross_check === true,
    note: dispatchNote, prep_from: prepFrom,
  }, null, 2));

  const t0 = Date.now();
  ledgerAppend({
    event: 'dispatched',
    permissoes_pedidas: permissions.pedido, permissoes_efectivas: permissions.efectivo,
    permissoes_diferenca: permissions.diferenca,
    job_id, wave, cargo: cargoSelection.cargo, cargo_porque: cargoSelection.porque,
    agent, worktree: wtNorm, worktree_criada: createdWorktree,
    local_decisao: localDecision,
    mp_hash, model, model_recommended, tier, step: stepId,
    goal: jobGoal, category: jobCategory, category_fonte: jobCategoryFonte,
    prompt_chars: masterprompt.length,
    escrita: canWrite, preparation: !!chain,
    git_base_commit: gitBase ? gitBase.commit : null,
    git_base_clean: gitBase ? gitBase.clean : null,
    handoff_from: handoff.ok ? handoffFrom : null, prep_from: prepFrom, note: dispatchNote,
    mapa_injectado: projectMap.injetado, mapa_porque: projectMap.porque });

  let startedLogged = false;
  const logStarted = () => {
    if (startedLogged) return;
    startedLogged = true;
    const started = {
      job_id, wave, agent, worktree: wtNorm, event: 'started', mp_hash,
      steps_total: stepProgress.steps_total,
    };
    if (stepProgress.porque) started.porque = stepProgress.porque;
    ledgerAppend(started);
  };
  const fileOutStream = fs.createWriteStream(path.join(jobDir, 'out.log'));
  const outStream = new PassThrough();
  const contentTiming = telemetry.createContentTiming(t0);
  const stepTracker = createStreamStepTracker(agent, (stepIndex, signal) => {
    logStarted();
    const progress = {
      job_id, wave, agent, worktree: wtNorm, event: 'step', mp_hash,
      step_index: stepIndex, steps_total: stepProgress.steps_total, step_signal: signal,
    };
    if (stepProgress.porque) progress.porque = stepProgress.porque;
    ledgerAppend(progress);
  });
  outStream.on('data', (chunk) => {
    contentTiming.observe(chunk);
    stepTracker.observe(chunk);
  });
  outStream.pipe(fileOutStream);
  const errStream = fs.createWriteStream(path.join(jobDir, 'err.log'));
  let child;
  try {
    if (agent === 'moo') {
      // local tier: no CLI, no shell, no PATH lottery — straight to the GPU
      const resident = await require('./fleet.js').probeOllama(700).catch(() => null);
      // ⚠️ v1.4.2 — a escolha do modelo local passa a vir com o PORQUÊ, e o
      // porquê vai para o ledger. Sem isso, a única forma de descobrir que o
      // tier local estava preso a um 3B residente foi ler 4 jobs à mão.
      let freeMb = null;
      let vramSnapshot = null;
      try {
        vramSnapshot = await require('./gpu.js').gpuSnapshot(resident ? resident.length : null);
        freeMb = vramSnapshot && vramSnapshot.headroom ? vramSnapshot.headroom.free_mb : null;
      } catch { /* sem nvidia-smi seguimos sem folga conhecida */ }
      // quantos jobs locais já disputam esta placa neste instante
      let locaisVivos = 0;
      try { for (const [, r] of REGISTRY) if (r && r.agent === 'moo') locaisVivos++; } catch { /* */ }
      const escolha = await moo.pickModelExplained(model, process.env.OLLAMA_HOST || '127.0.0.1:11434', resident,
        // Onda 1.3 — o objectivo REAL (não o boilerplate do masterprompt) informa
        // a adequação: tarefa de código prefere um modelo *-coder
        { vram: vramSnapshot, locais_a_correr: locaisVivos,
          goal: (String(masterprompt || '').match(/OBJECTIVO: (.+)/) || [])[1] || null });
      const chosen = escolha.model;
      if (!chosen) {
        stepTracker.finish();
        ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash,
          exit_code: 'no-local-model', ttft_ms: contentTiming.finish().ttft_ms });
        try { outStream.end(); errStream.end(); } catch { /* */ }
        return { error: 'nenhum modelo local disponível (Ollama sem modelos ou inalcançável) — nada foi inventado', job_id };
      }
      // o porquê vai para o ledger append-only: uma escolha que não deixa
      // rasto não se pode auditar três dias depois
      ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'local_model_chosen',
        model: chosen, modelo_porque: escolha.porque || null,
        modelo_trocou_residente: escolha.trocou_residente || null, vram_livre_mb: freeMb });
      child = moo.runLocal({
        hostStr: process.env.OLLAMA_HOST || '127.0.0.1:11434',
        model: chosen, prompt: masterprompt, outStream, errStream,
      });
      try {
        const m = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8'));
        m.model = chosen;
        m.modelo_porque = escolha.porque || null;
        m.modelo_trocou_residente = escolha.trocou_residente || null;
        fs.writeFileSync(path.join(jobDir, 'meta.json'), JSON.stringify(m, null, 2));
      } catch { /* */ }
    } else if (agent === 'kimi') {
      child = kimi.runKimi({
        prompt: masterprompt,
        outStream,
        errStream,
        timeoutMs: Number(process.env.MOOTER_KIMI_TIMEOUT_MS) || kimi.DEFAULT_TIMEOUT_MS,
      });
    } else {
      child = spawnJob(cmd, wtNorm, outStream, errStream, agent);
    }
  } catch (e) {
    stepTracker.finish();
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash,
      exit_code: 'spawn-error', ttft_ms: contentTiming.finish().ttft_ms });
    try { outStream.end(); errStream.end(); } catch { /* */ }
    return { error: 'spawn falhou: ' + ((e && e.message) || e), job_id };
  }
  let prepTimedOut = false;
  let prepFailedOnError = false;
  let jobTimedOut = false;
  let processErrored = false;
  let cancelRequested = false;
  let chainDispatched = false;
  let prepTimer = null;
  const timer = setTimeout(() => {
    jobTimedOut = true;
    killTree(child);
    REGISTRY.delete(job_id);
    stepTracker.finish();
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: 'timeout',
      duration_s: Math.round((Date.now() - t0) / 1000), ttft_ms: contentTiming.finish().ttft_ms });
    try { outStream.end(); errStream.end(); } catch { /* */ }
  }, JOB_TIMEOUT_MS());
  // ⚠️ unref(): o timeout do job é de dezenas de minutos e, sem isto, o
  // event loop fica preso a ele — o processo nunca termina sozinho e a suite
  // no Windows morria com exit 124 (timeout) DEPOIS de todos os asserts
  // passarem. O processo filho tem handle próprio, por isso a vida do job
  // continua garantida; o que deixa de ser garantido é o processo ficar vivo
  // só por causa de um despertador.
  try { timer.unref(); } catch { /* ambiente sem unref */ }
  /**
   * ── O ORÁCULO: fotografia ANTES, para o loop poder atribuir culpa ─────────
   *
   * Auditoria E2E 2026-08-01: `followup_quality` existe desde sempre em
   * `tools/router/feedback-collector.js` e alimenta o reward de
   * `auto-feedback.js` — com **0 eventos** no `decisions.log`. Ninguém carrega no
   * polegar. Sem sinal de qualidade a entrar, o learner não aprende nada e a
   * auto-melhoria é uma intenção.
   *
   * `oraculo.js` fecha isso sem juiz-LLM: mede o estado verificável antes e
   * depois e compara. A régua é a do repo — «não piora», nunca «passa» — para
   * que uma falha crónica (o `ondaA.test.js`) não marque todos os jobs como maus.
   *
   * Só para jobs de ESCRITA — um job de leitura não pode partir nada.
   *
   * **D13, decidida por Paulo a 2026-08-01: LIGADO POR OMISSÃO.** Ficou opt-in
   * (`MOOTER_ORACULO=1`) quando aterrou, com o argumento de que correr a suite
   * custa segundos reais (20,5 s medidos em `packages/router`). O argumento é
   * verdadeiro e é insuficiente: um sinal de qualidade que só existe quando
   * alguém se lembra de exportar uma variável é o mesmo `/mooter-good` que
   * ninguém carregou — 0 eventos em toda a história do `decisions.log`. O custo
   * real do opt-in não são os 20 s por job de escrita; é o learner continuar
   * cego indefinidamente. Ligado por omissão, os segundos pagam-se; desligado
   * por omissão, não se paga nada e não se aprende nada.
   *
   * Reversível numa variável: `MOOTER_ORACULO=0` desliga-o por completo. Quem
   * opera a máquina continua a mandar — o que mudou foi só a omissão.
   * Envolto em try/catch: o oráculo pode falhar à vontade, o job segue.
   */
  let oraculoAntes = null;
  let impressaoAntes = null;
  if (canWrite && ORACULO_LIGADO()) {
    try {
      oraculoAntes = oraculo.medir(wtNorm, { timeoutMs: ORACULO_TIMEOUT_MS });
      impressaoAntes = oraculo.impressao(wtNorm);
    } catch (e) { log('oráculo: baseline falhou (' + (e && e.message) + ') — job segue sem sinal'); }
  }
  REGISTRY.set(job_id, { child, timer, startedAt: t0, wave, agent, worktree: wtNorm, oraculoAntes,
    mp_hash, step: stepId, contentTiming, stepTracker, markCancelled() { cancelRequested = true; } });

  function prepMetrics(durationS, usable) {
    let text = jobResultText(agent, jobDir);
    if (text == null) {
      try { text = fs.readFileSync(path.join(jobDir, 'out.log'), 'utf8'); } catch { text = ''; }
    }
    const prepChars = String(text || '').length;
    const avoided = /opus/i.test(String(chain && chain.model))
      ? 'opus'
      : (/haiku/i.test(String(chain && chain.model)) ? 'haiku' : 'sonnet');
    const estimated = localfirst.poupancaEstimada(masterprompt.length, usable ? prepChars : 0, avoided);
    return {
      prep_duration_s: durationS,
      prep_chars: prepChars,
      tokens_poupados_estimados: estimated.tokens_out_estimados,
      tokens_poupados_estimados_nota: estimated.nota,
    };
  }

  function dispatchChain(withHandoff, note) {
    if (!chain || chainDispatched) return;
    chainDispatched = true;
    const next = Object.assign({}, chain);
    if (withHandoff) next.handoff_from = job_id;
    if (note) {
      next.__note = note;
      next.__prep_from = job_id;
    }
    setImmediate(() => {
      toolDispatch(next)
        .then((r2) => { if (r2 && r2.error) log('chain dispatch recusado: ' + JSON.stringify(r2.reasons || r2.error)); })
        .catch((e) => log('chain falhou: ' + ((e && e.message) || e)));
    });
  }

  if (chain && agent === 'moo') {
    prepTimer = setTimeout(() => {
      prepTimedOut = true;
      clearTimeout(timer);
      REGISTRY.delete(job_id);
      stepTracker.finish();
      const durationS = Number(((Date.now() - t0) / 1000).toFixed(3));
      const note = 'preparação local excedeu ' + Number((PREP_TIMEOUT_MS() / 1000).toFixed(3)) + 's — fui directo';
      ledgerAppend(Object.assign({
        job_id, wave, agent, worktree: wtNorm, event: 'prep_timeout', mp_hash,
        exit_code: 'prep-timeout', note, ttft_ms: contentTiming.finish().ttft_ms,
      }, prepMetrics(durationS, false)));
      try { outStream.end(); } catch { /* */ }
      try { errStream.end(); } catch { /* */ }
      killTree(child);
      dispatchChain(false, note);
    }, PREP_TIMEOUT_MS());
    try { prepTimer.unref(); } catch { /* ambiente sem unref */ }
  }
  // proof of ownership: another connector instance must be able to tell whether
  // this job is alive before it dares to declare it orphaned
  // ⚠️ A2 — guardar o pid do TRABALHO, não só o do servidor. É a diferença
  // entre "quem o lançou ainda vive?" e "o trabalho ainda corre?".
  try {
    fs.writeFileSync(path.join(jobDir, 'owner.json'),
      JSON.stringify({ pid: process.pid, child_pid: (child && child.pid) || null, at: nowIso() }));
  } catch { /* */ }
  if (stepId) {
    try {
      // title: the first meaningful line of the masterprompt, so a step created
      // by a bare dispatch still reads like something a human wrote
      const firstLine = String(masterprompt).split('\n').map((l) => l.trim())
        .find((l) => l && !l.startsWith('⇄') && !l.startsWith('#')) || ('job ' + agent);
      plan.updateStep(wave, stepId, {
        state: 'a-correr', job_id, title: firstLine.slice(0, 90), agent,
        by: (agent === 'moo' ? 'Ollama · local' : agentLabel(agent)) + (model ? ' · ' + model : ''),
      });
    } catch { /* */ }
  }

  child.once('spawn', logStarted);
  child.once('error', (e) => {
    processErrored = true;
    clearTimeout(timer); clearTimeout(prepTimer); REGISTRY.delete(job_id);
    stepTracker.finish();
    const exit = 'proc-error:' + ((e && e.message) || '');
    ledgerAppend({ job_id, wave, agent, worktree: wtNorm, event: 'failed', mp_hash, exit_code: exit,
      duration_s: Math.round((Date.now() - t0) / 1000), ttft_ms: contentTiming.finish().ttft_ms });
    if (chain && agent === 'moo') {
      prepFailedOnError = true;
      const prep = prepMetrics(Number(((Date.now() - t0) / 1000).toFixed(3)), false);
      const note = 'a preparação local falhou (exit ' + exit + ') — fui directo';
      ledgerAppend(Object.assign({
        job_id, wave, agent, worktree: wtNorm, event: 'prep_failed_fallback', mp_hash,
        exit_code: exit, note, ttft_ms: contentTiming.finish().ttft_ms,
      }, prep));
      dispatchChain(false, note);
    }
  });
  child.once('close', (code) => {
    clearTimeout(timer); clearTimeout(prepTimer); REGISTRY.delete(job_id);
    if (prepTimedOut || prepFailedOnError || jobTimedOut || processErrored || cancelRequested) return;
    logStarted(); // shells emit no 'spawn' reliably; a close implies it ran
    const dur = Math.round((Date.now() - t0) / 1000);
    // ⚠️ `close` fires when the process ends, NOT when our WriteStream has
    // drained. Reading immediately could miss the final `result` line — which
    // carries cost, model and tokens. Wait for the stream to finish, with a
    // short ceiling so a stuck pipe can never hold the ledger hostage.
    finalizeWhenFlushed(outStream, fileOutStream, () => finish(code, dur));
  });

  function finalizeWhenFlushed(stream, fileStream, done) {
    let fired = false;
    const go = () => { if (!fired) { fired = true; done(); } };
    try {
      if (fileStream.writableFinished || fileStream.closed) return go();
      fileStream.once('finish', go);
      fileStream.once('close', go);
      stream.end();
      setTimeout(go, 1500).unref?.();
    } catch { go(); }
  }

  function finish(code, dur) {
    stepTracker.finish();
    const timing = contentTiming.finish();
    const r = readJobResult(agent, jobDir, dur);
    const quotaReceipt = quotaParaLedger(quotaCalibration);
    // ⚠️ v1.3.3 — MEDIR O RESULTADO, NÃO A TELEMETRIA.
    //
    // A v1.3.2 perguntava "a telemetria trouxe tokens?" e marcava `failed` quando
    // não. Em 2026-07-25 um job entregou 1,8 KB de análise correcta e foi dado
    // como `empty-output`, porque o parser de NDJSON não extraiu `tokens_out`.
    // O produto disse que o trabalho falhou com o trabalho à frente do utilizador.
    //
    // Há duas fontes sobre o mesmo job — o TEXTO e a TELEMETRIA — e a decisão de
    // vida-ou-morte usava a frágil. O texto é a robusta: se há resultado, houve
    // trabalho. Telemetria em falta é um aviso de coerência, não uma sentença.
    const delivered = jobResultText(agent, jobDir);
    const outcome = classificarEntrega(code, delivered);
    const { producedNothing, refusal, ok } = outcome;
    const prep = chain && agent === 'moo'
      ? prepMetrics(Number(((Date.now() - t0) / 1000).toFixed(3)), ok)
      : null;
    const touched = freshWorktree ? aprender.captureFilesTouched(wtNorm, gitBase)
      : (canWrite ? { files: null, reason: 'o job não correu numa worktree criada de fresco' } : null);
    if (code === 0 && producedNothing) log('job ' + job_id + ' saiu 0 sem entregar texto — marcado failed');
    if (refusal) log('job ' + job_id + ' saiu 0, mas recusou por falta de contexto — marcado failed');
    if (outcome.aguarda_aprovacao) {
      log('job ' + job_id + ' saiu 0, mas ' + outcome.aguarda_aprovacao + ' — marcado nao_verificado');
    }
    // ── O ORÁCULO: fotografia DEPOIS + sinal de qualidade a custo zero ────────
    let oraculoVeredicto = null;
    let entrega = null;
    if (oraculoAntes) {
      try {
        const depois = oraculo.medir(wtNorm, { timeoutMs: ORACULO_TIMEOUT_MS });
        oraculoVeredicto = oraculo.comparar(oraculoAntes, depois);
        entrega = oraculo.entregouAlgo(impressaoAntes, oraculo.impressao(wtNorm));
        /**
         * «Não partiu nada» não é «fez alguma coisa». Medido em 2026-08-01: um
         * job de escrita com 20 negações de permissão respondeu «✓ Tarefa
         * concluída», ficou `done`, e teria levado followup_quality:1 — porque
         * de facto não regrediu nada. Um verde comprado com inacção envenena o
         * learner tão bem como um vermelho falso.
         *
         * A composição vive em `oraculo.comporEntrega` — é doutrina do oráculo e
         * a suite tem de a exercitar no MESMO caminho que corre aqui, não numa
         * cópia. Ela é que garante a guarda que D13 tornou indispensável: sem
         * medição (`followup_quality: null`, o caso da raiz deste repo, que não
         * declara verificações), a entrega não escreve nada — senão o `0` seria
         * o único valor que aquela worktree conseguiria produzir.
         */
        oraculoVeredicto = oraculo.comporEntrega(oraculoVeredicto, entrega);
        const ev = oraculo.eventoDeQualidade(oraculoVeredicto, {
          job_id, tier, task_category: args && args.__category, session_id: r.session_id,
        });
        if (ev) escreverSinalDeQualidade(ev);
        log('oráculo: ' + oraculoVeredicto.veredicto + ' — ' + oraculoVeredicto.porque);
      } catch (e) {
        log('oráculo: comparação falhou (' + (e && e.message) + ') — sem sinal, nunca sinal inventado');
      }
    }
    if (ok && (!r.telemetry || r.telemetry.tokens_out == null)) {
      log('job ' + job_id + ' entregou resultado sem telemetria — tokens n/d, mas o job correu');
    }
    ledgerAppend(Object.assign({
      job_id, wave, agent, worktree: wtNorm, event: outcome.evento || (ok ? 'done' : 'failed'), mp_hash,
      exit_code: outcome.exit_code,
      note: refusal || outcome.aguarda_aprovacao || undefined,
      recusa_contexto: refusal ? { detectada: true, porque: refusal } : undefined,
      oraculo: oraculoVeredicto
        ? { veredicto: oraculoVeredicto.veredicto, porque: oraculoVeredicto.porque,
          followup_quality: oraculoVeredicto.followup_quality,
          novos_falhados: oraculoVeredicto.novos_falhados, custo_usd: 0 }
        : undefined,
      aprovacao_pendente: outcome.aguarda_aprovacao
        ? { detectada: true, porque: outcome.aguarda_aprovacao,
          faz_assim: 'passa allowedTools com Bash (ex.: "Read,Glob,Grep,Edit,Write,Bash") para o agente poder verificar o próprio trabalho' }
        : undefined,
      cost_usd: r.cost_usd, duration_s: dur, ttft_ms: timing.ttft_ms,
      // model_used comes from the job's own stream. model_recommended is what the
      // router asked for. Keeping both makes the gap between doctrine and reality
      // a metric instead of a surprise.
      model_used: r.model_used, model_recommended,
      tier_pedido: tier, tier_motor: tierDoMotor(agent, r.model_used || model),
      session_id: r.session_id,
      tokens_in: r.telemetry ? r.telemetry.tokens_in : null,
      tokens_out: r.telemetry ? r.telemetry.tokens_out : null,
      classify_ms: classifyMeasurement.classify_ms,
      classify_porque: classifyMeasurement.classify_ms == null
        ? classifyMeasurement.porque
        : null,
      ollama: ollamaParaLedger(r.telemetry),
      pressao_quota: quotaReceipt.pressao_quota,
      calibragem: quotaReceipt.calibragem,
      goal: jobGoal, escrita: canWrite, preparation: !!chain,
      files_touched: touched ? touched.files : null,
      files_touched_reason: touched ? touched.reason : null,
      step: stepId,
    }, prep || {}));
    if (ok && agent !== 'moo' && args && args.__cross_check === true) {
      setImmediate(() => {
        runCrossCheckForJob({
          job_id, resultado: delivered, worktree: wtNorm,
          wave, agent, jobDir,
        }).catch((error) => log('cross-check ' + job_id + ' falhou: '
          + ((error && error.message) || error)));
      });
    }
    if (stepId) {
      try {
        plan.updateStep(wave, stepId, {
          state: ok ? 'feito' : 'falhou',
          job_id,
          by: (agent === 'moo' ? 'Ollama · local' : agentLabel(agent)) + (r.model_used ? ' · ' + r.model_used : ''),
          note: refusal || (r.cost_usd != null ? '$' + Number(r.cost_usd).toFixed(4) + ' · ' + dur + 's' : dur + 's'),
        });
      } catch { /* the plan is a convenience; it must never break a job */ }
    }
    // ── the chain: the local moo finished, now the paid agent starts, with the
    // moo's work already in its prompt. This is the "carregar o piano" step.
    if (chain) {
      if (ok) {
        dispatchChain(true, null);
      } else {
        const exit = outcome.exit_code;
        const note = 'a preparação local falhou (exit ' + exit + ') — fui directo';
        ledgerAppend(Object.assign({
          job_id, wave, agent, worktree: wtNorm, event: 'prep_failed_fallback', mp_hash,
          exit_code: exit, note, ttft_ms: timing.ttft_ms,
        }, prep || {}));
        dispatchChain(false, note);
      }
    }
  }

  return {
    permissoes_pedidas: permissions.pedido,
    permissoes_efectivas: permissions.efectivo,
    permissoes_diferenca: permissions.diferenca,
    job_id, wave, cargo: cargoSelection.cargo, cargo_porque: cargoSelection.porque,
    agent, agent_label: agentLabel(agent), worktree: wtNorm, worktree_criada: createdWorktree, mp_hash,
    model: agent === 'moo' ? (model || '(auto local)') : model,
    model_recommended, tier,
    mapa_injectado: projectMap.injetado,
    mapa_porque: projectMap.porque,
    verificacao_cruzada: args && args.__cross_check === true && agent !== 'moo'
      ? { estado: 'pendente', custo_usd: 0 }
      : null,
    // ⚠️ v1.3.3 — proveniência PROPAGADA, não inferida da forma dos argumentos.
    // A v1.3.2 via `args.model` preenchido (posto pelo próprio mooter_work) e
    // reportava "forçado pelo chamador" — atribuía ao utilizador um acto do
    // próprio produto. O campo que existe para dar rasto apontava para o lado errado.
    routed_by: dispatchRoutedBy,
    routed: dispatchRoutedBy === 'quota' ? 'limitado pelo tecto de quota antes do spawn'
      : (args && args.routed_by === 'work+classify' ? 'escolhido pelo mooter_work via classify.js (FROZEN)'
        : (args && args.model ? 'forçado pelo chamador' : (model ? 'pelo classify.js (FROZEN)' : 'default do CLI'))),
    note: dispatchNote || 'dispatch aceito; acompanhar com mooter_status (traz tokens e a acção em curso), resultado via mooter_collect',
  };
}

async function toolStatus(args) {
  const jobId = args && args.job_id ? String(args.job_id) : null;
  const wave = args && args.wave ? String(args.wave) : null;
  if (!jobId && !wave) return { error: 'passa job_id ou wave' };
  const evs = ledgerRead().filter((e) => (jobId ? e.job_id === jobId : e.wave === wave));
  if (!evs.length) return { error: 'nada no ledger para ' + (jobId || wave) };
  const byJob = {};
  for (const e of evs) {
    const observed = aprender.enriquecerCusto(e);
    const j = byJob[e.job_id] || (byJob[e.job_id] = {
      job_id: e.job_id, wave: e.wave, agent: e.agent, worktree: e.worktree,
      cargo: Object.prototype.hasOwnProperty.call(e, 'cargo') ? e.cargo : null,
      cargo_porque: e.cargo_porque || 'n/d — anterior à instrumentação de cargos',
      local: typeof e.local === 'boolean' ? e.local : e.agent === 'moo',
      events: [], last: null, started_ts: null, steps_done: 0,
      steps_total: null, steps_total_porque: 'o job ainda não emitiu started',
      goal: null, prompt_chars: null,
    });
    j.events.push({
      ts: e.ts, event: e.event, cargo: Object.prototype.hasOwnProperty.call(e, 'cargo') ? e.cargo : null,
      cargo_porque: e.cargo_porque || 'n/d — anterior à instrumentação de cargos',
      exit_code: e.exit_code, cost_usd: observed.cost_usd,
      cost_usd_fonte: observed.cost_usd_fonte,
      cost_usd_calculo: observed.cost_usd_calculo,
      duration_s: e.duration_s,
      prep_duration_s: e.prep_duration_s, prep_chars: e.prep_chars,
      tokens_poupados_estimados: e.tokens_poupados_estimados, note: e.note,
      disponivel: e.disponivel, verificado: e.verificado,
      divergencias_count: e.divergencias_count,
      step_index: e.step_index, steps_total: e.steps_total, porque: e.porque,
    });
    if (Object.prototype.hasOwnProperty.call(e, 'cargo')) j.cargo = e.cargo;
    if (e.cargo_porque) j.cargo_porque = e.cargo_porque;
    if (typeof e.local === 'boolean') j.local = e.local;
    if (!NON_STATE_EVENTS.has(e.event)) j.last = e.event;
    if (e.event === 'started') {
      j.started_ts = e.ts;
      j.steps_total = Object.prototype.hasOwnProperty.call(e, 'steps_total') ? e.steps_total : null;
      j.steps_total_porque = e.steps_total == null ? (e.porque || 'o total de passos é n/d') : null;
    }
    if (e.event === 'step') {
      j.steps_done = Math.max(j.steps_done, Number(e.step_index) || 0);
      if (Object.prototype.hasOwnProperty.call(e, 'steps_total')) j.steps_total = e.steps_total;
      if (e.steps_total == null && e.porque) j.steps_total_porque = e.porque;
    }
    if (e.model_used) j.model_used = e.model_used;
    if (e.model_recommended) j.model_recommended = e.model_recommended;
    if (e.tier) j.tier_pedido = e.tier;
    if (e.tier_pedido) j.tier_pedido = e.tier_pedido;
    if (e.tier_motor) j.tier_motor = e.tier_motor;
    if (e.step) j.step = e.step;
    if (e.goal) j.goal = e.goal;
    if (e.prompt_chars != null) j.prompt_chars = e.prompt_chars;
    if (e.note) j.note = e.note;
    if (e.exit_code != null) j.exit_code = e.exit_code;
  }
  const statusNow = Date.now();
  const liveJobs = Object.values(byJob).filter((job) => REGISTRY.has(job.job_id) && !isTerminal(job));
  const etaIndex = liveJobs.length
    ? estimation.readIndex({ indexPath: path.join(MOOTER_HOME_DIR(), 'eta-index.json') })
    : null;
  for (const j of Object.values(byJob)) {
    j.alive = REGISTRY.has(j.job_id) && !isTerminal(j);
    // v1.2 — the third state that was missing. The ledger saying `started` while
    // this process knows nothing about the job does NOT mean it is running: it
    // means the connector restarted and the truth was lost. Reporting alive:false
    // next to last:"started" and calling it a day was two contradictory fields
    // with no name. Now it has a name, and the sweeper can act on it.
    j.stale = !j.alive && !isTerminal(j) && (j.last === 'started' || j.last === 'dispatched');
    if (j.stale) j.stale_note = 'o ledger diz "' + j.last + '" mas este processo não conhece o job — provável restart do conector. Usa mooter_cancel para o encerrar honestamente.';
    try {
      const errPath = path.join(JOBS_DIR(), j.job_id, 'err.log');
      const tail = fs.readFileSync(errPath, 'utf8').split('\n').filter(Boolean).slice(-5);
      if (tail.length) j.stderr_tail = tail;
    } catch { /* */ }
    // live telemetry, straight from the job's own stream
    try {
      const elapsed = j.started_ts ? Math.max(1, Math.round((statusNow - Date.parse(j.started_ts)) / 1000)) : null;
      // ⚠️ v1.3.3 — o mesmo job dava tok_s 34 no `fleet` e 2 no `status`, porque
      // só o fleet congelava a taxa na duração final. Um número derivado
      // calculado em dois sítios diverge sempre; é só uma questão de quando.
      const finalDur = (j.events.find((e) => e.duration_s != null) || {}).duration_s;
      const isDone = isTerminal(j);
      const t = telemetry.readJobTelemetry(path.join(JOBS_DIR(), j.job_id, 'out.log'), elapsed,
        { finished: isDone, duration_s: finalDur });
      if (t) {
        j.now = {
          model: t.model || null,
          activity: t.activity || null,
          tokens_in: t.tokens_in, tokens_out: t.tokens_out,
          tok_s: t.tok_s, tok_s_basis: t.tok_s_basis || null,
          steps_done: Math.max(Number(t.steps_done) || 0, j.steps_done),
          steps_total: j.steps_total,
          tools_used: t.tools_used && t.tools_used.length ? t.tools_used : null,
          cost_usd: t.cost_usd,
        };
        if (j.steps_total == null) j.now.steps_total_porque = j.steps_total_porque;
        if (t.model && !j.model_used) j.model_used = t.model;
      }
    } catch { /* telemetry is a bonus; status must never fail because of it */ }
    if (!j.now) {
      j.now = { steps_done: j.steps_done, steps_total: j.steps_total };
      if (j.steps_total == null) j.now.steps_total_porque = j.steps_total_porque;
    }
    if (j.alive) {
      j.estimativa = estimation.estimateJob(j.job_id, {
        agent: j.agent, goal: j.goal, prompt_chars: j.prompt_chars,
        started_ts: j.started_ts, elapsed_s: j.started_ts
          ? Math.max(0, Math.round((statusNow - Date.parse(j.started_ts)) / 1000)) : null,
        steps_done: j.now.steps_done, steps_total: j.now.steps_total,
        steps_total_porque: j.now.steps_total_porque || j.steps_total_porque,
      }, {
        index: etaIndex,
        indexPath: path.join(MOOTER_HOME_DIR(), 'eta-index.json'),
        outPath: path.join(JOBS_DIR(), j.job_id, 'out.log'),
        now: statusNow,
      });
    }
  }
  const jobs = Object.values(byJob);
  const refused = jobs.find((job) => job.last === 'failed'
    && /recusa do agente por falta de contexto/i.test(String(job.note || '')));
  const result = { jobs, ledger_lines: evs.length };
  if (refused) result.resumo = '⛔ ' + refused.job_id + ' falhou · ' + refused.note;
  return result;
}

/**
 * mooter_cancel — the exit that did not exist.
 *
 * v1.1 had no way to end a job: no tool, no protocol path. A hung job stayed
 * `started` in the ledger forever, and the WIP guard then refused every future
 * dispatch on that worktree. The only escape was killing a process by hand in
 * Windows. That is the opposite of "the vibe coder never leaves the chat".
 */
async function toolCancel(args) {
  const jobId = String((args && args.job_id) || '').trim();
  const sweep = !!(args && args.sweep);
  if (!jobId && !sweep) return { error: 'passa job_id, ou sweep:true para encerrar todos os órfãos' };

  if (sweep && !jobId) {
    const swept = sweepOrphans();
    return {
      swept, count: swept.length,
      note: swept.length
        ? 'jobs órfãos ou terminais divergentes reconciliados no ledger append-only — as worktrees ficaram livres'
        : 'nenhum órfão: todos os jobs do ledger têm estado terminal ou estão vivos neste processo',
    };
  }

  const live = REGISTRY.get(jobId);
  const evs = ledgerRead().filter((e) => e.job_id === jobId);
  if (!evs.length) return { error: 'job desconhecido: ' + jobId };
  // O estado é o último evento de ESTADO, não o último evento escrito: um
  // diagnóstico gravado a seguir ao desfecho não ressuscita o job.
  // `last` continua a ser a última linha, que é de onde saem os metadados
  // (wave, agent, worktree) para o evento de cancelamento mais abaixo.
  const last = evs[evs.length - 1];
  const stateRecord = lastStateRecord(evs);
  const estado = stateRecord ? stateRecord.event : null;
  if (isTerminal(stateRecord)) {
    if (terminalLedgerAgrees(stateRecord)) {
      return { job_id: jobId, state: estado, note: 'já estava terminado — nada a fazer (idempotente)' };
    }
    const reconciled = appendTerminalReconciliation(stateRecord);
    if (live) {
      clearTimeout(live.timer);
      if (live.stepTracker) live.stepTracker.finish();
      REGISTRY.delete(jobId);
    }
    if (live && live.step) {
      try { plan.updateStep(live.wave, live.step, { state: reconciled === 'done' ? 'feito' : 'falhou', note: 'estado terminal reconciliado' }); } catch { /* */ }
    }
    return {
      job_id: jobId, state: reconciled, reconciled: true,
      note: 'estado terminal acrescentado ao ledger append-only; a releitura já não vê o job como vivo',
    };
  }

  // ⚠️ A2 — o cancelamento é CONFIRMADO, não presumido.
  // Antes escrevia-se `cancelled` logo a seguir ao kill. Se o processo
  // sobrevivesse (com `shell:true` o kill apanha o cmd.exe e não o neto), o
  // ledger dizia morto e o agente continuava a escrever no disco. Agora
  // re-verificamos o pid e, se ele resistir, dizemo-lo em vez de mentir.
  const pids = jobPids(jobId);
  let killed = false;
  if (live) {
    clearTimeout(live.timer);
    if (typeof live.markCancelled === 'function') live.markCancelled();
    killed = killTree(live.child);
    REGISTRY.delete(jobId);
  }
  else if (pids.child_pid && pidAlive(pids.child_pid)) {
    // o servidor reiniciou mas o trabalho continua vivo — matar pela árvore
    killed = killTree({ pid: pids.child_pid, kill: () => { try { process.kill(pids.child_pid, 'SIGKILL'); return true; } catch { return false; } } });
  }
  await new Promise((r) => setTimeout(r, 250));            // dar tempo ao SO
  const aindaVivo = pids.child_pid ? pidAlive(pids.child_pid) : false;
  const ttft = live && live.contentTiming ? live.contentTiming.finish().ttft_ms : null;
  if (live && live.stepTracker) live.stepTracker.finish();
  ledgerAppend({
    job_id: jobId, wave: last.wave, agent: last.agent, worktree: last.worktree,
    event: 'failed', mp_hash: last.mp_hash,
    exit_code: aindaVivo ? 'cancel_failed' : (killed ? 'cancelled-by-user' : 'cancelled-stale'),
    child_pid: pids.child_pid, pid_verificado: true,
    duration_s: live ? Math.round((Date.now() - live.startedAt) / 1000) : null,
    ttft_ms: ttft,
  });
  if (aindaVivo) {
    return {
      resumo: '⚠️ não consegui matar o job ' + jobId + ' — o processo ' + pids.child_pid + ' continua vivo',
      job_id: jobId, killed: false, child_pid: pids.child_pid, cancel_failed: true,
      faz_assim: ['no PowerShell: taskkill /PID ' + pids.child_pid + ' /T /F', 'depois volta a chamar mooter_cancel para fechar o ledger'],
      note: 'o ledger regista cancel_failed com o pid — nunca digo que matei algo que continua a correr',
    };
  }
  if (live && live.step) { try { plan.updateStep(live.wave, live.step, { state: 'falhou', note: 'cancelado' }); } catch { /* */ } }
  return {
    job_id: jobId, killed,
    note: killed
      ? 'processo morto (árvore inteira, taskkill /T no Windows) e ledger fechado'
      : 'o processo não vivia neste servidor (restart) — ledger fechado, worktree libertada',
  };
}

async function toolCollect(args) {
  const jobId = String((args && args.job_id) || '').trim();
  if (!jobId) return { error: 'job_id is required' };
  const jobDir = path.join(JOBS_DIR(), jobId);
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(jobDir, 'meta.json'), 'utf8')); }
  catch { return { error: 'job desconhecido: ' + jobId }; }
  const evs = ledgerRead().filter((e) => e.job_id === jobId);
  const last = lastStateEvent(evs);
  if (!isTerminal(last)) {
    return { job_id: jobId, state: last || 'unknown', note: 'job ainda não terminou — usa mooter_status e volta' };
  }
  const durEv = evs.find((e) => e.duration_s != null);
  const r = readJobResult(meta.agent, jobDir, durEv ? durEv.duration_s : null);
  const terminalEvent = [...evs].reverse().find(isTerminal) || {};
  const cost = aprender.enriquecerCusto({
    ...terminalEvent,
    event: terminalEvent.event || 'done',
    agent: meta.agent,
    model_used: r.model_used || terminalEvent.model_used || meta.model,
    tokens_in: r.telemetry ? r.telemetry.tokens_in : terminalEvent.tokens_in,
    tokens_out: r.telemetry ? r.telemetry.tokens_out : terminalEvent.tokens_out,
    cost_usd: r.cost_usd != null ? r.cost_usd : terminalEvent.cost_usd,
  });
  const cost_usd = cost.cost_usd;
  const session_id = r.session_id;
  // mesma função que `finish()` usa para decidir done/failed — uma só verdade
  let body = jobResultText(meta.agent, jobDir);
  if (body == null) { try { body = fs.readFileSync(path.join(jobDir, 'out.log'), 'utf8'); } catch { body = null; } }
  let truncated = false; let full_path = null;
  if (body && body.length > COLLECT_LIMIT) {
    truncated = true;
    full_path = path.join(jobDir, 'out.log');
    body = body.slice(0, 3000) + `\n\n[… truncado: ${body.length} chars — conteúdo completo em ${full_path} …]\n\n` + body.slice(-3000);
  }
  const already = evs.some((e) => e.event === 'collected');
  if (!already) ledgerAppend({ job_id: jobId, wave: meta.wave, agent: meta.agent, worktree: meta.worktree, event: 'collected', mp_hash: meta.mp_hash });

  // ── A4 · guard de SAÍDA, mecânico ────────────────────────────────────────
  // O nível 1 é a regra escrita no prompt. Esta é a rede por baixo: um modelo
  // de 3B não obedece a uma instrução só porque ela está lá. Aqui não se pede
  // nada ao modelo — lê-se o que ele escreveu e compara-se com a evidência que
  // o disco diz que ele teve. Só corre para motores sem ferramentas: o `cc`
  // corre os seus comandos e o veredicto dele assenta em algo.
  const vered = veredictoSemEvidencia(meta, body);
  const crossCheck = readCrossCheck(jobDir);
  const permissions = {
    pedido: meta.permissoes_pedidas || requestedPermissions(meta),
    efectivo: meta.permissoes_efectivas || effectivePermissions(meta),
    diferenca: meta.permissoes_diferenca || permissionReport(meta).diferenca,
  };

  return {
    permissoes_pedidas: permissions.pedido,
    permissoes_efectivas: permissions.efectivo,
    permissoes_diferenca: permissions.diferenca,
    job_id: jobId, state: last, agent: meta.agent, wave: meta.wave,
    cargo: Object.prototype.hasOwnProperty.call(meta, 'cargo') ? meta.cargo : null,
    cargo_porque: meta.cargo_porque || 'n/d — anterior à instrumentação de cargos',
    result: vered.degradado ? vered.texto : body,
    note: meta.note || (([...evs].reverse().find((e) => e.note) || {}).note) || null,
    session_id: session_id || null, cost_usd: cost_usd,
    cost_usd_fonte: cost.cost_usd_fonte,
    cost_usd_calculo: cost.cost_usd_calculo || null,
    // ⚠️ A4 — `true` quer dizer: o motor não tinha ferramentas, o disco não
    // regista evidência nenhuma, e mesmo assim a resposta traz um veredicto.
    veredicto_sem_evidencia: vered.degradado || false,
    evidencia: meta.evidencia || null,
    // Aliases ingleses preservados por compatibilidade; a verdade pública vive
    // nos três campos acima e distingue pedido, efectivo e comparabilidade.
    allowed_tools_pedido: meta.allowedTools || null,
    allowed_tools_effective: permissions.efectivo,
    // v1.2: the model the job REALLY ran, from its own stream — never inferred
    model_used: r.model_used || null,
    model_recommended: meta.model_recommended || null,
    tier_pedido: meta.tier || null,
    tier_motor: tierDoMotor(meta.agent, r.model_used || meta.model),
    tokens_in: r.telemetry ? r.telemetry.tokens_in : null,
    tokens_out: r.telemetry ? r.telemetry.tokens_out : null,
    tok_s: r.telemetry ? r.telemetry.tok_s : null,
    tools_used: r.telemetry && r.telemetry.tools_used && r.telemetry.tools_used.length ? r.telemetry.tools_used : null,
    verificacao_cruzada: crossCheck || (meta.cross_check_requested
      ? {
        estado: 'pendente',
        disponivel: 'n/d',
        porque: 'o job terminou; a verificação local pós-job ainda não persistiu resultado',
        custo_usd: 0,
      }
      : null),
    truncated, full_path, idempotent: already ? 'já tinha sido coletado (evento não duplicado)' : 'primeira coleta',
  };
}

/**
 * mooter_await — one call instead of seven.
 *
 * The session that ran the v1.3.1 demo had to `sleep 40` in a shell four times
 * to follow a wave, because status is a point-in-time read. That is a ridiculous
 * choreography for a product whose whole thesis is "the vibe coder doesn't study".
 *
 * Server-side waiting is also the RIGHT workaround for this host: it never sends
 * `progressToken` (anthropics/claude-code#58687), so notifications would be dead
 * work. The server waits, the panel polls itself, and the chat stays clean.
 */

/**
 * ⚠️ J-2 — o titular de `mooter_check`. Existe como função NOMEADA de propósito:
 * `estranho.test.js` verifica que ela existe, porque quando este resumo nascia
 * inline (ou não nascia de todo) o wrapper `comResumo` de `tools6.js` punha
 * "🐮 feito" por omissão — inclusive sobre jobs falhados.
 *
 * ⚠️ LIMITE CONHECIDO (medido 2026-08-01): `failed` só contém jobs com
 * `exit_code ≠ 0`. Um agente que RECUSA — "preciso de permissão", "não consigo
 * ler o ficheiro" — sai com 0 e cai no ramo verde. Nessa sessão quatro jobs
 * bloqueados apareceram como concluídos e custaram $0,44 sem trabalho nenhum.
 * Detectar recusa semântica é trabalho por fazer, não coberto por esta função.
 */
function resumoHonesto(done, failed, jobs, failureReasons) {
  if (failed.length) {
    return '⛔ ' + failed.length + ' job(s) falharam'
      + (failureReasons.length ? ' · ' + failureReasons.join(' · ') : '');
  }
  return '🐮 ' + done.length + '/' + jobs.length + ' job(s) concluídos';
}

async function toolAwait(args) {
  const a = args || {};
  const wave = a.wave ? String(a.wave) : null;
  const jobId = a.job_id ? String(a.job_id) : null;
  if (!wave && !jobId) return { error: 'passa wave ou job_id' };
  // ⚠️ A1 — o `await` NUNCA pode durar mais que o host aguenta.
  //
  // A v1.3.5 aceitava `timeout_s` até 1800 e a nota dizia "aumenta o timeout_s".
  // O Claude Desktop tem um tecto duro na chamada MCP; ao estourar, derruba a
  // ligação, o servidor reinicia — e o job que estava a correr fica órfão. Um
  // utilizador que seguiu a nota da própria tool matou o trabalho que esperava
  // (job-ms0iggqi-882b, 79 s, 7 passos feitos, custo perdido).
  //
  // O tecto passa a 45 s, com clamp em runtime e no schema. Esperar mais faz-se
  // voltando a chamar, não pedindo ao host que aguente mais.
  // 45 s é o tecto seguro medido neste host. Configurável por env para os testes
  // poderem provar o clamp sem esperar 45 s, e para afinar noutro host sem tocar
  // no código — mas nunca acima de 120 s, que é onde o Desktop começa a desistir.
  const AWAIT_MAX_S = Math.min(Number(process.env.MOOTER_AWAIT_MAX_S) || 45, 120);
  const pedido = Number(a.timeout_s);
  const timeoutS = Math.min(Math.max(Number.isFinite(pedido) ? pedido : 30, 5), AWAIT_MAX_S);
  const clamped = Number.isFinite(pedido) && pedido > AWAIT_MAX_S ? pedido : null;
  const t0 = Date.now();

  const snapshot = () => {
    const evs = ledgerRead().filter((e) => (jobId ? e.job_id === jobId : e.wave === wave));
    const byJob = new Map();
    for (const e of evs) {
      if (!e.job_id) continue;
      const observed = aprender.enriquecerCusto(e);
      const j = byJob.get(e.job_id) || {
        job_id: e.job_id, agent: e.agent, wave: e.wave, worktree: e.worktree,
        cargo: Object.prototype.hasOwnProperty.call(e, 'cargo') ? e.cargo : null,
        cargo_porque: e.cargo_porque || 'n/d — anterior à instrumentação de cargos',
        local: typeof e.local === 'boolean' ? e.local : e.agent === 'moo', last: null,
      };
      if (e.worktree) j.worktree = e.worktree;
      if (Object.prototype.hasOwnProperty.call(e, 'cargo')) j.cargo = e.cargo;
    if (e.cargo_porque) j.cargo_porque = e.cargo_porque;
    if (typeof e.local === 'boolean') j.local = e.local;
    if (!NON_STATE_EVENTS.has(e.event)) j.last = e.event;
      if (e.exit_code != null) j.exit_code = e.exit_code;
      if (Object.prototype.hasOwnProperty.call(observed, 'cost_usd')) {
        j.cost_usd = observed.cost_usd;
        j.cost_usd_fonte = observed.cost_usd_fonte;
        j.cost_usd_calculo = observed.cost_usd_calculo || null;
      }
      if (e.duration_s != null) j.duration_s = e.duration_s;
      if (e.model_used) j.model_used = e.model_used;
      if (e.tokens_in != null) j.tokens_in = e.tokens_in;
      if (e.tokens_out != null) j.tokens_out = e.tokens_out;
      if (e.note) j.note = e.note;
      byJob.set(e.job_id, j);
    }
    return [...byJob.values()];
  };

  const settled = (jobs) => jobs.length > 0 && jobs.every(isTerminal);

  let jobs = snapshot();
  while (!settled(jobs)) {
    if (Date.now() - t0 > timeoutS * 1000) {
      const vivos = jobs.filter((j) => !isTerminal(j));
      return {
        resumo: '🐮 ainda a trabalhar ao fim de ' + timeoutS + 's · ' + vivos.length + ' job(s) a correr — volta a chamar com o mesmo '
          + (jobId ? 'job_id' : 'wave'),
        timed_out: true, waited_s: Math.round((Date.now() - t0) / 1000),
        jobs,
        // ❌ NUNCA "aumenta o timeout_s": foi essa nota que levou alguém a pedir
        //    600s e a matar o próprio job que esperava.
        note: 'os jobs continuam vivos. Chama outra vez com o mesmo ' + (jobId ? 'job_id' : 'wave')
          + ' — cada espera é curta de propósito, para o host nunca derrubar a ligação e deixar um job órfão.',
        timeout_maximo_s: AWAIT_MAX_S,
        pedido_ajustado: clamped ? ('pediste ' + clamped + 's; o máximo seguro é ' + AWAIT_MAX_S + 's e foi esse o usado') : null,
      };
    }
    await new Promise((r) => setTimeout(r, 2000));
    jobs = snapshot();
  }

  const done = jobs.filter((j) => j.last === 'done');
  const failed = jobs.filter((j) => isTerminal(j) && j.last !== 'done');
  // ⚠️ v1.3.3 — `0` é uma afirmação; `null` é uma abstenção.
  // Somar `null`s dá 0 em JS, e a v1.3.2 fechou uma wave que gastou Opus 62 s
  // a dizer `cost_usd: 0`. Num produto cujo diferencial é custo honesto, essa
  // é a linha que destrói mais valor por carácter.
  const comValor = jobs.filter((j) => typeof j.cost_usd === 'number');
  const calculados = comValor.filter((j) => j.cost_usd_fonte === aprender.CUSTO_FONTE_CALCULADO);
  const reportados = comValor.length - calculados.length;
  const semValor = jobs.length - comValor.length;
  const semMedicao = jobs.length - reportados;
  const cost = comValor.reduce((s, j) => s + Number(j.cost_usd), 0);
  const costNotes = [];
  if (calculados.length) {
    costNotes.push(calculados.length + ' job(s) com custo '
      + aprender.CUSTO_FONTE_CALCULADO);
  }
  if (semValor) costNotes.push(semValor + ' job(s) com custo n/d — o total é parcial');
  /**
   * ⚠️ J-2 — o `toolAwait` não construía resumo próprio, e por isso o wrapper
   * `comResumo` punha "🐮 feito" por omissão, mesmo sobre jobs falhados.
   * Medido em produção a 2026-07-31: um job cujo agente respondeu "NÃO CONSIGO
   * VERIFICAR — sem acesso ao ficheiro" fechou com `done:1, failed:0,
   * exit_code:0` e titular "🐮 feito". O resumo passa a nascer aqui, com o
   * motivo da falha à frente em vez de escondido no detalhe.
   */
  const failureReasons = failed.map((job) => job.note).filter(Boolean);
  return {
    resumo: resumoHonesto(done, failed, jobs, failureReasons),
    settled: true,
    waited_s: Math.round((Date.now() - t0) / 1000),
    total: jobs.length, done: done.length, failed: failed.length,
    cost_usd: comValor.length ? Number(cost.toFixed(6)) : null,
    cost_jobs_medidos: reportados,
    cost_jobs_calculados: calculados.length,
    cost_jobs_sem_medicao: semMedicao,
    cost_jobs_sem_valor: semValor,
    cost_note: costNotes.length ? costNotes.join('; ') : null,
    jobs,
    note: failed.length
      ? failed.length + ' job(s) falharam'
        + (failureReasons.length ? ' — ' + failureReasons.join(' · ') : ' — usa mooter_collect/mooter_status para o detalhe')
      : 'todos terminaram; recolhe com mooter_collect',
  };
}

// ── v1.2 · plan / journal / work ─────────────────────────────────────────
async function toolPlan(args) {
  const a = args || {};
  const wave = String(a.wave || '').trim();
  if (!wave) return { error: 'wave é obrigatório' };
  const action = String(a.action || 'get');
  if (action === 'set') {
    if (!Array.isArray(a.steps) || !a.steps.length) return { error: 'steps é obrigatório em action:"set"' };
    return plan.summarize(plan.setPlan(wave, a.steps, a.goal));
  }
  if (action === 'update') {
    if (!a.step) return { error: 'step é obrigatório em action:"update"' };
    const r = plan.updateStep(wave, String(a.step), { state: a.state, by: a.by, note: a.note, job_id: a.job_id, risk: a.risk });
    return r && r.error ? r : plan.summarize(r);
  }
  const p = plan.readPlan(wave);
  return p ? plan.summarize(p) : { error: 'sem plano para a wave "' + wave + '"', hint: 'cria com action:"set"' };
}

async function toolJournal(args) {
  const a = args || {};
  if (a.status_only) return journal.vaultStatus();
  if (!a.title || !a.body) return { error: 'title e body são obrigatórios (ou usa status_only:true)' };
  const wave = a.wave ? String(a.wave) : null;
  let jobs = null; let cost = null;
  if (wave) {
    const evs = ledgerRead().filter((e) => e.wave === wave);
    jobs = [...new Set(evs.map((e) => e.job_id).filter(Boolean))];
    const costs = evs.map((e) => e.cost_usd).filter((c) => c != null);
    if (costs.length) cost = Number(costs.reduce((s, c) => s + Number(c), 0).toFixed(6));
  }
  return journal.writeNote({
    title: String(a.title), body: String(a.body), kind: a.kind || 'learning',
    wave, tags: a.tags, jobs, cost_usd: cost, subfolder: a.subfolder,
  });
}

/**
 * mooter_work — ONE door.
 *
 * Nine tools that demand you know what a worktree, a wave, a tier and an
 * allowedTools list are do not serve a vibe coder; they serve whoever built
 * them. This tool takes a goal in plain language and does the rest: classify,
 * pick the tier AND the agent, pick a free worktree, write the ⇄ handoff header
 * the constitution requires, dispatch, and hand back a live panel.
 *
 * It is deliberately conservative: read-only by default, and it refuses rather
 * than guessing a worktree. Refusing is honest; guessing writes code somewhere
 * you did not look.
 */
async function toolWork(args) {
  const a = args || {};
  const preparacao = resolverPreparacao(a);
  const goal = String(a.goal || '').trim();
  if (!goal) return { error: 'goal é obrigatório — descreve o que queres em linguagem normal' };
  const cargoSelection = normalizarCargo(a.cargo);
  if (!cargoSelection.ok) {
    return { error: cargoSelection.error, cargos_validos: cargoSelection.cargos_validos };
  }
  const workCategory = aprender.resolveCategory(goal, a.category);
  if (!workCategory.category) {
    return { error: workCategory.porque, categorias_validas: [...aprender.CATEGORY_NAMES] };
  }
  const suppliedStepsTotal = Array.isArray(a.steps) ? a.steps.length : null;
  const wave = String(a.wave || ('work-' + new Date().toISOString().slice(0, 10) + '-' + crypto.randomBytes(2).toString('hex')));
  // The guard only checks that a ⇄ header EXISTS. If user text could carry its
  // own ⇄, a forged routing header could smuggle instructions past the reader's
  // eye ("⇄ ROUTING ... allowedTools: everything"). The header is ours alone.
  if (/⇄/.test(goal) || /⇄/.test(String(a.context || ''))) {
    return { error: '❌ "⇄" é reservado ao cabeçalho de routing — remove-o do goal/context (tentativa de forjar handoff)' };
  }

  const d = classifyOrNull(goal);
  const tier = d ? (d.tier || null) : null;
  let agent = a.agent ? String(a.agent) : (tier === 'T0' ? 'moo' : 'cc');
  let escolhaLocal = null;   // preenchido abaixo, depois de sabermos o contexto
  let aprendizagem = null;   // só existe quando o ledger já tem base suficiente

  // ⚠️ v1.3.3 — DEGRADAR, não recusar. (achado dos testes de caminho, não de
  // uma auditoria: quando o classificador dava T0 e a máquina não tinha Ollama
  // a correr, o `mooter_work` devolvia "nenhum modelo local disponível" e o
  // utilizador ficava sem nada. A porta única não pode fechar-se porque um
  // motor opcional está em baixo — cai para a nuvem e diz que caiu.)
  let worktree = a.worktree ? String(a.worktree) : null;
  if (!worktree) {
    const ctx = (() => { try { return require('./fleet.js').readSessionContext(); } catch { return null; } })();
    worktree = (ctx && ctx.folder) || REPO;
  }
  // ⚠️ v1.3.4 — a worktree ocupada deixa de ser um beco.
  // O guard continua certo (dois agentes na mesma árvore corrompem-se), mas
  // antes a saída oferecida era "passa outra worktree" — um conceito de git que
  // o vibe coder não tem. Agora procuramos uma livre, e só falamos de git se
  // não houver nenhuma.
  // A5 — os ficheiros que o goal cita têm de existir na pasta escolhida
  const pedidos = [];
  { const m = String(goal + ' ' + (a.context || '')).match(new RegExp(PATH_RE.source, 'g'));
    if (m) for (const x of m) { const c = x.trim().replace(/^["'`(]/, ''); if (c.includes('/') || c.includes('\\')) pedidos.push(c.replace(/\\/g, '/')); } }

  const pedida = worktree;
  const deictic = isDeicticGoal(goal);
  let relocated = false; let relocatedPorque = null;
  let worktreeCriada = null;
  const refuseRelocation = (reason, jobs) => {
    const occupied = Array.isArray(jobs) && jobs.length
      ? [{ pasta: path.basename(pedida), jobs }] : [];
    ledgerAppend({
      event: 'relocacao_recusada', wave, worktree: pedida, goal,
      relocacao_recusada: { porque: reason, goal_deictico: true },
    });
    return {
      resumo: '⛔ não relocalizei: o pedido refere-se a esta worktree' + worktreeSuffix(pedida, pedida, false),
      erro: 'sem_worktree_viavel', porque: reason,
      ocupadas: occupied, faz_assim: [...WORKTREE_RECOVERY_STEPS],
      worktree_pedida: pedida, worktree_usada: pedida, relocated: false,
    };
  };
  if (a.create_worktree === true) {
    if (deictic) {
      return refuseRelocation('o goal é dêictico e create_worktree:true mudaria a pasta pedida', []);
    }
    const createWave = String(a.wave || 'work');
    const made = wt.create(REPO, createWave.slice(0, 20), worktree);
    if (!made.ok) {
      ledgerAppend({
        event: 'worktree_create_failed', wave: createWave, source_worktree: worktree,
        reason: made.error || 'motivo n/d',
      });
      return {
        resumo: '⛔ não arranquei o job: create_worktree:true falhou' + worktreeSuffix(pedida, pedida, false),
        erro: 'create_worktree_falhou', create_worktree: true,
        worktree_origem: worktree, porque: made.error || 'motivo n/d',
      };
    }
    worktreeCriada = {
      path: made.path, branch: made.branch || null, source: made.source || worktree,
    };
    ledgerAppend({
      event: 'worktree_created', wave: createWave,
      worktree: worktreeCriada.path, branch: worktreeCriada.branch,
      source_worktree: worktreeCriada.source,
    });
    worktree = made.path;
    relocated = true; relocatedPorque = 'create_worktree:true criou isolamento explícito';
    log('worktree criada: ' + made.path);
  }
  let busy = activeJobsByWorktree(worktree);
  const temOsFicheiros = !pedidos.length || pedidos.every((rel) => { try { return require('fs').existsSync(require('path').join(worktree, rel)); } catch { return false; } });
  if (!busy.length && !temOsFicheiros && !deictic) {
    const alt2 = wt.firstFree(REPO, activeJobsByWorktree, null, pedidos);
    if (alt2) { worktree = alt2; relocated = true; relocatedPorque = 'a pasta pedida não tem ' + pedidos.join(', '); log('relocado: ' + relocatedPorque); }
  }
  if (busy.length) {
    if (deictic) {
      return refuseRelocation('a worktree pedida tem job activo (' + busy.join(', ') + ')', busy);
    }
    const alt = wt.firstFree(REPO, activeJobsByWorktree, worktree, pedidos);
    if (alt) {
      relocated = true;
      relocatedPorque = 'a pasta pedida tinha um job activo (' + busy.join(', ') + ')';
      log('worktree ocupada; mudei para ' + alt);
      worktree = alt;
      busy = [];
    } else {
      const inv = wt.list(REPO, activeJobsByWorktree);
      const semFich = pedidos.length ? wt.semOsFicheiros(REPO, activeJobsByWorktree, pedidos) : [];
      return {
        resumo: pedidos.length
          ? '⛔ não há pasta livre com ' + pedidos.join(', ') + worktreeSuffix(pedida, pedida, false)
          : '🐮 não há onde trabalhar: as ' + (inv.total || 0) + ' pastas estão ocupadas'
            + worktreeSuffix(pedida, pedida, false),
        erro: pedidos.length ? 'sem_worktree_viavel' : 'todas_ocupadas',
        ocupadas: (inv.worktrees || []).filter((w) => w.busy).map((w) => ({ pasta: w.name, jobs: w.busy_jobs })),
        livres_sem_os_ficheiros: semFich.length ? semFich : null,
        faz_assim: [...WORKTREE_RECOVERY_STEPS],
      };
    }
  }
  let relocationFreshness = null;
  if (relocated) {
    try { relocationFreshness = wt.frescura(worktree, REPO); } catch { relocationFreshness = null; }
  }

  // ── A3 (v1.4.1) · DAR OLHOS ao motor local, em vez de o proibir ──────────
  //
  // A v1.4.0 recusava despachar leitura para o `moo`. Era honesto e era a
  // solução errada: amputava o tier local de 90% do trabalho real. O servidor
  // corre em Node, no disco do utilizador — pode ler o ficheiro ELE PRÓPRIO e
  // injectá-lo no prompt. O modelo local não precisa de ferramentas; precisa de
  // contexto. Custa milissegundos, custa $0, e transforma "o teu modelo local
  // não serve para isto" em "o teu modelo local acabou de auditar o ficheiro".
  const executionText = goal + ' ' + (a.context || '');
  const leitura = pedeLeituraDeFicheiro(executionText);
  const executionIntent = pedeExecucaoDeMotor(executionText);
  const contextoParaLeitura = leitura && preparacao.read_files
    ? contexto.lerParaPrompt(executionText, worktree, a.context_budget)
    : null;
  let contextoInjectado = null;
  let avisoFabricacao = null;

  // ── A4 · correr os comandos pedidos, PELO motor local ────────────────────
  // O A3 acima empresta-lhe os olhos para ficheiros. Este empresta-lhos para
  // comandos. Só corre para motores sem ferramentas: o `cc` e o `codex` correm
  // os seus próprios, e duplicá-los seria pagar duas vezes pela mesma verdade.
  let execucaoInjectada = null;
  if (ENGINES_SEM_FICHEIROS.has(agent)) {
    const exe = executarComandos(goal + ' ' + (a.context || ''), worktree);
    if (exe && exe.bloco) {
      execucaoInjectada = exe;
    } else if (exe && exe.recusados.length && !contextoInjectado && !avisoFabricacao) {
      // pediram comandos, nenhum correu, e não há leitura a compensar:
      // dizê-lo agora é melhor do que deixar o modelo preencher o vazio
      avisoFabricacao = 'pediste comandos que eu não pude correr ('
        + exe.recusados.map((r) => r.comando + ' — ' + r.porque).join(' · ')
        + ') e o motor local não tem ferramentas — qualquer veredicto na resposta é especulação';
    }
  }

  let downgraded = null;
  if (agent === 'moo') {
    const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
    const res = await require('./fleet.js').probeOllama(700).catch(() => null);
    const has = await moo.pickModel(null, host, res).catch(() => null);
    if (!has) {
      downgraded = 'o router escolheu a GPU local (T0) mas não há modelo local capaz de gerar em ' + host + ' — passei para o Claude Code';
      agent = 'cc';
      log(downgraded);
    }
  }
  // ⚠️ v1.3.3 — o `agent` VAI, e é por isto que o bug existia: esta linha
  // chamava com 2 argumentos e o shim assumia Anthropic, entregando "sonnet"
  // ao Ollama. O agente está calculado na linha acima; nunca mais o deixar cair.
  /**
   * ── CALIBRAGEM POR QUOTA (v1.7) ─────────────────────────────────────────
   *
   * Isto é o que nenhum concorrente pode copiar sem ter uma GPU do lado do
   * utilizador. O LiteLLM, com o orçamento esgotado, RECUSA a chamada. O
   * OpenRouter escolhe um provedor mais barato — e continua a cobrar. Nós
   * descemos de tier e, no limite, mandamos para uma placa que não cobra nada.
   * O trabalho não pára.
   *
   * ❌ Nunca sobe de tier por causa da quota. Só desce, e diz porquê.
   */
  let calibragem = null;
  if (!a.model) {
    try {
      const q = require('./quota.js').estado({});
      if (q && q.pressao && q.pressao.valor != null && q.calibragem.politica !== 'normal') {
        calibragem = q.calibragem;
        calibragem.pressao = q.pressao.valor;
        calibragem.nivel = q.pressao.nivel;
      }
    } catch { /* sem leitura de quota, o routing fica como estava */ }
  }

  if (agent === 'kimi' && a.model && String(a.model) !== kimi.MODEL) {
    return { error: 'o agente kimi usa apenas o modelo kimi-k3', agent: 'kimi', model: kimi.MODEL };
  }
  let model = agent === 'kimi'
    ? kimi.MODEL
    : (a.model ? String(a.model) : (d ? cliModelFor(agent, tier, d.recommended_model) : null));
  let routedBy = a.model ? 'user' : (model ? 'work+classify' : 'cli-default');
  // o tecto da calibragem aplica-se DEPOIS do router, e só para baixo
  if (calibragem && calibragem.tecto && agent !== 'moo' && model) {
    const ordem = ['haiku', 'sonnet', 'opus'];
    const iAgora = ordem.findIndex((x) => String(model).includes(x));
    const iTecto = ordem.indexOf(calibragem.tecto);
    if (iAgora > iTecto && iTecto >= 0) {
      calibragem.desceu_de = model;
      model = calibragem.tecto;
      routedBy = 'quota';
    }
  }
  // ── LOCAL-FIRST (v1.4.1) · agora que sabemos o contexto, a GPU pode chegar ──
  //
  // Medido em 2026-07-25: 0% de output local em 8 sessões. O classify.js olha
  // para o TEXTO e nada sabe sobre o que a máquina aguenta — e até aqui o tier
  // local nem sequer lia ficheiros. Com `context.js` a fronteira mudou, e esta
  // é a decisão que o classificador nunca teve dados para tomar.
  // ❌ Nunca escolhe local para escrita, git, deploy, testes ou auditoria.
  if (!a.agent && !a.model && agent !== 'moo') {
    let vram = null; let temLocal = false; let escolhaModeloLocal = null;
    try {
      const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
      const res = await require('./fleet.js').probeOllama(700).catch(() => null);
      const g = await require('./gpu.js').gpuSnapshot(res ? res.length : null).catch(() => null);
      vram = g && g.headroom ? g.headroom.free_mb : null;
      escolhaModeloLocal = await moo.pickModelExplained(null, host, res, { vram: g, goal }).catch(() => null);
      temLocal = !!(escolhaModeloLocal && escolhaModeloLocal.model);
    } catch { /* sem local, seguimos para a nuvem */ }

    // ler os ficheiros ANTES de decidir: é o tamanho do contexto que manda
    const pre = contextoParaLeitura || (preparacao.read_files
      ? contexto.lerParaPrompt(executionText, worktree, a.context_budget)
      : { chars: 0 });
    escolhaLocal = localfirst.cabeNoLocal({
      goal, tier, contextoChars: pre.chars, temModeloLocal: temLocal,
      escrita: a.write === true, vramLivreMb: vram,
      motivoNaoLocal: escolhaModeloLocal && escolhaModeloLocal.motivo_nao_local,
      modeloJaResidente: escolhaModeloLocal && escolhaModeloLocal.residente === true,
      // Onda 0.6 — a quota crítica agora tem efeito real: forcar_local era
      // calculado em quota.js e NUNCA lido. Ou se usa, ou se apaga: usa-se.
      forcar: !!(calibragem && calibragem.forcar_local),
    });

    // O resultado anterior pode mudar a decisão, mas nunca ultrapassa um veto
    // mecânico de risco/capacidade nem altera o modelo cloud já calibrado.
    aprendizagem = aprender.recomendarAgente({
      goal, category: workCategory.category, category_fonte: workCategory.category_fonte,
      tier, escrita: a.write === true, ledger: ledgerRead(),
    });
    const mechanicalVeto = !escolhaLocal.local && escolhaLocal.confianca === 'alta';
    if (aprendizagem && aprendizagem.agente && !mechanicalVeto) {
      escolhaLocal = {
        local: aprendizagem.agente === 'moo',
        porque: 'histórico local: ' + aprendizagem.porque,
        confianca: aprendizagem.confianca,
        forcado_por_quota: false,
        motivo_nao_local: null,
      };
      routedBy = 'adaptive-learned';
    }
    if (escolhaLocal.local) {
      agent = 'moo';
      // Um alias cloud (sonnet/opus) nunca pode viajar como modelo explícito
      // para o Ollama; o selector local escolhe o modelo instalado real.
      if (!a.model) model = null;
      log('local-first: ' + escolhaLocal.porque);
    }
  }
  if (!escolhaLocal && !a.agent && !a.model) {
    escolhaLocal = {
      local: agent === 'moo',
      porque: agent === 'moo'
        ? 'o classificador deu T0 e escolheu o motor local'
        : 'a decisão local-first não encontrou base para trocar o motor escolhido',
      confianca: 'media', forcado_por_quota: false,
    };
  } else if (escolhaLocal) {
    escolhaLocal = {
      local: escolhaLocal.local === true,
      porque: escolhaLocal.porque,
      confianca: escolhaLocal.confianca,
      forcado_por_quota: escolhaLocal.forcado_por_quota === true,
      motivo_nao_local: escolhaLocal.local === false && escolhaLocal.motivo_nao_local
        ? String(escolhaLocal.motivo_nao_local) : null,
    };
  }

  // BUG v1.18: o moo aceitou `node board.test.js`, não correu nada e respondeu
  // 14/0 por inferência do ficheiro. O A4 continua intacto para git de leitura;
  // todo o pedido que ele não satisfez é recusado ou reencaminhado antes do job.
  const capability = executionIntent ? executionCapability(agent) : null;
  const satisfiedByA4 = !!(executionIntent && executionIntent.apenas_git
    && execucaoInjectada && execucaoInjectada.executados.length > 0
    && execucaoInjectada.recusados.length === 0);
  if (executionIntent && capability && !capability.supported && !satisfiedByA4) {
    if (a.agent) {
      return {
        resumo: '⛔ não despachei: este motor não executa comandos — usa agent:"cc" ou agent:"codex"'
          + worktreeSuffix(pedida, worktree, relocated),
        erro: 'motor_sem_execucao', agent,
        pedido_execucao: executionIntent,
        permissoes_efectivas: capability.effective,
        faz_assim: [
          'mooter_work({goal, agent:"cc"}) — o Claude Code executa e devolve a saída real',
          'mooter_work({goal, agent:"codex"}) — o Codex executa no sandbox declarado',
        ],
      };
    }
    agent = 'cc';
    model = d ? cliModelFor(agent, tier, d.recommended_model) : null;
    routedBy = 'capacidade-execucao';
    escolhaLocal = {
      local: false,
      porque: 'o goal pede execução e o motor local não recebe ferramentas',
      confianca: 'alta', forcado_por_quota: false,
    };
  }

  // Contrato final: só agora o motor está resolvido (o local-first pode tê-lo
  // mudado). Um /api/chat sem ferramentas só recebe leitura quando o conteúdo
  // foi realmente injectado; caso contrário o job é impossível e nem nasce.
  if (leitura && ENGINES_SEM_FICHEIROS.has(agent)) {
    if (!preparacao.read_files) {
      return Object.assign({
        resumo: '⛔ não despachei: a tarefa exige ler ficheiros e read_files está desligado'
          + worktreeSuffix(pedida, worktree, relocated, relocationFreshness),
        worktree_pedida: pedida, worktree_usada: worktree,
        relocated, relocated_porque: relocatedPorque,
        worktree_frescura: relocationFreshness,
      }, recusaContratoDeLeitura(agent, leitura, executionCapability(agent).effective));
    }
    if (contextoParaLeitura && contextoParaLeitura.bloco) {
      contextoInjectado = contextoParaLeitura;
    } else {
      let onde = [];
      try {
        onde = wt.comOsFicheiros(REPO, activeJobsByWorktree, contexto.pathsCitados(executionText))
          .filter((w) => !P.mesmo(w.path, worktree)).slice(0, 5);
      } catch { /* sem git, seguimos sem sugestão */ }
      return {
        resumo: onde.length
          ? '⛔ não despachei: esse ficheiro não existe em ' + path.basename(worktree)
            + ' — mas existe em ' + onde.map((w) => w.name).join(', ')
            + worktreeSuffix(pedida, worktree, relocated, relocationFreshness)
          : '⛔ não despachei: o motor não lê ficheiros e eu também não consegui injectá-los'
            + worktreeSuffix(pedida, worktree, relocated, relocationFreshness),
        erro: 'sem_contexto_para_o_local',
        porque: 'tentei ler '
          + (((contextoParaLeitura && contextoParaLeitura.falhados) || []).map((f) => f.path).join(', ')
            || 'os ficheiros citados')
          + ' na pasta ' + path.basename(worktree) + ' e não consegui',
        detalhe: contextoParaLeitura ? contextoParaLeitura.falhados : [],
        onde_existe: onde.length ? onde : null,
        worktree_pedida: pedida, worktree_usada: worktree,
        relocated, relocated_porque: relocatedPorque,
        worktree_frescura: relocationFreshness,
        faz_assim: (onde.length
          ? ['mooter_work({goal, agent:"' + agent + '", worktree:"' + onde[0].path + '", read_files:true}) — usa a pasta onde o ficheiro existe']
          : []).concat([
          'mooter_work({goal, agent:"cc"}) — o Claude Code procura os ficheiros sozinho',
          'diz o caminho completo a partir da raiz do projecto',
        ]),
      };
    }
  }

  const readOnly = a.write !== true;
  const allowedTools = a.allowedTools ? String(a.allowedTools) : (readOnly ? 'Read,Glob,Grep' : 'Read,Glob,Grep,Edit,Write');
  const mp = [
    '⇄ ROUTING / DE: Cowork (mooter_work) / PARA: ' + agent + ' / WAVE: ' + wave,
    '',
    'OBJECTIVO: ' + goal,
    '',
    'REGRAS (constituição Mooter):',
    readOnly
      ? '- ❌ NÃO escrever, criar, alterar nem apagar ficheiro nenhum. Análise apenas.'
      : '- Escreve só o que o objectivo exige. ❌ Zero git (sem add/commit/push/merge/rebase/delete).',
    '- ❌ Nunca tocar em tools/router/classify.js (FROZEN).',
    '- Números só com fonte. O que não souberes = `n/d`. ❌ Não inventes.',
    '- Sê conciso: entrega o resultado, não o processo.',
    a.context ? '\nCONTEXTO ADICIONAL:\n' + String(a.context) : '',
  ].join('\n');

  // ⚠️ v1.3.3 — ACRESCENTAR, não substituir.
  // `setPlan` substitui. Três `mooter_work` na mesma wave davam `total: 1` e o
  // goal da wave passava a ser o do último — o trabalho anterior desaparecia do
  // plano que o painel desenha como checklist. O produto a mentir sobre si mesmo.
  const stepId = 'S' + (((plan.readPlan(wave) || {}).steps || []).length + 1);
  // os olhos emprestados entram no prompt, antes do plano
  const mpFinal = mp
    + (contextoInjectado ? '\n' + contextoInjectado.bloco : '')
    + (execucaoInjectada ? '\n' + execucaoInjectada.bloco : '');

  // ⚠️ A4 · invariante 3 — a evidência viaja para o disco, não só para a resposta
  const evidencia = {
    ficheiros_lidos: contextoInjectado ? contextoInjectado.lidos.map((f) => f.path) : [],
    comandos_corridos: execucaoInjectada ? execucaoInjectada.executados : [],
    comandos_recusados: execucaoInjectada ? execucaoInjectada.recusados : [],
    chars: (contextoInjectado ? contextoInjectado.chars : 0) + (execucaoInjectada ? execucaoInjectada.chars : 0),
  };
  const evidenciaPrep = {
    ficheiros_lidos: contextoParaLeitura && contextoParaLeitura.bloco
      ? contextoParaLeitura.lidos.map((f) => f.path) : [],
    comandos_corridos: [],
    comandos_recusados: [],
    chars: contextoParaLeitura && contextoParaLeitura.bloco ? contextoParaLeitura.chars : 0,
  };

  if (Array.isArray(a.steps) && a.steps.length) { try { plan.setPlan(wave, a.steps, goal); } catch { /* */ } }
  else { try { plan.addStep(wave, { id: stepId, title: goal, agent, state: 'a-correr' }, goal); } catch { /* */ } }

  // ── prepare: the local moo loads the piano before the expensive agent plays ──
  // Default ON when the GPU is available and the target is a paid agent. The
  // moo produces a short brief; the cloud job starts with it already embedded,
  // so the first paid token is spent on the actual problem instead of on
  // orientation. Costs $0 and is measured, not claimed.
  const wantsPrepare = preparacao.pre_digest && agent !== 'moo';
  let prepareSkipped = null;
  if (wantsPrepare) {
    // ⚠️ v1.3.3 — /api/ps lista o que está RESIDENTE em memória, não o que está
    // instalado. Com a GPU em idle a lista vem vazia, e a v1.3.2 concluía "não
    // há modelo local" e desistia EM SILÊNCIO. Resultado: em 4 jobs reais houve
    // 0 handoffs e 0 chained — a prova de valor do produto ("a GPU prepara de
    // graça o trabalho do agente pago") nunca correu, e nada avisou.
    // Um modelo frio custa segundos de carregamento, não é um impedimento.
    const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';
    const resident = await require('./fleet.js').probeOllama(700).catch(() => null);
    let vramSnapshot = null;
    try { vramSnapshot = await require('./gpu.js').gpuSnapshot(resident ? resident.length : null); } catch { /* */ }
    const localModel = await moo.pickModel(null, host, resident, { vram: vramSnapshot, goal }).catch(() => null);
    if (!localModel) {
      prepareSkipped = (resident === null)
        ? 'Ollama não respondeu em ' + host + ' — sem preparação local'
        : 'nenhum modelo local capaz de gerar texto (só embedders ou lista vazia) — sem preparação local';
      log('prepare saltado: ' + prepareSkipped);
    }
    if (localModel) {
      const prepMp = [
        '⇄ ROUTING / DE: Cowork (mooter_work) / PARA: moo (GPU local) / WAVE: ' + wave,
        '',
        'És o preparador. Um agente pago vai receber isto a seguir e não deve perder tokens a orientar-se.',
        '',
        'OBJECTIVO DA WAVE: ' + goal,
        a.context ? '\nCONTEXTO: ' + String(a.context) : '',
        '',
        'ENTREGA (≤250 palavras, sem preâmbulo):',
        '1. Reformula o objectivo em 1 frase precisa.',
        '2. Lista 3-6 passos concretos por ordem.',
        '3. Diz que ficheiros ou zonas do projecto são provavelmente relevantes.',
        '4. Nomeia 2 armadilhas prováveis.',
        '5. Diz o que NÃO deve ser feito.',
        '',
        '❌ Não inventes ficheiros nem factos. Se não souberes, escreve "a verificar".',
      ].join('\n') + (contextoParaLeitura && contextoParaLeitura.bloco
        ? '\n' + contextoParaLeitura.bloco : '');

      const prep = await toolDispatch({
        agent: 'moo', worktree, masterprompt: prepMp, wave, cargo: cargoSelection.cargo,
        step: 'S0', model: localModel,
        evidencia: evidenciaPrep,
        __goal: goal, __escrita: false,
        __category: workCategory.category, __category_fonte: workCategory.category_fonte,
        __worktree_created: worktreeCriada,
        __chain: { agent, worktree, masterprompt: mpFinal, wave, cargo: cargoSelection.cargo,
          allowedTools, model, step: stepId, evidencia,
          __goal: goal, __escrita: a.write === true, __cross_check: true,
          __category: workCategory.category, __category_fonte: workCategory.category_fonte,
          __steps_total: suppliedStepsTotal,
          __worktree_created: worktreeCriada, __local_decisao: escolhaLocal,
          __quota_calibragem: calibragem },
      });
      if (prep && prep.job_id) {
        return {
          resumo: '🐮 GPU local (' + localModel + ') a preparar o trabalho a $0 · depois entra o ' + agentLabel(agent)
            + (model ? ' (' + model + ')' : '') + ' · job ' + prep.job_id
            + worktreeSuffix(pedida, worktree, relocated, relocationFreshness),
          ok: true, goal, category: workCategory.category,
          category_fonte: workCategory.category_fonte, wave,
          cargo: cargoSelection.cargo, cargo_porque: cargoSelection.porque, tier,
          phase: 'preparação local',
          agent: 'moo → ' + agent,
          agent_label: 'Ollama · local → ' + agentLabel(agent),
          model: (prep.model || localModel) + ' → ' + (model || '(default do CLI)'),
          job_id: prep.job_id,
          permissoes_pedidas: prep.permissoes_pedidas,
          permissoes_efectivas: prep.permissoes_efectivas,
          permissoes_diferenca: prep.permissoes_diferenca,
          worktree_criada: worktreeCriada,
          worktree_pedida: pedida,
          worktree_usada: worktree,
          relocated,
          relocated_porque: relocatedPorque,
          worktree_frescura: relocationFreshness,
          read_files: preparacao.read_files,
          pre_digest: preparacao.pre_digest,
          prepare_legacy: preparacao.prepare_legacy,
          chained: true,
          worktree,
          aprendizagem: aprendizagem ? {
            agente: aprendizagem.agente, porque: aprendizagem.porque,
            confianca: aprendizagem.confianca, base: aprendizagem.base,
          } : null,
          mode: readOnly ? 'só leitura' : 'escrita permitida',
          verificacao_cruzada: {
            estado: 'aguarda_job_pago',
            job_id: 'n/d',
            custo_usd: 0,
            porque: 'o job pago nasce automaticamente quando a preparação local terminar',
          },
          note: 'a GPU local está a preparar o handoff ($0). Quando acabar, o ' + agentLabel(agent) + ' arranca sozinho com esse trabalho já dentro do prompt — vê o painel.',
        };
      }
      prepareSkipped = 'a preparação local foi recusada: ' + ((prep && (prep.reasons || prep.error)) || 'motivo desconhecido');
      log(prepareSkipped);
    }
  }

  /**
   * ⚠️ J-5b (2026-07-31) — `handoff_from` chegava aqui e morria.
   *
   * `toolDispatch` sabe usá-lo (linha ~1450 lê-o, ~1478 chama `embedHandoff`)
   * e `embedHandoff` cola mesmo o corpo do job anterior no masterprompt. Mas
   * este objecto é montado campo a campo, e `handoff_from` não estava na lista
   * — portanto chegava sempre `undefined` e o handoff só existia no ramo da
   * cadeia automática moo→nuvem.
   *
   * Apanhado em produção, e pelo próprio mecanismo: pediu-se ao moo que
   * verificasse a $0 o que o kimi tinha escrito, e ele respondeu «NAO PROCEDE
   * — o texto de referência não foi incluído na mensagem». O handoff
   * nuvem→moo funcionou como verificador e denunciou o seu próprio bug.
   *
   * A lição de método: o teste que existia validava que o parâmetro estava no
   * SCHEMA, não que o conteúdo atravessava a porta. Ver `handoff.test.js`.
   */
  const r = await toolDispatch({ agent, worktree, masterprompt: mpFinal, wave, cargo: cargoSelection.cargo,
    allowedTools, model, step: stepId, handoff_from: a.handoff_from || null,
    routed_by: routedBy, evidencia, __goal: goal, __escrita: a.write === true,
    __category: workCategory.category, __category_fonte: workCategory.category_fonte,
    __steps_total: suppliedStepsTotal,
    __cross_check: agent !== 'moo', __worktree_created: worktreeCriada, __local_decisao: escolhaLocal,
    __quota_calibragem: calibragem });
  if (r && r.error) return Object.assign({
    resumo: '⛔ não despachei o job' + worktreeSuffix(pedida, worktree, relocated, relocationFreshness),
    goal, wave, tier_pedido: tier, agent, model,
    worktree_pedida: pedida, worktree_usada: worktree,
    relocated, relocated_porque: relocatedPorque, worktree_criada: worktreeCriada,
    worktree_frescura: relocationFreshness,
  }, r);
  // ⚠️ Medido UMA vez e usado em dois sítios: o campo `router` e o titular.
  // Se o router não correu, o titular tem de o dizer — um conector sem
  // classificador continua a responder, e é aí que o valor evapora em silêncio.
  const routerEstado = routerParaResposta(goal);
  const routerAviso = routerEstado.disponivel === true
    ? ''
    : ' · ⚠ sem router (' + routerEstado.porque + ')';
  return {
    // ⚠️ v1.3.3 — a frase legível vive DENTRO do objecto, como primeira chave.
    // A v1.3.2 punha-a em `content[0].text` e este host mostra o
    // `structuredContent`: a prosa era escrita e descartada em 21/21 chamadas.
    resumo: '🐮 ' + (agent === 'kimi' ? agentLabel(agent) : (r.model || model || agent)) + ' a trabalhar em "' + goal.slice(0, 60) + '"'
      + ' · ' + (readOnly ? 'só leitura' : 'escrita permitida') + ' · job ' + r.job_id
      + (prepareSkipped ? ' · sem preparação local' : '')
      + worktreeSuffix(pedida, worktree, relocated, relocationFreshness)
      + (contextoInjectado ? ' · li ' + contextoInjectado.lidos.length + ' ficheiro(s) por ele ($0)' : '')
      + (execucaoInjectada ? ' · corri ' + execucaoInjectada.executados.length + ' comando(s) por ele ($0)' : '')
      + routerAviso,
    ok: true, goal, category: workCategory.category,
    category_fonte: workCategory.category_fonte, wave,
    cargo: cargoSelection.cargo, cargo_porque: cargoSelection.porque,
    permissoes_pedidas: r.permissoes_pedidas,
    permissoes_efectivas: r.permissoes_efectivas,
    permissoes_diferenca: r.permissoes_diferenca,
    // ⚠️ A4 — dois campos que partilhavam nome e diziam coisas diferentes.
    // `tier` chegou a dizer T0 para um job Opus e T3 para um job local grátis.
    tier_pedido: tier,                   // o que o classify.js achou do TEXTO
    tier_motor: tierDoMotor(agent, r.model || model),  // o que de facto correu
    agent,
    agent_label: agentLabel(agent),
    model: r.model || model || '(default do CLI)',
    routed: r.routed,
    routed_by: r.routed_by || routedBy,
    job_id: r.job_id,
    // ⚠️ A5 — toda a mudança de pasta é DECLARADA. Antes trocava em silêncio e
    // o utilizador não tinha como saber que o job correu noutro sítio.
    worktree_pedida: pedida,
    worktree_usada: worktree,
    relocated,
    relocated_porque: relocatedPorque,
    worktree_frescura: relocationFreshness,
    worktree_criada: worktreeCriada,
    prepared: false,
    read_files: preparacao.read_files,
    pre_digest: preparacao.pre_digest,
    prepare_legacy: preparacao.prepare_legacy,
    mapa_injectado: r.mapa_injectado,
    mapa_porque: r.mapa_porque,
    verificacao_cruzada: r.verificacao_cruzada,
    // v1.4.1 — o que o conector leu PELO modelo local. É o que separa uma
    // resposta fundamentada de uma resposta plausível.
    // porque foi (ou não foi) para a GPU — a decisão que o classificador não podia tomar
    // ⚠️ se a quota mexeu no routing, isso NUNCA pode ser silencioso
    calibragem_por_quota: calibragem ? {
      politica: calibragem.politica, nivel: calibragem.nivel, pressao: calibragem.pressao,
      desceu_de: calibragem.desceu_de || null, porque: calibragem.porque, tecto: calibragem.tecto,
    } : null,
    escolha_local: escolhaLocal ? {
      local: escolhaLocal.local, porque: escolhaLocal.porque, confianca: escolhaLocal.confianca,
      forcado_por_quota: escolhaLocal.forcado_por_quota,
      motivo_nao_local: escolhaLocal.motivo_nao_local || null,
    } : null,
    aprendizagem: aprendizagem ? {
      agente: aprendizagem.agente, porque: aprendizagem.porque,
      confianca: aprendizagem.confianca, base: aprendizagem.base,
    } : null,
    poupanca_estimada: (escolhaLocal && escolhaLocal.local)
      ? localfirst.poupancaEstimada((contextoInjectado ? contextoInjectado.chars : 0) + goal.length, 2000, tier === 'T3' ? 'opus' : 'sonnet')
      : null,
    ficheiros_lidos: contextoInjectado ? contextoInjectado.lidos.map((f) => f.path) : null,
    contexto_chars: contextoInjectado ? contextoInjectado.chars : null,
    contexto_truncado: contextoInjectado && contextoInjectado.truncados.length ? contextoInjectado.truncados : null,
    // A4 — o que o conector correu PELO motor local, e o que recusou correr
    comandos_corridos: execucaoInjectada && execucaoInjectada.executados.length ? execucaoInjectada.executados : null,
    comandos_recusados: execucaoInjectada && execucaoInjectada.recusados.length ? execucaoInjectada.recusados : null,
    aviso_fabricacao: avisoFabricacao,   // A3: forçaste um motor que não lê
    downgraded,                          // porque não foi para onde o router queria
    prepare_skipped: prepareSkipped,     // ❌ silêncio nunca; n/d sempre
    // ⚠️ O router é o núcleo de valor: se ele não correu, isto tem de o dizer.
    // Sem este campo, um conector sem classificador respondia na mesma e ninguém
    // notava — a degradação silenciosa que o estranho.test.js persegue.
    router: routerEstado,
    mode: readOnly ? 'só leitura' : 'escrita permitida',
    note: 'a trabalhar. O painel actualiza-se sozinho; usa mooter_await para esperar e mooter_collect no fim.',
  };
}

// ── MCP tool descriptors (annotations per MCP directory requirements) ─────
const TOOLS = [
  {
    name: 'mooter_route',
    description: 'Classify a task with the FROZEN Mooter router (tools/router/classify.js, read-only, <50ms, $0) and return {agent, tier, confidence, rationale}. Deterministic heuristics, no LLM call. Use before dispatching to pick the minimum viable tier.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The task/prompt text to classify.' } }, required: ['text'], additionalProperties: false },
    annotations: { title: '🐄 Mooter · classify locally · <50ms · $0', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolRoute,
  },
  {
    name: 'mooter_dispatch',
    description: 'Dispatch a masterprompt to an agent (cc = claude -p | codex exec | gemini -p | kimi = Moonshot cloud API) with cwd bound to the given git worktree. The guard validates FIRST (⇄ header, worktree ownership via ledger, path allowlist, vault deny) and refuses with reasons. Appends `dispatched` to the append-only ledger (~/.mooter/ledger.jsonl) and returns {job_id} IMMEDIATELY — it never waits for the job. Follow with mooter_status / mooter_collect.',
    inputSchema: { type: 'object', properties: {
      agent: { type: 'string', enum: ['cc', 'codex', 'gemini', 'moo', 'kimi'], description: 'Which engine executes the job. `moo` = local Ollama on this machine ($0); `kimi` = Moonshot · nuvem.' },
      worktree: { type: 'string', description: 'Absolute path of the git worktree the job runs in (cwd). Must exist and be free of active jobs.' },
      masterprompt: { type: 'string', description: 'Full masterprompt (must contain the ⇄ routing header). Written to the job dir; the CLI is pointed at the file.' },
      wave: { type: 'string', description: 'Wave id for the ledger (e.g. "mooter-seamless-m1").' },
      cargo: { type: 'string', enum: VALID_CARGOS, description: 'M-level declarado por quem dispara. Nunca é inferido do texto.' },
      allowedTools: { type: 'string', description: 'cc only: --allowedTools permission list (role matrix). Default "Read".' },
      model: { type: 'string', description: 'Override the model (alias like "haiku"/"sonnet"/"opus", or a full name). Omit and the FROZEN classifier picks the minimum viable tier and passes it to the CLI.' },
      step: { type: 'string', description: 'Plan step id this job executes (see mooter_plan) — the step is marked running, then done/failed with who did it.' },
      handoff_from: { type: 'string', description: 'Job id whose result should be embedded into this masterprompt. Records a proven handoff chain in the ledger.' },
    }, required: ['agent', 'worktree', 'masterprompt', 'wave'], additionalProperties: false },
    annotations: { title: '🐄 Mooter · dispatch to the fleet', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: toolDispatch,
  },
  {
    name: 'mooter_status',
    description: 'Status of one job (job_id) or a whole wave: ledger events (dispatched/started/done/failed/collected), liveness, exit codes, cost and duration when known, last stderr lines. Read-only over the append-only ledger.',
    inputSchema: { type: 'object', properties: {
      job_id: { type: 'string', description: 'Job id returned by mooter_dispatch.' },
      wave: { type: 'string', description: 'Wave id — returns every job in the wave.' },
    }, additionalProperties: false },
    annotations: { title: '🐄 Mooter · job status', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolStatus,
  },
  {
    name: 'mooter_collect',
    description: 'Collect the result of a finished job: result text (CC json result / Codex last message / raw output), session id and cost when known. Results >100k chars come back as head+tail excerpt plus the full-file path. Idempotent — the `collected` ledger event is appended once.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string', description: 'Job id returned by mooter_dispatch.' } }, required: ['job_id'], additionalProperties: false },
    annotations: { title: '🐄 Mooter · collect the result', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolCollect,
  },
  {
    name: 'mooter_work',
    description: 'ONE DOOR: give it a goal in plain language and it does the rest — classifies with the FROZEN router, picks the minimum viable tier AND the engine (local Ollama for T0, Claude Code otherwise), picks a free worktree, writes the ⇄ handoff header the Mooter constitution requires, dispatches, and returns a live panel. Read-only unless you pass write:true. Use this instead of route+dispatch when you just want the work done.',
    inputSchema: { type: 'object', properties: {
      goal: { type: 'string', description: 'What you want, in normal language.' },
      write: { type: 'boolean', description: 'Allow the agent to modify files (default false = analysis only). Git is never allowed.' },
      worktree: { type: 'string', description: 'Where to work. Defaults to the bound Cowork folder.' },
      wave: { type: 'string', description: 'Wave id (auto-generated if omitted).' },
      agent: { type: 'string', enum: ['cc', 'codex', 'gemini', 'moo', 'kimi'], description: 'Force an engine. Omit to let the router decide. `kimi` = Moonshot · nuvem.' },
      model: { type: 'string', description: 'Force a model. Omit to let the router decide.' },
      category: { type: 'string', enum: ['git_deploy', 'auditoria', 'codigo', 'leitura_resumo', 'outro'], description: 'Override da categoria de aprendizagem. Quando presente, ganha à inferência e fica registada como declarada.' },
      cargo: { type: 'string', enum: VALID_CARGOS, description: 'M-level declarado por quem dispara. Nunca é inferido do texto.' },
      steps: { type: 'array', items: { type: 'string' }, description: 'Optional plan: the steps the panel should show, with risk inferred per step.' },
      prepare: { type: 'boolean', description: 'Compatibility alias for pre_digest. Let the local GPU write the handoff brief first, at $0.' },
      read_files: { type: 'boolean', description: 'Read and inject cited files when the selected engine has no file tools. Default true.' },
      pre_digest: { type: 'boolean', description: 'Let the local GPU pre-digest the request before the paid engine. Default true.' },
      create_worktree: { type: 'boolean', description: 'Create a fresh isolated worktree before dispatch (git worktree add, reversible). If creation fails the job does not start.' },
      allowedTools: { type: 'string', description: 'Override the permission list.' },
      context: { type: 'string', description: 'Extra context to inline in the masterprompt.' },
    }, required: ['goal'], additionalProperties: false },
    annotations: { title: '🐄 Mooter · route to the right model', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: toolWork,
  },
  {
    name: 'mooter_worktrees',
    description: 'Where can work happen right now: every git worktree of this project with its branch and whether an agent is already using it. Two agents in the same folder corrupt each other, so the Mooter refuses to double-book — this tool is how you see the free ones without knowing anything about git. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: '🐄 Mooter · where work can run', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async () => {
      const r = wt.list(REPO, activeJobsByWorktree);
      if (r.error) return r;
      return Object.assign({
        resumo: '🐮 ' + r.free + ' de ' + r.total + ' pastas livres para trabalhar'
          + (r.free ? ' (' + r.livres.map((w) => w.name).join(', ') + ')' : ' — espera que um job termine ou usa mooter_cancel(sweep:true)'),
      }, r);
    },
  },
  {
    name: 'mooter_await',
    description: 'Block until a wave (or one job) finishes, then return the summary: how many done, how many failed, total cost, and the per-job outcome. One call instead of polling mooter_status in a loop with sleeps. Server-side waiting is deliberate: this host does not send progressToken, so the panel polls itself while the server waits and the chat stays clean.',
    inputSchema: { type: 'object', properties: {
      wave: { type: 'string', description: 'Wave id to wait for.' },
      job_id: { type: 'string', description: 'Single job to wait for.' },
      timeout_s: { type: 'number', minimum: 5, maximum: 45, default: 30, description: 'Quanto tempo esperar, em segundos (5-45, default 30). O tecto é curto de propósito: uma espera longa faz o host derrubar a ligação e deixa o job órfão. Para esperar mais, chama outra vez com o mesmo job_id/wave.' },
    }, additionalProperties: false },
    annotations: { title: '🐄 Mooter · await the wave', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolAwait,
  },
  {
    name: 'mooter_cancel',
    description: 'End a job honestly: kills the whole process tree (taskkill /T on Windows, because with shell:true a plain kill only reaps cmd.exe and orphans the real CLI) and closes it in the ledger, freeing the worktree. Pass sweep:true with no job_id to close every job left `started` by a connector restart — those ghosts block the WIP guard forever and there was previously no way out.',
    inputSchema: { type: 'object', properties: {
      job_id: { type: 'string', description: 'Job to cancel.' },
      sweep: { type: 'boolean', description: 'Close all orphaned jobs (no job_id needed).' },
    }, additionalProperties: false },
    annotations: { title: '🐄 Mooter · stop a job', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: toolCancel,
  },
  {
    name: 'mooter_plan',
    /* ⚠️ Os níveis de risco NÃO são citados aqui de propósito: os valores do
       enum (`baixo`/`médio`/`alto`) são o contrato da API e levam acento.
       Citá-los na descrição punha PT no texto customer-facing; traduzi-los na
       descrição mentia sobre o que a tool aceita. Ficam onde são verdade — no
       inputSchema — e a descrição aponta para lá. */
    description: 'The steps of a wave, who executed each one, and how risky it is. Risk is inferred from the step text (push/merge/delete/deploy/secrets is the top level, writes the middle one, reads the lowest) and can be overridden with `risk` — see its enum in the schema. The fleet panel renders this as a checklist, so the user sees what is mapped, what is running, what is done and by whom, without opening an IDE.',
    inputSchema: { type: 'object', properties: {
      wave: { type: 'string', description: 'Wave id.' },
      action: { type: 'string', enum: ['get', 'set', 'update'], description: 'get (default) | set (replace the steps) | update (move one step).' },
      goal: { type: 'string', description: 'One line on what the wave is for.' },
      steps: { type: 'array', items: {}, description: 'For set: strings, or objects {id,title,risk,agent}.' },
      step: { type: 'string', description: 'For update: step id or title.' },
      state: { type: 'string', enum: ['pendente', 'a-correr', 'feito', 'falhou', 'saltado'] },
      by: { type: 'string', description: 'Who actually executed it (agent + model).' },
      job_id: { type: 'string' },
      note: { type: 'string' },
      risk: { type: 'string', enum: ['baixo', 'médio', 'alto'] },
    }, required: ['wave'], additionalProperties: false },
    annotations: { title: '🐄 Mooter · the wave plan', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolPlan,
  },
  {
    name: 'mooter_journal',
    description: 'Write the wave outcome into the Obsidian vault. The vault root is DETECTED (a folder containing .obsidian/), never assumed — if none is found nothing is written and it says so, because scattering notes into a guessed folder is worse than not writing. Automatically attaches the wave job ids and the summed cost. Pass status_only:true to just report whether the vault is reachable and when the last note landed.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' },
      body: { type: 'string', description: 'Markdown body.' },
      kind: { type: 'string', enum: ['learning', 'decision', 'project'], description: 'Decides the folder: 30-learnings | 20-decisions | 10-projects.' },
      wave: { type: 'string', description: 'Wave id — pulls job ids and cost into the frontmatter.' },
      tags: { type: 'array', items: { type: 'string' } },
      subfolder: { type: 'string', description: 'Override the destination folder.' },
      status_only: { type: 'boolean', description: 'Do not write; just report vault status.' },
    }, additionalProperties: false },
    annotations: { title: '🐄 Mooter · write to the vault', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: toolJournal,
  },
];

module.exports = {
  TOOLS, guardCheck, ledgerAppend, ledgerRead, activeJobsByWorktree,
  toolRoute, toolDispatch, toolStatus, toolCollect, toolCancel, toolPlan, toolJournal, toolWork, toolAwait,
  // o painel precisa de mostrar o estado do router sem disparar uma classificação
  estadoDoRouter, resumoHonesto,
  buildCommand, bootstrapPrompt, setJobSpawner, setCrossCheckRunner, REGISTRY,
  sweepOrphans, killTree, cliModelFor, tierDoMotor, classifyOrNull, readJobResult, parseCostFromOut,
  pedeLeituraDeFicheiro, resolverPreparacao, recusaPorFaltaDeContexto, classificarEntrega,
  terminouAPedirAprovacao, guardFazAssim,
  _recusaContratoDeLeitura: recusaContratoDeLeitura,
  jobResultText, pidAlive, runCrossCheckForJob, readCrossCheck,
  isDeicticGoal, worktreeSuffix, stepsTotalFor, createStreamStepTracker,
  // J-5b — exposto para a suite poder provar que o CONTEÚDO atravessa a porta,
  // e não apenas que o parâmetro existe no schema. Ver handoff.test.js.
  _embedHandoff: embedHandoff,
  VALID_CARGOS, _normalizarCargo: normalizarCargo,
  _normalizarDecisaoLocal: normalizarDecisaoLocal,
  // A4 — expostos para a suite poder exercitar o caminho real, não uma cópia
  pedeExecucao, pedeExecucaoDeMotor, executarComandos, veredictoSemEvidencia,
  applyQuotaCeiling,
  // D13 — exposto para a suite poder provar a OMISSÃO (ligado) e o opt-out
  // (`MOOTER_ORACULO=0`), em vez de confiar na leitura do `if`.
  ORACULO_LIGADO,
  requestedPermissions, effectivePermissions, permissionReport,
  _paths: { REPO, LEDGER_PATH, JOBS_DIR },
  requireClassify,
};
