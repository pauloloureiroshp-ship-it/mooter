#!/usr/bin/env node
'use strict';
// Wave 33 (B.2) — statusline LINE 3 EAGLE-3 chip. Reads the opt-in flag written
// by `mooter backend install vllm --eagle3` (~/.mooter/preferences.json
// vllm_eagle3). No network, no spawn. Silent when not enabled.

const fs = require('fs');
const path = require('path');
const os = require('os');

function statusLine() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return prefs && prefs.vllm_eagle3 === true ? '⚡ EAGLE-3' : '';
  } catch {
    return '';
  }
}

module.exports = { statusLine };
