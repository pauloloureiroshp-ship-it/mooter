#!/usr/bin/env node
/**
 * terminal-name-status.js — Wave 33.5 Block A.7.
 *
 * Opt-in line-3 chip naming the current terminal/worktree, e.g. `🪟 wave33_5-historic`.
 * Resolution chain (first hit wins), all cheap enough for the ≤10ms render budget
 * (env reads + at most one small file read — NO git subprocess):
 *   1. $MOOTER_TERMINAL_NAME                (explicit per-terminal env var) — Wave 33.6
 *   2. preferences.json `terminal_label`  (set via `mooter terminal label <name>`)
 *   3. $TMUX_PANE_TITLE                    (tmux)
 *   4. $ZELLIJ_SESSION_NAME                (Zellij)
 *   5. $WEZTERM_PANE → pane-N             (WezTerm)
 *   6. git branch via .git/HEAD walk-up    (worktree-aware, file read only)
 *   7. directory basename
 *
 * `hidden_chips: ["terminal-name"]` drops it. Best-effort: any failure → ''.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function clean(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length ? t : null;
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Read the current branch from .git/HEAD, walking up and resolving worktree .git files. */
function gitBranch(startCwd) {
  let dir = startCwd;
  for (let i = 0; i < 8; i++) {
    const gitPath = path.join(dir, '.git');
    try {
      const st = fs.statSync(gitPath);
      let headFile;
      if (st.isDirectory()) {
        headFile = path.join(gitPath, 'HEAD');
      } else {
        // Linked worktree: .git is a file `gitdir: <path>`.
        const m = fs.readFileSync(gitPath, 'utf8').trim().match(/^gitdir:\s*(.+)$/);
        if (!m) return null;
        headFile = path.join(m[1], 'HEAD');
      }
      const head = fs.readFileSync(headFile, 'utf8').trim();
      const bm = head.match(/^ref:\s*refs\/heads\/(.+)$/);
      return bm ? bm[1] : null;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Pure resolver (env/cwd injected) → { name, source }. */
function resolveLabel({ env, cwd, override }) {
  const envName = clean(env.MOOTER_TERMINAL_NAME);
  if (envName) return { name: envName, source: 'env' };
  const ov = clean(override);
  if (ov) return { name: ov, source: 'override' };
  const tmux = clean(env.TMUX_PANE_TITLE);
  if (tmux) return { name: tmux, source: 'tmux' };
  const zellij = clean(env.ZELLIJ_SESSION_NAME);
  if (zellij) return { name: zellij, source: 'zellij' };
  const wez = clean(env.WEZTERM_PANE);
  if (wez) return { name: `pane-${wez}`, source: 'wezterm' };
  const branch = gitBranch(cwd);
  if (branch) return { name: branch, source: 'worktree' };
  return { name: path.basename(cwd) || 'session', source: 'cwd' };
}

function statusLine() {
  const p = prefs();
  if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('terminal-name')) return '';
  const { name } = resolveLabel({
    env: process.env,
    cwd: process.cwd(),
    override: p.terminal_label,
  });
  return `🪟 ${name}`;
}

module.exports = { resolveLabel, gitBranch, statusLine };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
