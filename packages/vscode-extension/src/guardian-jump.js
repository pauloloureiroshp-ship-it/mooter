'use strict';
// guardian-jump.js — 🐮🛡️ Moo Context Guardian · Fase 3 (Salto para sessão fresca).
//
// Pure, host-side, testable logic for the "⇄ Saltar para fresca" action. It re-implements the
// F1 pressure ladder (compaction-advisor.pressureLadder) as a SELF-CONTAINED copy so F3 works
// even when F1 has not landed in this worktree (orchestration: build in parallel against the
// contracts, merge sequentially). The thresholds are fixed by contract, so a local copy can
// never drift from F1 without a contract change.
//
// Contracts honoured:
//  - F1 (advisor):  pressureLadder(ctxPct) → 'monitor'|'mask'|'prune'|'advise'|'emergency'
//                   thresholds: ≥80 mask · ≥85 prune · ≥90 advise · ≥99 emergency
//  - F2 (pre-bake): _handoff/guardian/<sid>.md = the freshest pre-cooked handoff for a session.
//
// Research-gate (resolved before coding the delivery — see extension.js GUARDIAN:F3 handler):
//  the Claude Code VS Code plugin (verified in the 2.1.195 bundle) DOES expose a prompt seed.
//  `claude-vscode.primaryEditor.open(session, prompt)` accepts a 2nd `prompt` argument and, for
//  a NEW session (session=undefined), delivers it into the new panel's input
//  (createPanel→setupPanel→getHtmlForWebview(webview, session, prompt, …)). The deep-link
//  `vscode://anthropic.claude-code/open?prompt=<encoded>` routes to the same call. So the jump
//  is a REAL seed, not clipboard-only — but we still copy to the clipboard as a safety net
//  (older plugin builds ignore the 2nd arg → Ctrl+V recovers it). We NEVER edit the .jsonl.
//
// No vscode import → unit-testable under `node --test`.

const fs = require('fs');
const path = require('path');

// ctx% from a token count + model window — mirror of mc-snapshot.ctxPct (the SSOT for this
// estimate): [1m] variants get a 1M window, otherwise the 200k default. null when there is no
// token count (we never fabricate a fill we cannot measure).
function ctxPctOf(ctxTokens, model) {
  const t = (typeof ctxTokens === 'number' && isFinite(ctxTokens)) ? ctxTokens : null;
  if (t == null) return null;
  const win = /\[1m\]|\b1m\b/.test(String(model || '').toLowerCase()) ? 1000000 : 200000;
  return Math.max(0, Math.min(100, Math.round((t / win) * 100)));
}

// F1 ladder — defensive local copy. Below 80 the session is merely being watched; the delirium
// threshold (advise) is where F3 surfaces the jump.
function pressureRung(ctxPct) {
  const p = (typeof ctxPct === 'number' && isFinite(ctxPct)) ? ctxPct : 0;
  if (p >= 99) return 'emergency';
  if (p >= 90) return 'advise';
  if (p >= 85) return 'prune';
  if (p >= 80) return 'mask';
  return 'monitor';
}

// The jump is offered only at the delirium threshold (advise ≥90) and beyond (emergency).
// Accepts a ctx% directly, OR derives it from { ctxPct?, ctxTokens?, model? } when given a row.
function offerCtxPct(rowOrPct) {
  if (rowOrPct == null) return null;
  if (typeof rowOrPct === 'number') return isFinite(rowOrPct) ? rowOrPct : null;
  if (typeof rowOrPct.ctxPct === 'number' && isFinite(rowOrPct.ctxPct)) return rowOrPct.ctxPct;
  return ctxPctOf(rowOrPct.ctxTokens, rowOrPct.model);
}

function shouldOfferJump(rowOrPct) {
  const pct = offerCtxPct(rowOrPct);
  if (pct == null) return false; // unknown fill → never offer (defensive default)
  const r = pressureRung(pct);
  return r === 'advise' || r === 'emergency';
}

// F2 contract path: _handoff/guardian/<sid>.md under a given root.
function prebakedHandoffPath(rootDir, sid) {
  const clean = String(sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!clean || !rootDir) return null;
  return path.join(rootDir, '_handoff', 'guardian', clean + '.md');
}

// Read the freshest pre-cooked handoff for <sid>, trying each root in order (workspace first,
// cwd fallback). Returns { text, path } or null. NEVER throws — absence is the normal case
// (F3 falls back to a live handoff when the file is not there).
function readPrebakedHandoff(roots, sid) {
  const list = Array.isArray(roots) ? roots : [roots];
  for (const root of list) {
    const p = prebakedHandoffPath(root, sid);
    if (!p) continue;
    try {
      const txt = fs.readFileSync(p, 'utf8');
      if (txt && txt.trim()) return { text: txt, path: p };
    } catch { /* try the next root */ }
  }
  return null;
}

module.exports = {
  ctxPctOf, pressureRung, offerCtxPct, shouldOfferJump,
  prebakedHandoffPath, readPrebakedHandoff,
};
