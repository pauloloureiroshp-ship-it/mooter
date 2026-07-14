'use strict';
// lp-security-view.js — Review Security · LP-5 §A. Pure renderer: takes the combined result of
// the 4 scanners (lp-secret-scan / lp-audit-summary / lp-xss-scan / lp-csp-check — the host runs
// them; this module only turns the data into HTML) and groups findings by severity
// (Critical → Warning → Info). No fs, no net, no vscode — SELF-CONTAINED (own escaper fallback,
// own bucketing) so it survives fn.toString() serialisation into the webview (same trick as
// lp-presets.js's renderPresetsBarHTML).
//
// ── HONESTY ──────────────────────────────────────────────────────────────────────────────────
//   The header ALWAYS states what this review covers and that it does NOT replace a human audit.
//   A finding's redacted preview/snippet (already truncated by the scanner that produced it) is
//   only HTML-escaped here — this module never re-derives, widens, or un-redacts a secret.
//   A failed/unavailable npm audit says so; it is never presented as "nothing found".
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   renderSecurityFindings never throws: a missing/malformed result, non-array finding lists, or
//   a failed audit all degrade to an honest "sem dados"/"indisponível" line — never a crash,
//   never a fabricated "tudo limpo".

// bucketOf(sev) — PURE. Folds every scanner's own severity vocabulary (secrets: critical/warning;
// xss: warning; csp: info/warning; npm-audit: critical/high/moderate/low/info) into the 3 review
// buckets. Never invents a MORE severe bucket than the source claimed.
function bucketOf(sev) {
  var s = String(sev == null ? '' : sev).toLowerCase();
  if (s === 'critical' || s === 'high') return 'critical';
  if (s === 'warning' || s === 'moderate') return 'warning';
  return 'info'; // low, info, unknown severity — never silently promoted
}

function defaultEsc(x) {
  return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// buildItems(result) — PURE, FAIL-SOFT. Reshapes the 4 scanner outputs into one flat list of
// { bucket, label, detail } rows (secrets, then xss, then csp, then the audit top rows). Any
// malformed slice of `result` is simply skipped — never throws.
function buildItems(result) {
  var items = [];
  var r = (result && typeof result === 'object') ? result : {};

  var secrets = Array.isArray(r.secrets) ? r.secrets : [];
  for (var i = 0; i < secrets.length; i++) {
    var s = secrets[i];
    if (!s || typeof s !== 'object') continue;
    items.push({
      bucket: bucketOf(s.severity),
      label: 'segredo · ' + String(s.type == null ? '?' : s.type),
      detail: String(s.path == null ? '?' : s.path) + ':' + String(s.line == null ? '?' : s.line) + ' — ' + String(s.preview == null ? '' : s.preview),
      id: typeof s.findingId === 'string' ? s.findingId : null,
      path: typeof s.path === 'string' ? s.path : null,
      fixable: false,
    });
  }

  var xss = Array.isArray(r.xss) ? r.xss : [];
  for (var j = 0; j < xss.length; j++) {
    var x = xss[j];
    if (!x || typeof x !== 'object') continue;
    items.push({
      bucket: bucketOf(x.severity == null ? 'warning' : x.severity),
      label: 'xss · ' + String(x.type == null ? '?' : x.type),
      detail: String(x.path == null ? '?' : x.path) + ':' + String(x.line == null ? '?' : x.line) + ' — ' + String(x.snippet == null ? '' : x.snippet),
      id: typeof x.findingId === 'string' ? x.findingId : null,
      path: typeof x.path === 'string' ? x.path : null,
      fixable: x.fixable === true,
    });
  }

  var csp = (r.csp && typeof r.csp === 'object') ? r.csp : null;
  var cspFindings = (csp && Array.isArray(csp.findings)) ? csp.findings : [];
  for (var k = 0; k < cspFindings.length; k++) {
    var c = cspFindings[k];
    if (!c || typeof c !== 'object') continue;
    items.push({
      bucket: bucketOf(c.severity == null ? 'info' : c.severity),
      label: 'csp · ' + String(c.type == null ? '?' : c.type),
      detail: String(c.detail == null ? '' : c.detail),
      id: typeof c.findingId === 'string' ? c.findingId : null,
      path: typeof c.path === 'string' ? c.path : null,
      fixable: c.fixable === true,
    });
  }

  var audit = (r.audit && typeof r.audit === 'object') ? r.audit : null;
  var top = (audit && audit.ok === true && Array.isArray(audit.top)) ? audit.top : [];
  for (var t = 0; t < top.length; t++) {
    var a = top[t];
    if (!a || typeof a !== 'object') continue;
    var fix = a.fixAvailable ? ' · correção disponível' : '';
    var range = a.range ? (' (' + String(a.range) + ')') : '';
    var pkg = a.packageRoot ? ('[' + String(a.packageRoot) + '] ') : '';
    items.push({
      bucket: bucketOf(a.severity),
      label: 'audit · ' + String(a.name == null ? '?' : a.name),
      detail: pkg + String(a.title || 'vulnerabilidade reportada') + range + fix,
      id: typeof a.findingId === 'string' ? a.findingId : null,
      path: typeof a.path === 'string' ? a.path : null,
      fixable: a.fixable === true,
      actionLabel: a.fixable === true ? 'aplicar fix npm compatível' : null,
    });
  }

  return items;
}

// renderSecurityActivity(thread, esc) — compact, local-only operational thread for scans and
// remediations. It is separate from a selected node's conversation because security findings may
// live anywhere in the workspace. The host owns every row and redacts/bounds it before display.
function renderSecurityActivity(thread, esc) {
  var e = (typeof esc === 'function') ? esc : defaultEsc;
  var rows = Array.isArray(thread) ? thread.slice(-60) : [];
  var html = '<div class="lp-sec-thread-hd">💬 thread do review</div>';
  if (!rows.length) return html + '<div class="lp-sec-meta">a atividade do scan e das correções aparece aqui.</div>';
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i] || {};
    var role = t.role === 'user' ? 'user' : (t.role === 'assistant' ? 'assistant' : 'activity');
    var who = role === 'user' ? 'Tu' : (role === 'assistant' ? 'Moo' : 'atividade');
    html += '<div class="lp-sec-thread-row lp-sec-thread-' + role + '"><b>' + who + '</b> · ' + e(String(t.text || ''))
      + (t.model ? (' <span>· ' + e(String(t.model)) + '</span>') : '') + '</div>';
  }
  return html;
}

// renderSecurityFindings(result, esc) — PURE, FAIL-SOFT. result shaped
// { secrets, xss, csp, audit, scannedFiles, error? }. esc is the webview's own HTML escaper
// (same contract as lp-presets.js's renderPresetsBarHTML) — defaults to a minimal escaper for
// the unit tests. Never throws.
function renderSecurityFindings(result, esc) {
  var e = (typeof esc === 'function') ? esc : defaultEsc;
  var HEADER = '<div class="lp-sec-hdr">🛡 Review local — cobre secret-scan, npm audit, CSP e XSS estático. O secret-scan, o CSP e o XSS correm 100% na tua máquina; o npm audit consulta o registry npm para comparar versões (nenhum código teu sai). Não substitui auditoria humana.</div>';

  if (result && typeof result === 'object' && result.error) {
    return HEADER + '<div class="lp-sec-meta lp-sec-err">falhou: ' + e(String(result.error)) + '</div>';
  }
  if (!result || typeof result !== 'object') {
    return HEADER + '<div class="lp-sec-meta">sem dados — corre o scan.</div>';
  }

  var scanned = (typeof result.scannedFiles === 'number' && isFinite(result.scannedFiles) && result.scannedFiles >= 0) ? result.scannedFiles : 0;
  var audit = (result.audit && typeof result.audit === 'object') ? result.audit : null;
  var auditLine = (audit && audit.ok === true)
    ? String(audit.honestSummary || '')
    : 'npm audit indisponível' + (audit && audit.reason ? (' — ' + String(audit.reason)) : ' — sem dados.');

  var items = buildItems(result);
  var groups = { critical: [], warning: [], info: [] };
  for (var i = 0; i < items.length; i++) groups[items[i].bucket].push(items[i]);

  var LABELS = { critical: 'Crítico', warning: 'Aviso', info: 'Info' };
  var ORDER = ['critical', 'warning', 'info'];
  var body = '';
  for (var g = 0; g < ORDER.length; g++) {
    var key = ORDER[g];
    var rows = groups[key];
    if (!rows.length) continue;
    var open = key === 'critical' || (groups.critical.length === 0 && key === 'warning') ? ' open' : '';
    body += '<details class="lp-sec-group lp-sec-' + key + '"' + open + '>';
    body += '<summary class="lp-sec-glabel">' + LABELS[key] + ' (' + rows.length + ')</summary>';
    for (var r2 = 0; r2 < rows.length; r2++) {
      var it = rows[r2];
      body += '<div class="lp-sec-item"><span class="lp-sec-label">' + e(it.label) + '</span>'
        + '<span class="lp-sec-detail">' + e(it.detail) + '</span>'
        + (it.id && it.path ? ('<span class="lp-sec-actions"><button type="button" class="lp-sec-action" data-security-open="' + e(it.id) + '">abrir</button>'
          + (it.fixable ? ('<button type="button" class="lp-sec-action lp-sec-fix" data-security-fix="' + e(it.id) + '">' + e(it.actionLabel || 'corrigir com o agente') + '</button>') : '') + '</span>') : '')
        + '</div>';
    }
    body += '</details>';
  }
  if (!items.length) body = result.coverage && result.coverage.complete === false
    ? '<div class="lp-sec-meta">nenhum finding nos scanners que concluíram — isto não equivale a aprovação porque a cobertura ficou incompleta.</div>'
    : '<div class="lp-sec-meta">nada encontrado pelos 4 scanners estáticos.</div>';

  // Chips and group headings describe the SAME visible rows. The host's aggregate counts remain
  // authoritative for the badge/gate, but npm metadata can contain more affected packages than
  // the bounded `audit.top` detail list. Mixing those two quantities made e.g. a chip say “3 info”
  // beside “Info (1)”. Reconcile explicitly instead of fabricating duplicate rows.
  var shownCounts = { critical: groups.critical.length, warning: groups.warning.length, info: groups.info.length, total: items.length };
  var rawCounts = result.counts && typeof result.counts === 'object' ? result.counts : null;
  function safeCount(value) {
    var n = Number(value);
    return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }
  var reportedCounts = rawCounts ? {
    critical: safeCount(rawCounts.critical), warning: safeCount(rawCounts.warning), info: safeCount(rawCounts.info), total: safeCount(rawCounts.total),
  } : shownCounts;
  if (rawCounts && reportedCounts.total !== reportedCounts.critical + reportedCounts.warning + reportedCounts.info) {
    reportedCounts.total = reportedCounts.critical + reportedCounts.warning + reportedCounts.info;
  }
  var chips = '<div class="lp-sec-counts" aria-label="linhas detalhadas abaixo"><span class="lp-sec-count critical">' + e(shownCounts.critical) + ' crítico</span><span class="lp-sec-count warning">' + e(shownCounts.warning) + ' aviso</span><span class="lp-sec-count info">' + e(shownCounts.info) + ' info</span></div>';
  var hiddenByBucket = {
    critical: Math.max(0, reportedCounts.critical - shownCounts.critical),
    warning: Math.max(0, reportedCounts.warning - shownCounts.warning),
    info: Math.max(0, reportedCounts.info - shownCounts.info),
  };
  var hiddenTotal = hiddenByBucket.critical + hiddenByBucket.warning + hiddenByBucket.info;
  var reconciliation = '';
  if (rawCounts && (reportedCounts.total !== shownCounts.total || hiddenTotal > 0)) {
    var hiddenParts = [];
    if (hiddenByBucket.critical) hiddenParts.push(hiddenByBucket.critical + ' crítico');
    if (hiddenByBucket.warning) hiddenParts.push(hiddenByBucket.warning + ' aviso');
    if (hiddenByBucket.info) hiddenParts.push(hiddenByBucket.info + ' info');
    reconciliation = '<div class="lp-sec-meta lp-sec-reconcile"><b>Totais do scan:</b> ' + e(reportedCounts.critical) + ' crítico · ' + e(reportedCounts.warning) + ' aviso · ' + e(reportedCounts.info) + ' info. '
      + 'A lista detalha ' + e(shownCounts.total) + ' de ' + e(reportedCounts.total) + ' finding' + (reportedCounts.total === 1 ? '' : 's') + '.'
      + (hiddenTotal ? (' +' + e(hiddenTotal) + ' contabilizado' + (hiddenTotal === 1 ? '' : 's') + ' apenas nos totais agregados (' + e(hiddenParts.join(' · ')) + '), incluindo metadata do npm.') : '')
      + '</div>';
  }
  var meta = '<div class="lp-sec-meta">' + scanned + ' ficheiro' + (scanned === 1 ? '' : 's') + ' analisados · ' + e(auditLine) + '</div>';
  var coverage = result.coverage && typeof result.coverage === 'object' ? result.coverage : {};
  var packageRoots = Array.isArray(coverage.packageRoots) ? coverage.packageRoots : [];
  var rootsText = packageRoots.length ? packageRoots.map(function (p) {
    return String((p && p.root) || '?') + ((p && p.ok) ? ' ✓' : (' ✕' + (p && p.reason ? (' (' + String(p.reason) + ')') : '')));
  }).join(' · ') : 'n/a';
  var coverageWarning = coverage.complete === false
    ? '<div class="lp-sec-err">⚠ cobertura incompleta — o Publish permanece bloqueado até um novo review completo.</div>'
    : '';
  var causes = [];
  if (coverage.gitScope === false) causes.push('Git: ' + String(coverage.gitReason || 'status indisponível'));
  if (coverage.scopeOverflow) causes.push('mais de 4 pacotes npm alterados/servidos; reduz o escopo ou revê por partes');
  if (coverage.truncated) {
    var tr = Array.isArray(coverage.truncatedReasons) ? coverage.truncatedReasons : [];
    causes.push('varredura truncada' + (tr.length ? (': ' + tr.join(' · ')) : ''));
  }
  if (Number(coverage.skippedUnreadable) > 0) {
    var ur = Array.isArray(coverage.unreadablePaths) ? coverage.unreadablePaths : [];
    causes.push(Number(coverage.skippedUnreadable) + ' caminho(s) sem leitura' + (ur.length ? (': ' + ur.join(' · ')) : ''));
  }
  if (coverage.npmAudit === false) causes.push('npm audit de produção não concluiu; verifica rede/registry e tenta Refresh');
  var causeHtml = causes.length ? '<div class="lp-sec-causes"><b>Porque ficou bloqueado:</b><ul>' + causes.map(function (c) { return '<li>' + e(c) + '</li>'; }).join('') + '</ul></div>' : '';
  var when = result.scannedAt ? new Date(result.scannedAt) : null;
  var whenText = when && !isNaN(when.getTime()) ? when.toLocaleString() : 'n/d';
  var report = '<details class="lp-sec-report"><summary>Relatório final · ' + e(result.reportId || 'sem id') + '</summary>'
    + '<div>executado: ' + e(whenText) + '</div><div>escopo: app servido + pacotes npm com alterações; código, env, public, manifests e locks. Testes, builds e vendored excluídos.</div>'
    + '<div>cobertura: secret ' + (coverage.secrets === false ? 'indisponível' : '✓') + ' · XSS ' + (coverage.xss === false ? 'indisponível' : '✓') + ' · CSP ' + (coverage.csp === false ? 'indisponível' : '✓') + ' · npm audit prod ' + (coverage.npmAudit ? '✓' : 'indisponível') + ' · paths Git ' + (coverage.gitScope ? '✓' : 'indisponível') + '</div>'
    + '<div>pacotes auditados: ' + e(rootsText) + '</div>'
    + '<div>Limite: análise estática local; não substitui pentest ou auditoria humana.</div></details>';
  var thread = '<div id="lp-security-thread" class="lp-sec-thread">' + renderSecurityActivity(result.thread, e) + '</div><div id="lp-security-fix-result"></div>';

  return HEADER + chips + reconciliation + meta + coverageWarning + causeHtml + body + report + thread;
}

module.exports = { renderSecurityFindings: renderSecurityFindings, renderSecurityActivity: renderSecurityActivity, bucketOf: bucketOf, buildItems: buildItems };
