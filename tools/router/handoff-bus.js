'use strict';

// handoff-bus — distilled working-state handoff between lanes (First Magic — FASE 3).
//
// When local Moos do leaf work and the cloud maestro does synthesis, the maestro must
// receive the WORKING STATE — not a raw transcript dump. This bus writes a bounded,
// structured `state.md` per run at ~/.mooter/run/<id>/state.md:
//   ## Goal · ## Decisions · ## State · ## Open · ## Artifacts
// Everything is capped (per-section line caps + a hard total-byte cap) so a handoff can
// never balloon into a dump — that is the whole point (preserve the maestro's context +
// prompt cache, don't refill it).
//
// The arbiter keeps ONE paid thread per provider: a deterministic local rule that pins
// the maestro to a single provider for the run so its prompt cache survives across
// handoffs. Zero-LLM, no network.

const fs = require('fs');
const path = require('path');
const os = require('os');

const RUN_ROOT = process.env.MOOTER_RUN_ROOT || path.join(os.homedir(), '.mooter', 'run');
const MAX_TOTAL_BYTES = Number(process.env.MOOTER_HANDOFF_MAX_BYTES) || 4096; // hard cap — distilled, not dumped
const MAX_LINES_PER_SECTION = 12;
const MAX_LINE_CHARS = 200;

function runDir(runId) {
  // sanitize: keep [A-Za-z0-9_.-], strip everything else, then neutralise bare-dot
  // segments ('.' / '..') so a runId can never escape RUN_ROOT.
  const safe = String(runId).replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+$/, '_');
  return path.join(RUN_ROOT, safe || '_');
}
function statePath(runId) {
  return path.join(runDir(runId), 'state.md');
}

function asLines(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split('\n');
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

// Distil messy input into a capped, deduped bullet list — NOT a dump.
function distillSection(items) {
  const seen = new Set();
  const out = [];
  for (const raw of asLines(items)) {
    const line = raw.length > MAX_LINE_CHARS ? raw.slice(0, MAX_LINE_CHARS - 1) + '…' : raw;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= MAX_LINES_PER_SECTION) { out.push('…(truncated)'); break; }
  }
  return out;
}

/**
 * Build the distilled state.md text from a working-state object.
 * @param {{goal?:string, decisions?:any, state?:any, open?:any, artifacts?:any, maestro_provider?:string}} ws
 */
function renderState(ws = {}) {
  const sections = [
    ['Goal', ws.goal ? [String(ws.goal).trim().slice(0, 400)] : []],
    ['Decisions', distillSection(ws.decisions)],
    ['State', distillSection(ws.state)],
    ['Open', distillSection(ws.open)],
    ['Artifacts', distillSection(ws.artifacts)],
  ];
  let md = `<!-- mooter handoff — distilled working-state, NOT a transcript dump -->\n`;
  if (ws.maestro_provider) md += `<!-- maestro_provider: ${String(ws.maestro_provider).slice(0, 120)} -->\n`;
  for (const [title, lines] of sections) {
    md += `\n## ${title}\n`;
    md += lines.length ? lines.map((l) => `- ${l}`).join('\n') + '\n' : '- —\n';
  }
  // Hard total-BYTE cap — distilled, never a dump. Slice on BYTES (not UTF-16 code
  // units) so multibyte content cannot blow past the ceiling; toString may drop a
  // partial trailing char, which is fine (it is a truncation marker anyway).
  if (Buffer.byteLength(md, 'utf8') > MAX_TOTAL_BYTES) {
    const marker = '\n<!-- …capped (distilled) -->\n';
    const budget = MAX_TOTAL_BYTES - Buffer.byteLength(marker, 'utf8');
    md = Buffer.from(md, 'utf8').slice(0, budget).toString('utf8') + marker;
  }
  return md;
}

function writeState(runId, ws) {
  const md = renderState(ws);
  fs.mkdirSync(runDir(runId), { recursive: true });
  fs.writeFileSync(statePath(runId), md, 'utf8');
  return statePath(runId);
}

function readState(runId) {
  try { return fs.readFileSync(statePath(runId), 'utf8'); } catch { return null; }
}

/**
 * Handoff arbiter — keep ONE paid thread per provider to preserve prompt cache.
 * Deterministic, local. Once a run pins a maestro provider, every cloud handoff stays
 * on it unless a HIGH_RISK escalation forces a specific provider.
 * @param {{pinnedProvider?:string, candidateProvider?:string, forced?:boolean}} a
 * @returns {{provider:string, switched:boolean, reason:string}}
 */
function arbitrate(a = {}) {
  const pinned = a.pinnedProvider || null;
  const candidate = a.candidateProvider || pinned || 'claude';
  if (!pinned) return { provider: candidate, switched: false, reason: 'first cloud lane pins the provider for the run' };
  if (a.forced && candidate !== pinned) return { provider: candidate, switched: true, reason: 'forced switch (e.g. risk/availability) — cache reset accepted' };
  return { provider: pinned, switched: false, reason: 'kept on pinned provider — preserves prompt cache (one paid thread per provider)' };
}

module.exports = { writeState, readState, renderState, distillSection, arbitrate, statePath, runDir, MAX_TOTAL_BYTES };

if (require.main === module) {
  const runId = process.argv[2] || 'demo';
  process.stdout.write(readState(runId) || `(no state for run ${runId})\n`);
}
