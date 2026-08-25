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
 * Wave 33.8 Block B — cross-terminal visibility. When ≥2 Conductor heartbeats
 * are live, append `(N active)` so a glance answers "how many Mooter terminals
 * are running right now" without opening the sessions TUI. Solo (N≤1) → output
 * is byte-identical to before (no suffix), preserving every existing snapshot.
 *
 * `hidden_chips: ["terminal-name"]` drops it. Best-effort: any failure → ''.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// A heartbeat is considered live if refreshed within this window. The Conductor
// (Wave 33.5) rewrites heartbeats periodically; a stale file means a dead/exited
// terminal we must not count. 90s tolerates a slow refresh cadence.
const HEARTBEAT_LIVE_MS = 90000;

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

/**
 * Pure: count live sessions from an array of parsed heartbeat objects.
 * Live = has a numeric last_heartbeat_ms within HEARTBEAT_LIVE_MS of `now`.
 * Returns 0 on any non-array / empty input.
 */
function countLiveSessions(heartbeats, now) {
  if (!Array.isArray(heartbeats)) return 0;
  let n = 0;
  for (const hb of heartbeats) {
    const ms = hb && Number(hb.last_heartbeat_ms);
    if (Number.isFinite(ms) && now - ms <= HEARTBEAT_LIVE_MS && now - ms >= -HEARTBEAT_LIVE_MS) n += 1;
  }
  return n;
}

/**
 * Read + parse heartbeat files (best-effort, capped).
 * Returns an array of heartbeats, `[]` when the directory genuinely does not
 * exist (ENOENT — o Conductor nunca correu, logo há mesmo zero sessões), e
 * `null` quando não foi possível ler (permissões, ENOTDIR, EIO).
 *
 * Devolver `[]` em todos os casos tornava "não consegui ler a pasta"
 * indistinguível de "não há terminais activos" — e quem chama traduzia isso em
 * "≤1 activo", uma contagem que nunca chegámos a fazer.
 */
function readHeartbeats(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).slice(0, 64);
  } catch (err) {
    return err && err.code === 'ENOENT' ? [] : null;
  }
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* skip */ }
  }
  return out;
}

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
  // Block B — append the live-session count only when ≥2 terminals are active,
  // so the common solo case stays byte-identical. Hidden via `--hide-sessions-count`.
  let suffix = '';
  if (!(Array.isArray(p.hidden_chips) && p.hidden_chips.includes('sessions-count'))) {
    try {
      const hbs = readHeartbeats(path.join(mooterHome(), 'orchestration', 'heartbeats'));
      if (hbs === null) {
        // Heartbeats ilegíveis: não sabemos quantos terminais estão vivos.
        // Ficar sem sufixo afirmava "≤1 activo" por ignorância; o `?` diz a
        // verdade — há uma contagem, mas não é esta linha que a conhece.
        suffix = ' (? active)';
      } else {
        const n = countLiveSessions(hbs, Date.now());
        if (n >= 2) suffix = ` (${n} active)`;
      }
    } catch { /* best-effort: no suffix */ }
  }
  return `🪟 ${name}${suffix}`;
}

module.exports = { resolveLabel, gitBranch, countLiveSessions, readHeartbeats, statusLine, HEARTBEAT_LIVE_MS };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
