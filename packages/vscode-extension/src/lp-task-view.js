'use strict';
// lp-task-view.js — LP-4.5 · pure view/decision helpers for the one-box anchored task UX.
//
// Dual-use like live-preview-view.js: required by tests (node:test) AND serialised into the
// webview via fn.toString() (see extension.js getLivePreviewHtml). ALL functions use string
// concatenation only — NO template literals, NO ${} — so the serialised source embeds safely
// inside the host's outer template literal. Pure: no Node/VSCode APIs, no require() at use time;
// `esc` resolves as a free variable (module scope here, webview top-level there — the same
// contract renderDirectorsCut rides on).
//
// ── HONESTY RULES ──────────────────────────────────────────────────────────────────────────
//   • suggestLocalChip SUGGESTS, never decides: the box's default stays the agent; the hint
//     only points at the "local $0 · só este nó" chip when the ask smells node-local.
//   • Rendering never fabricates: a missing diff says why (git indisponível) instead of an
//     empty green box; a question result shows "ficheiros lidos" only when the list is real.

function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// ── suggestLocalChip(text) — cheap heuristic (regex, zero LLM, zero cost): does this prompt look
// like a NODE-LOCAL cosmetic change (color/text/class) the fenced $0 path handles? Conservative
// on purpose: any project-context smell (validate/real numbers/repo/other files) wins and mutes
// the suggestion — a false "local" hint on a project task is exactly the LP-4 dead-end this wave
// exists to fix. Returns true = SHOW the hint (never auto-switch).
function suggestLocalChip(text) {
  var t = String(text == null ? '' : text).toLowerCase();
  if (!t.trim()) return false;
  // Project-context smells → NOT node-local, whatever else it says.
  var project = /\b(projecto|projeto|project|repo|reposit|codebase|ficheiros|arquivos|files|valida|verifica|confere|check|coerente|consistente|real|reais|dados|data|api|backend|todos os|em todo|noutro|outro ficheiro|outra p[aá]gina)\b/;
  if (project.test(t)) return false;
  // Numbers-as-content smell (the CommunityPulse case): "números", "valores", counts.
  if (/\b(n[uú]meros?|valores?|estat[ií]sticas?|m[eé]tricas?|contagem|totais?)\b/.test(t)) return false;
  // Node-local smells: color words, text/label tweaks, class/tailwind/spacing/typography.
  var local = /\b(cor|cores|color|azul|verde|vermelh|rosa|amarel|rox|laranja|preto|branc|cinz|blue|red|green|pink|yellow|purple|orange|black|white|gray|grey|texto|t[ií]tulo|label|placeholder|legenda|wording|renomeia|rename|classe|class|tailwind|rounded|border|borda|padding|margin|espa[cç]amento|fonte|font|bold|negrito|it[aá]lico|italic|tamanho|size|maior|menor|centrad|align|alinha|sombra|shadow|opacidade|opacity|esconde|hide|arredonda)\b/;
  return local.test(t);
}

module.exports = {
  esc: esc,
  suggestLocalChip: suggestLocalChip,
};
