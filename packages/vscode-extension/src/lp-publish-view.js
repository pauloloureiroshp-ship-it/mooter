'use strict';
// lp-publish-view.js — 🚀 Publish popover · LP-6 §A. Pure renderer: takes the host's publish
// state (branch, touched files, security gate, Vercel link, last commit/deploy result) and turns
// it into HTML. No fs, no net, no vscode, no child_process — SELF-CONTAINED (own escaper
// fallback) so it survives fn.toString() serialisation into the webview (same trick as
// lp-security-view.js / lp-presets.js). This module NEVER decides whether a deploy is allowed —
// that gate is enforced HOST-SIDE (extension.js `_publishDeploy`); this file only renders what
// the host already decided, and disables the buttons that mirror that decision so the UI is
// never misleading.
//
// ── HONESTY ──────────────────────────────────────────────────────────────────────────────────
//   The cost line is always shown, always the same three numbers — Mooter's OWN cost (no LLM
//   calls in this flow) is $0; it is NOT a claim about Vercel's own billing/plan.
//   "Publicado" is only shown when the host reports a REAL known deploy URL from THIS session —
//   never inferred, never a guess.
//   A missing Vercel link or an open Critical finding is stated plainly, with the exact reason a
//   button is disabled, never a silently-dead control.
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   renderPublishPopover never throws: malformed/absent state degrades to an honest "sem dados"
//   line — never a crash, never a fabricated "tudo pronto".

function defaultEsc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// pathOf(f) — PURE. A touched-file entry is either a porcelain row {x,y,path} (from
// gitCommitPreview) or a bare string. Never throws on a malformed entry.
function pathOf(f) {
  if (f && typeof f === 'object') return String(f.path == null ? '' : f.path);
  return String(f == null ? '' : f);
}

// renderPublishPopover(state, esc) — PURE, FAIL-SOFT. state shape (all optional, all defensive):
//   { branch, touchedFiles:[{x,y,path}]|[string], defaultMessage, vercelLinked, projectName,
//     hasOpenCritical, websiteUrl, lastResult:{action:'commit'|'deploy', ok, reason, out, url, cmd},
//     error }.
// esc is the webview's own HTML escaper (same contract as renderSecurityFindings) — defaults to a
// minimal escaper for the unit tests. Never throws.
function renderPublishPopover(state, esc) {
  var e = (typeof esc === 'function') ? esc : defaultEsc;

  if (state && typeof state === 'object' && state.error) {
    return '<div class="lp-pub-hdr">🚀 Publicar</div><div class="lp-pub-meta lp-pub-err">falhou: ' + e(String(state.error)) + '</div>';
  }
  if (!state || typeof state !== 'object') {
    return '<div class="lp-pub-hdr">🚀 Publicar</div><div class="lp-pub-meta">sem dados — abre o painel outra vez.</div>';
  }

  var branch = (typeof state.branch === 'string' && state.branch) ? state.branch : '(sem branch)';
  var files = Array.isArray(state.touchedFiles) ? state.touchedFiles : [];
  var fileRows = files.slice(0, 30).map(function (f) {
    return '<div class="lp-pub-file">' + e(pathOf(f)) + '</div>';
  }).join('');
  var more = files.length > 30 ? '<div class="lp-pub-meta">…+' + (files.length - 30) + ' more</div>' : '';

  var websiteUrl = (typeof state.websiteUrl === 'string' && state.websiteUrl) ? state.websiteUrl : null;
  var status = websiteUrl ? 'Publicado' : 'Rascunho';
  var hasCritical = !!state.hasOpenCritical;
  var vercelLinked = !!state.vercelLinked;
  var projectName = (typeof state.projectName === 'string') ? state.projectName : '';

  var head = '<div class="lp-pub-hdr">🚀 Publicar — ' + e(status) + '</div>';
  // the link text is rendered as plain escaped text — the webview's own markup turns it into an
  // anchor (same contract note as the brief: "just text the webview turns into an anchor").
  var siteLine = websiteUrl
    ? '<div class="lp-pub-url">site: ' + e(websiteUrl) + '</div>'
    : '<div class="lp-pub-meta">ainda sem deploy conhecido nesta sessão.</div>';
  var branchLine = '<div class="lp-pub-meta">branch: ' + e(branch) + '</div>';
  var costLine = '<div class="lp-pub-cost">edições $0 · review $0 · deploy $0</div>';

  var reviewBtn = '<button type="button" id="lp-pub-review-btn" class="lp-sel-btn">🛡 Rever segurança</button>';

  var filesBlock = files.length
    ? '<div class="lp-pub-files-hdr">' + files.length + ' ficheiro' + (files.length === 1 ? '' : 's') + ' por commitar:</div>'
      + '<div class="lp-pub-files">' + fileRows + more + '</div>'
    : '<div class="lp-pub-meta">nada por commitar.</div>';

  var msgVal = e(String(state.defaultMessage || ''));
  var commitDisabled = (!files.length || hasCritical) ? ' disabled' : '';
  var criticalNote = hasCritical
    ? '<div class="lp-pub-warn">⚠ resolve o Critical no 🛡 Review Security primeiro.</div>'
    : '';
  var commitBlock = '<textarea id="lp-pub-msg" class="lp-pub-msg" rows="2" aria-label="Mensagem de commit">' + msgVal + '</textarea>'
    + '<button type="button" id="lp-pub-commit-btn" class="lp-sel-btn"' + commitDisabled + '>Atualizar (commit + push)</button>';

  var deployBlock;
  if (!vercelLinked) {
    deployBlock = '<div class="lp-pub-meta">este workspace não está ligado a um projeto Vercel (landing/.vercel/project.json ausente).</div>';
  } else if (hasCritical) {
    deployBlock = '<div class="lp-pub-warn">⚠ deploy bloqueado — resolve o Critical no 🛡 Review Security primeiro.</div>';
  } else {
    deployBlock = '<button type="button" id="lp-pub-deploy-open" class="lp-sel-btn lp-pub-danger">Publicar (deploy Vercel — IRREVERSÍVEL)</button>'
      + '<div id="lp-pub-gate" class="lp-pub-gate" style="display:none" role="group" aria-label="Confirmar deploy">'
      + '<div class="lp-pub-warn">Escreve exactamente o nome do projeto (<code>' + e(projectName) + '</code>) para confirmar — o host verifica outra vez antes de correr.</div>'
      + '<input type="text" id="lp-pub-gate-input" class="lp-pub-gate-input" autocomplete="off" spellcheck="false" placeholder="' + e(projectName) + '" aria-label="Nome do projeto para confirmar o deploy" />'
      + '<button type="button" id="lp-pub-deploy-confirm" class="lp-sel-btn lp-pub-danger">Confirmar deploy</button>'
      + '<button type="button" id="lp-pub-deploy-cancel" class="lp-sel-btn">cancelar</button>'
      + '</div>';
  }

  var lastResult = '';
  var lr = (state.lastResult && typeof state.lastResult === 'object') ? state.lastResult : null;
  if (lr) {
    if (lr.action === 'commit') {
      lastResult = lr.ok
        ? '<div class="lp-pub-ok">✓ commit + push' + (lr.cmd ? ' — ' + e(String(lr.cmd)) : '') + '</div>'
        : '<div class="lp-pub-err">✕ ' + e(String(lr.reason || 'falhou')) + (lr.out ? ' — ' + e(String(lr.out).slice(0, 200)) : '') + '</div>';
    } else if (lr.action === 'deploy') {
      lastResult = lr.ok
        ? '<div class="lp-pub-ok">✓ deploy' + (lr.url ? ' — ' + e(String(lr.url)) : ' (sem URL — ver output)') + '</div>'
        : '<div class="lp-pub-err">✕ deploy: ' + e(String(lr.reason || 'falhou')) + (lr.out ? ' — ' + e(String(lr.out).slice(0, 200)) : '') + '</div>';
    }
  }

  return head + siteLine + branchLine + costLine + criticalNote
    + '<div class="lp-pub-sec">' + reviewBtn + '</div>'
    + '<div class="lp-pub-sec">' + filesBlock + commitBlock + '</div>'
    + '<div class="lp-pub-sec">' + deployBlock + '</div>'
    + (lastResult ? '<div class="lp-pub-sec">' + lastResult + '</div>' : '');
}

module.exports = { renderPublishPopover: renderPublishPopover, pathOf: pathOf };
