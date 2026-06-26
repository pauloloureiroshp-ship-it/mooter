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

// ── Project Stage Rail (WCOCKPIT-10): plain-language transparency for vibe coders ──
// STAGE_META + deriveStages are PURE and module-level so they can be unit-tested AND
// embedded into the webview by getHtml() (same fn.toString() path as renderRow). The
// webview has no module scope, so getHtml() emits `const STAGE_META=…` and
// `const deriveStages=…` as siblings of renderRow — see extension.js getHtml().
// Columns: [key, label, git-term, plain-language, icon].
var STAGE_META = [
  ['edit',   'Edit',   'working changes', 'The AI just changed your files — nothing saved yet',    '✎'],
  ['save',   'Save',   'commit',          'Bundle changes into a restore point you can return to', '◆'],
  ['backup', 'Backup', 'push',            'Send your restore points to GitHub so they are safe',   '↑'],
  ['branch', 'Branch', 'branch',          'A safe side-copy that does not touch the real version', '⎇'],
  ['merge',  'Merge',  'merge',           'Fold your side-copy back into the official version',     '⇄'],
  ['live',   'Live',   'deploy',          'Publish it for the world to use',                        '◉']
];

// PURE: gitStage + branch → {stages, safe, behind}. Concatenation/literals only (no
// template-literals — its source is embedded into the webview script). INVARIANT: at most
// one stage is 'now', and 'branch' is never 'now'.
function deriveStages(gitStage, branch) {
  var g = gitStage || { state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 };
  var onBranch = !!branch && !/^(main|master|trunk)$/i.test(branch);
  var stages = {
    edit:   g.dirty > 0 ? 'now' : 'done',
    save:   (g.dirty > 0) ? 'todo' : (g.staged > 0 ? 'now' : 'done'),
    backup: (g.dirty > 0 || g.staged > 0) ? 'todo' : (g.ahead > 0 ? 'now' : 'done'),
    branch: onBranch ? 'done' : 'todo',
    merge:  (onBranch && g.dirty === 0 && g.staged === 0 && g.ahead === 0) ? 'now' : 'todo',
    live:   'todo'
  };
  var safe = (g.dirty > 0 || g.staged > 0)
    ? { level: 'amber', label: 'unsaved work', action: 'gitFlow', move: 'Save my work' }
    : (g.ahead > 0
        ? { level: 'blue', label: 'saved, not backed up', action: null, hint: 'push to back up' }
        : { level: 'green', label: 'safe to close', action: null });
  var behind = g.behind > 0 ? { n: g.behind } : null;
  return { stages: stages, safe: safe, behind: behind };
}

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
  // WCOCKPIT-6: group context — when a session's branch/git matches its project group,
  // suppress the per-card chips (shown once in the group header) to kill repetition.
  var groupBranch = opts.groupBranch != null ? opts.groupBranch : null;
  var groupGitKey = opts.groupGitKey != null ? opts.groupGitKey : null;

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

  // SCM (branch + PR chip) — branch chip suppressed when it equals the group's (header shows it once)
  var scm = '';
  if (r.branch) {
    var bk = JSON.stringify([String(r.cwd || ''), String(r.branch || '')]);
    var linked = (branchCount[bk] || 0) > 1;
    var pr = r.pr;
    var sameBranch = groupBranch != null && groupBranch === r.branch;
    var branchChip = sameBranch ? '' : '<span class="scmbr" title="git branch">' + (linked ? '🔗 ' : '⎇ ') + esc(r.branch) + '</span>';
    var prChip = (pr && pr.stage)
      ? '<span class="scmpr" title="' + esc(pr.title || '') + '" style="color:' + stageColor(pr.stage) + '">#' + esc(pr.number != null ? String(pr.number) : '?') + ' · ' + esc(pr.stage) + '</span>'
      : (sameBranch ? '' : '<span class="scmpr" style="opacity:.55">no PR</span>');
    var scmInner = branchChip + (branchChip && prChip ? ' ' : '') + prChip;
    scm = scmInner ? '<div class="sscm">' + scmInner + '</div>' : '';
  }

  // Cow animation class: mode + working state + cowork
  var cowCls = '';
  // One honest motion per cow (transparency): loop > working > idle-mode personality.
  // WCOCKPIT-9 (Bloco F): loop só anima quando ARMADO **e** o runner está confirmado activo.
  if (r.loop && opts.loopActive) cowCls = ' loop';
  else if (r.working) cowCls = ' working';
  else if (r.mode && r.mode !== 'moo') cowCls = ' ' + r.mode;

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
  // WCOCKPIT-9 (Bloco D): dropdown = tiers Claude (Auto/Opus/Sonnet/Haiku) + LLMs locais Ollama
  // REAIS (opts.localModels, do snapshot.ollama). Locais pesados (≥8GB) levam "⚠ lento (cold-load)".
  // O registo aceita qualquer string de modelo, por isso seleccionar um local persiste tal e qual.
  var curModel = r.model || '';
  var matched = false;
  var modelOpts = '';
  for (var si = 0; si < _SMOD.length; si++) {
    var cOn = curModel === _SMOD[si][0]; if (cOn) matched = true;
    modelOpts += '<option value="' + esc(_SMOD[si][0]) + '"' + (cOn ? ' selected' : '') + '>' + esc(_SMOD[si][1]) + '</option>';
  }
  var locals = (opts.localModels && opts.localModels.length) ? opts.localModels : [];
  if (locals.length) {
    var locOpts = '';
    for (var li = 0; li < locals.length; li++) {
      var lname = locals[li] && locals[li].name; if (!lname) continue;
      var g = locals[li].sizeGb;
      var hint = (g != null) ? (g >= 8 ? ' · ' + g + 'GB ⚠ lento (cold-load)' : (g <= 4 ? ' · ' + g + 'GB ⚡' : ' · ' + g + 'GB')) : '';
      var lOn = curModel === lname; if (lOn) matched = true;
      locOpts += '<option value="' + esc(lname) + '"' + (lOn ? ' selected' : '') + '>🦙 ' + esc(lname) + esc(hint) + '</option>';
    }
    if (locOpts) modelOpts += '<optgroup label="Local (Ollama)">' + locOpts + '</optgroup>';
  }
  // Honestidade: se o modelo guardado já não está em lista (ex.: local desinstalado), mostra-o
  // tal como está, marcado, em vez de o "perder" silenciosamente para Auto.
  if (curModel && !matched) {
    modelOpts += '<option value="' + esc(curModel) + '" selected>' + esc(curModel) + ' (set)</option>';
  }
  var modelSel = '<select class="smodsel" data-msess="' + esc(sid) + '" title="model for this session — Claude tiers + local Ollama">' + modelOpts + '</select>';

  // ── Auto-pilot toggle ──
  var autoOn = !!r.auto;
  var autoBtn = '<button class="sauto' + (autoOn ? ' on' : '') + '" data-msess="' + esc(sid) + '" data-mauto="' + String(autoOn) + '" title="auto-pilot: Moo adapts model to task">' + (autoOn ? '⚡ auto' : 'auto') + '</button>';

  // ── WCOCKPIT-9 (Bloco F): LoopMoo toggle (separado do segmented lazy/moo/crazy: aquilo é
  // intensidade de routing; LoopMoo é o MODO de interacção — autopilot loop 🔁). Degradação
  // honesta: ARMADO mas runner inactivo mostra "🔁 loop (armado)" e não anima a cow. ──
  var loopOn = !!r.loop;
  var loopActive = !!opts.loopActive;
  var loopLabel = (loopOn && !loopActive) ? '🔁 armado' : '🔁 loop';
  var loopTitle = loopOn
    ? (loopActive ? 'LoopMoo ON — esta sessão está no autopilot loop (runner activo)'
                  : 'LoopMoo armado — loop NÃO activo (loop-runner não está a correr). Arranca o runner para a sessão entrar no loop.')
    : 'LoopMoo: corre esta sessão em autopilot loop (🔁) quando o loop-runner estiver activo';
  var loopBtn = '<button class="sloop' + (loopOn ? ' on' : '') + (loopOn && !loopActive ? ' armed' : '') + '" data-msess="' + esc(sid) + '" data-mloop="' + String(loopOn) + '" title="' + loopTitle + '" aria-label="' + loopTitle + '">' + loopLabel + '</button>';

  // WCOCKPIT-7: ctrl row assembled after integration chips (combines model+auto+loop+integrations+close)

  // ── Integration meta (Notion + Obsidian + worktree + refresh) ──
  var notionSvg = '<svg width="11" height="11" viewBox="0 0 100 100" class="intlogo" style="border-radius:2px"><rect width="100" height="100" fill="currentColor"/><text x="50" y="76" text-anchor="middle" font-size="72" font-weight="700" fill="#0d1117" font-family="serif">N</text></svg>';
  var obsSvg = '<svg width="11" height="11" viewBox="0 0 100 100" class="intlogo"><polygon points="50,5 90,38 72,95 28,95 10,38" fill="#7c3aed" opacity="0.85"/><polygon points="50,5 90,38 50,58" fill="#a78bfa" opacity="0.65"/></svg>';
  var notionAgo = r.notionSyncedAt ? agoFmt(nowMs - new Date(r.notionSyncedAt).getTime()) : null;
  var obsAgo = r.obsidianSyncedAt ? agoFmt(nowMs - new Date(r.obsidianSyncedAt).getTime()) : null;
  var notionChip = '<span class="intchip' + (notionAgo ? ' on' : '') + '" role="img" aria-label="Notion ' + (notionAgo ? 'synced ' + notionAgo + ' ago' : 'not synced') + '" title="Notion' + (notionAgo ? ' · synced ' + notionAgo + ' ago' : ' · not synced — use ↺') + '">' + notionSvg + '</span>';
  var obsChip = '<span class="intchip' + (obsAgo ? ' on' : '') + '" role="img" aria-label="Obsidian ' + (obsAgo ? 'synced ' + obsAgo + ' ago' : 'not synced') + '" title="Obsidian' + (obsAgo ? ' · synced ' + obsAgo + ' ago' : ' · not synced — use ↺') + '">' + obsSvg + '</span>';
  var wtChip = r.worktree ? '<span class="wtchip" title="git linked worktree: ' + esc(r.worktree) + '">⌥' + esc(r.worktree) + '</span>' : '';
  var refreshBtn = '<button class="intrefresh" data-a="refreshIntegrations" data-x="' + esc(sid) + '" aria-label="refresh Notion and Obsidian sync" title="refresh Notion/Obsidian sync">↺</button>';
  var archiveBtn = '<button class="sarch" data-a="archiveSession" data-x="' + esc(sid) + '" aria-label="close this session (archive, reversible)" title="close this session in the cockpit (archive — reversible; reappears if it becomes active again, nothing is deleted)">✕</button>';
  var ctrl = '<div class="sctrl">' + modelSel + autoBtn + loopBtn + '<span class="sint">' + notionChip + obsChip + (wtChip || '') + refreshBtn + '</span>' + archiveBtn + '</div>';

  // ── Brain title ──
  var brainLine = (r.brainTitle && r.brainTitle !== nm)
    ? '<div class="ssub" style="opacity:.7">🧠 ' + esc(r.brainTitle) + '</div>'
    : '';

  // ── WCOCKPIT-9 (Bloco E): slash-command picker (skills + Moo Packs) ──
  // Lista REAL (opts.slashCommands, host-side) com descrição entre parêntesis. Escolher copia o
  // comando + arma-o como "próximo prompt" da sessão (registry nextSlash). Sem inventar comandos.
  var slashList = (opts.slashCommands && opts.slashCommands.length) ? opts.slashCommands : [];
  var slashPicker = '';
  if (slashList.length) {
    var sOpts = '<option value="">⌘ slash command…</option>';
    for (var qi = 0; qi < slashList.length; qi++) {
      var sc = slashList[qi]; if (!sc || !sc.cmd) continue;
      var lbl = sc.cmd + (sc.desc ? ' — (' + sc.desc + ')' : '');
      sOpts += '<option value="' + esc(sc.cmd) + '"' + (r.nextSlash === sc.cmd ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }
    slashPicker = '<div class="sslashrow"><select class="sslash" data-msess="' + esc(sid) + '" aria-label="slash command para o próximo prompt desta sessão" title="escolhe um slash command (skills + Moo Packs) para o próximo prompt desta sessão">' + sOpts + '</select></div>';
  }
  // Feedback honesto sempre visível (mesmo com o drawer fechado): qual o slash armado.
  var nextSlashLine = r.nextSlash
    ? '<div class="snext" title="armado para o próximo prompt desta sessão — também copiado para o clipboard">⌘ next ▶ ' + esc(r.nextSlash) + '</div>'
    : '';

  // ── WCOCKPIT-9 (Bloco C): botão Commit & Push (só quando há trabalho) ──
  // Dispara o fluxo HOST-SIDE: preview → commit selectivo (nunca add -A) → push só com
  // confirmação modal. Guarda da sha de classify.js + aviso de harmonia entre sessões.
  var gitBtn = '';
  if (r.gitStage && (r.gitStage.state === 'uncommitted' || r.gitStage.state === 'staged' || r.gitStage.state === 'ahead')) {
    var gWork = r.gitStage.state === 'ahead'
      ? ('↑' + (r.gitStage.ahead || 0) + ' to push')
      : (((r.gitStage.dirty || r.gitStage.staged || 0)) + ' to commit');
    gitBtn = '<div class="sgitrow"><button class="sgitbtn" data-a="gitFlow" data-x="' + esc(sid) + '" aria-label="commit and push this session" title="preview → commit selectivo → push (confirmado). Nunca git add -A, nunca --force; verifica a sha de classify.js e avisa se outra sessão está no mesmo repo+branch.">⎇ Commit &amp; Push · ' + esc(gWork) + '</button></div>';
  }

  // ── Git stage chip (WCOCKPIT-4) — suppressed when identical to the group's (header shows it once) ──
  var gsChip = '';
  var gsTip = '';
  var rowGitKey = r.gitStage ? (r.gitStage.state + ':' + (r.gitStage.dirty || 0) + ':' + (r.gitStage.ahead || 0)) : '';
  var gitDeduped = groupGitKey != null && rowGitKey !== '' && groupGitKey === rowGitKey;
  if (r.gitStage && !gitDeduped) {
    var gsState = r.gitStage.state;
    var gsDirty = r.gitStage.dirty || 0;
    var gsAhead = r.gitStage.ahead || 0;
    var gsStaged = r.gitStage.staged || 0;
    if (gsState === 'clean') {
      gsChip = '<span class="gstage clean">✓ clean</span>';
    } else if (gsState === 'uncommitted') {
      gsChip = '<span class="gstage dirty">● ' + gsDirty + ' uncommitted</span>';
      gsTip  = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    } else if (gsState === 'staged') {
      gsChip = '<span class="gstage staged">◐ ' + gsStaged + ' staged</span>';
    } else if (gsState === 'ahead') {
      gsChip = '<span class="gstage ahead">↑' + gsAhead + ' to push</span>';
      gsTip  = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    }
  }
  var gitLine = gsChip ? '<div class="sgit">' + gsChip + (gsTip ? ' ' + gsTip : '') + '</div>' : '';

  // ── WCOCKPIT-10: Project Stage Rail + plain status + safe-to-close — only for real
  // git repos. We must NEVER claim "safe to close" / "done" for a session with no version
  // control, so the whole block is gated on r.gitStage. Pure derivation over the same
  // gitStage signal the chip above already uses — same source, same truth, zero new backend.
  var railLine = '', nowLine = '', safeChip = '', behindLine = '';
  if (r.gitStage) {
    var _ds = deriveStages(r.gitStage, r.branch);
    var _stg = _ds.stages;
    // Which single stage is the current step (invariant: ≤1 'now'; 'branch'/'live' never 'now').
    // Computed BEFORE the rail so the rail's aria-label can name the actual state to a
    // screen reader (the per-dot title tooltips are mouse-only).
    var _nowKey = '';
    var _norder = ['edit', 'save', 'backup', 'merge'];
    for (var _ni = 0; _ni < _norder.length; _ni++) { if (_stg[_norder[_ni]] === 'now') { _nowKey = _norder[_ni]; break; } }
    var _NOWTXT = {
      edit:   'The AI changed your files — nothing saved yet',
      save:   'Changes ready — save them into a restore point',
      backup: 'Saved on your machine — not backed up to GitHub yet',
      merge:  'Your side-copy is clean — ready to fold into the official version'
    };
    var _nowMsg = _nowKey ? _NOWTXT[_nowKey] : (_ds.safe.level === 'green' ? 'All caught up — nothing pending' : _ds.safe.label);

    var _dots = '';
    for (var _si = 0; _si < STAGE_META.length; _si++) {
      var _sk = STAGE_META[_si][0];
      var _sstate = _stg[_sk] || 'todo';
      var _sicon = _sstate === 'done' ? '✓' : STAGE_META[_si][4];
      var _stip = STAGE_META[_si][1] + ' — ' + STAGE_META[_si][3] + ' (git: ' + STAGE_META[_si][2] + ')';
      _dots += '<span class="sdot ' + _sstate + '" title="' + esc(_stip) + '">' + _sicon + '</span>';
    }
    railLine = '<div class="srail" role="img" aria-label="' + esc('Project stage — ' + _nowMsg) + '">' + _dots + '</div>';

    var _nowAct = '';
    if (_ds.safe.action === 'gitFlow') {
      _nowAct = ' <button class="snowbtn" data-a="gitFlow" data-x="' + esc(sid) + '" aria-label="' + esc((_ds.safe.move || 'Save my work') + ' — commit, then optionally push, this session') + '" title="preview → commit selectivo → push (confirmado). Nunca git add -A.">' + esc(_ds.safe.move || 'Save my work') + '</button>';
    } else if (_ds.safe.hint) {
      _nowAct = ' <span class="snowhint" title="advisory — use ⎇ Commit &amp; Push in the drawer to back up">' + esc(_ds.safe.hint) + '</span>';
    }
    nowLine = '<div class="snow"><span class="snowtxt">✦ ' + esc(_nowMsg) + '</span>' + _nowAct + '</div>';

    safeChip = '<span class="ssafe ' + _ds.safe.level + '" title="' + esc(_ds.safe.label) + '">' + esc(_ds.safe.label) + '</span>';
    if (_ds.behind) behindLine = '<div class="sbehind" title="your remote has commits you do not have yet">↓' + _ds.behind.n + ' — teammates pushed; pull to catch up</div>';
  }

  // ── Worktree accent (WCOCKPIT-4: consistent border-left color per worktree name) ──
  var _WTA = ['#5A9BD4','#D4A05A','#A05AD4','#5AD4A0','#D4605A','#D4C05A','#60A05A'];
  var wtStyle = '';
  if (r.worktree) {
    var _wth = 0;
    for (var _wti = 0; _wti < r.worktree.length; _wti++) _wth = (_wth * 31 + r.worktree.charCodeAt(_wti)) & 0xFFFF;
    var _wtc = _WTA[_wth % _WTA.length];
    wtStyle = ' style="border-left-color:' + _wtc + ';border-top-left-radius:0;border-bottom-left-radius:0"';
  }

  // WCOCKPIT-9 (Bloco B): cartão compacto — nome + estado + id COABITAM numa única .sline
  // (antes eram duas linhas .stop + .ssub). O drawer (.sdrawer) continua só na selecção
  // (.on / :focus-within — ver CSS). aria-label preserva o nome completo (a11y).
  var pin = sel ? (selSess === 'auto' ? ' · auto' : ' · pinned') : '';
  return '<div class="srow' + (sel ? ' on' : '') + (r.needsYou ? ' needs' : '') + (r.waitingForCowork ? ' cowork-row' : '')
    + '"' + wtStyle + ' data-sess="' + esc(r.fullId) + '" role="button" tabindex="0" aria-label="open session: ' + esc(nm) + '" title="open this session in Claude Code — ' + esc(nm) + '">'
    + '<span class="livecow' + cowCls + '">🐮</span>'
    + '<div class="sbody">'
    + '<div class="sline">'
      + '<span class="sname">' + esc(nm) + '</span>'
      + '<span class="sstate">' + badge + '</span>'
      + safeChip
      + '<span class="sid">· ' + esc(r.id) + pin + '</span>'
      + '<span class="sllm">' + famEmoji(r.model) + ' ' + esc(r.model ? modelLabel(r.model) : '—') + '</span>'
      + (r.ctxTokens ? ('<span style="font-size:9.5px;margin-left:6px;color:' + ((/opus|sonnet|haiku|claude/i.test(String(r.model || '')) && r.ctxTokens / 200000 >= 0.8) ? '#E06C75' : 'var(--vscode-descriptionForeground)') + '" title="approx context-window fill on the last turn — input + cache tokens read from the transcript">\u{1F9E0} ' + (r.ctxTokens >= 1000 ? ((Math.round(r.ctxTokens / 100) / 10) + 'k') : String(r.ctxTokens)) + (/opus|sonnet|haiku|claude/i.test(String(r.model || '')) ? (r.ctxTokens >= 200000 ? ' max' : (' ' + Math.round(100 * r.ctxTokens / 200000) + '%')) : '') + '</span>') : '')
    + '</div>'
    + brainLine + nextSlashLine + scm + gitLine + railLine + nowLine + behindLine
    + '<div class="sdrawer">' + modeSeg + ctrl + slashPicker + gitBtn + '</div>'
    + '</div>'
    + '<span class="sopen" title="open in Claude Code">↗</span>'
    + '</div>';
}

// ── Group header ──────────────────────────────────────────────────────────────
// WCOCKPIT-9 (Bloco A): opts.origin distingue a ORIGEM do grupo, com honestidade:
//   'cowork'     → nome real do projeto Cowork (espelho)  → "🗂 Mooter.ai · Cowork"
//   'repo'       → fallback rotulado pela pasta do repo    → "📁 myrepo · repo (sem Cowork)"
//   'unassigned' → sessões sem repo nem mapeamento Cowork  → "📁 Unassigned · sem Cowork"
// O repoFolder NUNCA é apresentado como se fosse um projeto Cowork; é sub-rótulo honesto.
function renderGroupHeader(key, group, opts) {
  opts = opts || {};
  var origin = opts.origin || (key === 'Unassigned' ? 'unassigned' : 'cowork');
  var gneed = 0, br = null, gs = null, i;
  var repoSet = {};
  for (i = 0; i < group.length; i++) {
    if (group[i].needsYou) gneed++;
    if (!br && group[i].branch) br = group[i].branch;
    if (!gs && group[i].gitStage) gs = group[i].gitStage;
    if (group[i].repoFolder) repoSet[group[i].repoFolder] = 1;
  }
  var repos = Object.keys(repoSet);
  // WCOCKPIT-6: branch + git stage rolled up once per project (was repeated on every card)
  var brChip = br ? '<span class="ghbr" title="branch shared by this project">⎇ ' + esc(br) + '</span>' : '';
  var gChip = '', gTip = '';
  if (gs) {
    var st = gs.state, d = gs.dirty || 0, a = gs.ahead || 0;
    if (st === 'clean') gChip = '<span class="ghg clean">✓ clean</span>';
    else if (st === 'uncommitted') { gChip = '<span class="ghg dirty">● ' + d + ' uncommitted</span>'; gTip = '<span class="ghtip" title="trabalho por guardar — não fechar">⚠ não fechar</span>'; }
    else if (st === 'staged') gChip = '<span class="ghg staged">◐ ' + (gs.staged || 0) + ' staged</span>';
    else if (st === 'ahead') { gChip = '<span class="ghg ahead">↑' + a + ' to push</span>'; gTip = '<span class="ghtip" title="trabalho por guardar — não fechar">⚠ não fechar</span>'; }
  }
  var meta = (brChip || gChip) ? '<span class="ghmeta">' + brChip + (brChip && gChip ? ' ' : '') + gChip + (gTip ? ' ' + gTip : '') + '</span>' : '';
  var count = '<span class="ghcount">' + group.length + '</span>' + (gneed ? '<span class="ghneed" role="status" aria-live="polite" style="color:#E5C07B;font-weight:700;margin-left:7px" title="sessions waiting for your reply">⬤ ' + gneed + ' your turn</span>' : '');
  // Origin-aware key + honest source tag + repo sub-label.
  var icon, srcTag, repoSub = '';
  if (origin === 'cowork') {
    icon = '🗂'; srcTag = '<span class="ghsrc cw" title="agrupado pelo projeto Cowork real (espelho CC↔Cowork)">· Cowork</span>';
    if (repos.length) repoSub = '<span class="ghrepo" title="pasta(s) de repo local deste projeto">📁 ' + esc(repos.join(' · ')) + '</span>';
  } else if (origin === 'repo') {
    icon = '📁'; srcTag = '<span class="ghsrc repo" title="sem projeto Cowork mapeado — agrupado pela pasta do repo (fallback honesto)">· repo (sem Cowork)</span>';
  } else {
    icon = '📁'; srcTag = '<span class="ghsrc none" title="sessões sem repo git nem mapeamento Cowork">· sem Cowork</span>';
    if (repos.length) repoSub = '<span class="ghrepo" title="pasta(s) local — não é um projeto Cowork">repo:' + esc(repos.join(' · ')) + '</span>';
  }
  var keyHtml = '<span class="ghkey">' + icon + ' ' + esc(key) + ' ' + srcTag + '</span>';
  return '<div class="ghd collaphead"><span class="chev">▾</span>' + keyHtml + repoSub + meta + count + '</div>';
}

module.exports = { esc, agoFmt, famEmoji, modelLabel, stageColor, renderRow, renderGroupHeader, MODES_UI, SESS_MODELS, deriveStages, STAGE_META };
