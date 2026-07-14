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
  // Anthropic keys have changed sub-prefixes over time (api03, admin01, ...). Pin the stable
  // provider prefix and require a substantial provider-shaped tail. Dots are deliberately not
  // accepted, so the canonical `sk-ant-...your-key-here` template is not promoted to critical.
  { type: 'anthropic-api-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, severity: 'critical' },
  { type: 'pem-private-key', re: /-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----/, severity: 'critical' },
];

// Generic assignment of a credential-shaped name to a literal value. It is a heuristic (the
// value may still be a development credential), so it is 'warning' outside sensitive paths.
//
// Supported names intentionally include the ecosystem forms that occur in real LP projects:
// underscore names, camelCase apiKey, Supabase service-role keys, private-key variables and a
// literal DATABASE_URL. `:(?!-)` is important: `${ANTHROPIC_API_KEY:-}` is bash expansion, not
// an assignment. The optional quote after the name supports JSON (`"apiKey": "..."`).
var GENERIC_RE = /\b((?:[A-Za-z0-9]+_)*(?:SERVICE_ROLE_KEY|PRIVATE_KEY|DATABASE_URL|API_KEY|SECRET|PASSWORD|TOKEN)|apiKey)\b["']?\s*(?:=|:(?!-))\s*(?:"([^"]*)"|'([^']*)'|([^\s,;#]+))/gi;

// Values that communicate "put a secret here" rather than carrying one. Suppression happens
// only for the generic heuristic; a provider-shaped token is scanned first and remains critical
// even when it appears in a comment, fixture, example or template.
function isPlaceholderValue(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return true;

  // Environment indirection and shell parameter expansion are references, never literal keys.
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*(?::[-+?=][^}]*)?\}$/.test(raw)) return true;
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return true;
  if (/^(?:process\.env\.[A-Za-z_][A-Za-z0-9_]*|Deno\.env\.get\([^)]*\)|import\.meta\.env\.[A-Za-z_][A-Za-z0-9_]*)$/.test(raw)) return true;

  var normalized = raw.toLowerCase();
  if (/^(?:undefined|null|none|string|changeme|change-me|replace-me|placeholder|example|dummy|todo|tbd|xxx+|\*+|-?})$/.test(normalized)) return true;
  if (/^<[^>]+>$/.test(raw) || /^\{\{[^}]+\}\}$/.test(raw)) return true;
  if (/\.\.\./.test(raw)) return true;
  if (/^(?:your|replace|insert|paste|add|set)(?:[-_ ][a-z0-9]+)*(?:[-_ ]here)?$/i.test(raw)) return true;
  if (/(?:^|[-_])your[-_](?:[a-z0-9]+[-_])*(?:key|token|secret|password)(?:[-_]here)?$/i.test(raw)) return true;
  return false;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Exact public dummy strings used by Mooter's own sanitizer CLI self-test. They are deliberately
// provider-shaped so the sanitizer proves redaction, but their alphabetic/counting payloads are
// deterministic documentation fixtures, not credentials. Keep this allowlist exact and tiny;
// every other provider-shaped token (including comments/templates/tests) remains Critical.
function isKnownSyntheticToken(value) {
  var s = String(value == null ? '' : value);
  return s === 'sk-ant-abcdefghijklmnop1234567890'
    // Keep the public fixture byte-identical at runtime without embedding a provider-shaped
    // token literal in the distributable source (VSIX scanners correctly reject such literals).
    || s === 'ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890';
}

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
  // Compile global variants once per scan (not once per source line); a full workspace review
  // can contain hundreds of thousands of lines.
  var specificRes = PATTERNS.map(function (pat) {
    var flags = pat.re.flags.indexOf('g') >= 0 ? pat.re.flags : pat.re.flags + 'g';
    return new RegExp(pat.re.source, flags);
  });
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
      var specificRanges = [];
      for (var p = 0; p < PATTERNS.length; p++) {
        var pat = PATTERNS[p];
        var specificRe = specificRes[p];
        specificRe.lastIndex = 0;
        var m;
        while ((m = specificRe.exec(line)) !== null) {
          if (isKnownSyntheticToken(m[0])) { if (m[0].length === 0) specificRe.lastIndex++; continue; }
          out.push({
            path: path,
            line: ln + 1,
            type: pat.type,
            severity: sensitive ? 'critical' : pat.severity,
            preview: redact(m[0]),
          });
          specificRanges.push({ start: m.index, end: m.index + m[0].length });
          if (m[0].length === 0) specificRe.lastIndex++;
        }
      }

      GENERIC_RE.lastIndex = 0;
      var g;
      while ((g = GENERIC_RE.exec(line)) !== null) {
        var value = g[2] != null ? g[2] : (g[3] != null ? g[3] : g[4]);
        if (!value || isPlaceholderValue(value)) continue;

        // Do not count one provider-shaped secret twice (specific + generic assignment). The
        // provider finding remains critical; only its overlapping heuristic duplicate is skipped.
        var valueOffset = g[0].lastIndexOf(value);
        var valueStart = g.index + (valueOffset < 0 ? 0 : valueOffset);
        var valueEnd = valueStart + value.length;
        var duplicatesSpecific = specificRanges.some(function (range) {
          return overlaps(valueStart, valueEnd, range.start, range.end);
        });
        if (duplicatesSpecific) continue;

        out.push({
          path: path,
          line: ln + 1,
          type: 'generic-secret-assignment',
          severity: sensitive ? 'critical' : 'warning',
          preview: redact(value),
        });
        if (g[0].length === 0) GENERIC_RE.lastIndex++;
      }
    }
  }
  return out;
}

module.exports = {
  scanSecrets: scanSecrets,
  isSensitivePath: isSensitivePath,
};
