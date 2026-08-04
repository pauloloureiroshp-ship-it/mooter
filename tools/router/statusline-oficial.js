#!/usr/bin/env node
/**
 * mooter · statusline PRINCIPAL a partir dos campos OFICIAIS do Claude Code
 *
 * ⚠️ ISTO É UMA PROVA, NÃO UM SEGUNDO RENDERER PERMANENTE.
 * O `gsd-statusline.js` (2242 linhas) é o renderer vivo. Este ficheiro existe para
 * provar, com output real, que metade do que o Mooter calcula à mão já vem medido
 * no stdin — e o caminho é FUNDIR isto lá dentro, não manter dois. Manter dois é o
 * "drift de N renderers" que já custou `plugin.json` 1.38.0 contra router 1.45.4.
 *
 * O ACHADO QUE MOTIVA ISTO (medido 2026-08-03 por grep em gsd-statusline.js):
 *   rate_limits ......... 0 ocorrências
 *   five_hour ........... 0
 *   seven_day ........... 0
 *   session_name ........ 0
 *   transcript_path ..... 0
 *   git_worktree ........ 0
 *   total_cost_usd ...... 0
 *   total_api_duration_ms 0
 *   pr. ................. 0
 * O único campo oficial consumido é `context_window.remaining_percentage` (:1635).
 * Enquanto isso, `combustivel.pressao` declara nível `critico` contra uma referência
 * de 4000/400 que o próprio código admite ser "default — não é um limite publicado".
 * O cliente entrega `rate_limits.five_hour.used_percentage` no MESMO JSON que já
 * parseamos. Estamos a estimar o que nos é dado medido.
 *
 * DOUTRINA: campo ausente ⇒ "n/d". Nunca um zero que pareça medição.
 * Só lê stdin e, opcionalmente, ~/.mooter/. Nunca escreve, nunca chama a rede,
 * nunca chama um modelo. Cada `console.log` é uma row (doc: "Each print or echo
 * statement creates a separate row").
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const R = '\x1b[0m';
const DIM = '\x1b[2m';
const B = '\x1b[1m';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const SEP = `${DIM} · ${R}`;

/** OSC 8: torna texto clicável. Doc: "use OSC 8 escape sequences to make text
 *  clickable (Cmd+click on macOS, Ctrl+click on Windows/Linux). Requires a
 *  terminal that supports hyperlinks like iTerm2, Kitty, or WezTerm."
 *  ⚠️ Num terminal sem suporte, o texto aparece na mesma — degrada, não parte. */
function link(url, label) {
  if (typeof url !== 'string' || !url) return label;
  return `\x1b]8;;${url}\x07${label}\x1b]8;;\x07`;
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}
function parseOrNull(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}
/** Acesso seguro por caminho. Devolve undefined em vez de rebentar. */
function get(obj, dotted) {
  return String(dotted).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function str(v) { return typeof v === 'string' && v ? v : null; }

function pct(v) { const n = num(v); return n === null ? 'n/d' : `${Math.round(n)}%`; }
function usd(v) { const n = num(v); return n === null ? 'n/d' : `$${n.toFixed(4)}`; }
function dur(ms) {
  const n = num(ms);
  if (n === null) return 'n/d';
  const s = Math.round(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
function tok(v) {
  const n = num(v);
  if (n === null) return 'n/d';
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}
/** Verde <70, âmbar 70-89, vermelho >=90 — o mesmo degrau que a doc usa no exemplo. */
function heat(p) {
  const n = num(p);
  if (n === null) return DIM;
  if (n >= 90) return RED;
  if (n >= 70) return AMBER;
  return GREEN;
}

/** Enriquecimento OPCIONAL do Mooter. Falha em silêncio; nunca adivinha. */
function mooterState() {
  const out = {};
  try {
    const hw = path.join(os.homedir(), '.mooter', 'hardware.json');
    if (fs.existsSync(hw)) {
      const j = parseOrNull(fs.readFileSync(hw, 'utf8'));
      if (j && typeof j === 'object') {
        if (num(get(j, 'live.util_pct')) !== null) out.gpuUtil = get(j, 'live.util_pct');
        if (num(get(j, 'live.memory_used_mb')) !== null) out.gpuUsed = get(j, 'live.memory_used_mb');
        if (num(get(j, 'memory_total_mb')) !== null) out.gpuTotal = get(j, 'memory_total_mb');
      }
    }
  } catch { /* silêncio > número falso */ }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const d = parseOrNull(readStdin());
  if (!d) return; // sem input não há linha; silêncio é melhor que uma linha errada

  const moo = mooterState();

  // ── ROW 1 — ONDE ESTOU: sessão · modelo · pasta · worktree · PR
  const row1 = [];
  const sessName = str(get(d, 'session_name'));
  const sessId = str(get(d, 'session_id'));
  if (sessName) row1.push(`${B}${CYAN}${sessName}${R}`);
  else if (sessId) row1.push(`${DIM}sessão ${sessId.slice(0, 8)}${R}`);
  else row1.push(`${DIM}sessão n/d${R}`);

  const model = str(get(d, 'model.display_name')) || str(get(d, 'model.id')) || 'n/d';
  row1.push(`${DIM}${model}${R}`);

  const dir = str(get(d, 'workspace.current_dir')) || str(get(d, 'cwd'));
  row1.push(dir ? `${DIM}${path.basename(dir)}${R}` : `${DIM}pasta n/d${R}`);

  // Worktree: o campo que responde "estou na pasta certa?" — a pergunta que o
  // relocate silencioso do Mooter tornou cara.
  const wtName = str(get(d, 'worktree.name'));
  const wtBranch = str(get(d, 'worktree.branch'));
  const isWt = get(d, 'workspace.git_worktree') === true || !!wtName;
  if (isWt) {
    const origBranch = str(get(d, 'worktree.original_branch'));
    const label = `⑂ ${wtName || 'worktree'}${wtBranch ? `:${wtBranch}` : ''}`;
    row1.push(`${AMBER}${label}${R}`);
    if (origBranch && wtBranch && origBranch !== wtBranch) {
      row1.push(`${DIM}(saiu de ${origBranch})${R}`);
    }
  }

  const prNum = num(get(d, 'pr.number'));
  if (prNum !== null) {
    const prUrl = str(get(d, 'pr.url'));
    const state = str(get(d, 'pr.review_state'));
    const color = state === 'approved' ? GREEN : state ? AMBER : DIM;
    row1.push(`${color}${link(prUrl, `PR #${prNum}${state ? ` ${state}` : ''}`)}${R}`);
  }
  console.log(row1.join(SEP));

  // ── ROW 2 — QUANTO CUSTA E QUANTO FALTA (tudo medido pelo cliente)
  const row2 = [];

  // ⭐ A correcção de honestidade: quota REAL, publicada pelo cliente, em vez da
  // referência 4000/400 que o Mooter admite não ser um limite publicado.
  const q5 = num(get(d, 'rate_limits.five_hour.used_percentage'));
  const q7 = num(get(d, 'rate_limits.seven_day.used_percentage'));
  if (q5 !== null || q7 !== null) {
    const parts = [];
    if (q5 !== null) parts.push(`${heat(q5)}5h ${pct(q5)}${R}`);
    if (q7 !== null) parts.push(`${heat(q7)}7d ${pct(q7)}${R}`);
    row2.push(`${DIM}quota${R} ${parts.join(`${DIM}/${R}`)}`);
  } else {
    row2.push(`${DIM}quota n/d — o cliente não enviou rate_limits${R}`);
  }

  const ctxUsed = num(get(d, 'context_window.used_percentage'));
  if (ctxUsed !== null) row2.push(`${heat(ctxUsed)}ctx ${pct(ctxUsed)}${R}`);

  row2.push(`${DIM}${usd(get(d, 'cost.total_cost_usd'))}${R}`);

  const totalMs = num(get(d, 'cost.total_duration_ms'));
  const apiMs = num(get(d, 'cost.total_api_duration_ms'));
  if (totalMs !== null) {
    // A fatia de espera pela API é a métrica de latência que interessa a quem
    // roteia: mede quanto do tempo foi rede, não trabalho.
    const share = apiMs !== null && totalMs > 0 ? ` ${DIM}(${Math.round((apiMs / totalMs) * 100)}% API)${R}` : '';
    row2.push(`${DIM}${dur(totalMs)}${R}${share}`);
  }

  const tIn = num(get(d, 'context_window.total_input_tokens'));
  const tOut = num(get(d, 'context_window.total_output_tokens'));
  if (tIn !== null || tOut !== null) {
    row2.push(`${DIM}${tok(tIn)}↓ ${tok(tOut)}↑${R}`);
    // tok/s honesto: só se houver DURAÇÃO DE API. Dividir output pelo tempo de
    // parede incluiria o tempo em que o humano estava a pensar.
    if (tOut !== null && apiMs !== null && apiMs > 0) {
      row2.push(`${DIM}${(tOut / (apiMs / 1000)).toFixed(0)} tok/s${R}`);
    }
  }
  console.log(row2.join(SEP));

  // ── ROW 3 — O QUE O MOOTER ACRESCENTA (só se tiver medição própria)
  const row3 = [];
  if (num(moo.gpuUtil) !== null) {
    const g = [`GPU ${pct(moo.gpuUtil)}`];
    if (num(moo.gpuUsed) !== null && num(moo.gpuTotal) !== null) {
      g.push(`${(moo.gpuUsed / 1024).toFixed(1)}/${(moo.gpuTotal / 1024).toFixed(0)} GB`);
    }
    row3.push(`${heat(moo.gpuUtil)}🐮 ${g.join(' ')}${R}`);
  }
  const transcript = str(get(d, 'transcript_path'));
  if (transcript) {
    // O transcript é a fonte dos masterprompts desta sessão. OSC 8 abre-o.
    row3.push(link(`file://${transcript}`, `${DIM}transcript${R}`));
  }
  const agentName = str(get(d, 'agent.name'));
  if (agentName) row3.push(`${DIM}agente ${agentName}${R}`);
  if (row3.length) console.log(row3.join(SEP));
}

try { main(); } catch { /* uma statusline que rebenta não pode partir o prompt */ }
