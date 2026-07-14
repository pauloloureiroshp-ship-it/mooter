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

// pathOf(f) — PURE. A touched-file entry is either a porcelain row {x,y,path,origPath?} (from
// gitCommitPreview) or a bare string. Never throws on a malformed entry.
function pathOf(f) {
  if (f && typeof f === 'object') {
    var current = String(f.path == null ? '' : f.path);
    var renamed = f.x === 'R' || f.y === 'R';
    var original = typeof f.origPath === 'string' ? f.origPath : '';
    return renamed && original ? original + ' → ' + current : current;
  }
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
  var vercelReason = typeof state.vercelReason === 'string' ? state.vercelReason : null;
  var vercelIdentity = (state.vercelIdentity && typeof state.vercelIdentity === 'object') ? state.vercelIdentity : null;

  // COH-19 — a validated URL is a REAL clickable anchor (data-ext → host openExternal, CSP-safe),
  // not a plain <div> of text. Fail-soft: a falsy url renders nothing.
  function anchor(url) {
    if (!url) return '';
    return '<a href="' + e(url) + '" data-ext="' + e(url) + '" class="lp-pub-link" rel="noreferrer noopener">' + e(url) + '</a>';
  }
  var head = '<div class="lp-pub-hdr">🚀 Publicar <span class="lp-pub-caret">▾</span> — ' + e(status) + '</div>'
    + '<div class="lp-pub-meta">Escolhe conscientemente o alcance: a pasta local é a origem; Git guarda a versão; Produção torna-a pública.</div>';
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
  var deployReason = typeof state.deployReason === 'string' ? state.deployReason : null;
  var gitPublishedCommit = typeof state.gitPublishedCommit === 'string' && state.gitPublishedCommit ? state.gitPublishedCommit : null;
  var deploySourceLine = gitPublishedCommit
    ? '<div class="lp-pub-meta">fonte imutável do deploy: commit já enviado <code>' + e(gitPublishedCommit) + '</code></div>'
    : '';
  var ahead = isFinite(Number(state.ahead)) ? Math.max(0, Number(state.ahead)) : 0;
  var behind = isFinite(Number(state.behind)) ? Math.max(0, Number(state.behind)) : 0;
  var branchLine = '<div class="lp-pub-meta">branch local: ' + e(branch)
    + (ahead ? (' · ' + e(ahead) + ' commit' + (ahead === 1 ? '' : 's') + ' já pronto' + (ahead === 1 ? '' : 's') + ' para push') : '')
    + (behind ? (' · ' + e(behind) + ' atrás do upstream') : '') + '</div>';
  // D10 (honesty) — the old "edições $0 · review $0 · deploy $0" was a lie: cloud edits use the user's
  // Anthropic subscription and deploy uses the user's Vercel account. State WHO charges, not a false absolute.
  var costLine = '<div class="lp-pub-cost">sem cobrança do Mooter · edições locais $0 · edições cloud = a tua subscrição · deploy = a tua conta Vercel</div>';

  var reviewBtn = '<button type="button" id="lp-pub-review-btn" class="lp-sel-btn">🛡 Rever segurança</button>';

  var local = (state.local && typeof state.local === 'object') ? state.local : null;
  var localFolder = local && typeof local.folder === 'string' && local.folder ? local.folder : 'workspace atual';
  var localPath = local && typeof local.path === 'string' && local.path ? local.path : null;
  var localDirty = local && isFinite(Number(local.dirtyCount)) ? Math.max(0, Number(local.dirtyCount)) : files.length;
  var localPublishable = local && isFinite(Number(local.publishableCount)) ? Math.max(0, Number(local.publishableCount)) : files.length;
  var localExcluded = local && isFinite(Number(local.excludedCount)) ? Math.max(0, Number(local.excludedCount)) : Math.max(0, localDirty - localPublishable);
  var localBlockedPaths = local && Array.isArray(local.blockedPaths) ? local.blockedPaths.filter(function (p) { return typeof p === 'string' && p; }).slice(0, 30) : [];
  var localBlocked = localBlockedPaths.length
    ? '<div class="lp-pub-warn"><b>não publicável ainda:</b> ' + localBlockedPaths.map(function (p) { return '<code>' + e(p) + '</code>'; }).join(' · ')
      + '<br>Este ficheiro já tinha alterações antes do primeiro Live Preview (ou ainda não era rastreado). Para não enviar WIP escondido, reverte esta proposta, guarda/stash/commita o trabalho anterior e aplica a edição novamente.</div>'
    : '';
  var localStep = '<section class="lp-pub-step lp-pub-step-local" aria-label="Etapa local">'
    + '<div class="lp-pub-step-hd"><span class="lp-pub-step-n">1</span><span><b>Local</b><small>pasta de trabalho</small></span><strong class="lp-pub-step-state">origem</strong></div>'
    + '<div class="lp-pub-step-body"><div>📁 ' + e(localFolder) + ' · ' + localDirty + ' ' + (localDirty === 1 ? 'alteração' : 'alterações') + '</div>'
    + (localPath ? ('<div class="lp-pub-local-path" aria-label="Caminho local"><code>' + e(localPath) + '</code></div>') : '<div class="lp-pub-meta">caminho local indisponível.</div>')
    + localBlocked
    + (localExcluded ? ('<div class="lp-pub-warn">' + localPublishable + ' aprovada' + (localPublishable === 1 ? '' : 's') + ' pelo Live Preview · ' + localExcluded + ' ' + (localExcluded === 1 ? 'alteração paralela fica apenas local.' : 'alterações paralelas ficam apenas locais.') + '</div>') : '')
    + '</div></section>';

  var git = (state.git && typeof state.git === 'object') ? state.git : null;
  var gitAvailable = !!(git && git.available && git.url);
  var gitName = git && typeof git.name === 'string' && git.name ? git.name : 'remote';
  var gitUrl = git && typeof git.url === 'string' && git.url ? git.url : null;
  var gitWebUrl = git && typeof git.webUrl === 'string' && git.webUrl ? git.webUrl : null;
  var gitTargetBranch = git && typeof git.targetBranch === 'string' && git.targetBranch ? git.targetBranch : null;
  var gitReason = git && typeof git.reason === 'string' ? git.reason : null;
  var gitDestinationCount = git && isFinite(Number(git.destinationCount)) ? Math.max(0, Number(git.destinationCount)) : 0;
  var gitBlocked = !!git && !gitAvailable;
  var gitRemoteLine = gitAvailable
    ? '<div class="lp-pub-remote">🔗 ' + e(gitName) + ': ' + (gitWebUrl ? anchor(gitWebUrl) : '<code>' + e(gitUrl) + '</code>')
      + (gitTargetBranch ? ('<div class="lp-pub-meta">destino do push: ' + e(gitName) + '/' + e(gitTargetBranch) + '</div>') : '')
      + (gitWebUrl ? ('<details><summary>ver URL do remote</summary><code>' + e(gitUrl) + '</code></details>') : '') + '</div>'
    : (gitReason === 'git-multiple-push-destinations'
      ? '<div class="lp-pub-warn">Publish bloqueado: o remote tem ' + e(gitDestinationCount || 'múltiplos') + ' destinos de push. Mantém exatamente um destino explícito antes de continuar.</div>'
      : (gitReason === 'git-destination-unverifiable'
        ? '<div class="lp-pub-warn">Publish bloqueado: não foi possível provar a URL efetiva de push. Revê aliases/rewrite e configura um único destino de rede verificável.</div>'
        : '<div class="lp-pub-warn">sem remote Git configurado — o código continua apenas na pasta local até ligares um remote.</div>'));

  var filesBlock = files.length
    ? '<div class="lp-pub-files-hdr">' + files.length + ' ficheiro' + (files.length === 1 ? '' : 's') + ' aprovado' + (files.length === 1 ? '' : 's') + ' pelo Live Preview:</div>'
      + '<div class="lp-pub-files">' + fileRows + more + '</div>'
    : '<div class="lp-pub-meta">nada por commitar.</div>';

  // D6 — the publish gate is fail-closed for MORE than an open Critical: a missing / failed / stale scan
  // also blocks. Say WHICH so the disabled button is never a silent or lying dead control.
  function secReasonText(reason) {
    switch (reason) {
      case 'security-scan-required': return 'corre o 🛡 Review Security primeiro — o publish exige um scan válido desta versão.';
      case 'security-scan-failed': return 'o último 🛡 scan de segurança falhou — corre-o de novo antes de publicar.';
      case 'security-scan-stale': return 'o código mudou desde o último 🛡 scan — corre-o de novo (o scan tem de ser desta versão).';
      case 'security-coverage-incomplete': return 'o Review não conseguiu cobrir todos os scanners/pacotes — corre-o novamente e resolve a causa indicada no relatório.';
      case 'security-remediation-running': return 'uma correção do Review ainda está em curso — aguarda o resultado e corre o scan novamente.';
      case 'selection-approval-required': return 'a alteração selecionada ainda está amarela — confirma OK ou reverte antes de publicar.';
      case 'preexisting-dirt-in-approved-file': return 'este ficheiro já tinha WIP antes do primeiro Live Preview (ou não era rastreado). Não consigo separar esses bytes com segurança: reverte a proposta, guarda/stash/commita o trabalho anterior e aplica novamente.';
      case 'approved-content-changed': return 'os bytes mudaram depois da revisão/OK — revê a versão atual antes de publicar.';
      case 'critical-open': return 'resolve o Critical no 🛡 Review Security primeiro.';
      default: return 'publish bloqueado pela verificação de segurança — corre o 🛡 Review Security.';
    }
  }
  var secText = secReasonText(state.securityReason);

  var msgVal = e(String(state.defaultMessage || ''));
  var commitDisabled = (!files.length || hasCritical || gitBlocked) ? ' disabled' : '';
  var criticalNote = hasCritical
    ? '<div class="lp-pub-warn">⚠ ' + e(secText) + '</div>'
    : '';
  var transactionNote = '<details class="lp-pub-transaction"><summary>como funciona o commit protegido</summary>'
    + '<div class="lp-pub-meta">O Mooter cria este commit somente com os bytes revistos acima e preserva o teu staging não relacionado.</div>'
    + '<div class="lp-pub-warn">Para manter essa garantia transacional, este caminho não executa hooks Git nem assinatura automática. Se o repositório exigir essas políticas, usa o fluxo Git habitual.</div></details>';
  var commitBlock = transactionNote
    + '<textarea id="lp-pub-msg" class="lp-pub-msg" rows="2" aria-label="Mensagem de commit">' + msgVal + '</textarea>'
    + '<button type="button" id="lp-pub-commit-btn" class="lp-sel-btn"' + commitDisabled + '>Guardar no Git (commit + push)</button>';
  var gitStep = '<section class="lp-pub-step lp-pub-step-git" aria-label="Etapa Git">'
    + '<div class="lp-pub-step-hd"><span class="lp-pub-step-n">2</span><span><b>Git</b><small>repositório de código</small></span><strong class="lp-pub-step-state">' + (gitAvailable ? 'ligado' : 'não ligado') + '</strong></div>'
    + '<div class="lp-pub-step-body">' + gitRemoteLine + branchLine + filesBlock + commitBlock + '</div></section>';

  var deployBlock;
  if (!vercelLinked) {
    deployBlock = vercelReason === 'vercel-identity-invalid'
      ? '<div class="lp-pub-warn">o vínculo Vercel está incompleto, ilegível ou inseguro — religa o projeto para obter projectName, projectId e orgId válidos.</div>'
      : '<div class="lp-pub-meta">este workspace não está ligado a um projeto Vercel (landing/.vercel/project.json ausente).</div>';
  } else if (hasCritical) {
    deployBlock = '<div class="lp-pub-warn">⚠ deploy bloqueado — ' + e(secText) + '</div>';
  } else if (deployReason) {
    var deployWhy = deployReason === 'git-publish-required'
      ? 'guarda primeiro estes bytes no Git (commit + push); Produção nunca recebe o working tree mutável.'
      : (deployReason === 'git-publish-stale'
        ? 'há novas alterações Live Preview depois do último push — guarda-as no Git antes do deploy.'
        : 'o commit enviado não está ligado ao Review Security atual — revê e guarda novamente antes do deploy.');
    deployBlock = '<div class="lp-pub-warn">⚠ deploy bloqueado — ' + e(deployWhy) + '</div>';
  } else {
    deployBlock = '<button type="button" id="lp-pub-deploy-open" class="lp-sel-btn lp-pub-danger">Publicar (deploy Vercel — IRREVERSÍVEL)</button>'
      + '<div id="lp-pub-gate" class="lp-pub-gate" style="display:none" role="group" aria-label="Confirmar deploy">'
      + '<div class="lp-pub-warn">Escreve exactamente o nome do projeto (<code>' + e(projectName) + '</code>) para confirmar — o host verifica outra vez antes de correr.</div>'
      + '<input type="text" id="lp-pub-gate-input" class="lp-pub-gate-input" autocomplete="off" spellcheck="false" placeholder="' + e(projectName) + '" aria-label="Nome do projeto para confirmar o deploy" />'
      + '<button type="button" id="lp-pub-deploy-confirm" class="lp-sel-btn lp-pub-danger">Confirmar deploy</button>'
      + '<button type="button" id="lp-pub-deploy-cancel" class="lp-sel-btn">cancelar</button>'
      + '</div>';
  }
  var vercelIdentityLine = vercelIdentity
    ? '<div class="lp-pub-identity">alvo Vercel: <b>' + e(String(vercelIdentity.projectName || projectName)) + '</b>'
      + (vercelIdentity.projectIdHint ? ' · projeto <code>' + e(String(vercelIdentity.projectIdHint)) + '</code>' : '')
      + (vercelIdentity.orgIdHint ? ' · org <code>' + e(String(vercelIdentity.orgIdHint)) + '</code>' : '')
      + (vercelIdentity.projectJsonSha256Hint ? ' · vínculo SHA <code>' + e(String(vercelIdentity.projectJsonSha256Hint)) + '</code>' : '')
      + '</div>'
    : '';
  var prodStep = '<section class="lp-pub-step lp-pub-step-prod" aria-label="Etapa produção">'
    + '<div class="lp-pub-step-hd"><span class="lp-pub-step-n">3</span><span><b>Produção</b><small>URL pública</small></span><strong class="lp-pub-step-state">' + e(status) + '</strong></div>'
    + '<div class="lp-pub-step-body">' + destLine + siteLine + deploySourceLine + vercelIdentityLine + deployBlock + '</div></section>';

  // D6 — a security-gate refusal returns a slug (security-scan-required/-failed/-stale, critical-open);
  // render the honest sentence instead of the raw slug so a blocked publish explains itself.
  var SEC_REASONS = { 'security-scan-required': 1, 'security-scan-failed': 1, 'security-scan-stale': 1, 'security-coverage-incomplete': 1, 'security-remediation-running': 1, 'selection-approval-required': 1, 'preexisting-dirt-in-approved-file': 1, 'approved-content-changed': 1, 'critical-open': 1 };
  function reasonText(reason) {
    if (SEC_REASONS[reason]) return secReasonText(reason);
    if (reason === 'git-remote-required') return 'liga um remote Git antes de usar commit + push.';
    if (reason === 'git-multiple-push-destinations') return 'há múltiplos destinos de push — mantém exatamente um destino antes de publicar.';
    if (reason === 'git-destination-unverifiable') return 'a URL efetiva de push não pôde ser provada — revê aliases/rewrite do Git.';
    if (reason === 'approved-content-changed') return 'os bytes mudaram depois da revisão — o commit foi recusado; revê a versão atual e tenta novamente.';
    if (reason === 'approved-content-unverifiable') return 'não foi possível provar os bytes revistos — o commit foi recusado sem alterar a branch.';
    if (reason === 'approved-content-transform-unsupported') return 'um filtro Git tentaria transformar o código para além da normalização segura de fim de linha — o commit foi recusado; revê .gitattributes e corre o Security Review novamente.';
    if (reason === 'approved-snapshot-invalid') return 'a seleção aprovada ficou inválida — reabre Publish e revê os ficheiros atuais.';
    if (reason === 'git-head-moved') return 'a branch mudou enquanto o commit era preparado — nada foi enviado; revê o novo HEAD.';
    if (reason === 'git-selected-base-moved') return 'outro commit mudou o mesmo ficheiro depois do teu OK — a alteração local foi preservada, mas nada foi commitado ou enviado; revê a nova base.';
    if (reason === 'git-index-selected-path-moved') return 'o staging deste ficheiro mudou enquanto o commit era preparado — o Mooter preservou o staging e recusou o Publish; revê o índice antes de tentar novamente.';
    if (reason === 'git-index-lock-busy') return 'o índice Git está ocupado por outra operação — nada mudou; termina essa operação e tenta novamente.';
    if (reason === 'git-index-reconcile-failed') return 'o commit protegido não conseguiu reconciliar o índice Git de forma atómica — nenhum push foi feito; revê HEAD e staging antes de continuar.';
    if (reason === 'git-destination-changed') return 'o remote ou a branch de destino mudou depois da confirmação — o push foi recusado.';
    if (reason === 'git-operation-in-progress') return 'há um merge, rebase, cherry-pick, revert ou sequencer em curso — termina-o ou aborta-o antes de publicar.';
    if (reason === 'classify-frozen-changed') return 'classify.js divergiu do SHA congelado — Publish abortado pelo guardrail.';
    if (reason === 'deploy-snapshot-incomplete') return 'não foi possível ler todos os bytes do projeto para criar um snapshot imutável; deploy abortado.';
    if (reason === 'deploy-snapshot-mismatch') return 'o snapshot de deploy não corresponde aos bytes revistos; deploy abortado.';
    if (reason === 'deploy-snapshot-symlink') return 'o projeto contém um symlink no escopo de deploy; resolve-o antes de publicar com segurança.';
    if (reason === 'vercel-identity-invalid') return 'o vínculo Vercel não contém uma identidade completa e segura; religa o projeto.';
    if (reason === 'vercel-identity-changed') return 'a identidade Vercel mudou depois da confirmação; reabre Publish, confere o alvo e confirma novamente.';
    if (reason === 'git-publish-required') return 'guarda primeiro os bytes aprovados no Git; o deploy não lê o working tree.';
    if (reason === 'git-publish-stale') return 'há alterações Live Preview posteriores ao último push; guarda-as antes do deploy.';
    if (reason === 'git-publish-security-mismatch') return 'o commit enviado não corresponde ao Review Security atual; revê e guarda novamente.';
    return String(reason || 'falhou');
  }
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

  return head + costLine + criticalNote
    + '<div class="lp-pub-sec lp-pub-review">' + reviewBtn + '</div>'
    + '<div class="lp-pub-pipeline">' + localStep + '<div class="lp-pub-flow" aria-hidden="true">↓</div>' + gitStep + '<div class="lp-pub-flow" aria-hidden="true">↓</div>' + prodStep + '</div>'
    + (lastResult ? '<div class="lp-pub-sec">' + lastResult + '</div>' : '');
}

module.exports = { renderPublishPopover: renderPublishPopover, pathOf: pathOf };
