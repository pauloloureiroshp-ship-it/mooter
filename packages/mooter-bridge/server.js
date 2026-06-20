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
    tokensIn: r.tokIn, tokensOut: r.tokOut, costUsd: r.cost, savedUsd: r.saved, tokPerSec: r.tokPerSec,
  };
}

async function toolSessionsList(args) {
  const limit = Math.min(Math.max(Number(args && args.limit) || 8, 1), 50);
  if (!hx || typeof hx.recentSessions !== 'function') {
    return { error: 'host-extra unavailable — run this server from inside the mooter repo (packages/vscode-extension present)' };
  }
  const rows = await hx.recentSessions(limit);
  const sessions = rows.map(shapeSession);
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
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { log('bad json line'); continue; }
      Promise.resolve(handle(msg)).then((res) => { if (res) send(res); }).catch((e) => log('handle err', (e && e.message) || ''));
    }
  });
  process.stdin.on('end', () => process.exit(0));
  log('ready (P0) · tools: ' + TOOLS.map((t) => t.name).join(', '));
}

if (require.main === module) main();
module.exports = { handle, TOOLS, toolSessionsList, toolSessionRead, shapeSession, setHostExtra, PROTOCOL_VERSION };
