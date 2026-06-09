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
    // Wave 48 (1.3) — `nomic-embed-text · 768d` was cryptic. Label it as the
    // Pastor's embedding model + drop the `-embed-text` suffix → `🧭 embed nomic 768d`.
    const dims = typeof m.dims === 'number' ? ` ${m.dims}d` : '';
    const short = String(m.name).replace(/:.*/, '').replace(/-embed(-text)?$/, '');
    return `🧭 embed ${short}${dims}`;
  } catch {
    return '';
  }
}

module.exports = { statusLine };
