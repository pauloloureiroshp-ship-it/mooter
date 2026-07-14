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
  if (x.indexOf('⏳') >= 0) return 'var(--acc-warm)';
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
  ['edit',   'Edit',   'working changes', 'Working changes in the repo that are not saved yet',    '✎'],
  ['save',   'Save',   'commit',          'Bundle changes into a restore point you can return to', '◆'],
  ['backup', 'Backup', 'push',            'Send your restore points to GitHub so they are safe',   '↑'],
  ['branch', 'Branch', 'branch',          'A safe side-copy that does not touch the real version', '⎇'],
  ['merge',  'Merge',  'merge',           'Fold your side-copy back into the official version',     '⇄'],
  ['live',   'Live',   'deploy',          'Publish it for the world to use',                        '◉']
];

// PURE: gitStage + branch (+ optional attribution) → {stages, safe, behind}. Concatenation/
// literals only (no template-literals — its source is embedded into the webview script).
// INVARIANT: at most one stage is 'now', and 'branch' is never 'now'.
//
// HONEST-CONTROLS D3 — attribution (3rd arg, ADDITIVE / back-compat):
//   attr = { unsavedOwn:number, partial:boolean } | null|undefined
//   • attr absent           → behaves BYTE-IDENTICALLY to before (safe object unchanged).
//   • attr.unsavedOwn > 0    → this session owns dirty work → amber + "Save my work" (true CTA).
//   • attr.unsavedOwn === 0
//     and the tree is dirty  → the dirt is NOT this session's (shared working tree). safe.level
//                              becomes 'repo' (an info fact, NO per-session CTA — a commit is a
//                              repo action, not this session's). safe.repoFact/partial carry the
//                              honesty so renderRow can phrase the copy without asserting "the AI
//                              changed YOUR files".
function deriveStages(gitStage, branch, attr) {
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
  var treeDirty = (g.dirty > 0 || g.staged > 0);
  var hasAttr = !!attr && typeof attr === 'object';
  var ownUnsaved = hasAttr ? (Number(attr.unsavedOwn) || 0) : null;
  var safe;
  if (treeDirty && hasAttr && ownUnsaved === 0) {
    // Repo is dirty but NOT because of this session → a repo fact, not this session's unsaved work.
    var n = g.dirty || g.staged || 0;
    safe = { level: 'repo', label: 'repo · ' + n + ' uncommitted', action: null,
             repoFact: true, partial: !!attr.partial };
  } else if (treeDirty) {
    safe = { level: 'amber', label: 'unsaved work', action: 'gitFlow', move: 'Save my work' };
  } else if (g.ahead > 0) {
    safe = { level: 'blue', label: 'saved, not backed up', action: null, hint: 'push to back up' };
  } else {
    safe = { level: 'green', label: 'safe to close', action: null };
  }
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
  // F1 (cowork title mirror): the REAL Cowork conversation title (durable mirror written by the
  // Cowork side into .cowork-sessions.json, surfaced by mode-registry.decorate) LEADS the row name.
  // Falls back to the CC 1st prompt (r.name), then to a synthetic id. NEVER fabricated — coworkTitle
  // is null unless the Cowork side actually wrote it (producer documents that gap honestly). The 1st
  // prompt is preserved as a subline (coworkSub below) + the row tooltip, so provenance stays visible.
  var firstPrompt = r.name || ('session ' + r.id);
  var nm = r.coworkTitle || firstPrompt;

  // Badge: cowork > working > needsYou > ago
  var badge;
  if (r.waitingForCowork) {
    // The conversation title now leads the row name → don't repeat it in the badge when it is the
    // same string (não dupliques o título); show just the live state. Badge itself always continues.
    var cwTitleDup = !!(r.coworkTitle && r.coworkTitle === nm);
    var cLabel = r.coworkStatus === 'cowork_working'
      ? (cwTitleDup ? 'waiting for Cowork' : ('waiting for Cowork — ' + esc(r.coworkTitle || 'deciding…')))
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
  // ── B2: chips de integração ACCIONÁVEIS e HONESTOS ──────────────────────────────
  // Notion: clicável SÓ se houver uma página real (notionPageId → URL) → abre via openUrl. Obsidian:
  // clicável SÓ se houver um ficheiro (obsidianPath) → abre no editor via openFile. Sem alvo → chip
  // informativo (role=img), NUNCA finge ser accionável. O carimbo "synced ago" continua a iluminar
  // (.on) honestamente. NÃO há sync remoto a partir do cockpit (o ↺ é "marcar visto" — ver refreshBtn).
  var notionUrl = r.notionPageId ? (/^https?:\/\//i.test(r.notionPageId) ? r.notionPageId : ('https://www.notion.so/' + String(r.notionPageId).replace(/-/g, ''))) : null;
  var notionTip = 'Notion' + (notionAgo ? ' · synced ' + notionAgo + ' ago' : '') + (notionUrl ? ' · abrir página' : ' · sem página ligada');
  var notionAttr = notionUrl ? (' data-a="openUrl:' + esc(notionUrl) + '" role="button" tabindex="0" style="cursor:pointer"') : ' role="img"';
  var notionChip = '<span class="intchip' + (notionAgo ? ' on' : '') + '"' + notionAttr + ' aria-label="' + esc(notionTip) + '" title="' + esc(notionTip) + '">' + notionSvg + '</span>';
  var obsTip = 'Obsidian' + (obsAgo ? ' · synced ' + obsAgo + ' ago' : '') + (r.obsidianPath ? ' · abrir ficheiro' : ' · sem ficheiro ligado');
  var obsAttr = r.obsidianPath ? (' data-a="openFile:' + esc(r.obsidianPath) + '" role="button" tabindex="0" style="cursor:pointer"') : ' role="img"';
  var obsChip = '<span class="intchip' + (obsAgo ? ' on' : '') + '"' + obsAttr + ' aria-label="' + esc(obsTip) + '" title="' + esc(obsTip) + '">' + obsSvg + '</span>';
  var wtChip = r.worktree ? '<span class="wtchip" title="git linked worktree: ' + esc(r.worktree) + '">⌥' + esc(r.worktree) + '</span>' : '';
  // ↺→👁 HONESTO: não há sync remoto a partir do cockpit; isto carimba a hora de revisão local ("marcar visto").
  var refreshBtn = '<button class="intrefresh" data-a="refreshIntegrations" data-x="' + esc(sid) + '" aria-label="marcar Notion e Obsidian como vistos agora (carimbo local)" title="marcar visto — carimba a hora de revisão local. Não há sync remoto a partir do cockpit; clica o chip para abrir a página/ficheiro.">👁</button>';
  var archiveBtn = '<button class="sarch" data-a="archiveSession" data-x="' + esc(sid) + '" aria-label="close this session (archive, reversible)" title="close this session in the cockpit (archive — reversible; reappears if it becomes active again, nothing is deleted)">✕</button>';
  var ctrl = '<div class="sctrl">' + modelSel + autoBtn + loopBtn + '<span class="sint">' + notionChip + obsChip + (wtChip || '') + refreshBtn + '</span>' + archiveBtn + '</div>';

  // ── F1: 1st-prompt subline (only when a Cowork title was promoted to the name) ──
  // The conversation title leads; the CC prompt that started it stays one glance away (honest
  // provenance), as a dim subline whose tooltip carries the full first prompt. Suppressed when there
  // is no Cowork title (the name already IS the 1st prompt) or when they coincide.
  var coworkSub = (r.coworkTitle && firstPrompt && firstPrompt !== nm)
    ? '<div class="ssub coworksub" style="opacity:.6" title="' + esc(firstPrompt) + '">↳ ' + esc(firstPrompt) + '</div>'
    : '';

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

  // ── handoff button — SEMPRE disponivel (qualquer sessao pode dar handoff) ──
  // Gera um texto de handoff (estado + ultima accao + pergunta pendente verbatim), copia
  // para o clipboard (cola no Cowork) e faz upsert no SYNC.md. Classe distinta "sgitbtn handoff"
  // (reusa o estilo/wiring mas NAO o selector exacto class="sgitbtn" — mantem o invariante do
  // cartao clean, que so mostra um botao sgitbtn quando ha trabalho de git).
  // NOTA: sem template-literals/backticks neste ficheiro (a fonte e embebida no webview).
  var handoffBtn = '<div class="sgitrow"><button class="sgitbtn handoff" data-a="handoff" data-x="' + esc(sid) + '" aria-label="generate a Cowork handoff for this session" title="Gera um handoff (estado + última acção + pergunta pendente) → mostra-o no painel inline aqui em baixo, copia para o clipboard e faz upsert no SYNC.md. Cola no Cowork para dar contexto total sem screenshots.">⇄ Handoff</button></div>';

  // ── GUARDIAN:F3 ── "⇄ Saltar para fresca": surge SÓ no limiar de delírio (advise ≥90, contrato
  // F1 pressureLadder). ctx% derivado de ctxPct (se o host já o trouxer) OU de ctxTokens+model
  // (mirror de mc-snapshot / guardian-jump.ctxPctOf — self-contained porque renderRow é serializado
  // para o webview via fn.toString(); sem template-literals/backticks). ctx desconhecido →
  // 'monitor' → sem botão (defensivo). Clique → handler guardianJump: abre sessão CC nova + entrega
  // o handoff pré-cozinhado (semeado no input; Ctrl+V se não aparecer — já vai no clipboard).
  var _gjPct = (typeof r.ctxPct === 'number' && isFinite(r.ctxPct))
    ? r.ctxPct
    : ((typeof r.ctxTokens === 'number' && isFinite(r.ctxTokens))
      ? Math.max(0, Math.min(100, Math.round((r.ctxTokens / ((/\[1m\]|\b1m\b/.test(String(r.model || '').toLowerCase())) ? 1000000 : 200000)) * 100)))
      : null);
  var jumpBtn = (_gjPct != null && _gjPct >= 90)
    ? '<div class="sgitrow"><button class="sgitbtn jump" data-a="guardianJump" data-x="' + esc(sid) + '" aria-label="jump to a fresh Claude Code session carrying this context" title="A janela de contexto está a ' + _gjPct + '% — perto do limiar de delírio (a sessão começa a perder coerência). Abre uma sessão CC NOVA e entrega-lhe o handoff pré-cozinhado (semeado no input da sessão nova; se não aparecer, Ctrl+V — já vai no clipboard). A sessão velha fica intacta.">⇄ Saltar para fresca · ' + _gjPct + '%</button></div>'
    : '';

  // ── ⇄ Handoff v2: painel inline POR SESSÃO ──────────────────────────────────────
  // Mostra EXACTAMENTE o texto que vai para o clipboard (mesma fonte: generateHandoff). Fica
  // FORA do drawer (irmão, dentro de .sbody) para sobreviver às re-renderizações periódicas e
  // não depender do display:none do drawer. Escondido até o host emitir postMessage({type:
  // 'handoff'}) — esqueleto (status 'generating') e depois final (status 'done'). data-hoff=sid.
  // Sem template-literals/backticks (a fonte é embebida no webview via fn.toString()).
  var hoffPanel = '<div class="hoffp" data-hoff="' + esc(sid) + '" hidden>'
    + '<div class="hoffp-st"></div>'
    + '<pre class="hoffp-pre"></pre>'
    + '<button class="sgitbtn hoffcopy" data-a="hoffCopy" data-x="' + esc(sid) + '" aria-label="copy this handoff to the clipboard again" title="copia outra vez este handoff para o clipboard">📋 Copiar</button>'
    + '</div>';

  // ── B4: vista viva do "moo local" por sessão (estado do acumulador; read-only, $0) ───────────────
  // Mostra o que o moo LOCAL fez/está a fazer SEM abrir terminal: nº de turns no journal + último
  // rolling summary + flag honesta "a actualizar…" (journal à frente do último rollup). O streaming ao
  // vivo do handoff (F2) reusa o painel inline acima. Sem dados → "sem actividade local ainda".
  // Sem template-literals (a fonte é embebida no webview via fn.toString()).
  var lm = r.localMoo;
  var localMooBlock;
  if (lm && (lm.journalN || lm.summary)) {
    var lmModel = lm.model ? (' · ' + esc(lm.model)) : '';
    var lmUpd = lm.updating ? '<span class="smooupd" title="o journal tem turns que o último rollup local ainda não absorveu — a próxima sumarização ($0) apanha-os">⟳ a actualizar…</span>' : '';
    var lmHead = '<div class="smoohd">🐮 moo local · <b>' + (lm.journalN || 0) + '</b> turn' + ((lm.journalN || 0) === 1 ? '' : 's') + ' no journal' + lmModel + ' ' + lmUpd + '</div>';
    var lmSum = lm.summary ? '<div class="smoosum" title="rolling summary local (qwen) — $0, gerado pelo hook de fim-de-turno">' + esc(lm.summary) + '</div>' : '';
    var lmTools = '';
    if (lm.lastTools && lm.lastTools.length) {
      var tparts = [];
      for (var tmi = 0; tmi < lm.lastTools.length; tmi++) { var tmt = lm.lastTools[tmi]; tparts.push(esc(tmt.name) + (tmt.target ? ' ' + esc(tmt.target) : '')); }
      lmTools = '<div class="smootools" title="últimas ferramentas registadas no journal local">▸ ' + tparts.join(' · ') + '</div>';
    }
    localMooBlock = '<div class="smoo">' + lmHead + lmSum + lmTools + '</div>';
  } else {
    localMooBlock = '<div class="smoo smoo-empty" title="o acumulador local ainda não escreveu journal/summary para esta sessão">🐮 sem actividade local ainda</div>';
  }

  // ── Git stage chip (WCOCKPIT-4) — suppressed when identical to the group's (header shows it once) ──
  var gsChip = '';
  var gsTip = '';
  var rowGitKey = r.gitStage ? (r.gitStage.state + ':' + (r.gitStage.dirty || 0) + ':' + (r.gitStage.ahead || 0)) : '';
  var gitDeduped = groupGitKey != null && rowGitKey !== '' && groupGitKey === rowGitKey;
  // HONEST-CONTROLS D5: the "⚠ não fechar" (don't close — you'd lose work) tip is a per-session
  // claim. It's only true when THIS session has dirty work of its own (unsavedOwn). When the tree
  // is dirty but none of it is this session's, closing the session loses nothing → no scary tip.
  // Attribution unknown (no touchedFiles field — e.g. a legacy/test row) → keep the tip (conservative).
  var _own = Array.isArray(r.unsavedOwn) ? r.unsavedOwn.length : null;
  var _warnClose = (_own === null) ? true : (_own > 0);
  if (r.gitStage && !gitDeduped) {
    var gsState = r.gitStage.state;
    var gsDirty = r.gitStage.dirty || 0;
    var gsAhead = r.gitStage.ahead || 0;
    var gsStaged = r.gitStage.staged || 0;
    if (gsState === 'clean') {
      gsChip = '<span class="gstage clean">✓ clean</span>';
    } else if (gsState === 'uncommitted') {
      gsChip = '<span class="gstage dirty">● ' + gsDirty + ' uncommitted</span>';
      if (_warnClose) gsTip = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    } else if (gsState === 'staged') {
      gsChip = '<span class="gstage staged">◐ ' + gsStaged + ' staged</span>';
    } else if (gsState === 'ahead') {
      gsChip = '<span class="gstage ahead">↑' + gsAhead + ' to push</span>';
      if (_warnClose) gsTip = '<span class="gtip">⚠ trabalho por guardar — não fechar</span>';
    }
  }
  var gitLine = gsChip ? '<div class="sgit">' + gsChip + (gsTip ? ' ' + gsTip : '') + '</div>' : '';

  // ── WCOCKPIT-10: Project Stage Rail + plain status + safe-to-close — only for real
  // git repos. We must NEVER claim "safe to close" / "done" for a session with no version
  // control, so the whole block is gated on r.gitStage. Pure derivation over the same
  // gitStage signal the chip above already uses — same source, same truth, zero new backend.
  var railLine = '', nowLine = '', safeChip = '', behindLine = '';
  if (r.gitStage) {
    // HONEST-CONTROLS D3: feed attribution to deriveStages so the safe-chip/copy stop asserting this
    // session owns shared-tree dirt. attr is built ONLY when attribution was actually computed
    // (r.touchedFiles present) — otherwise attr stays null and deriveStages keeps its old behaviour.
    var _attr = Array.isArray(r.touchedFiles)
      ? { unsavedOwn: (Array.isArray(r.unsavedOwn) ? r.unsavedOwn.length : 0), partial: !!r.touchedPartial }
      : null;
    var _ds = deriveStages(r.gitStage, r.branch, _attr);
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
    // HONEST-CONTROLS D3: when the dirt isn't this session's (repoFact), NEVER say "The AI changed
    // your files" — phrase it as a repo fact. Otherwise the per-stage message stands (it's true).
    var _nowMsg;
    if (_ds.safe.repoFact) {
      _nowMsg = _ds.safe.partial
        ? ('The repo has uncommitted files — not clearly attributed to this session')
        : (_ds.safe.label + ' — none from this session');
    } else {
      _nowMsg = _nowKey ? _NOWTXT[_nowKey] : (_ds.safe.level === 'green' ? 'All caught up — nothing pending' : _ds.safe.label);
    }

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
  var _WTA = ['var(--wt-1)','var(--wt-2)','var(--wt-3)','var(--wt-4)','var(--wt-5)','var(--wt-6)','var(--wt-7)'];
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
  // B3 — declutter: estado canónico + nome-pesquisável em data-attrs para o filtro/procura client-side
  // (needs-you / active / idle / cowork). Aditivo; o filtro vive no webview e só esconde/mostra .srow.
  var _rowState = r.waitingForCowork ? 'cowork' : (r.working ? 'active' : (r.needsYou ? 'needs' : 'idle'));
  var _searchName = esc(String((nm || '') + ' ' + (r.id || '') + ' ' + (firstPrompt || '')).toLowerCase().slice(0, 200));
  // Deck Floor (Fase 2): session type glyph (💬 CC · ♾️ LoopMoo). ⏰ Schedule has no per-session
  // source yet, so it is never fabricated — a plain session reads as 💬.
  var _stype = r.loop
    ? '<span class="stype" title="tipo: LoopMoo (autopilot loop)" aria-label="type: loop">♾️</span>'
    : '<span class="stype" title="tipo: sessão Claude Code" aria-label="type: CC session">💬</span>';
  // Deck Floor (Fase 2): persistent pin toggle (📌). Filled = pinned (mode-registry, survives reload).
  var _pinBtn = '<button class="spin' + (r.pinned ? ' on' : '') + '" data-psess="' + esc(r.fullId) + '" data-pinned="' + String(!!r.pinned)
    + '" title="' + (r.pinned ? 'sessão fixada — clica para soltar' : 'fixar sessão (fica no topo, nunca auto-arquiva)')
    + '" aria-label="' + (r.pinned ? 'unpin session' : 'pin session') + '" aria-pressed="' + (r.pinned ? 'true' : 'false') + '">📌</button>';
  return '<div class="srow' + (sel ? ' on' : '') + (r.pinned ? ' pinned' : '') + (r.needsYou ? ' needs' : '') + (r.waitingForCowork ? ' cowork-row' : '')
    + '"' + wtStyle + ' data-sess="' + esc(r.fullId) + '" data-state="' + _rowState + '" data-name="' + _searchName + '" role="button" tabindex="0" aria-label="open session: ' + esc(nm) + '" title="open this session in Claude Code — ' + esc(nm) + '">'
    + '<span class="livecow' + cowCls + '">🐮</span>'
    + '<div class="sbody">'
    + '<div class="sline">'
      + _stype
      + '<span class="sname">' + esc(nm) + '</span>'
      + '<span class="sstate">' + badge + '</span>'
      + safeChip
      + '<span class="sid">· ' + esc(r.id) + pin + '</span>'
      + '<span class="sllm">' + famEmoji(r.model) + ' ' + esc(r.model ? modelLabel(r.model) : '—') + '</span>'
      + (r.ctxTokens ? ('<span style="font-size:9.5px;margin-left:6px;color:' + ((/opus|sonnet|haiku|claude/i.test(String(r.model || '')) && r.ctxTokens / 200000 >= 0.8) ? 'var(--danger)' : 'var(--vscode-descriptionForeground)') + '" title="approx context-window fill on the last turn — input + cache tokens read from the transcript">\u{1F9E0} ' + (r.ctxTokens >= 1000 ? ((Math.round(r.ctxTokens / 100) / 10) + 'k') : String(r.ctxTokens)) + (/opus|sonnet|haiku|claude/i.test(String(r.model || '')) ? (r.ctxTokens >= 200000 ? ' max' : (' ' + Math.round(100 * r.ctxTokens / 200000) + '%')) : '') + '</span>') : '')
      // -- GUARDIAN:F1 -- pressure chip, only for 200k-window (claude) models; ctxPct = tokens/200k. guardianChip is a webview-injected sibling (typeof-guarded so host-side renderRow calls skip it). Concat-only: no backticks here (renderRow.toString() must stay template-literal-free).
      + ((typeof guardianChip === 'function' && r.ctxTokens && /opus|sonnet|haiku|claude/i.test(String(r.model || ''))) ? guardianChip(100 * r.ctxTokens / 200000, esc) : '')
    + '</div>'
    + coworkSub + brainLine + nextSlashLine + scm + gitLine + railLine + nowLine + behindLine
    + '<div class="sdrawer">' + modeSeg + ctrl + slashPicker + gitBtn + handoffBtn + jumpBtn + localMooBlock + '</div>'
    + hoffPanel
    + '</div>'
    + _pinBtn
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
  var count = '<span class="ghcount">' + group.length + '</span>' + (gneed ? '<span class="ghneed" role="status" aria-live="polite" style="color:var(--acc-warm);font-weight:700;margin-left:7px" title="sessions waiting for your reply">⬤ ' + gneed + ' your turn</span>' : '');
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
  // ── ⇄ Handoff v2: handoff de PROJECTO (todas as sessões deste grupo) ──────────────
  // Botão no header → o host monta uma BOARD (linha por sessão + flags DUP/UNCOMMITTED/
  // UNPUSHED + síntese local) e usa o MESMO painel inline (data-hoff=<projectKey>). O painel
  // é irmão de .ghd (filho directo de .grpsec) → persiste e NÃO faz parte do alvo de colapso.
  var projBtn = '<button class="sgitbtn handoff projhandoff" data-a="projHandoff" data-x="' + esc(key) + '" aria-label="generate a Cowork handoff for the whole project" title="Handoff de TODO o projecto — uma board com cada sessão (estado · branch · modelo · flags DUP/UNCOMMITTED/UNPUSHED) + síntese local. Mostra-o no painel aqui, copia para o clipboard e faz upsert no SYNC.md.">⇄ Handoff do projecto</button>';
  var hoffPanel = '<div class="hoffp" data-hoff="' + esc(key) + '" hidden>'
    + '<div class="hoffp-st"></div>'
    + '<pre class="hoffp-pre"></pre>'
    + '<button class="sgitbtn hoffcopy" data-a="hoffCopy" data-x="' + esc(key) + '" aria-label="copy this project handoff to the clipboard again" title="copia outra vez o handoff do projecto para o clipboard">📋 Copiar</button>'
    + '</div>';
  return '<div class="ghd collaphead"><span class="chev">▾</span>' + keyHtml + repoSub + meta + count + projBtn + '</div>' + hoffPanel;
}

// ── WS3: Local Moo Fleet ─────────────────────────────────────────────────────────
// A live view of the LOCAL moos working on handoffs IN PARALLEL with the cloud CC, on
// the free GPU ($0). Read-only: aggregates the per-session localMoo state (B4, already
// on each row) + the measured local tok/s (WS1 speed-meter, via opts.localSpeed). The
// PROOF of the local-first thesis: free, parallel work off the cloud critical path.
// Idle-safe (→ "moos locais ociosos"); never blocks. Concatenation/literals only (no
// template-literals — its source is embedded into the webview script via fn.toString()).
// opts: { localSpeed, nowMs }. Calls esc — must be in scope (it is, in both module + webview).
function renderLocalFleet(recent, opts) {
  opts = opts || {};
  recent = Array.isArray(recent) ? recent : [];
  var ls = opts.localSpeed || null;
  var active = [];
  for (var i = 0; i < recent.length; i++) {
    var rr = recent[i];
    var lm0 = rr && rr.localMoo;
    if (lm0 && (lm0.journalN || lm0.summary)) active.push(rr);
  }
  // Measured local throughput (WS1) — honest SINGLE-STREAM rate (moos share one GPU,
  // so we never fabricate an N× linear "total"). Labelled "medido"; n/d when absent.
  var tps = (ls && ls.latest && ls.latest.tps != null) ? ls.latest.tps : null;
  var tpsModel = (ls && ls.latest && ls.latest.model) ? ls.latest.model : null;
  var tpsTxt = tps != null
    ? ('~' + tps + ' tok/s local' + (tpsModel ? ' (' + esc(tpsModel) + ', medido)' : ' (medido)'))
    : 'tok/s local n/d — corre o speed-meter';

  if (!active.length) {
    // Honest idle copy (Fase 2): the fleet is ADVISORY when nothing has actually dispatched.
    // "N prontos" = local Ollama models available; "X dispatches reais" = real local executions
    // (Option-A deflections) — never inflated. 0 dispatches ⇒ explicitly advisory.
    var readyN = (opts.readyN != null) ? opts.readyN : null;
    var dispN = (opts.dispatchN != null) ? Number(opts.dispatchN) : null;
    var readyTxt = (readyN != null)
      ? (readyN + ' pronto' + (readyN === 1 ? '' : 's') + ' (modelo' + (readyN === 1 ? '' : 's') + ' local' + (readyN === 1 ? '' : 'is') + ')')
      : 'modelos locais n/d';
    var dispTxt = (dispN != null ? dispN : 0) + ' dispatch' + ((dispN === 1) ? '' : 'es') + ' rea' + ((dispN === 1) ? 'l' : 'is');
    var advisory = (dispN == null || dispN === 0) ? ' · <b>advisory</b>' : '';
    return '<div class="card" data-fleet="idle" style="padding:8px 11px;margin-bottom:8px">'
      + '<div class="lbl">🐮 Local Moo Fleet</div>'
      + '<div class="sub" style="margin-top:4px;opacity:.75" title="os moos locais moem journal/rollup/handoff no GPU livre, em paralelo ao CC, a $0 — advisory até haver um dispatch real">'
      + readyTxt + advisory + ' · ' + dispTxt + ' · nenhum moo a moer agora · ' + tpsTxt + ' · $0 · GPU livre</div>'
      + '</div>';
  }

  var rows = '';
  for (var j = 0; j < active.length; j++) {
    var s = active[j];
    var l = s.localMoo;
    var nm = s.coworkTitle || s.name || ('session ' + s.id);
    // B7 — each moo says WHAT it is doing (stage), tagged with its source session id below.
    // The "why" (grinds the journal into a rollup/handoff on the free GPU, parallel to the
    // cloud CC, at $0) is stated once in the card head — kept here as the stable contract copy.
    var stage = l.updating ? '⟳ a acumular journal' : (l.summary ? '✓ rollup local' : '· journal');
    var jn = l.journalN || 0;
    var mtps = null;
    if (ls && ls.models) {
      for (var k = 0; k < ls.models.length; k++) {
        if (ls.models[k].model === l.model && ls.models[k].tps != null) { mtps = ls.models[k].tps; break; }
      }
    }
    if (mtps == null) mtps = tps;
    var mtpsTxt = mtps != null ? (mtps + ' tok/s') : '—';
    rows += '<div class="fleetmoo" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:10px;border-top:1px solid var(--vscode-widget-border,rgba(127,127,127,.18))">'
      + '<span class="livecow working" style="font-size:13px">🐮</span>'
      + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(nm) + '">' + esc(nm) + '</span>'
      + (s.id ? '<span style="flex:none;opacity:.5;font-family:var(--vscode-editor-font-family,monospace);font-size:9px" title="sessão de origem">' + esc(String(s.id)) + '</span>' : '')
      + '<span style="flex:none;opacity:.8" title="tarefa real do moo · ' + jn + ' turn' + (jn === 1 ? '' : 's') + ' acumulados">' + esc(stage) + ' · ' + jn + ' turn' + (jn === 1 ? '' : 's') + '</span>'
      + '<span style="flex:none;opacity:.7" title="modelo local Ollama ($0)">' + (l.model ? esc(l.model) : '—') + '</span>'
      + '<span style="flex:none;color:var(--g);white-space:nowrap" title="velocidade local medida (WS1) · não consome cloud">' + mtpsTxt + ' · $0</span>'
      + '</div>';
  }

  var plural = active.length === 1 ? '' : 's';
  var head = '<div class="lbl">🐮 Local Moo Fleet · <b>' + active.length + '</b> moo' + plural + ' local' + (active.length === 1 ? '' : 'is') + ' a trabalhar</div>'
    + '<div class="sub" style="margin:2px 0 4px;opacity:.78" title="trabalho local fora da rota crítica do cloud — grátis e em paralelo">' + tpsTxt + ' · $0 · paralelo ao CC · GPU livre</div>';

  return '<div class="card" data-fleet="active" style="padding:8px 11px;margin-bottom:8px">' + head + rows + '</div>';
}

// ── HONEST-CONTROLS D2: inbox counts REPOS, not sessions ─────────────────────────
// PURE (testable), serialised into the webview (concat/regex-literals only — no template-literals).
// isMetaPath: is a dirty path "meta" (docs/handoff/markdown/manifests) rather than real code? A repo
// whose entire dirt is meta reads calm 📝, never a scary ⚠️. The set matches the wave brief D2:
// SYNC.md, _handoff/**, docs/**, any *.md, package.json / package-lock.json / lockfiles.
function isMetaPath(p) {
  var s = String(p == null ? '' : p).replace(/\\/g, '/').replace(/^"|"$/g, '').toLowerCase();
  if (!s) return false;
  if (/(^|\/)_handoff\//.test(s)) return true;
  if (/(^|\/)docs\//.test(s)) return true;
  if (/\.md$/.test(s)) return true;
  if (/(^|\/)package(-lock)?\.json$/.test(s)) return true;
  if (/(^|\/)(yarn\.lock|pnpm-lock\.yaml)$/.test(s)) return true;
  return false;
}

// PURE (testable): collapse the session rows into ONE entry per dirty repo (keyed by cwd — all N
// sessions of a shared working tree carry the SAME gitStage, so dedupe by cwd). The inbox then shows
// "1 repo · N por commitar", not "N sessions unsaved". Each entry says whether ALL its dirt is meta
// (→ calm tone) and carries a ≤5-path sample for the tooltip. Order = first-seen. Never throws.
function inboxRepoSummary(rows) {
  rows = Array.isArray(rows) ? rows : [];
  var map = {}; var order = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r || !r.gitStage || !(Number(r.gitStage.dirty) > 0)) continue;
    var key = r.cwd || r.repoFolder || ('#' + i);
    if (map[key]) continue;
    var repo = r.repoFolder || (r.cwd ? String(r.cwd).replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() : 'repo');
    map[key] = { repo: repo || 'repo', files: (Array.isArray(r.gitStage.files) ? r.gitStage.files : []), dirty: Number(r.gitStage.dirty) || 0 };
    order.push(key);
  }
  var out = [];
  for (var j = 0; j < order.length; j++) {
    var m = map[order[j]];
    var allMeta = m.files.length > 0 && m.files.every(function (f) { return isMetaPath(f && f.path); });
    var sample = m.files.slice(0, 5).map(function (f) { return f && f.path; }).filter(Boolean);
    out.push({ repo: m.repo, dirty: m.dirty, files: m.files, meta: allMeta, sample: sample });
  }
  return out;
}

module.exports = { esc, agoFmt, famEmoji, modelLabel, stageColor, renderRow, renderGroupHeader, renderLocalFleet, MODES_UI, SESS_MODELS, deriveStages, STAGE_META, isMetaPath, inboxRepoSummary };
