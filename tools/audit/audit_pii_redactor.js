#!/usr/bin/env node
'use strict';

// audit_pii_redactor.js — Wave 23 common utility.
//
// The self-audit corpus is a committed artifact (audit/corpus.jsonl). It is built
// from REAL file summaries, so anything the summarizer happens to echo — absolute
// home paths, the user's name/email, an API key pasted in a doc, a telemetry secret
// — must be stripped before it lands on disk. This module is the single chokepoint:
// every writer (corpus / validation / lora export) pipes string values through
// `redact()` first, and the closure guard greps the corpus for `hasPII()` survivors.
//
// Design: conservative, deterministic, allowlist-free. We redact known-shaped
// secrets (token prefixes, JWTs, AWS keys, env-assignment values) and the user's
// own identifiers. We deliberately do NOT blanket-redact every long hex string —
// the audit legitimately references the classify.js sha256 (7b01eb86…), and a
// 64-char digest in a summary is not PII. Secrets are caught by their assignment
// context or prefix, not by entropy.

// User identifiers (this machine / this user). Order matters: longest first.
const USER_PATHS = [
  { re: /\/mnt\/c\/Users\/Paulo Loureiro/g, to: '<USER_DIR>' },
  { re: /\/home\/paulo/g, to: '<HOME>' },
  { re: /C:\\Users\\Paulo Loureiro/g, to: '<USER_DIR>' },
];

const IDENTIFIERS = [
  { re: /paulo\.loureiro\.shp@gmail\.com/gi, to: '<EMAIL>' },
  { re: /\bPaulo Loureiro\b/g, to: '<USER>' },
];

// Generic email (after the known one is handled, so we don't double-touch).
const EMAIL_RE = { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, to: '<EMAIL>' };

// Known secret/token SHAPES. These are unambiguous — a string matching one of these
// is a credential regardless of context.
const SECRET_SHAPES = [
  { re: /sk-ant-[A-Za-z0-9_-]{20,}/g, to: '<ANTHROPIC_KEY>' },
  { re: /sk-[A-Za-z0-9]{20,}/g, to: '<API_KEY>' },
  { re: /gh[posu]_[A-Za-z0-9]{20,}/g, to: '<GH_TOKEN>' },
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, to: '<GH_TOKEN>' },
  { re: /AKIA[0-9A-Z]{16}/g, to: '<AWS_KEY>' },
  { re: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, to: '<JWT>' },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, to: '<SLACK_TOKEN>' },
];

// Secret ASSIGNMENTS — `SECRET=value`, `"apiKey": "value"`, `TOKEN: value`.
// Redacts the VALUE, keeps the key so the summary stays legible.
const SECRET_KEY = '(?:[A-Za-z0-9_]*(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD|PASSWD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET)[A-Za-z0-9_]*)';
const ASSIGN_SHAPES = [
  // KEY=value  /  KEY = value   (env / shell)
  { re: new RegExp(`(${SECRET_KEY})(\\s*=\\s*)(['"]?)([^\\s'"#]{6,})\\3`, 'gi'), to: (_m, k, eq, q) => `${k}${eq}${q}<REDACTED>${q}` },
  // "key": "value"   (json / object literal)
  { re: new RegExp(`(['"]?${SECRET_KEY}['"]?\\s*:\\s*)(['"])([^'"]{6,})\\2`, 'gi'), to: (_m, pre, q) => `${pre}${q}<REDACTED>${q}` },
];

/**
 * Redact PII / secrets from a single string. Pure, deterministic, never throws.
 * Non-strings pass through unchanged (callers may hand us numbers/null).
 */
function redact(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  for (const { re, to } of SECRET_SHAPES) out = out.replace(re, to);
  for (const { re, to } of ASSIGN_SHAPES) out = out.replace(re, to);
  for (const { re, to } of IDENTIFIERS) out = out.replace(re, to);
  out = out.replace(EMAIL_RE.re, EMAIL_RE.to);
  for (const { re, to } of USER_PATHS) out = out.replace(re, to);
  return out;
}

/**
 * Deep-redact every string value in a JSON-shaped object/array. Returns a new
 * structure; does not mutate the input. Keys are left untouched (they are schema,
 * not data).
 */
function redactObject(obj) {
  if (typeof obj === 'string') return redact(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = redactObject(obj[k]);
    return out;
  }
  return obj;
}

/**
 * True if the string STILL contains a recognizable PII / secret marker AFTER it
 * should have been redacted. Used by the closure guard to fail the build if any
 * corpus line leaks. Checks the raw identifiers + secret shapes — NOT the
 * `<REDACTED>` placeholders (those are the safe output).
 */
function hasPII(value) {
  if (typeof value !== 'string') return false;
  const probes = [
    /\/home\/paulo/,
    /\/mnt\/c\/Users\/Paulo Loureiro/,
    /C:\\Users\\Paulo Loureiro/,
    /paulo\.loureiro\.shp@gmail\.com/i,
    /\bPaulo Loureiro\b/,
    ...SECRET_SHAPES.map((s) => s.re.source).map((src) => new RegExp(src)),
  ];
  return probes.some((re) => re.test(value));
}

module.exports = { redact, redactObject, hasPII };

// CLI: `node audit_pii_redactor.js <file>` → scans a JSONL/text file, prints any
// lines where hasPII() survives (for the closure guard). Exit 1 if leaks found.
if (require.main === module) {
  const fs = require('fs');
  const target = process.argv[2];
  if (!target) { console.error('usage: audit_pii_redactor.js <file>'); process.exit(2); }
  let leaks = 0;
  const raw = fs.readFileSync(target, 'utf8');
  raw.split('\n').forEach((line, i) => {
    if (line.trim() && hasPII(line)) { leaks += 1; console.error(`PII@${target}:${i + 1}`); }
  });
  if (leaks) { console.error(`FAIL: ${leaks} PII leak(s)`); process.exit(1); }
  console.log(`OK: no PII in ${target}`);
  process.exit(0);
}
