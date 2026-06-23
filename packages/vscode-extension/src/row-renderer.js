// row-renderer.js — WCOCKPIT-3: self-contained session-card renderer.
// Dual-use: required by tests (node:test) AND embedded into the webview via fn.toString().
// ALL functions use string concatenation only — NO template literals, NO ${...} — so the
// serialised source embeds safely inside getHtml()'s template literal.
// Pure: no Node.js APIs, no VSCode APIs, no require() calls.
'use strict';

// ── Helpers (mirrors of webview definitions — single source of truth for tests) ──

function esc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

function agoFmt(ms) {
  var t = Math.round((+ms || 0) / 1000);
  if (t < 60) return t + 's';
  var mi = Math.round(t / 60);
  if (mi < 60) return mi + 'm';
  var h = Math.round(mi / 60);
  return h < 24 ? h + 'h' : Math.round(h / 24) + 'd';
}

var MLABEL_RR = {
  'claude-opus-4-8':'Opus 4.8','claude-opus-4-7':'Opus 4.7','claude-opus-4-6':'Opus 4.6',
  'claude-sonnet-4-6':'Sonnet 4.6','claude-sonnet-4-5':'Sonnet 4.5',
  'claude-haiku-4-5':'Haiku 4.5','claude-haiku-4-5-20251001':'Haiku 4.5','claude-fable-5':'Fable 5'
};
function modelLabel(m) {
  return MLABEL_RR[String(m || '').toLowerCase()] || String(m || '').replace(/^claude-/, '').replace(/-/g, ' ');
}

function famEmoji(model) {
  var x = String(model || '').toLowerCase();
  if (x.includes('fable')) return '\u{1F31F}';
  if (/claude|opus|sonnet|haiku/.test(x)) return '✨';
  if (/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x) || x.includes(':')) return '🦙';
  if (x.includes('gemini')) return '💎';
  if (/gpt|codex|openai/.test(x)) return '🟢';
  return '🤖';
}

function stageColor(st) {
  var x = String(st || '');
  if (x.indexOf('merged') === 0) return 'var(--g)';
  if (x.indexOf('ready') === 0) return 'var(--g)';
  if (x.indexOf('❌') >= 0) return 'var(--t3)';
  if (x.indexOf('⏳') >= 0) return '#e5c07b';
  if (x === 'draft') return 'var(--vscode-descriptionForeground)';
  return 'var(--vscode-descriptionForeground)';
}

// WCOCKPIT-3: per-session mode metadata
var MODES_UI = [
  ['lazy', '💤', 'LazyMoo — local-first'],
  ['moo', '🐮', 'Moo — balanced'],
  ['crazy', '⚡', 'CrazyMoo — max power']
];

// WCOCKPIT-3: model options for per-session dropdown
var SESS_MODELS = [
  ['', '🐮 Auto'],
  ['claude-opus-4-6', 'Opus'],
  ['claude-sonnet-4-6', 'Sonnet'],
  ['claude-haiku-4-5', 'Haiku']
];

// ── Main row renderer ──────────────────────────────────────────────────────────
// opts: { selSess, effSess, branchCount, nowMs }
// Calls esc/agoFmt/famEmoji/modelLabel/stageColor — must be in scope.
// Uses MODES_UI / SESS_MODELS defined above (local to this module scope;
// when fn.toString() is embedded in webview they are NOT in scope, so the function
// redeclares them inline as local vars — see the 'var _MODES' pattern inside).
function renderRow(r, opts) {
  opts = opts || {};
  var selSess = opts.selSess != null ? opts.selSess : 'auto';
  var effSess = opts.effSess != null ? opts.effSess : null;
  var branchCount = opts.branchCount || {};
  var nowMs = opts.nowMs != null ? opts.nowMs : Date.now();

  // Inline constants (safe when serialised — no external references needed in webview)
  var _MODES = [['lazy','💤','LazyMoo — local-first'],['moo','🐮','Moo — balanced'],['crazy','⚡','CrazyMoo — max power']];
  var _SMOD = [['','🐮 Auto'],['claude-opus-4-6','Opus'],['claude-sonnet-4-6','Sonnet'],['claude-haiku-4-5','Haiku']];

  var sel = (selSess === 'auto' && effSess === r.fullId) || selSess === r.fullId;
  var nm = r.name || ('session ' + r.id);

  // Badge: cowork > working > needsYou > ago
  var badge;
  if (r.waitingForCowork) {
    var cLabel = r.coworkStatus === 'cowork_working'
      ? ('waiting for Cowork — ' + esc(r.coworkTitle || 'deciding…'))
      : (r.coworkStatus === 'pending' ? 'signalled Cowork…' : 'waiting for Cowork');
    badge = '<span class="coworkdot"></span><span class="coworktitle">' + cLabel + '</span>';
  } else if (r.working) {
    badge = '<span class="livedot"></span>working';
  } else if (r.needsYou) {
    badge = '<span class="alertdot"></span><span class="needsyou">your turn</span>';
  } else {
    badge = esc(agoFmt(r.ageMs)) + ' ago';
  }

  // SCM (branch + PR chip)
  var scm = '';
  if (r.branch) {
    var bk = JSON.stringify([String(r.cwd || ''), String(r.branch || '')]);
    var linked = (branchCount[bk] || 0) > 1;
    var pr = r.pr;
    var branchChip = '<span class="scmbr" title="git branch">' + (linked ? '🔗 ' : '⎇ ') + esc(r.branch) + '</span>';
    var prChip = (pr && pr.stage)
      ? '<span class="scmpr" title="' + esc(pr.title || '') + '" style="color:' + stageColor(pr.stage) + '">#' + esc(pr.number != null ? String(pr.number) : '?') + ' · ' + esc(pr.stage) + '</span>'
      : '<span class="scmpr" style="opacity:.55">no PR</span>';
    scm = '<div class="sscm">' + branchChip + ' ' + prChip + '</div>';
  }

  // Cow animation class: mode + working state + cowork
  var cowCls = '';
  if (r.working) cowCls += ' working';
  if (r.mode && r.mode !== 'moo') cowCls += ' ' + r.mode;
  if (r.waitingForCowork) cowCls += ' cowork';

  var sid = r.fullId;

  // ── Mode segmented selector (💤 | 🐮 | ⚡) ──
  var curMode = r.mode || 'moo';
  var modeSeg = '<div class="sseg" role="toolbar" aria-label="session mode">';
  for (var mi = 0; mi < _MODES.length; mi++) {
    var mMode = _MODES[mi][0], mEmoji = _MODES[mi][1], mTip = _MODES[mi][2];
    modeSeg += '<button class="smode' + (curMode === mMode ? ' on' : '') + '" data-mmode="' + mMode + '" data-msess="' + esc(sid) + '" title="' + mTip + '">' + mEmoji + '</button>';
  }
  modeSeg += '</div>';

  // ── Model select (per-session) ──
  var curModel = r.model || '';
  var modelOpts = '';
  for (var si = 0; si < _SMOD.length; si++) {
    modelOpts += '<option value="' + esc(_SMOD[si][0]) + '"' + (curModel === _SMOD[si][0] ? ' selected' : '') + '>' + esc(_SMOD[si][1]) + '</option>';
  }
  var modelSel = '<select class="smodsel" data-msess="' + esc(sid) + '" title="model for this session">' + modelOpts + '</select>';

  // ── Auto-pilot toggle ──
  var autoOn = !!r.auto;
  var autoBtn = '<button class="sauto' + (autoOn ? ' on' : '') + '" data-msess="' + esc(sid) + '" data-mauto="' + String(autoOn) + '" title="auto-pilot: Moo adapts model to task">' + (autoOn ? '⚡ auto' : 'auto') + '</button>';

  var ctrl = '<div class="sctrl">' + modelSel + autoBtn + '</div>';

  // ── Integration meta (Notion + Obsidian + worktree + refresh) ──
  var notionSvg = '<svg width="11" height="11" viewBox="0 0 100 100" class="intlogo" style="border-radius:2px"><rect width="100" height="100" fill="currentColor"/><text x="50" y="76" text-anchor="middle" font-size="72" font-weight="700" fill="#0d1117" font-family="serif">N</text></svg>';
  var obsSvg = '<svg width="11" height="11" viewBox="0 0 100 100" class="intlogo"><polygon points="50,5 90,38 72,95 28,95 10,38" fill="#7c3aed" opacity="0.85"/><polygon points="50,5 90,38 50,58" fill="#a78bfa" opacity="0.65"/></svg>';
  var notionAgo = r.notionSyncedAt ? agoFmt(nowMs - new Date(r.notionSyncedAt).getTime()) : null;
  var obsAgo = r.obsidianSyncedAt ? agoFmt(nowMs - new Date(r.obsidianSyncedAt).getTime()) : null;
  var notionChip = '<span class="intchip" title="Notion' + (notionAgo ? ' · ' + notionAgo + ' ago' : ' · not synced') + '">'
    + notionSvg + (notionAgo ? ' ' + esc(notionAgo) : '<span class="intcta">link</span>') + '</span>';
  var obsChip = '<span class="intchip" title="Obsidian' + (obsAgo ? ' · ' + obsAgo + ' ago' : ' · not synced') + '">'
    + obsSvg + (obsAgo ? ' ' + esc(obsAgo) : '<span class="intcta">link</span>') + '</span>';
  var wtChip = r.worktree ? '<span class="wtchip" title="git linked worktree">⌥ wt:' + esc(r.worktree) + '</span>' : '';
  var refreshBtn = '<button class="intrefresh" data-a="refreshIntegrations" data-x="' + esc(sid) + '" title="refresh integrations">↺</button>';
  var meta = '<div class="smeta">' + notionChip + ' ' + obsChip + (wtChip ? ' ' + wtChip : '') + ' ' + refreshBtn + '</div>';

  // ── Brain title ──
  var brainLine = (r.brainTitle && r.brainTitle !== nm)
    ? '<div class="ssub" style="opacity:.7">🧠 ' + esc(r.brainTitle) + '</div>'
    : '';

  // ── Git stage chip (WCOCKPIT-4: safety — shows uncommitted/staged/ahead/clean) ──
  var gsChip = '';
  var gsTip = '';
  if (r.gitStage) {
    var gsState = r.gitStage.state;
    var gsDirty = r.gitStage.dirty || 0;
    var gsAhead = r.gitStage.ahead || 0;
    if (gsState === 'clean') {
      gsChip = '<span class="gstage clean">✓ clean</span>';
    } else if (gsState === 'uncommitted') {
      gsChip = '<span class="gstage dirty">● ' + gsDirty + ' uncommitted</span>';
      gsTip  = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    } else if (gsState === 'staged') {
      gsChip = '<span class="gstage staged">◐ staged</span>';
    } else if (gsState === 'ahead') {
      gsChip = '<span class="gstage ahead">↑' + gsAhead + ' to push</span>';
      gsTip  = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    }
  }
  var gitLine = gsChip ? '<div class="sgit">' + gsChip + (gsTip ? ' ' + gsTip : '') + '</div>' : '';

  // ── Worktree accent (WCOCKPIT-4: consistent border-left color per worktree name) ──
  var _WTA = ['#5A9BD4','#D4A05A','#A05AD4','#5AD4A0','#D4605A','#D4C05A','#60A05A'];
  var wtStyle = '';
  if (r.worktree) {
    var _wth = 0;
    for (var _wti = 0; _wti < r.worktree.length; _wti++) _wth = (_wth * 31 + r.worktree.charCodeAt(_wti)) & 0xFFFF;
    var _wtc = _WTA[_wth % _WTA.length];
    wtStyle = ' style="border-left-color:' + _wtc + ';border-top-left-radius:0;border-bottom-left-radius:0"';
  }

  return '<div class="srow' + (sel ? ' on' : '') + (r.needsYou ? ' needs' : '') + (r.waitingForCowork ? ' cowork-row' : '')
    + '"' + wtStyle + ' data-sess="' + esc(r.fullId) + '" role="button" tabindex="0" title="open this session in Claude Code">'
    + '<span class="livecow' + cowCls + '">🐮</span>'
    + '<div class="sbody">'
    + '<div class="stop"><span class="sname">' + esc(nm) + '</span><span class="sllm">' + famEmoji(r.model) + ' ' + esc(r.model ? modelLabel(r.model) : '—') + '</span></div>'
    + '<div class="ssub">' + badge + ' · ' + esc(r.id) + (sel ? (selSess === 'auto' ? ' · auto' : ' · pinned') : '') + '</div>'
    + brainLine + scm + gitLine
    + modeSeg + ctrl + meta
    + '</div>'
    + '<span class="sopen" title="open in Claude Code">↗</span>'
    + '</div>';
}

// ── Group header ──────────────────────────────────────────────────────────────
function renderGroupHeader(key, group) {
  var gneed = 0;
  for (var i = 0; i < group.length; i++) { if (group[i].needsYou) gneed++; }
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin:9px 2px 3px;font-size:9px;letter-spacing:.04em;text-transform:uppercase;opacity:.6"><span>🗂 ' + esc(key) + '</span><span>' + group.length + (gneed ? ' · ' + gneed + ' need you' : '') + '</span></div>';
}

module.exports = { esc, agoFmt, famEmoji, modelLabel, stageColor, renderRow, renderGroupHeader, MODES_UI, SESS_MODELS };
