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

// ── renderMarkdownSafe(text) — the agent's answer as SAFE minimal markdown. esc() runs FIRST on
// every line (all HTML is neutralised), then only these transforms apply on the escaped text:
// **bold**, `code`, bullet lists (-/*/•), #-headings (bold line). Links stay as escaped text —
// nothing here is clickable or executable. NOTE the serialisation contract: this source contains
// NO backtick character anywhere (the code-span regex is built via String.fromCharCode(96)) —
// a literal backtick would terminate the host's outer template literal.
function renderMarkdownSafe(text) {
  var t = String(text == null ? '' : text);
  if (!t.trim()) return '';
  var bt = String.fromCharCode(96);
  var codeRe = new RegExp(bt + '([^' + bt + ']+)' + bt, 'g');
  var lines = t.split('\n');
  var html = '';
  var inList = false;
  function inline(s) {
    var e = esc(s);
    e = e.replace(codeRe, function (_m, c) { return '<code>' + c + '</code>'; });
    e = e.replace(/\*\*([^*]+)\*\*/g, function (_m, b) { return '<b>' + b + '</b>'; });
    return e;
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    var head = line.match(/^\s*#{1,4}\s+(.+)$/);
    if (bullet) {
      if (!inList) { html += '<ul class="lp-md-ul">'; inList = true; }
      html += '<li>' + inline(bullet[1]) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (head) { html += '<div class="lp-md-h">' + inline(head[1]) + '</div>'; continue; }
    if (!line.trim()) { html += '<div class="lp-md-sp"></div>'; continue; }
    html += '<div>' + inline(line) + '</div>';
  }
  if (inList) html += '</ul>';
  return html;
}

// ── renderEditsFeed(items) — LP-4.5 §4 · the UNIFIED session feed: EVERY Live Edit write
// (deterministic text/class, delete, fenced rewrite, agent task) is one row with time + via +
// file(s) + a per-item revert. Newest first. Statuses are facts from the host (live/reverted/
// kept) — a refused revert shows its honest reason inline and keeps the button. Same
// serialisation contract as everything above (concat-only, backtick-free, esc free variable).
function renderEditsFeed(items) {
  var list = Array.isArray(items) ? items : [];
  function clock(ts) {
    if (ts == null) return 'n/d';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return 'n/d';
    return d.toLocaleTimeString(undefined, { hour12: false });
  }
  // F0.2 — a node tag on the row so the feed reads per-node ("… › h1"), and prior-SESSION items (persisted)
  // render as read-only "histórico" (no revert button — their undo bytes are not in this session's RAM).
  function nodeTag(e) { var nk = e && e.nodeKey; return (nk && typeof nk.tag === 'string' && nk.tag) ? nk.tag : ''; }
  var hd = '<div class="lpfd-hd">✎ mudanças deste preview (sessão + histórico)' + (list.length ? (' · <b>' + list.length + '</b>') : '') + '</div>';
  if (!list.length) {
    return '<div class="lpfd lpfd-empty">' + hd
      + '<div class="lpfd-nd">ainda nenhuma — cada escrita do Live Edit entra aqui com hora, nó, via e reverter por item</div></div>';
  }
  var rows = '';
  for (var i = list.length - 1; i >= 0; i--) {
    var e = list[i] || {};
    var files = Array.isArray(e.files) ? e.files : [];
    var st;
    if (e.persisted) st = '<span class="lpfd-st lpfd-hist" title="edição de uma sessão anterior — o histórico é só de leitura (reverter só existe na sessão que a fez)">🕘 histórico</span>';
    else if (e.status === 'reverted') st = '<span class="lpfd-st">↩ revertido</span>';
    else if (e.status === 'kept') st = '<span class="lpfd-st">✓ mantido</span>';
    else st = '<button type="button" class="lpfd-rv" data-feed-rv="' + esc(e.id || '') + '" title="repor os bytes anteriores desta mudança — guardado por hash: recusa se o ficheiro mudou entretanto">reverter</button>';
    var stale = (e.reason === 'undo-stale' || e.reason === 'revert-stale');
    var why = (!e.persisted && e.status === 'live' && e.reason)
      ? ('<span class="lpfd-why">' + esc(stale ? 'o ficheiro mudou entretanto — reverter recusado' : e.reason) + '</span>')
      : '';
    var tagBit = nodeTag(e) ? ('<span class="lpfd-node" title="nó editado">' + esc('<' + nodeTag(e) + '>') + '</span>') : '';
    rows += '<div class="lpfd-row' + (e.persisted ? ' lpfd-row-hist' : '') + '">'
      + '<span class="lpfd-time">' + esc(clock(e.ts)) + '</span>'
      + '<span class="lpfd-via">' + esc(e.via || 'edição') + '</span>'
      + tagBit
      + '<span class="lpfd-files">' + esc(files.join(' · ')) + '</span>'
      + st + why
      + '</div>';
  }
  return '<div class="lpfd">' + hd + '<div class="lpfd-list">' + rows + '</div></div>';
}

// ── renderJourneyThread(journey) — one durable conversation per selected source node. The host
// owns identity/state and sends a bounded display projection; this renderer never reconstructs a
// lease from webview state. `working/awaiting/approved` deliberately match the in-page overlay:
// pink motion while code is changing, yellow while a reversible local result awaits OK, green only
// after the user accepts it. Activity rows are concise operational facts; user/assistant rows keep
// the actual conversational continuity that the old edit-only feed could not provide.
function renderJourneyThread(journey) {
  var j = (journey && typeof journey === 'object') ? journey : null;
  if (!j) return '<div class="lpjt lpjt-empty"><div class="lpjt-hd">💬 conversa deste elemento</div><div class="lpjt-nd">seleciona um elemento para começar.</div></div>';
  var turns = Array.isArray(j.turns) ? j.turns.slice(-60) : [];
  var states = {
    selected: 'selecionado', working: 'a alterar', awaiting: 'aguarda OK', approved: 'aprovado localmente',
    reverted: 'revertido', stale: 'desatualizado', error: 'bloqueado'
  };
  var state = (typeof j.state === 'string' && states[j.state]) ? j.state : 'selected';
  var label = (typeof j.label === 'string' && j.label) ? j.label : states[state];
  var hd = '<div class="lpjt-hd"><span>💬 conversa deste elemento</span><span class="lpjt-state lpjt-' + esc(state) + '">' + esc(label) + '</span></div>';
  if (!turns.length) {
    return '<div class="lpjt">' + hd + '<div class="lpjt-nd">Escreve na caixa logo abaixo. Perguntas, propostas, atividade e aprovações ficam nesta thread.</div></div>';
  }
  function clock(ts) {
    if (ts == null) return 'n/d';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return 'n/d';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  var body = '';
  for (var i = 0; i < turns.length; i++) {
    var t = turns[i] || {};
    var role = t.role === 'user' ? 'user' : (t.role === 'assistant' ? 'assistant' : 'activity');
    var who = role === 'user' ? 'Tu' : (role === 'assistant' ? 'Moo' : 'atividade');
    var meta = [];
    if (t.model) meta.push(String(t.model));
    if (t.status) meta.push(String(t.status));
    var content = role === 'assistant' ? renderMarkdownSafe(t.text || '') : esc(t.text || '');
    body += '<div class="lpjt-turn lpjt-turn-' + role + '">'
      + '<div class="lpjt-meta"><b>' + who + '</b><span>' + esc(clock(t.ts)) + '</span>'
      + (meta.length ? ('<span>· ' + esc(meta.join(' · ')) + '</span>') : '') + '</div>'
      + '<div class="lpjt-text">' + content + '</div></div>';
  }
  return '<div class="lpjt">' + hd + '<div class="lpjt-list" role="log" aria-label="Conversa e atividade deste elemento">' + body + '</div></div>';
}

module.exports = {
  esc: esc,
  suggestLocalChip: suggestLocalChip,
  renderMarkdownSafe: renderMarkdownSafe,
  renderEditsFeed: renderEditsFeed,
  renderJourneyThread: renderJourneyThread,
};
