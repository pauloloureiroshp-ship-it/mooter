#!/usr/bin/env node
/**
 * custom-status.js — Wave 53 Phase B.5 (pluggable status segment).
 *
 * Opt-in line-3 chip that lets a user append their own segment by dropping a
 * CommonJS module at ~/.mooter/statusline/custom.js exporting a `segment()`:
 *
 *   module.exports = { segment: () => `🎵 ${nowPlaying()}` };
 *   // also accepted: module.exports = () => '…'  ·  exports.default = { segment }
 *
 * The output is sanitized to a single line and clamped, so a misbehaving segment
 * can never blow up the statusline. Silent when the file is absent or returns a
 * non-string. `hidden_chips: ["custom"]` drops it.
 *
 * Trust model: this executes the user's OWN file on their OWN machine (no remote
 * fetch, no network). It is wrapped in try/catch and length-clamped; any throw or
 * bad return → ''. The statusline runs as a fresh process per render, so editing
 * custom.js takes effect on the next render (no require-cache staleness).
 */
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');

const MAX = 48; // clamp a custom segment so it can't dominate the line

function customPath() {
  const home = process.env.MOOTER_HOME;
  return home
    ? path.join(home, 'statusline', 'custom.js')
    : path.join(os.homedir(), '.mooter', 'statusline', 'custom.js');
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Accept the documented shapes (fn · {segment} · ESM-interop default). */
function resolveSegmentFn(mod) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.segment === 'function') return mod.segment;
  if (mod && mod.default) {
    if (typeof mod.default === 'function') return mod.default;
    if (typeof mod.default.segment === 'function') return mod.default.segment;
  }
  return null;
}

/** One line, trimmed, clamped — or '' for anything that is not a usable string. */
function sanitize(raw) {
  if (typeof raw !== 'string') return '';
  const one = raw.replace(/[\r\n\t]+/g, ' ').trim();
  if (!one) return '';
  return one.length > MAX ? one.slice(0, MAX - 1) + '…' : one;
}

function statusLine() {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('custom')) return '';
    const file = customPath();
    if (!fs.existsSync(file)) return '';
    const fn = resolveSegmentFn(require(file));
    if (!fn) return '';
    return sanitize(fn());
  } catch {
    return '';
  }
}

module.exports = { customPath, resolveSegmentFn, sanitize, statusLine };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
