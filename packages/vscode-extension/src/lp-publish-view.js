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
  // D10 (F9 honesty) — a linked Vercel project ALWAYS has a prod URL, so "Publicado" purely from websiteUrl
  // falsely implies the current working tree is live. Only claim "Publicado" on a REAL successful deploy THIS
  // session; a known URL without one is "Site ligado" (last known deploy), and no URL at all is "Rascunho".
  var deployedThisSession = !!(state.lastResult && state.lastResult.action === 'deploy' && state.lastResult.ok);
  var status = deployedThisSession ? 'Publicado' : (websiteUrl ? 'Site ligado' : 'Rascunho');
  var hasCritical = !!state.hasOpenCritical;
  var vercelLinked = !!state.vercelLinked;
  var projectName = (typeof state.projectName === 'string') ? state.projectName : '';

  // COH-19 — a validated URL is a REAL clickable anchor (data-ext → host openExternal, CSP-safe),
  // not a plain <div> of text. Fail-soft: a falsy url renders nothing.
  function anchor(url) {
    if (!url) return '';
    return '<a href="' + e(url) + '" data-ext="' + e(url) + '" class="lp-pub-link" rel="noreferrer noopener">' + e(url) + '</a>';
  }
  var head = '<div class="lp-pub-hdr">🚀 Publicar — ' + e(status) + '</div>';
  var siteLine = websiteUrl
    ? '<div class="lp-pub-url">' + (deployedThisSession ? 'site: ' : 'site (último deploy conhecido): ') + anchor(websiteUrl) + '</div>'
    : '<div class="lp-pub-meta">ainda sem deploy conhecido nesta sessão.</div>';
  // COH-10 — the production DESTINATION, shown BEFORE the two-factor deploy so the user knows where they
  // are publishing. Honest precedence + source (resolved host-side in _productionUrl); n/d when unknown.
  var dest = (state.destination && typeof state.destination === 'object') ? state.destination : null;
  var destUrl = (dest && typeof dest.url === 'string' && dest.url) ? dest.url : null;
  var destSrc = (dest && typeof dest.source === 'string' && dest.source) ? dest.source : null;
  var destLine = destUrl
    ? '<div class="lp-pub-dest">destino: 🌐 ' + anchor(destUrl) + (destSrc ? ' <span class="lp-pub-dest-src">· fonte: ' + e(destSrc) + '</span>' : '') + '</div>'
    : '<div class="lp-pub-dest lp-pub-meta">destino: n/d — define <code>NEXT_PUBLIC_SITE_URL</code> ou a setting <code>mooter.livePreview.productionUrl</code></div>';
  var branchLine = '<div class="lp-pub-meta">branch: ' + e(branch) + '</div>';
  // D10 (honesty) — the old "edições $0 · review $0 · deploy $0" was a lie: cloud edits use the user's
  // Anthropic subscription and deploy uses the user's Vercel account. State WHO charges, not a false absolute.
  var costLine = '<div class="lp-pub-cost">sem cobrança do Mooter · edições locais $0 · edições cloud = a tua subscrição · deploy = a tua conta Vercel</div>';

  var reviewBtn = '<button type="button" id="lp-pub-review-btn" class="lp-sel-btn">🛡 Rever segurança</button>';

  var filesBlock = files.length
    ? '<div class="lp-pub-files-hdr">' + files.length + ' ficheiro' + (files.length === 1 ? '' : 's') + ' por commitar:</div>'
      + '<div class="lp-pub-files">' + fileRows + more + '</div>'
    : '<div class="lp-pub-meta">nada por commitar.</div>';

  // D6 — the publish gate is fail-closed for MORE than an open Critical: a missing / failed / stale scan
  // also blocks. Say WHICH so the disabled button is never a silent or lying dead control.
  function secReasonText(reason) {
    switch (reason) {
      case 'security-scan-required': return 'corre o 🛡 Review Security primeiro — o publish exige um scan válido desta versão.';
      case 'security-scan-failed': return 'o último 🛡 scan de segurança falhou — corre-o de novo antes de publicar.';
      case 'security-scan-stale': return 'o código mudou desde o último 🛡 scan — corre-o de novo (o scan tem de ser desta versão).';
      case 'critical-open': return 'resolve o Critical no 🛡 Review Security primeiro.';
      default: return 'publish bloqueado pela verificação de segurança — corre o 🛡 Review Security.';
    }
  }
  var secText = secReasonText(state.securityReason);

  var msgVal = e(String(state.defaultMessage || ''));
  var commitDisabled = (!files.length || hasCritical) ? ' disabled' : '';
  var criticalNote = hasCritical
    ? '<div class="lp-pub-warn">⚠ ' + e(secText) + '</div>'
    : '';
  var commitBlock = '<textarea id="lp-pub-msg" class="lp-pub-msg" rows="2" aria-label="Mensagem de commit">' + msgVal + '</textarea>'
    + '<button type="button" id="lp-pub-commit-btn" class="lp-sel-btn"' + commitDisabled + '>Atualizar (commit + push)</button>';

  var deployBlock;
  if (!vercelLinked) {
    deployBlock = '<div class="lp-pub-meta">este workspace não está ligado a um projeto Vercel (landing/.vercel/project.json ausente).</div>';
  } else if (hasCritical) {
    deployBlock = '<div class="lp-pub-warn">⚠ deploy bloqueado — ' + e(secText) + '</div>';
  } else {
    deployBlock = '<button type="button" id="lp-pub-deploy-open" class="lp-sel-btn lp-pub-danger">Publicar (deploy Vercel — IRREVERSÍVEL)</button>'
      + '<div id="lp-pub-gate" class="lp-pub-gate" style="display:none" role="group" aria-label="Confirmar deploy">'
      + '<div class="lp-pub-warn">Escreve exactamente o nome do projeto (<code>' + e(projectName) + '</code>) para confirmar — o host verifica outra vez antes de correr.</div>'
      + '<input type="text" id="lp-pub-gate-input" class="lp-pub-gate-input" autocomplete="off" spellcheck="false" placeholder="' + e(projectName) + '" aria-label="Nome do projeto para confirmar o deploy" />'
      + '<button type="button" id="lp-pub-deploy-confirm" class="lp-sel-btn lp-pub-danger">Confirmar deploy</button>'
      + '<button type="button" id="lp-pub-deploy-cancel" class="lp-sel-btn">cancelar</button>'
      + '</div>';
  }

  // D6 — a security-gate refusal returns a slug (security-scan-required/-failed/-stale, critical-open);
  // render the honest sentence instead of the raw slug so a blocked publish explains itself.
  var SEC_REASONS = { 'security-scan-required': 1, 'security-scan-failed': 1, 'security-scan-stale': 1, 'critical-open': 1 };
  function reasonText(reason) { return SEC_REASONS[reason] ? secReasonText(reason) : String(reason || 'falhou'); }
  var lastResult = '';
  var lr = (state.lastResult && typeof state.lastResult === 'object') ? state.lastResult : null;
  if (lr) {
    if (lr.action === 'commit') {
      lastResult = lr.ok
        ? '<div class="lp-pub-ok">✓ commit + push' + (lr.cmd ? ' — ' + e(String(lr.cmd)) : '') + '</div>'
        : '<div class="lp-pub-err">✕ ' + e(reasonText(lr.reason)) + (lr.out ? ' — ' + e(String(lr.out).slice(0, 200)) : '') + '</div>';
    } else if (lr.action === 'deploy') {
      // COH-19 — the post-deploy URL is a REAL clickable anchor (opens in the browser), not text.
      lastResult = lr.ok
        ? '<div class="lp-pub-ok">✓ deploy' + (lr.url ? ' — ' + anchor(String(lr.url)) : ' (sem URL — ver output)') + '</div>'
        : '<div class="lp-pub-err">✕ deploy: ' + e(reasonText(lr.reason)) + (lr.out ? ' — ' + e(String(lr.out).slice(0, 200)) : '') + '</div>';
    }
  }

  return head + siteLine + branchLine + costLine + criticalNote
    + '<div class="lp-pub-sec">' + reviewBtn + '</div>'
    + '<div class="lp-pub-sec">' + filesBlock + commitBlock + '</div>'
    + '<div class="lp-pub-sec">' + destLine + deployBlock + '</div>' // COH-10 — destination BEFORE the two-factor
    + (lastResult ? '<div class="lp-pub-sec">' + lastResult + '</div>' : '');
}

module.exports = { renderPublishPopover: renderPublishPopover, pathOf: pathOf };
