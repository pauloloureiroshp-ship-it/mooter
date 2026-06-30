#!/usr/bin/env node
// ledger-prov.js — Moo Ledger Spine L0: mechanical provenance primitives.
//
// Two PURE helpers the ledger uses to make every moo artefact content-addressed
// and dedupe-able:
//
//   canonicalize(obj) → a STABLE JSON string (object keys sorted recursively,
//                       array order preserved). The same logical value always
//                       serializes to the same bytes, regardless of key order.
//   provHash(io)      → SHA-256 hex over canonicalize(io). The content address.
//
// Doctrine (MOO_LEDGER_AND_ORCHESTRATION.md): provenance is MECHANICAL — the
// runner stamps agent/model/tier/ts/hash; the LLM never writes its own lineage.
// These helpers are how the runner stamps it. Deliberately NOT inside
// classify.js (frozen) — a standalone, dependency-light module.
//
// Pure, deterministic, no fs, no clock. Throws only on a cyclic object (an
// invalid I/O payload); callers wrap in try/catch under the never-throws doctrine.

'use strict';

const crypto = require('crypto');

// Recursively normalize a JSON-able value into a canonical form:
//  • objects   → a new object with keys inserted in sorted order
//  • arrays    → element order preserved (it is semantically significant)
//  • primitives→ returned as-is
// `undefined` properties are dropped (JSON.stringify drops them anyway); this
// keeps `{a:1, b:undefined}` and `{a:1}` hashing identically.
function _sort(v) {
  if (Array.isArray(v)) return v.map(_sort);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const sv = _sort(v[k]);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  return v;
}

// Stable JSON: same logical value → identical bytes. Always returns a string
// (top-level undefined → "null") so provHash never feeds undefined to the hash.
function canonicalize(obj) {
  const s = JSON.stringify(_sort(obj));
  return s === undefined ? 'null' : s;
}

// Content address of an I/O payload: SHA-256 (hex) over its canonical form.
function provHash(io) {
  return crypto.createHash('sha256').update(canonicalize(io), 'utf8').digest('hex');
}

module.exports = { canonicalize, provHash };
