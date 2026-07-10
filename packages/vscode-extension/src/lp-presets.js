// lp-presets.js — LP-4.8 §2. Deterministic style presets (the Lovable playbook): 1-click colour,
// size and spacing tweaks that apply through the EXISTING className edit path — $0, no LLM, no
// tokens. A preset never calls a model: it computes the next className string and feeds the LP-4
// preview-first fence (lp-edit preview → apply), exactly like typing in the class box by hand.
//
// Two functions, both SELF-CONTAINED so they survive fn.toString() serialisation into the webview
// (the inline script has no access to this module's scope): mergeClass carries its own group
// regexes; renderPresetsBarHTML carries its own catalog. The unit tests call the same functions.
'use strict';

// Swap-in a preset class without clobbering unrelated classes: drop any existing token of the same
// GROUP (so red→blue replaces, never stacks), drop an exact duplicate, then append. Idempotent —
// clicking the same swatch twice is a no-op string. Pure: no DOM, no model, no side effects.
function mergeClass(current, cls, group) {
  // Group → the tokens it owns. Hues are listed explicitly (never a catch-all text-\w+) so a SIZE
  // like text-lg is never mistaken for a colour — the size and colour token sets stay disjoint.
  var HUES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
  var GROUP_RE = {
    'text-color': new RegExp('^text-(?:' + HUES + ')(?:-\\d{2,3})?$|^text-(?:black|white)$'),
    'bg-color': new RegExp('^bg-(?:' + HUES + ')(?:-\\d{2,3})?$|^bg-(?:black|white)$'),
    'text-size': /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/,
    'pad': /^p-\d+(?:\.\d+)?$/,
  };
  var re = GROUP_RE[group] || null;
  var out = [];
  var seen = {};
  var toks = String(current == null ? '' : current).split(/\s+/);
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (!t) continue;
    if (re && re.test(t)) continue;      // owned by this group → replaced
    if (t === cls) continue;             // exact dup → drop (re-appended below once)
    if (seen[t]) continue;
    seen[t] = 1;
    out.push(t);
  }
  out.push(cls);
  return out.join(' ');
}

// The catalog, rendered as a compact bar: colour swatches (text + bg), a size scale, a spacing
// scale. Every entry carries data-cls + data-group so the webview can wire one click handler that
// calls mergeClass + the class-edit fence. esc is the webview's own HTML escaper (passed in so this
// stays dependency-free after serialisation); default to a minimal escaper for the unit tests.
function renderPresetsBarHTML(esc) {
  var e = (typeof esc === 'function') ? esc : function (x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  // Curated hues with a real hex (Tailwind ~600 for text, ~500 for the dot) so the swatch shows the
  // actual colour. Deterministic, offline — no Tailwind runtime needed to preview the choice.
  var HUES = [
    ['slate', '#475569'], ['red', '#dc2626'], ['orange', '#ea580c'], ['amber', '#d97706'],
    ['yellow', '#ca8a04'], ['green', '#16a34a'], ['teal', '#0d9488'], ['sky', '#0284c7'],
    ['blue', '#2563eb'], ['indigo', '#4f46e5'], ['violet', '#7c3aed'], ['pink', '#db2777'],
  ];
  var SIZES = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'];
  var PADS = ['p-1', 'p-2', 'p-3', 'p-4', 'p-6'];
  var h = '<div class="lp-pz-l">cor do texto</div><div class="lp-pz-row">';
  for (var i = 0; i < HUES.length; i++) {
    var name = HUES[i][0], hex = HUES[i][1], cls = 'text-' + name + '-600';
    h += '<button type="button" class="lp-sw" data-cls="' + e(cls) + '" data-group="text-color" title="' + e(cls) + '" aria-label="cor do texto ' + e(name) + '"><span class="lp-sw-dot" style="background:' + e(hex) + '"></span></button>';
  }
  h += '</div><div class="lp-pz-l">fundo</div><div class="lp-pz-row">';
  for (var j = 0; j < HUES.length; j++) {
    var bname = HUES[j][0], bhex = HUES[j][1], bcls = 'bg-' + bname + '-500';
    h += '<button type="button" class="lp-sw" data-cls="' + e(bcls) + '" data-group="bg-color" title="' + e(bcls) + '" aria-label="fundo ' + e(bname) + '"><span class="lp-sw-dot" style="background:' + e(bhex) + '"></span></button>';
  }
  h += '</div><div class="lp-pz-l">tamanho</div><div class="lp-pz-row">';
  for (var k = 0; k < SIZES.length; k++) {
    var scls = SIZES[k], slabel = scls.replace('text-', '');
    h += '<button type="button" class="lp-pz-chip" data-cls="' + e(scls) + '" data-group="text-size" title="' + e(scls) + '">' + e(slabel) + '</button>';
  }
  h += '</div><div class="lp-pz-l">espaçamento (padding)</div><div class="lp-pz-row">';
  for (var p = 0; p < PADS.length; p++) {
    var pcls = PADS[p];
    h += '<button type="button" class="lp-pz-chip" data-cls="' + e(pcls) + '" data-group="pad" title="' + e(pcls) + '">' + e(pcls) + '</button>';
  }
  h += '</div>';
  return h;
}

module.exports = { mergeClass: mergeClass, renderPresetsBarHTML: renderPresetsBarHTML };
