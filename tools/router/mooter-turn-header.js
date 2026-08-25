#!/usr/bin/env node
// mooter-turn-header.js — UserPromptSubmit hook (second in chain after inject_context.js).
//
// Emits a visible turn header so the user sees the routing decision every turn.
// Complements PostToolUse.js (which shows the executor of each Bash call) by
// exposing hook-time decisions that otherwise stay invisible:
//
//   • Tier chosen (T0/T1/T2/T3)
//   • Worker model + backend
//   • Classifier confidence
//   • Cache hit / arbiter consulted
//   • Ollama Option-A pre-compute status (hit/miss)
//   • Cost vs Opus baseline (saved this turn)
//
// Renders via systemMessage (same UI channel PostToolUse.js uses), so it
// appears as a one-liner right after the user prompt and before Claude starts
// working. Never blocks the turn — but a decisions.log that exists and cannot
// be read is reported as `n/d`, not swallowed: silence there is identical to a
// turn nobody classified, and the two are not the same thing.
//
// Reads the latest `classified` + `option_a_*` events for this session from
// decisions.log. inject_context.js has already logged them by the time this
// hook runs (hooks in the UserPromptSubmit array execute sequentially).

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');

let pricing = null;
try { pricing = require(path.join(ROUTER_DIR, 'pricing.js')); } catch { /* optional */ }

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// Guarda o erro real da última leitura falhada do log, para o main o poder
// mostrar em vez de desaparecer em silêncio.
let tailError = null;

// Devolve `null` quando o log existe mas não se consegue ler. Antes o catch
// devolvia `[]`, que é exactamente o que se lê de um log vazio — quem chama não
// distinguia "ninguém classificou este turno" (normal) de "não consegui abrir o
// decisions.log" (avaria do motor), e nos dois casos o cabeçalho simplesmente
// não aparecia. Log ainda inexistente continua a ser `[]`: numa instalação
// fresca isso é mesmo vazio, não é ignorância.
function tailLines(filePath, maxBytes = 65536) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter(Boolean);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    tailError = err;
    return null;
  }
}

function modelEmoji(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus'))   return '🔴';
  if (m.includes('sonnet')) return '🟡';
  if (m.includes('haiku'))  return '⚡';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return '🦙';
  if (m.includes('gemini') || m.includes('google')) return '💎';
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai')) return '🟩';
  return '❓';
}

function tierEmoji(tier) {
  switch (tier) {
    case 'T0': return '🌱';
    case 'T1': return '⚡';
    case 'T2': return '🧠';
    case 'T3': return '🏛️';
    default:   return '❓';
  }
}

function fmtUsd(n) {
  if (n == null || !isFinite(n)) return null;
  if (n === 0)     return '$0';
  if (n < 0.001)   return `~$${(n * 1000).toFixed(1)}m`;  // sub-milli
  if (n < 0.01)    return `$${n.toFixed(4)}`;
  if (n < 1)       return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

// Blocking sleep without busy-wait. Needed because Claude Code runs
// UserPromptSubmit hooks IN PARALLEL, so this hook may start before
// inject_context.js has flushed its `classified` event to decisions.log.
// We poll with a short wait until a fresh event lands (or give up silently).
function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch { /* fallback: tight loop */
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function findFreshClassified(sessionId, freshnessWindowMs) {
  const nowMs = Date.now();
  const lines = tailLines(LOG_PATH);
  if (!lines) return null; // log ilegível: não sabemos — o main avisa via tailError
  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = safeJson(lines[i]);
    if (!obj || obj.event !== 'classified') continue;
    if (sessionId && obj.session_id && obj.session_id !== sessionId) continue;
    // Require freshness — older events belong to previous turns.
    if ((obj.ts_ms || 0) < nowMs - freshnessWindowMs) return null;
    return obj;
  }
  return null;
}

(function main() {
  const raw = readStdin();
  const payload = safeJson(raw) || {};
  const sessionId =
    payload.session_id || payload.sessionId ||
    (payload.session && payload.session.id) || null;

  // Parallel-hook race mitigation: inject_context.js may still be classifying
  // when this hook starts. Poll for a fresh event, bounded by ~2.4s total
  // (well under the 3s hook timeout). inject_context.js normally completes
  // in <100ms unless the Ollama pre-compute fires, which caps at 4s but
  // typically lands in 1-2s. A fresh event within 10s counts as "this turn".
  const FRESHNESS_MS = 10000;
  const POLL_INTERVAL_MS = 200;
  const MAX_WAIT_MS = 2400;
  const start = Date.now();

  let classified = findFreshClassified(sessionId, FRESHNESS_MS);
  while (!classified && (Date.now() - start) < MAX_WAIT_MS) {
    sleepMs(POLL_INTERVAL_MS);
    classified = findFreshClassified(sessionId, FRESHNESS_MS);
  }
  if (!classified) {
    // Não haver cabeçalho é normal quando ninguém classificou este turno. Mas se
    // o decisions.log não deu para ler, o mesmo silêncio estaria a esconder uma
    // avaria — dizemos qual foi, e seguimos sem bloquear o turno.
    if (tailError) {
      process.stdout.write(JSON.stringify({
        continue: true,
        suppressOutput: false,
        systemMessage: `mooter → ⚠ n/d · decisions.log unreadable (${tailError.code || tailError.message})`,
      }));
    }
    process.exit(0);
  }

  // Look for Option A event in the 10 s window around the classified event.
  // Re-read the log here because findFreshClassified() only returned the one
  // event we care about — option_a_* lines live around it in the same tail.
  let optionA = null;
  const anchor = classified.ts_ms || 0;
  const tailForOptionA = tailLines(LOG_PATH);
  if (!tailForOptionA) {
    // Esta segunda leitura falhou: não sabemos se houve pre-compute. Sem isto, a
    // ausência do chip diria "não houve" — que é uma afirmação que não podemos fazer.
    optionA = 'unknown';
  } else {
    for (let i = tailForOptionA.length - 1; i >= 0; i--) {
      const obj = safeJson(tailForOptionA[i]);
      if (!obj || !obj.event || !/^option_a_/.test(obj.event)) continue;
      const dt = Math.abs((obj.ts_ms || 0) - anchor);
      if (dt < 10000) { optionA = obj.event.replace('option_a_', ''); break; }
    }
  }

  const tier    = classified.tier || 'T?';
  const model   = classified.recommended_model || 'unknown';
  const backend = classified.recommended_backend || '?';
  const conf    = typeof classified.confidence === 'number' ? classified.confidence : null;
  const promptLen = classified.prompt_len || 0;

  const parts = [];
  parts.push(`${tierEmoji(tier)} ${tier}`);
  parts.push(`${modelEmoji(model)} ${model}`);

  // Backend label only when it differs from the default tier mapping (keeps
  // the header short for the common case).
  if (backend && backend !== 'claude_subagent') parts.push(`via ${backend}`);

  if (conf != null) parts.push(`conf ${Math.round(conf * 100)}%`);

  if (classified.cache_hit) parts.push('🗄 cached');
  if (classified.arbiter_honored === true) parts.push('🧪 arbiter ✓');
  if (classified.arbiter_honored === false) parts.push('🧪 arbiter ✗');
  if (classified.quality_intent) parts.push('✨ quality-intent');
  if (classified.active_mode) parts.push(`🎭 ${classified.active_mode}`);

  // Surface user override signal (from escalation_rule) — critical for the
  // user to understand why Opus may still be handling a T0 turn.
  const esc = classified.escalation_rule || '';
  if (/user_override/.test(esc)) parts.push('👤 user-override');

  if (optionA === 'hit')   parts.push('🦙 pre-compute ✓');
  if (optionA === 'miss')  parts.push('🦙 pre-compute ✗');
  if (optionA === 'error') parts.push('🦙 pre-compute err');
  if (optionA === 'unknown') parts.push('🦙 pre-compute n/d');

  // Potential savings vs Opus baseline. Phrased as "est. save" because this
  // is the RECOMMENDATION cost — the actual savings only materialize if the
  // turn delegates to the recommended subagent. The gsd-turn-end.js footer
  // reports the realized delta after the turn completes.
  if (pricing && promptLen > 0) {
    try {
      const spent = pricing.estimateTurnCost(tier, promptLen);
      const baseline = pricing.naiveOpusCost(promptLen);
      const saved = Math.max(0, baseline - spent);
      if (tier === 'T3') {
        parts.push(`est. ${fmtUsd(spent)}`);
      } else if (saved >= 0.001) {
        parts.push(`est. save ${fmtUsd(saved)}`);
      }
    } catch { /* non-fatal */ }
  }

  // v0.12: session compliance warning — if this session has already logged
  // ≥ 5 Bash calls all in Opus and the current recommendation is T0/T1,
  // show a prominent ⚠ marker so the user SEES the doctrine being violated.
  // The runtime-side enforcement (delegation_directive) lives in
  // inject_context.js; this just mirrors the signal visually.
  try {
    const execPath = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');
    if (fs.existsSync(execPath)) {
      const stat = fs.statSync(execPath);
      const start = Math.max(0, stat.size - 256 * 1024);
      const fd = fs.openSync(execPath, 'r');
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      const execLines = buf.toString('utf8').split('\n').filter(Boolean);
      let bashCount = 0, opusCount = 0;
      const sid = classified.session_id;
      for (const line of execLines) {
        const sm = line.match(/session=(\S+)/);
        if (!sm || sm[1] !== sid) continue;
        const mm = line.match(/model=(\S+)/);
        if (!mm) continue;
        bashCount++;
        if (/opus/i.test(mm[1])) opusCount++;
      }
      const isUserOpusOverride = /user_override/.test(esc)
        && /opus/i.test(String(classified.recommended_model || ''));
      if (bashCount >= 5 && opusCount === bashCount
          && (tier === 'T0' || tier === 'T1') && !isUserOpusOverride) {
        parts.push(`⚠ session 100% Opus — delegate now`);
      }
    }
  } catch { /* non-fatal */ }

  const header = `mooter → ${parts.join(' · ')}`;

  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: false,
    systemMessage: header,
  }));
  process.exit(0);
})();
