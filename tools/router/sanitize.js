#!/usr/bin/env node
// @ts-check
/**
 * sanitize.js — shared input sanitization for the Mooter router.
 *
 * Two pure functions, no dependencies:
 *   sanitizeText(input)  — strips HTML tags, `javascript:` URIs, inline
 *                          event handlers, and NUL bytes. Returns a string.
 *   sanitizeUrl(input)   — only allows http:, https:, mailto: URIs. Rejects
 *                          data:, javascript:, file:, vbscript:, etc.
 *                          Returns the original URL on allow, or null on
 *                          reject.
 *
 * Used by:
 *   - savings-tracker.js (inbound JSON on POST /decision, /arbiter-event)
 *   - hub/routes/delta.js, events.js, heartbeat.js (mirrored via copy — the
 *     CF Worker can't require() host files, so the file is duplicated at
 *     hub/lib/sanitize.js with identical semantics)
 *
 * CCA Criterion #9 (Input Sanitization) — protects against XSS payloads
 * reflecting back in responses, injection via event handlers, and URL
 * protocol-based exploits in rendered dashboards.
 *
 * Design: fail-closed. Unknown protocols → null. Unknown HTML → stripped.
 * The caller can always fall back to a safe default when null is returned.
 */

'use strict';

// ── sanitizeText ────────────────────────────────────────────────────────

// Keep in sync with hub/lib/sanitize.js if edited.
const HTML_TAG_RE = /<[^>]*>/g;
// Event handlers anywhere in the string (on<word>=...). Belt-and-braces —
// the HTML_TAG_RE already removes them when wrapped in <...>, this catches
// raw `onerror=alert(1)` pastes that aren't in a tag.
const EVENT_HANDLER_RE = /\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
// javascript: / vbscript: / data: URIs inline in text.
const DANGEROUS_PROTO_RE = /\b(?:javascript|vbscript|data|file)\s*:/gi;
// Control chars 0x00-0x1F except \t (0x09), \n (0x0A), \r (0x0D).
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strip untrusted HTML + inline handlers + control bytes from a string.
 * Returns empty string for non-string input.
 *
 * @param {unknown} input
 * @param {{ maxLength?: number }} [opts]
 * @returns {string}
 */
function sanitizeText(input, opts) {
  if (input === null || input === undefined) return '';
  const s = typeof input === 'string' ? input : String(input);
  const max = (opts && Number.isInteger(opts.maxLength) && opts.maxLength > 0)
    ? opts.maxLength
    : 4096;
  let out = s;
  out = out.replace(HTML_TAG_RE, '');
  out = out.replace(EVENT_HANDLER_RE, '');
  out = out.replace(DANGEROUS_PROTO_RE, '');
  out = out.replace(CONTROL_CHAR_RE, '');
  // Trim runaway whitespace but preserve newlines for multi-line fields.
  out = out.replace(/[\u0020\u00A0]{2,}/g, ' ');
  if (out.length > max) out = out.slice(0, max);
  return out;
}

// ── sanitizeUrl ─────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Allow-list URL validator. Returns the URL unchanged if safe, or null.
 *
 * @param {unknown} input
 * @returns {string | null}
 */
function sanitizeUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  // WHATWG URL parser handles the edge cases (encoding, fragment, host).
  try {
    const u = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

// ── sanitizeJson ────────────────────────────────────────────────────────

/**
 * Recursively sanitize every string value inside a JSON object. Arrays
 * and nested objects are traversed. Non-string leaves are returned
 * unchanged. Useful for cleaning third-party payloads before logging.
 *
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function sanitizeJson(value, depth) {
  const d = typeof depth === 'number' ? depth : 0;
  if (d > 32) return null; // runaway protection
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeJson(v, d + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Key sanitization: reject __proto__, constructor, prototype.
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeJson(v, d + 1);
    }
    return out;
  }
  return null;
}

module.exports = {
  sanitizeText,
  sanitizeUrl,
  sanitizeJson,
  ALLOWED_PROTOCOLS,
};

// ── Self-test (CLI) ─────────────────────────────────────────────────────

if (require.main === module) {
  /** @type {Array<{ name: string, pass: boolean }>} */
  const results = [];
  const assert = (/** @type {string} */ name, /** @type {boolean} */ cond) => {
    results.push({ name, pass: cond });
    process.stdout.write(`  [${cond ? 'PASS' : 'FAIL'}] ${name}\n`);
  };

  // sanitizeText
  assert('strip-script-tag',
    sanitizeText('<script>alert(1)</script>hello') === 'alert(1)hello');
  assert('strip-onerror',
    sanitizeText('<img src=x onerror=alert(1)>') === '');
  assert('strip-javascript-proto',
    !/javascript:/i.test(sanitizeText('click javascript:alert(1)')));
  assert('passthrough-plain-text',
    sanitizeText('Hello world') === 'Hello world');
  assert('enforce-max-length',
    sanitizeText('x'.repeat(5000), { maxLength: 100 }).length === 100);

  // sanitizeUrl
  assert('allow-https', sanitizeUrl('https://example.com') === 'https://example.com');
  assert('allow-mailto', sanitizeUrl('mailto:a@b.com') === 'mailto:a@b.com');
  assert('reject-javascript', sanitizeUrl('javascript:alert(1)') === null);
  assert('reject-data', sanitizeUrl('data:text/html,<script>') === null);
  assert('reject-file', sanitizeUrl('file:///etc/passwd') === null);
  assert('reject-empty', sanitizeUrl('') === null);
  assert('reject-non-string', sanitizeUrl(null) === null);
  assert('reject-malformed', sanitizeUrl('not a url') === null);

  // sanitizeJson
  const clean = sanitizeJson({
    name: '<script>alert(1)</script>x',
    age: 42,
    nested: { evil: 'javascript:x' },
    arr: ['<b>a</b>', 'b'],
  });
  assert('json-strips-tags',
    /** @type {any} */ (clean).name === 'alert(1)x');
  assert('json-preserves-numbers',
    /** @type {any} */ (clean).age === 42);
  assert('json-drops-proto',
    (() => {
      const c = /** @type {any} */ (sanitizeJson({ __proto__: { poison: 1 }, safe: 'x' }));
      return !('__proto__' in c) || c.__proto__.poison !== 1;
    })());

  const pass = results.filter((r) => r.pass).length;
  const total = results.length;
  process.stdout.write(`\nsanitize self-test: ${pass}/${total} passed\n`);
  process.exit(pass === total ? 0 : 1);
}
