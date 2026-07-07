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
    });
  }

  var audit = (r.audit && typeof r.audit === 'object') ? r.audit : null;
  var top = (audit && audit.ok === true && Array.isArray(audit.top)) ? audit.top : [];
  for (var t = 0; t < top.length; t++) {
    var a = top[t];
    if (!a || typeof a !== 'object') continue;
    var fix = a.fixAvailable ? ' · correção disponível' : '';
    var range = a.range ? (' (' + String(a.range) + ')') : '';
    items.push({
      bucket: bucketOf(a.severity),
      label: 'audit · ' + String(a.name == null ? '?' : a.name),
      detail: String(a.title || 'vulnerabilidade reportada') + range + fix,
    });
  }

  return items;
}

// renderSecurityFindings(result, esc) — PURE, FAIL-SOFT. result shaped
// { secrets, xss, csp, audit, scannedFiles, error? }. esc is the webview's own HTML escaper
// (same contract as lp-presets.js's renderPresetsBarHTML) — defaults to a minimal escaper for
// the unit tests. Never throws.
function renderSecurityFindings(result, esc) {
  var e = (typeof esc === 'function') ? esc : defaultEsc;
  var HEADER = '<div class="lp-sec-hdr">🛡 Review local — cobre secret-scan, npm audit, CSP e XSS estático. Não substitui auditoria humana.</div>';

  if (result && typeof result === 'object' && result.error) {
    return HEADER + '<div class="lp-sec-meta lp-sec-err">falhou: ' + e(String(result.error)) + '</div>';
  }
  if (!result || typeof result !== 'object') {
    return HEADER + '<div class="lp-sec-meta">sem dados — corre o scan.</div>';
  }

  var scanned = (typeof result.scannedFiles === 'number' && isFinite(result.scannedFiles) && result.scannedFiles >= 0) ? result.scannedFiles : 0;
  var audit = (result.audit && typeof result.audit === 'object') ? result.audit : null;
  var auditLine = (audit && audit.ok === true) ? String(audit.honestSummary || '') : 'npm audit indisponível — sem dados.';

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
    body += '<div class="lp-sec-group lp-sec-' + key + '">';
    body += '<div class="lp-sec-glabel">' + LABELS[key] + ' (' + rows.length + ')</div>';
    for (var r2 = 0; r2 < rows.length; r2++) {
      var it = rows[r2];
      body += '<div class="lp-sec-item"><span class="lp-sec-label">' + e(it.label) + '</span>'
        + '<span class="lp-sec-detail">' + e(it.detail) + '</span></div>';
    }
    body += '</div>';
  }
  if (!items.length) body = '<div class="lp-sec-meta">nada encontrado pelos 4 scanners estáticos.</div>';

  var meta = '<div class="lp-sec-meta">' + scanned + ' ficheiro' + (scanned === 1 ? '' : 's') + ' analisados · ' + e(auditLine) + '</div>';

  return HEADER + meta + body;
}

module.exports = { renderSecurityFindings: renderSecurityFindings, bucketOf: bucketOf };
