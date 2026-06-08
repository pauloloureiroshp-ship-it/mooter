#!/usr/bin/env node
'use strict';
// Wave 32 (Phase NEW2) — statusline LINE 3 effort chip. Opt-in line 3 only, so
// lines 1-2 stay byte-identical. Reads ~/.mooter/effort.json (written by
// `mooter effort`). Silent unless an above-baseline mode is active, so the line
// stays quiet for the default mode.

const fs = require('fs');
const path = require('path');
const os = require('os');

function readMode() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'effort.json'), 'utf8'));
    return typeof raw.mode === 'string' ? raw.mode : null;
  } catch {
    return null;
  }
}

/** Chip text or '' (no chip). ultramoo → 🐄, high → ⚡, others silent. */
function statusLine() {
  const mode = readMode();
  if (mode === 'ultramoo') return '🐄 ultramoo';
  if (mode === 'high') return '⚡ effort:high';
  return '';
}

module.exports = { statusLine, readMode };
