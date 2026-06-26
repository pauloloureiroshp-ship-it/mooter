#!/usr/bin/env node
// handoff-rollup.js — Live Context Accumulator (PASSO 2).
//
// Maintains a ROLLING 1–3 line summary of what a session is doing, updated in
// the BACKGROUND on the free local GPU (qwen via Ollama), THROTTLED so it never
// runs more than it needs to. The cockpit handoff then READS <sid>.summary.txt
// (already built) instead of paying a cold-start on-demand call at copy time.
//
// Invoked two ways:
//   • detached, by gsd-turn-end.js:  node handoff-rollup.js <sessionId>
//     → maybeWarm() (keep the model hot) + maybeRollup() (throttled summary).
//   • in-process, by tests:          require('./handoff-rollup').maybeRollup(sid, {...})
//     → opts.generate / opts.listModels injected so no real Ollama is needed.
//
// Doctrine: qwen is best-effort and NEVER fabricates — the prompt forbids echo
// and invention; on Ollama-down/timeout the summary simply isn't updated (the
// handoff falls back to the deterministic skeleton). NEVER throws, NEVER blocks
// the turn (the hook spawns it detached and does not await).

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const journal = require('./handoff-journal.js');

const OLLAMA_PORT = Number(process.env.MOOTER_OLLAMA_PORT) || 11434;
const MIN_MS = 90 * 1000;   // ≥90s since last rollup …
const MIN_TURNS = 5;        // … OR ≥5 new journal entries
const WARM_MS = 120 * 1000; // keep-warm throttle
const SUMMARY_NUM_PREDICT = 90;
const DELTA_MAX = 12;       // cap journal entries fed to the prompt

// ── local Ollama helpers (best-effort, bounded, never throw) ───────────────
function _tags(timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = http.request({ host: '127.0.0.1', port: OLLAMA_PORT, path: '/api/tags', method: 'GET', timeout: timeoutMs || 1200 },
        (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch { resolve(null); }
  });
}
function _generate(model, prompt, timeoutMs, numPredict) {
  return new Promise((resolve) => {
    try {
      // keep_alive '30m' renews the warm-model retention window on every call.
      const payload = JSON.stringify({ model, prompt, stream: false, keep_alive: '30m', options: { num_predict: numPredict || SUMMARY_NUM_PREDICT } });
      const req = http.request({ host: '127.0.0.1', port: OLLAMA_PORT, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: timeoutMs || 8000 },
        (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { const j = JSON.parse(b); resolve(j && typeof j.response === 'string' ? j.response : null); } catch { resolve(null); } }); });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload); req.end();
    } catch { resolve(null); }
  });
}

// PURE: pick a GENERATION model (never an embedding one) — smallest = fastest
// cold-start. Mirrors host-extra.pickLocalGenModel so the two agree on the
// engine. Returns the name or null.
function pickLocalGenModel(models) {
  const list = Array.isArray(models) ? models : [];
  const gen = list.filter((m) => {
    const n = String((m && m.name) || '');
    if (!n) return false;
    if (/embed/i.test(n)) return false;
    if (/(^|[-_/])(nomic|bge|gte|e5|minilm|all-minilm)/i.test(n)) return false;
    return true;
  });
  if (!gen.length) return null;
  const best = gen.slice().sort((a, b) => (a.size || 0) - (b.size || 0))[0];
  return (best && best.name) ? String(best.name) : null;
}

function _readTs(sid) { try { return JSON.parse(fs.readFileSync(journal.rollupTsPath(sid), 'utf8')) || {}; } catch { return {}; } }
function _writeTs(sid, obj) { try { const tmp = journal.rollupTsPath(sid) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, journal.rollupTsPath(sid)); } catch { /* best-effort */ } }
function _writeSummary(sid, text) { try { const tmp = journal.summaryPath(sid) + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, journal.summaryPath(sid)); return true; } catch { return false; } }

// TIGHT prompt — current rolling summary + only the NEW journal entries. The
// instruction forbids echo, preamble and invention. Output is the summary only.
function buildPrompt(currentSummary, deltaEntries) {
  const cur = String(currentSummary || '').trim();
  const lines = (Array.isArray(deltaEntries) ? deltaEntries : []).slice(-DELTA_MAX).map((e) => {
    const tools = (e && Array.isArray(e.tools)) ? e.tools.map((t) => (t.name + (t.target ? ' ' + t.target : ''))).join(', ') : '';
    const snip = (e && e.assistant_snippet) ? String(e.assistant_snippet).slice(0, 160) : '';
    return '- ' + [snip, tools ? '[' + tools + ']' : ''].filter(Boolean).join(' ');
  }).filter((l) => l.trim() !== '-').join('\n');
  return [
    'Actualiza um resumo CORRENTE de 1-3 linhas do que esta sessão de programação está a fazer.',
    'Regras: NÃO repitas as entradas abaixo verbatim. NÃO escrevas "Preamble", "Topic", "Recap" nem rótulos. NÃO inventes nada que não esteja aqui. Output APENAS o resumo, sem preâmbulo.',
    '',
    cur ? ('Resumo actual:\n' + cur) : 'Resumo actual: (nenhum ainda)',
    '',
    'Novas acções desde a última actualização:',
    lines || '- (nenhuma)',
    '',
    'Resumo actualizado:',
  ].join('\n');
}

// PURE: clean the model output into a 1–3 line summary. Strips common preamble
// labels and blank lines. Never throws.
function cleanSummary(out) {
  if (!out) return '';
  const lines = String(out).split('\n').map((s) => s.trim())
    // strip a leading label PREFIX (keep the content after it), not the whole line
    .map((s) => s.replace(/^(resumo actualizado|resumo actual|resumo|summary|preamble|topic|recap|output)\s*[:\-]\s*/i, ''))
    .filter(Boolean);
  return lines.slice(0, 3).join('\n').slice(0, 400);
}

// Update the rolling summary IF the throttle allows. Returns a small status
// object; never throws. opts.{now,generate,listModels,minMs,minTurns} injectable
// for tests (defaults hit the local Ollama).
async function maybeRollup(sessionId, opts) {
  opts = opts || {};
  const out = { ok: false, skipped: false, reason: null, model: null, summary: null };
  try {
    if (!sessionId) { out.skipped = true; out.reason = 'no_session'; return out; }
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const minMs = Number.isFinite(opts.minMs) ? opts.minMs : MIN_MS;
    const minTurns = Number.isFinite(opts.minTurns) ? opts.minTurns : MIN_TURNS;

    const entries = journal.readJournal(sessionId);
    if (!entries.length) { out.skipped = true; out.reason = 'empty_journal'; return out; }

    const st = _readTs(sessionId);
    const lastTs = Number(st.ts) || 0;
    const lastTurns = Number(st.turns) || 0;
    const turnsDelta = entries.length - lastTurns;
    // Throttle: skip unless ≥minMs elapsed OR ≥minTurns new entries. First run
    // (lastTs falsy) always proceeds.
    if (lastTs && (now - lastTs) < minMs && turnsDelta < minTurns) {
      out.skipped = true; out.reason = 'throttled'; return out;
    }

    // Coarse lock so two detached processes don't both call the model.
    const lock = journal.rollupTsPath(sessionId) + '.lock';
    try {
      const lst = fs.statSync(lock);
      if (now - lst.mtimeMs < 60 * 1000) { out.skipped = true; out.reason = 'locked'; return out; }
    } catch { /* no lock */ }
    try { fs.writeFileSync(lock, String(now)); } catch { /* best-effort */ }

    try {
      const listModels = opts.listModels || (async () => { const t = await _tags(1200); return (t && t.models) || []; });
      const model = pickLocalGenModel(await listModels());
      if (!model) { out.skipped = true; out.reason = 'no_model'; return out; }

      const delta = lastTurns > 0 ? entries.slice(lastTurns) : entries;
      const current = journal.readSummary(sessionId) || '';
      const prompt = buildPrompt(current, delta);
      const gen = opts.generate || ((m, p) => _generate(m, p, 8000, SUMMARY_NUM_PREDICT));
      const raw = await gen(model, prompt);
      const summary = cleanSummary(raw);
      if (!summary) { out.skipped = true; out.reason = 'no_output'; return out; }

      _writeSummary(sessionId, summary);
      _writeTs(sessionId, { ts: now, turns: entries.length, model, updated_at: new Date(now).toISOString() });
      out.ok = true; out.model = model; out.summary = summary; return out;
    } finally {
      try { fs.unlinkSync(lock); } catch { /* best-effort */ }
    }
  } catch (e) {
    out.skipped = true; out.reason = 'error'; return out;
  }
}

// Keep the local gen model hot between rollups (throttled). A tiny num_predict:1
// generate renews keep_alive so the NEXT rollup/handoff is warm. Never throws.
async function maybeWarm(sessionId, opts) {
  opts = opts || {};
  try {
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const warmTs = journal.rollupTsPath(sessionId) + '.warm';
    try { const st = fs.statSync(warmTs); if (now - st.mtimeMs < WARM_MS) return false; } catch { /* not warmed */ }
    const listModels = opts.listModels || (async () => { const t = await _tags(1200); return (t && t.models) || []; });
    const model = pickLocalGenModel(await listModels());
    if (!model) return false;
    try { fs.writeFileSync(warmTs, String(now)); } catch { /* best-effort */ }
    const gen = opts.generate || ((m, p) => _generate(m, p, 8000, 1));
    await gen(model, 'ok');
    return true;
  } catch { return false; }
}

module.exports = { maybeRollup, maybeWarm, pickLocalGenModel, buildPrompt, cleanSummary };

// Detached CLI entry (the turn-end hook): warm + throttled rollup, then exit.
if (require.main === module) {
  const sid = process.argv[2];
  (async () => {
    try { await maybeWarm(sid); } catch { /* never */ }
    try { await maybeRollup(sid); } catch { /* never */ }
    process.exit(0);
  })();
}
