#!/usr/bin/env node
'use strict';
// Wave 32 (Phase G) — statusline LINE 3 vector chip. Reads the cached snapshot
// `mooter vector status` writes (~/.mooter/cache/vector-snapshot.json). No
// network on the render path. Silent if no snapshot.

const fs = require('fs');
const path = require('path');
const os = require('os');

function statusLine() {
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'cache', 'vector-snapshot.json'), 'utf8'));
    const m = Array.isArray(snap.models) && snap.models[0];
    if (!m) return '';
    const dims = typeof m.dims === 'number' ? ` · ${m.dims}d` : '';
    return `🧭 ${String(m.name).replace(/:.*/, '')}${dims}`;
  } catch {
    return '';
  }
}

module.exports = { statusLine };
