'use strict';
// lp-secret-scan.js — Review Security · LP-5. Static secret detector.
//
// PURE analyzer: no fs, no net, no vscode. The host reads workspace files and hands their
// CONTENT in ({path, content}) — this module only regex-scans strings it is given and returns
// findings. Zero code is ever transmitted anywhere; everything runs local, $0.
//
// ── HONESTY / REDACTION ─────────────────────────────────────────────────────────────────────
//   A finding's `preview` NEVER carries the full secret — only the first 4 characters + '…'.
//   Even a 1-3 char "secret" is still truncated through the same redact() path (never grown
//   back to full length), so there is exactly one code path that can leak a secret, and it
//   caps at 4 chars by construction.
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   scanSecrets never throws: non-array input, non-object entries, non-string path/content are
//   all skipped silently and the function returns whatever findings it could safely compute
//   (empty array in the worst case).

// Specific, high-confidence secret shapes. Each real key/token/PEM header is 'critical' —
// finding one of these is proof, not a heuristic guess.
var PATTERNS = [
  { type: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { type: 'github-token', re: /ghp_[A-Za-z0-9]{36}/, severity: 'critical' },
  { type: 'stripe-live-key', re: /sk_live_[A-Za-z0-9]{24,}/, severity: 'critical' },
  { type: 'pem-private-key', re: /-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----/, severity: 'critical' },
];

// Generic assignment of a *_API_KEY / *_SECRET / *_PASSWORD / *_TOKEN-shaped name to a
// non-empty value — a heuristic (could be a placeholder), so this one is 'warning' by default.
// Prefix must be underscore-separated (SESSION_TOKEN, AWS_SECRET_ACCESS_KEY, DB_PASSWORD, ...)
// so it never fires mid-word (TOKENIZER=, NOTOKEN=).
var GENERIC_RE = /\b(?:[A-Za-z0-9]+_)*(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*[:=]\s*(['"]?)([^\s'"]+)\1/i;

// isSensitivePath(path) — PURE. True when a file lives under a `public/` directory or is an
// `.env`-family file (.env, .env.local, .env.production, ...). Any secret found in such a file
// is escalated to 'critical' regardless of its own default severity — a generic-looking
// assignment shipped in a publicly-served asset or a real env file is never "just a warning".
function isSensitivePath(path) {
  var p = String(path == null ? '' : path);
  if (!p) return false;
  if (/(^|[\\/])public([\\/]|$)/i.test(p)) return true;
  var base = p.split(/[\\/]/).pop() || '';
  return /^\.env(\..*)?$/i.test(base);
}

// redact(secret) — PURE. First 4 characters + an ellipsis. Never returns more of the secret
// than that, even when the secret itself is 4 characters or shorter.
function redact(secret) {
  var s = String(secret == null ? '' : secret);
  if (!s) return '';
  return s.slice(0, 4) + '…';
}

// scanSecrets(files) — PURE, FAIL-SOFT. files = [{path, content}]. Returns
// [{path, line, type, severity, preview}], one entry per match, most-natural (file, then
// line) order. Never throws.
function scanSecrets(files) {
  var out = [];
  if (!Array.isArray(files)) return out;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || typeof f !== 'object') continue;
    var path = typeof f.path === 'string' ? f.path : '';
    var content = typeof f.content === 'string' ? f.content : '';
    if (!content) continue;
    var sensitive = isSensitivePath(path);
    var lines = content.split(/\r\n|\r|\n/);
    for (var ln = 0; ln < lines.length; ln++) {
      var line = lines[ln];
      if (!line) continue;
      for (var p = 0; p < PATTERNS.length; p++) {
        var pat = PATTERNS[p];
        var m = pat.re.exec(line);
        if (m) {
          out.push({
            path: path,
            line: ln + 1,
            type: pat.type,
            severity: sensitive ? 'critical' : pat.severity,
            preview: redact(m[0]),
          });
        }
      }
      var g = GENERIC_RE.exec(line);
      if (g && g[2]) {
        out.push({
          path: path,
          line: ln + 1,
          type: 'generic-secret-assignment',
          severity: sensitive ? 'critical' : 'warning',
          preview: redact(g[2]),
        });
      }
    }
  }
  return out;
}

module.exports = {
  scanSecrets: scanSecrets,
  isSensitivePath: isSensitivePath,
};
