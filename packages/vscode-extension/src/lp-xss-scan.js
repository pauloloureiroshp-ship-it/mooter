'use strict';
// lp-xss-scan.js — Review Security · LP-5. Static XSS-risk heuristic scanner.
//
// PURE analyzer: no fs, no net, no vscode. The host reads workspace files and hands their
// CONTENT in ({path, content}) — this module only regex-scans strings it is given.
//
// ── HONESTY ──────────────────────────────────────────────────────────────────────────────────
//   Every finding here is severity 'warning', never 'critical' — a static grep match is a
//   HEURISTIC ("this pattern is often unsafe"), not proof of an exploitable vulnerability.
//   dangerouslySetInnerHTML with a properly-sanitized value is not a bug; this scanner cannot
//   see the sanitizer, so it only ever raises a flag for a human to judge.
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   scanXss never throws on bad input — non-array files, non-object entries, non-string
//   path/content are skipped silently.

var PATTERNS = [
  { type: 'dangerously-set-inner-html', re: /dangerouslySetInnerHTML/ },
  { type: 'javascript-href', re: /href\s*=\s*["']javascript:/i },
  { type: 'eval-call', re: /\beval\s*\(/ },
  { type: 'new-function', re: /\bnew\s+Function\s*\(/ },
];

function clampStr(s, n) {
  var out = String(s == null ? '' : s);
  return out.length > n ? out.slice(0, n) : out;
}

// scanXss(files) — PURE, FAIL-SOFT. files = [{path, content}]. Returns
// [{path, line, type, severity:'warning', snippet}] — snippet is the trimmed matched line,
// bounded to 200 chars so a minified one-liner can never blow up the report. Never throws.
function scanXss(files) {
  var out = [];
  if (!Array.isArray(files)) return out;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || typeof f !== 'object') continue;
    var path = typeof f.path === 'string' ? f.path : '';
    var content = typeof f.content === 'string' ? f.content : '';
    if (!content) continue;
    var lines = content.split(/\r\n|\r|\n/);
    for (var ln = 0; ln < lines.length; ln++) {
      var line = lines[ln];
      if (!line) continue;
      for (var p = 0; p < PATTERNS.length; p++) {
        if (PATTERNS[p].re.test(line)) {
          out.push({
            path: path,
            line: ln + 1,
            type: PATTERNS[p].type,
            severity: 'warning',
            snippet: clampStr(line.trim(), 200),
          });
        }
      }
    }
  }
  return out;
}

module.exports = { scanXss: scanXss };
