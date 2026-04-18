// @ts-check
/**
 * hub/lib/sanitize.js — input sanitization for the Mooter hub (Cloudflare Worker).
 *
 * MIRROR of tools/router/sanitize.js. Duplicated because CF Workers cannot
 * require() host-project files. Keep the two in sync — same function names,
 * same semantics, same regex sources.
 *
 * CCA Criterion #9 (Input Sanitization) — strips XSS payloads, dangerous
 * URL protocols, and prototype-pollution keys from untrusted event bodies
 * before they hit D1 or propagate to downstream consumers.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const EVENT_HANDLER_RE = /\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const DANGEROUS_PROTO_RE = /\b(?:javascript|vbscript|data|file)\s*:/gi;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * @param {unknown} input
 * @param {{ maxLength?: number }} [opts]
 * @returns {string}
 */
export function sanitizeText(input, opts) {
  if (input === null || input === undefined) return '';
  const s = typeof input === 'string' ? input : String(input);
  const max = (opts && Number.isInteger(opts.maxLength) && opts.maxLength > 0)
    ? /** @type {number} */ (opts.maxLength)
    : 4096;
  let out = s;
  out = out.replace(HTML_TAG_RE, '');
  out = out.replace(EVENT_HANDLER_RE, '');
  out = out.replace(DANGEROUS_PROTO_RE, '');
  out = out.replace(CONTROL_CHAR_RE, '');
  out = out.replace(/[\u0020\u00A0]{2,}/g, ' ');
  if (out.length > max) out = out.slice(0, max);
  return out;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function sanitizeUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  try {
    const u = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitizeJson(value, depth) {
  const d = typeof depth === 'number' ? depth : 0;
  if (d > 32) return null;
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
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = sanitizeJson(v, d + 1);
    }
    return out;
  }
  return null;
}
