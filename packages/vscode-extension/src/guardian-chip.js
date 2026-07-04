'use strict';
// ── GUARDIAN:F1 ── Compaction-pressure chip 🪶 (Moo Context Guardian, Fase 1).
//
// Single source of truth for the pressure ladder is tools/router/compaction-advisor.js
// (`pressureLadder`). The cockpit (herd `renderRow`) and Mission Control (`sessionCard`)
// run *inside the webview*, serialised via fn.toString() — so they cannot require() at
// runtime. extension.js injects `pressureLadder` (the real advisor fn when present, else
// the inline mirror below) and `guardianChip` as sibling consts into the webview script;
// both renderers then call the shared global `guardianChip`.
//
// `ctxPct` must be a finite number. null/undefined/NaN → '' (no chip; n/d is never
// fabricated, per the brief).

// Host-side: prefer the real advisor so dev stays in lock-step with the F1 contract.
// When the repo-root file is absent (e.g. a packaged VSIX) fall back to an identical
// inline mirror — keep the thresholds byte-for-byte with compaction-advisor.js.
let pressureLadder;
try {
  ({ pressureLadder } = require('../../../tools/router/compaction-advisor.js'));
} catch {
  pressureLadder = function pressureLadder(tokenPct) {
    var p = Number(tokenPct);
    if (!Number.isFinite(p)) return 'monitor';
    if (p >= 99) return 'emergency';
    if (p >= 90) return 'advise';
    if (p >= 85) return 'prune';
    if (p >= 80) return 'mask';
    return 'monitor';
  };
}

// Pure and self-contained except for its single free ref `pressureLadder` (declared as a
// sibling const in the webview). Colours run green→yellow→red up the ladder. Returns ''
// when ctxPct is n/d so the caller renders nothing.
function guardianChip(ctxPct, esc) {
  if (ctxPct == null) return '';                 // null/undefined → n/d, never fabricate a chip
  var p = Number(ctxPct);
  if (!Number.isFinite(p)) return '';
  var rung = pressureLadder(p);
  var R = {
    monitor:   ['var(--ok)', 'vigia',      'contexto saudável'],
    mask:      ['var(--acc-warm)', 'a vigiar',   'contexto a encher (≥80%) — a vigiar'],
    prune:     ['var(--warn)', 'a podar',    'contexto alto (≥85%) — handoff a pré-cozinhar'],
    advise:    ['var(--danger)', 'saltar',     'contexto crítico (≥90%) — saltar p/ sessão fresca'],
    emergency: ['var(--danger-strong)', 'emergência', 'quase cheio (≥99%) — auto-compact iminente'],
  }[rung] || ['var(--ok)', 'vigia', 'contexto'];
  var E = (typeof esc === 'function') ? esc : function (x) { return String(x); };
  return '<span class="g-chip g-' + rung + '" title="' + E(R[2] + ' · ' + Math.round(p) + '%') +
    '" style="border-color:' + R[0] + ';color:' + R[0] + '">\u{1FAB6} ' + E(R[1]) + '</span>';
}

module.exports = { pressureLadder, guardianChip };
