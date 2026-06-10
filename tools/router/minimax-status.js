#!/usr/bin/env node
'use strict';
// Wave 33 (B.3) — statusline LINE 3 MiniMax M3 chip. Reads the watcher state
// (~/.mooter/minimax_state.json). Prompts install only when weights are
// available but not yet installed. No network, no spawn. Silent otherwise.

const fs = require('fs');
const path = require('path');
const os = require('os');

function statusLine() {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'minimax_state.json'), 'utf8'));
    if (st && st.available === true && st.installed !== true) {
      return '🆕 MiniMax M3 ready — mooter minimax-m3 install';
    }
    return '';
  } catch {
    return '';
  }
}

module.exports = { statusLine };
