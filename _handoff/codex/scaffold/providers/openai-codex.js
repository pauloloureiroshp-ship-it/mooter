// tools/router/providers/openai-codex.js
// Mooter ↔ OpenAI Codex provider. Reference implementation, zero runtime deps (Node builtins only),
// matching Mooter's zero-dependency bias. Two paths:
//   1) execAgent()  — agentic parallel work: shells out to `codex exec --json` inside a worktree.
//                     Inherits Codex's sandbox, AGENTS.md chain, custom agents and the user's auth.
//   2) callApi()    — thin single-turn call to the OpenAI Responses API (Phase-2 auto-route path).
// All token usage is returned so savings-tracker.js can ledger a real `provider:"openai"` spend.
// Facts verified vs developers.openai.com/codex 2026-06-21.

'use strict';
const { spawn } = require('node:child_process');
const https = require('node:https');

/**
 * Agentic path: run Codex headless in an existing worktree.
 * @param {object} o
 * @param {string} o.task            instruction (HANDOFF pointer should be included by the caller)
 * @param {string} o.cwd             worktree path (already created by spawn-orchestrator)
 * @param {string} [o.model]         e.g. "gpt-5.3-codex"
 * @param {"read-only"|"workspace-write"|"danger-full-access"} [o.sandbox]
 * @param {string} [o.profile]       e.g. "mooter-cloud"
 * @param {(ev:object)=>void} [o.onEvent]  JSONL event callback
 * @returns {Promise<{ok:boolean, message:string, tokensIn:number, tokensOut:number, events:object[]}>}
 */
function execAgent(o) {
  const args = ['exec', '--json', '--cd', o.cwd];
  if (o.model) args.push('-m', o.model);
  args.push('--sandbox', o.sandbox || 'workspace-write');
  if (o.profile) args.push('-p', o.profile);
  args.push('--ask-for-approval', 'never'); // non-interactive
  args.push(o.task);

  return new Promise((resolve) => {
    const env = { ...process.env };
    // Prefer CODEX_API_KEY for a scoped exec run; falls back to the logged-in session.
    const child = spawn('codex', args, { cwd: o.cwd, env });
    let stdout = '';
    let stderr = '';
    const events = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let message = '';

    child.stdout.on('data', (b) => {
      stdout += b.toString();
      let i;
      while ((i = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, i).trim();
        stdout = stdout.slice(i + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        events.push(ev);
        if (o.onEvent) try { o.onEvent(ev); } catch { /* ignore */ }
        // Best-effort token + final-message extraction (event shapes per Codex JSONL).
        const u = ev.usage || (ev.turn && ev.turn.usage) || null;
        if (u) {
          tokensIn += u.input_tokens || u.prompt_tokens || 0;
          tokensOut += u.output_tokens || u.completion_tokens || 0;
        }
        if (ev.type === 'item.completed' && ev.item && ev.item.text) message = ev.item.text;
        if (ev.type === 'turn.completed' && ev.message) message = ev.message;
      }
    });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('error', (e) => resolve({ ok: false, message: String(e), tokensIn, tokensOut, events }));
    child.on('close', (code) => resolve({
      ok: code === 0,
      message: message || stderr.trim(),
      tokensIn, tokensOut, events,
    }));
  });
}

/**
 * Single-turn path: OpenAI Responses API. Used only when the auto-route gate is open (Phase 2).
 * Requires OPENAI_API_KEY in env.
 * @returns {Promise<{ok:boolean, message:string, tokensIn:number, tokensOut:number}>}
 */
function callApi({ prompt, model = 'gpt-5.3-codex', effort = 'medium' }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Promise.resolve({ ok: false, message: 'OPENAI_API_KEY not set', tokensIn: 0, tokensOut: 0 });
  const body = JSON.stringify({ model, input: prompt, reasoning: { effort } });
  const opts = {
    method: 'POST', hostname: 'api.openai.com', path: '/v1/responses',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };
  return new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const usage = j.usage || {};
          const message = j.output_text
            || (j.output && j.output.map((p) => (p.content || []).map((c) => c.text || '').join('')).join(''))
            || '';
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            message,
            tokensIn: usage.input_tokens || 0,
            tokensOut: usage.output_tokens || 0,
          });
        } catch (e) {
          resolve({ ok: false, message: `parse error: ${e}`, tokensIn: 0, tokensOut: 0 });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, message: String(e), tokensIn: 0, tokensOut: 0 }));
    req.write(body);
    req.end();
  });
}

module.exports = { execAgent, callApi };
