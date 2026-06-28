'use strict';
// mc-assistant.js — Frente 0 · Foundation (Mission Control backend integration).
//
// The local "Moo" assistant ($0). Answers ONLY about the mission-control state and the
// project handoff, using ONLY the MissionControlSnapshot as its source of truth — and
// REFUSES anything not in the snapshot ("não sei"). Reuses the existing handoff-stream
// plumbing: streams chunks back via an onChunk callback (the host re-posts them as
// `moo-stream` → `moo-done`, the same mechanism as handoff-stream).
//
// Runs entirely on local Ollama (qwen3) — no cloud tokens. The Ollama call is injectable
// (opts.generate) so the scoping logic is unit-testable without a live model.

// Strict system prompt. The guardrails (snapshot-only, refuse-when-absent, never-invent)
// are deliberately explicit so a small local model stays honest.
const MOO_SYSTEM = [
  'És o Moo — o assistente local do Mission Control do Mooter.',
  'Respondes em PT-PT, de forma curta e directa.',
  'REGRAS OBRIGATÓRIAS:',
  '1. Respondes APENAS sobre o estado do mission-control e o handoff do projecto.',
  '2. A tua ÚNICA fonte de verdade é o SNAPSHOT JSON fornecido abaixo. Não uses conhecimento externo.',
  '3. NUNCA inventes. Se a resposta não está no snapshot, di-lo claramente: "Não sei — isso não está no snapshot."',
  '4. Não dês opiniões nem conselhos fora do que o snapshot mostra. Sem floreados.',
].join('\n');

// Trim the snapshot to the fields the assistant needs (keeps the prompt lean → faster local
// inference, lower context). Caps the session list. Everything here is snapshot-derived —
// the prompt NEVER contains data that isn't in the snapshot.
function _contextFor(snapshot, maxSessions) {
  const s = snapshot || {};
  const cap = maxSessions || 24;
  const sessions = Array.isArray(s.sessions) ? s.sessions.slice(0, cap).map((x) => ({
    sid: x.sid, name: x.name, topic: x.topic, model: x.model, tier: x.tier,
    status: x.status, needsYou: x.needsYou,
    tokIn: x.tokIn, tokOut: x.tokOut, ctxPct: x.ctxPct,
    cost: x.cost, saved: x.saved,
    git: x.git, sync: x.sync, worktree: x.worktree,
  })) : [];
  return {
    at: s.at || null,
    project: s.project || null,
    device: s.device || null,
    scope: s.scope || null,
    totals: s.totals || null,
    loops: s.loops || null,
    gpu: s.gpu || null,
    remote: s.remote || null,
    sync: s.sync || null,
    sessions,
    sessionsTruncated: Array.isArray(s.sessions) && s.sessions.length > cap ? (s.sessions.length - cap) : 0,
  };
}

function _safeJson(obj) {
  try { return JSON.stringify(obj, null, 0); } catch { return '{}'; }
}

// Build the full prompt: strict system + snapshot context + the user question + an answer
// cue that re-states the refusal rule. Pure → unit-testable.
function buildMooPrompt(q, snapshot) {
  const ctx = _safeJson(_contextFor(snapshot));
  const question = String(q == null ? '' : q).slice(0, 800);
  return [
    MOO_SYSTEM,
    '',
    '=== SNAPSHOT (única fonte de verdade) ===',
    ctx,
    '',
    '=== PERGUNTA ===',
    question,
    '',
    '=== RESPOSTA (responde SÓ a partir do snapshot acima; se não estiver lá, diz que não sabes) ===',
    '',
  ].join('\n');
}

// Ask the Moo. Streams chunks via opts.onChunk; returns { ok, text, model }.
// - opts.generate(model, prompt, { onChunk, numPredict, timeoutMs }) → { ok, text } (injectable; defaults to host-extra._ollamaGenerateStream).
// - opts.model pins a model; otherwise pickLocalGenModel() chooses one (falls back to qwen3:30b).
async function askMoo(q, snapshot, opts) {
  opts = opts || {};
  const onChunk = (typeof opts.onChunk === 'function') ? opts.onChunk : function () {};
  if (q == null || !String(q).trim()) {
    return { ok: false, text: '', model: null, reason: 'empty' };
  }

  let extra = opts.extra;
  if (!extra) { try { extra = require('./host-extra.js'); } catch { extra = {}; } }
  const generate = opts.generate || extra._ollamaGenerateStream;
  if (typeof generate !== 'function') {
    return { ok: false, text: '', model: null, reason: 'no-backend' };
  }

  let model = opts.model || null;
  if (!model && typeof extra.pickLocalGenModel === 'function') {
    try { model = await extra.pickLocalGenModel(); } catch { model = null; }
  }
  model = model || 'qwen3:30b';

  const prompt = buildMooPrompt(q, snapshot);
  try {
    const res = await generate(model, prompt, {
      onChunk,
      numPredict: opts.numPredict || 512,
      timeoutMs: opts.timeoutMs || 30000,
    });
    return { ok: !!(res && res.ok), text: (res && res.text) || '', model };
  } catch {
    return { ok: false, text: '', model };
  }
}

module.exports = {
  MOO_SYSTEM,
  buildMooPrompt,
  askMoo,
  _contextFor,
};
