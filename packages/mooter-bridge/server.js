#!/usr/bin/env node
'use strict';
/**
 * mooter-bridge — local stdio MCP server exposing the Mooter agent fleet to an MCP client
 * (e.g. Cowork / Claude Desktop). P0: read-only session visibility.
 *
 * Doctrine: zero npm deps (pure Node, mirrors providers/ollama-api.js). Reuses the cockpit's
 * honest session model (host-extra.recentSessions) — every field comes from real ~/.claude logs
 * + git/gh; null when unknown, NEVER fabricated. classify.js is never touched. Read-only in P0.
 *
 * Transport: MCP stdio — newline-delimited JSON-RPC 2.0 on stdin/stdout; logs go to stderr;
 * stdout carries ONLY MCP messages (per spec 2025-06-18).
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'mooter-bridge', version: '0.1.0' };

// Reuse the cockpit's session logic. Injectable for tests via setHostExtra().
let hx = null;
try { hx = require(path.join(__dirname, '..', 'vscode-extension', 'src', 'host-extra.js')); }
catch (e) { hx = null; }
function setHostExtra(stub) { hx = stub; }

function log(...a) { try { process.stderr.write('[mooter-bridge] ' + a.join(' ') + '\n'); } catch { /* ignore */ } }

// ── tool implementations (read-only) ──────────────────────────────────────
function shapeSession(r) {
  return {
    id: r.id, fullId: r.fullId, title: r.name || null,
    status: r.working ? 'working' : (r.needsYou ? 'needs_you' : 'idle'),
    model: r.model || null, project: r.project || null,
    cwd: r.cwd || null, branch: r.branch || null,
    pr: r.pr ? { number: r.pr.number, title: r.pr.title, state: r.pr.state, stage: r.pr.stage } : null,
    turns: r.turns, ageMs: r.ageMs,
    tokensIn: r.tokIn, tokensOut: r.tokOut, tokPerSec: r.tokPerSec,
    // ⚠️ v1.3.2 — two honesty fixes, both measured on 2026-07-25.
    //
    // 1. `costUsd` here is the WHOLE Claude Code session, including turns that
    //    have nothing to do with a Mooter job. Reported bare, it contradicted
    //    the ledger for the same job ($1.3909 vs $0.9247) with no way to tell
    //    which was right. The ledger is the single source of truth for job cost;
    //    this number keeps its own name so the two can never be confused again.
    session_cost_usd: r.cost,
    cost_note: 'custo acumulado da sessão CC, inclui turnos fora do job — o custo por job vem do ledger',
    //
    // 2. `savedUsd` was negative in 8 of 8 sessions, because the baseline is
    //    all-Opus and everything WAS Opus: the formula is structurally unable to
    //    be positive. A product whose pitch is savings, showing losses 100% of
    //    the time, is worse than showing nothing. It comes back when there is a
    //    real A/B measurement to back it.
    savedUsd: null,
    saved_note: 'oculto: baseline contrafactual all-Opus dava negativo em 8/8 — volta quando houver medição A/B real',
  };
}

async function toolSessionsList(args) {
  const slow = Number(process.env.MOOTER_BRIDGE_SLOW_MS);
  if (slow > 0) await new Promise((r) => setTimeout(r, slow)); // test-only: prove graceful drain
  const limit = Math.min(Math.max(Number(args && args.limit) || 8, 1), 50);
  if (!hx || typeof hx.recentSessions !== 'function') {
    return { error: 'host-extra unavailable — run this server from inside the mooter repo (packages/vscode-extension present)' };
  }
  const rows = await hx.recentSessions(limit);
  const sessions = rows.map(shapeSession);
  // ⚠️ v1.3.2 — a headless job cannot "need you". Three finished Mooter jobs
  // showed up as `needs_you`, which would send the user looking for three
  // things that do not exist. If the ledger says the job is over, it is over.
  try {
    const seam = require('./seamless.js');
    const terminal = new Set();
    for (const e of seam.ledgerRead()) {
      if (!e.job_id) continue;
      if (e.event === 'done' || e.event === 'failed' || e.event === 'collected') terminal.add(e.job_id);
    }
    if (terminal.size) {
      for (const s of sessions) {
        if (s.status !== 'needs_you') continue;
        const title = String(s.title || '');
        for (const jid of terminal) {
          if (title.includes(jid)) { s.status = 'idle'; s.status_note = 'job headless já terminado no ledger'; break; }
        }
      }
    }
  } catch { /* never let this break the listing */ }
  const counts = {
    total: sessions.length,
    needs_you: sessions.filter((s) => s.status === 'needs_you').length,
    working: sessions.filter((s) => s.status === 'working').length,
    idle: sessions.filter((s) => s.status === 'idle').length,
  };
  return { counts, sessions };
}

async function toolSessionRead(args) {
  const id = String((args && args.id) || '').trim();
  if (!id) return { error: 'id is required' };
  if (!hx || typeof hx.recentSessions !== 'function') return { error: 'host-extra unavailable' };
  const rows = await hx.recentSessions(50);
  const r = rows.find((x) => x.fullId === id || x.id === id || (x.fullId && x.fullId.startsWith(id)));
  if (!r) return { error: `session "${id}" not found among recent sessions` };
  return shapeSession(r);
}


// ── P1: headless runner — spawn `claude -p` in an isolated dir, routed by Mooter ──────
// Real spawner. Injectable via setSpawner() for hermetic tests. WITHOUT --bare so the
// Mooter UserPromptSubmit hook (router) fires and the run shows in the cockpit/decisions.log.
function realSpawnClaude(cfg) {
  return new Promise((resolve) => {
    const args = ['-p', cfg.prompt, '--output-format', 'json'];
    if (cfg.allowedTools) args.push('--allowedTools', cfg.allowedTools);
    if (cfg.permissionMode) args.push('--permission-mode', cfg.permissionMode);
    if (cfg.maxTurns) args.push('--max-turns', String(cfg.maxTurns));
    let child;
    try { child = spawn('claude', args, { cwd: cfg.cwd, env: process.env }); }
    catch (e) { return resolve({ ok: false, error: 'spawn failed: ' + ((e && e.message) || e) }); }
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } resolve({ ok: false, error: 'timeout', stderr: err.slice(0, 800) }); }, cfg.timeoutMs || 300000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: String((e && e.message) || e) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let j = null; try { j = JSON.parse(out); } catch { /* not json */ }
      resolve({ ok: code === 0 && !!j, code, json: j, stderr: err.slice(0, 800) });
    });
  });
}
let spawnClaude = realSpawnClaude;
function setSpawner(fn) { spawnClaude = fn; }

async function toolRun(args) {
  const prompt = String((args && args.prompt) || '').trim();
  if (!prompt) return { error: 'prompt is required' };
  const allowedTools = args.allowedTools ? String(args.allowedTools) : null; // opt-in; omit => text-only
  const maxTurns = Math.min(Math.max(Number(args.maxTurns) || 6, 1), 20);
  const permissionMode = allowedTools ? (args.permissionMode ? String(args.permissionMode) : 'acceptEdits') : null;
  // Isolated working dir by default — never the user's active repo working tree unless asked.
  let cwd, ephemeral = false;
  if (args.cwd) { cwd = String(args.cwd); }
  else { cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-run-')); ephemeral = true; }
  const t0 = Date.now();
  const r = await spawnClaude({ prompt, cwd, allowedTools, permissionMode, maxTurns, timeoutMs: 300000 });
  const durationMs = Date.now() - t0;
  // best-effort audit (never throws)
  try {
    const dir = path.join(os.homedir(), '.mooter'); try { fs.mkdirSync(dir, { recursive: true }); } catch { /* */ }
    fs.appendFileSync(path.join(dir, 'bridge-runs.log'), JSON.stringify({ ts: new Date().toISOString(), prompt: prompt.slice(0, 200), cwd, allowedTools, maxTurns, ok: r.ok, cost: r.json && r.json.total_cost_usd, session_id: r.json && r.json.session_id }) + '\n');
  } catch { /* */ }
  if (!r.ok) return { error: r.error || ('claude -p failed (exit ' + r.code + ')'), stderr: r.stderr || null, cwd };
  const j = r.json || {};
  return { result: j.result != null ? j.result : null, session_id: j.session_id || null, cost_usd: j.total_cost_usd != null ? j.total_cost_usd : null, num_turns: j.num_turns != null ? j.num_turns : null, cwd, ephemeral, durationMs };
}

const TOOLS = [
  {
    name: 'mooter_sessions_list',
    description: 'List the live Claude Code sessions the Mooter cockpit sees, with honest status (working / needs_you / idle), git branch, open PR + CI stage, model, token usage, cost and savings. Read-only; data comes from ~/.claude logs + git/gh, null when unknown. Use to know at a glance what the agent fleet is doing and which sessions are waiting on the user.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max sessions to return (1-50, default 8), most-recent first.' } }, additionalProperties: false },
    annotations: { title: 'List Mooter sessions', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolSessionsList,
  },
  {
    name: 'mooter_session_read',
    description: 'Read one Claude Code session in detail by id (full id or 8-char short id / prefix): title, status, working directory, git branch, open PR + CI stage, turns, tokens, cost and savings. Read-only. Use after mooter_sessions_list to inspect a specific session.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Session id (fullId or 8-char short id / prefix).' } }, required: ['id'], additionalProperties: false },
    annotations: { title: 'Read a Mooter session', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: toolSessionRead,
  },
  {
    name: 'mooter_run',
    description: 'Run a Claude Code agent HEADLESS on a task and return its result. Spawns `claude -p` in an ISOLATED working directory (a fresh temp dir by default), routed and observed by the Mooter router (the run shows up in the cockpit). By default it runs TEXT-ONLY with no tools; pass allowedTools to let it edit files or run commands (e.g. "Write,Edit,Bash(npm test*)") — those runs are bounded by maxTurns and confined to the working directory. Returns result text, session id, cost (USD) and turns. Use to delegate work to the fleet from chat.',
    inputSchema: { type: 'object', properties: {
      prompt: { type: 'string', description: 'The task for the agent.' },
      allowedTools: { type: 'string', description: 'Optional permission-rule list to auto-approve tools, e.g. "Write,Edit,Bash(git *)". Omit for a safe text-only run.' },
      cwd: { type: 'string', description: 'Optional working directory. Defaults to a fresh isolated temp dir. Pass a path only when the task must run in a specific repo/worktree.' },
      maxTurns: { type: 'number', description: 'Max agent turns (1-20, default 6).' },
    }, required: ['prompt'], additionalProperties: false },
    annotations: { title: 'Run a headless Mooter agent', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: toolRun,
  },
];

// ── JSON-RPC handling (pure: returns the response object or null for notifications) ──
async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return null;
  const { id, method, params } = msg;
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
  if (method === 'initialize') {
    const clientPV = params && params.protocolVersion;
    return { jsonrpc: '2.0', id, result: { protocolVersion: typeof clientPV === 'string' ? clientPV : PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) } };
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const t = TOOLS.find((x) => x.name === name);
    if (!t) return { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${name}` } };
    try {
      const out = await t.handler((params && params.arguments) || {});
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out, isError: !!(out && out.error) } };
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'tool threw: ' + ((e && e.message) || e) }], isError: true } };
    }
  }
  if (typeof id !== 'undefined') return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
  return null;
}

function send(msg) { try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch (e) { log('send fail', (e && e.message) || ''); } }

function main() {
  let buf = '';
  let pending = 0;
  let stdinEnded = false;
  const maybeExit = () => { if (stdinEnded && pending === 0) process.exit(0); };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { log('bad json line'); continue; }
      pending++;
      Promise.resolve(handle(msg))
        .then((res) => { if (res) send(res); })
        .catch((e) => log('handle err', (e && e.message) || ''))
        .finally(() => { pending--; maybeExit(); });
    }
  });
  // Drain in-flight tool calls before exiting. A real MCP client keeps stdin open, but
  // pipe-and-close callers must still receive their last response — e.g. the async git/gh
  // inside recentSessions() that the stdin-end exit used to cut off.
  process.stdin.on('end', () => { stdinEnded = true; maybeExit(); });
  log('ready (P0.1) · tools: ' + TOOLS.map((t) => t.name).join(', '));
}

if (require.main === module) main();
module.exports = { handle, TOOLS, toolSessionsList, toolSessionRead, toolRun, shapeSession, setHostExtra, setSpawner, PROTOCOL_VERSION };
