#!/usr/bin/env node
'use strict';
/**
 * pastor-lora-status.js — Wave 58.4 Block D (Q1 Pastor v2 honest chip).
 *
 * Line-3 chip surfacing how much the Pastor has learned, e.g.
 *   `🎓 Pastor v2 · 66 decisions · TF-IDF (Occam-aligned)`
 *
 * HONESTY (Doctrine V4 #5, brief D.1):
 *   - The mechanism is **TF-IDF**, NOT a neural LoRA. The file is named
 *     pastor-lora-status.js for continuity with the "LoRA" routing story, but
 *     the DISPLAYED text says "TF-IDF" so we never imply neural training. Wave
 *     58.4 research (PASTOR_RESEARCH_VALIDATION.md) positions this deterministic
 *     TF-IDF approach as state-of-art per arXiv 2505.12601 ("Simple kNN Beats
 *     Complex Learned Routers") — hence "(Occam-aligned)".
 *   - "N decisions" counts the REAL non-empty lines in decisions.log — the same
 *     ground truth pastor-tune.js uses to decide when to wake the tuning loop
 *     (Paulo's gate decision Q3, 2026-06-13: N = decisions.log lines, not
 *     registered adapters). No invented number.
 *   - DEFAULT-ON above a learning threshold (DEFAULT_ON_THRESHOLD = 50): the
 *     chip stays SILENT until the Pastor has seen enough to be worth showing,
 *     and silent again if the log is missing (N = 0 — nothing learned yet).
 *     A log that EXISTS but cannot be read is a different fact: N = null and the
 *     chip renders `n/d`. Staying silent there would sell a read failure as a
 *     Pastor that simply has not learned anything.
 *
 * GATING — this chip is part of CHIP_MODULES (the legacy line-3 opt-in list),
 * NOT DEFAULT_ELIGIBLE, so it never surfaces in the always-on wired statusline.
 * That preserves the Wave 58 A.5 contract ("the ONLY new default-visible chip is
 * 🎯 matrix"). Within line-3 it self-activates at N≥50 with no extra per-chip
 * opt-in. Explicit overrides: env MOOTER_STATUSLINE_PASTOR=0 or
 * hidden_chips:["pastor_lora"] hide it; MOOTER_STATUSLINE_PASTOR=1 force-shows
 * the real N even below the threshold (still silent when N=0).
 *
 * Budget: one readFileSync of decisions.log + a newline count. Missing log → '';
 * unreadable log → `n/d`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/** The Pastor must have seen at least this many decisions before the chip shows. */
const DEFAULT_ON_THRESHOLD = 50;

/** Same router dir / log path convention as pastor-tune.js. */
function decisionsLogPath() {
  if (process.env.MOOTER_DECISIONS_LOG) return process.env.MOOTER_DECISIONS_LOG;
  const routerDir = process.env.MOOTER_ROUTER_DIR
    || path.join(os.homedir(), '.claude', 'tools', 'router');
  return path.join(routerDir, 'decisions.log');
}

function prefs() {
  try {
    const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
    return JSON.parse(fs.readFileSync(path.join(home, 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Count non-empty lines in decisions.log (mirrors pastor-tune.js decisionCount).
 *
 * O catch devolve `null`, não 0: 0 já quer dizer "o Pastor ainda não aprendeu
 * nada", por isso um log que existe mas não se consegue ler ficava
 * indistinguível de um Pastor virgem — e o chip desaparecia como se fosse
 * silêncio honesto quando era uma falha de leitura. Log ausente continua a ser
 * 0, que aí é mesmo verdade e não ignorância.
 *
 * @returns {number|null} contagem real; 0 se o log não existe; null se ilegível.
 */
function decisionCount(logPath) {
  try {
    const p = logPath || decisionsLogPath();
    if (!fs.existsSync(p)) return 0;
    return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).length;
  } catch {
    return null;
  }
}

/**
 * Hide override: env MOOTER_STATUSLINE_PASTOR=0 or hidden_chips:["pastor_lora"].
 * Returns true when the chip must NOT render regardless of N.
 */
function hidden(p) {
  if (process.env.MOOTER_STATUSLINE_PASTOR === '0') return true;
  if (p && Array.isArray(p.hidden_chips) && p.hidden_chips.includes('pastor_lora')) return true;
  return false;
}

/**
 * Pure renderer — decision count injected, no I/O.
 *
 * @param {number|null} n          real decision count, or null when the log
 *                                  exists but could not be read.
 * @param {object}  [opts]
 * @param {number}  [opts.threshold] override the default-on threshold (default 50).
 * @param {boolean} [opts.force]    when true, show the real N even below threshold
 *                                  (but still '' when n <= 0 — never fabricate).
 * @returns {string} the chip, or '' when below threshold / no data.
 */
function buildPastorLoraChip(n, opts = {}) {
  // n === null é "não consegui medir", não "não há nada": calar o chip aqui
  // seria vender uma falha de leitura como um Pastor que ainda não aprendeu.
  if (n === null) return '🎓 Pastor v2 · n/d decisions · decisions.log unreadable';
  const count = Math.max(0, Number(n) || 0);
  if (count <= 0) return ''; // honest: nothing learned yet → silent
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_ON_THRESHOLD;
  if (!opts.force && count < threshold) return ''; // below learning threshold → silent
  return `🎓 Pastor v2 · ${count} decisions · TF-IDF (Occam-aligned)`;
}

/** Line-3 entry: '' when hidden / below threshold / no data, else the chip. */
function statusLine() {
  try {
    const p = prefs();
    if (hidden(p)) return '';
    const n = decisionCount();
    return buildPastorLoraChip(n, { force: process.env.MOOTER_STATUSLINE_PASTOR === '1' });
  } catch {
    return '';
  }
}

module.exports = {
  buildPastorLoraChip,
  decisionCount,
  decisionsLogPath,
  hidden,
  statusLine,
  DEFAULT_ON_THRESHOLD,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
