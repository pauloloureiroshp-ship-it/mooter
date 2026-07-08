'use strict';
// lp-csp-check.js — Review Security · LP-5. Static Content-Security-Policy heuristic checker.
//
// PURE analyzer: no fs, no net, no vscode. The host reads the next.config(.js/.ts/.mjs) file and
// hands its text CONTENT in — this module only does string analysis on that text.
//
// ── HONESTY ──────────────────────────────────────────────────────────────────────────────────
//   A missing CSP header is not itself a vulnerability (many apps rely on other layers), so it
//   is reported as 'info', not 'warning'/'critical' — an honest observation, not an alarm.
//   'unsafe-inline' / 'unsafe-eval' / a bare '*' in script-src are real weakenings of a CSP that
//   IS present, so those are 'warning'. This module never claims to have PROVEN an exploit —
//   it is pure string analysis of one config file, not a runtime CSP audit.
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   checkCsp never throws — non-string input is treated as an empty file (→ missing-csp).

// scriptSrcTokens(text) — PURE. Best-effort extraction of the script-src directive's token
// list from a next.config text blob. Stops at `;` (next directive), a double quote or a
// backtick (the JS string/template literal wrapping the whole header value), or a newline —
// but keeps single quotes, since CSP source keywords are written 'self', 'unsafe-inline', etc.
function scriptSrcTokens(text) {
  var m = /script-src([^;"`\n]*)/i.exec(text);
  if (!m) return null;
  return m[1].split(/\s+/).filter(function (t) { return t.length > 0; });
}

// checkCsp(nextConfigContent) — PURE, FAIL-SOFT. Returns { hasCsp, findings }.
function checkCsp(nextConfigContent) {
  var text = typeof nextConfigContent === 'string' ? nextConfigContent : '';
  var findings = [];

  var hasCsp = /Content-Security-Policy/i.test(text);
  if (!hasCsp) {
    findings.push({
      type: 'missing-csp',
      severity: 'info',
      detail: 'Nenhum header Content-Security-Policy encontrado no next.config — observação honesta, não prova de vulnerabilidade.',
    });
    return { hasCsp: false, findings: findings };
  }

  if (/unsafe-inline/i.test(text)) {
    findings.push({
      type: 'unsafe-inline',
      severity: 'warning',
      detail: "CSP inclui 'unsafe-inline' — permite scripts/estilos inline, o que enfraquece a proteção contra XSS.",
    });
  }
  if (/unsafe-eval/i.test(text)) {
    findings.push({
      type: 'unsafe-eval',
      severity: 'warning',
      detail: "CSP inclui 'unsafe-eval' — permite eval()/new Function(), o que enfraquece a proteção contra XSS.",
    });
  }

  var tokens = scriptSrcTokens(text);
  if (tokens) {
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '*') {
        findings.push({
          type: 'script-src-wildcard',
          severity: 'warning',
          detail: "script-src inclui um '*' isolado — permite carregar scripts de qualquer origem.",
        });
        break;
      }
    }
  }

  return { hasCsp: true, findings: findings };
}

module.exports = { checkCsp: checkCsp };
