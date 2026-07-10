#!/usr/bin/env node
/**
 * live-edit-sdk-runner.mjs — LP-4 §2 · headless SUBSCRIPTION bridge for Live Edit escalation.
 *
 * Spawned by the cockpit host with ELECTRON_RUN_AS_NODE=1 (the proven overclock-fill.mjs +
 * _handoff/loop/sdk-runner.mjs pattern). NO API key: the Claude Agent SDK runs on the user's
 * Claude plan credentials — the extension itself never carries a credential.
 *
 * PRIVACY FENCE (what the model sees): ONLY the selected JSX subtree + the instruction + a
 * WORKSPACE-RELATIVE file:line label (review P3-a — the host strips the absolute path so no OS
 * username / repo tree leaks to the cloud). No tool call runs (canUseTool → deny) and the SDK
 * SESSION's cwd is a temp dir, so the MODEL cannot read the repo. The reply is text-only and is
 * then forced through spliceNodeRange + the sha256 hash-guard host-side — the SAME fence as local.
 *
 * ⚠ This is NOT a sandbox for the SDK MODULE itself: it is `import()`ed from the workspace and its
 * top-level code runs in THIS process with our env. That is why the host gates the whole bridge on
 * Workspace Trust (live-edit-cloud.js, review P1-A) — we are only ever spawned for a trusted repo.
 *
 * The SDK is NOT bundled in the vsix (it would be a new runtime dep — forbidden by this wave).
 * The host resolves it from the WORKSPACE (bridgeStatus in live-edit-cloud.js) and passes its
 * directory via LE_SDK_DIR; we import its real entry from there. Bridge absent → the host never
 * spawns us and the panel shows the honest disabled state.
 *
 * Protocol: JSON on stdin {nodeSource, prompt, file, line, model} → ONE JSON line on stdout
 * {ok:true, text} | {ok:false, reason, detail?}. Exit 0 always — fail-soft; the host parses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

// Resolve the SDK's real ESM entry from its own package.json (exports → module → main). We never
// guess a path: whatever the package declares is what we import.
async function loadQuery(sdkDir) {
  const pkg = JSON.parse(readFileSync(join(sdkDir, 'package.json'), 'utf8'));
  const pick = (v) => {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return pick(v.import) || pick(v.node) || pick(v.default);
    return null;
  };
  let entry = null;
  const ex = pkg.exports;
  if (ex) entry = (typeof ex === 'string') ? ex : (pick(ex['.']) || pick(ex));
  if (!entry) entry = pkg.module || pkg.main || 'index.js';
  const mod = await import(pathToFileURL(join(sdkDir, entry)).href);
  const query = mod.query || (mod.default && mod.default.query);
  if (typeof query !== 'function') throw new Error('query() not exported by the SDK entry');
  return query;
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolve(buf));
  });
}

async function main() {
  const sdkDir = process.env.LE_SDK_DIR || '';
  if (!sdkDir) { out({ ok: false, reason: 'sdk-bridge-missing', detail: 'LE_SDK_DIR unset' }); return; }
  let req;
  try { req = JSON.parse(await readStdin()); }
  catch { out({ ok: false, reason: 'bad-request', detail: 'stdin not JSON' }); return; }
  const nodeSource = typeof req.nodeSource === 'string' ? req.nodeSource : '';
  const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
  const model = (typeof req.model === 'string' && req.model) ? req.model : 'claude-sonnet-4-6';
  if (!nodeSource.trim() || !prompt) { out({ ok: false, reason: 'bad-request' }); return; }
  let query;
  try { query = await loadQuery(sdkDir); }
  catch (e) { out({ ok: false, reason: 'sdk-bridge-missing', detail: String((e && e.message) || e).slice(0, 200) }); return; }
  const where = ((req.file ? String(req.file) : '')
    + (Number.isInteger(req.line) ? (':' + req.line) : ''));
  // Same strict contract as the local moo: only the element back, no prose/markdown/comments.
  const p = 'Reescreve APENAS este elemento JSX segundo a instrução. Devolve SÓ o elemento JSX '
    + 'reescrito — sem prosa, sem markdown, sem comentários, sem explicações. Não uses ferramentas.\n\n'
    + 'Instrução: ' + prompt + '\n'
    + (where ? ('Localização (apenas contexto, não há mais nada para ler): ' + where + '\n') : '')
    + 'Elemento JSX:\n' + nodeSource;
  let text = '';
  try {
    for await (const m of query({
      prompt: p,
      options: {
        model,
        cwd: tmpdir(), // never the repo — the session has nothing to read even if a tool slipped
        maxTurns: 1,
        // Deny EVERY tool: this bridge is a text rewrite, not an agent. The subtree in the
        // prompt is the only thing the model ever sees.
        canUseTool: async () => ({ behavior: 'deny', message: 'live-edit bridge: tools are disabled — answer with the rewritten element only' }),
      },
    })) {
      if (m && m.type === 'assistant' && m.message && m.message.content) {
        for (const c of m.message.content) { if (c && c.type === 'text') text += c.text; }
      }
      if (m && typeof m.result === 'string') text = m.result;
    }
  } catch (e) {
    out({ ok: false, reason: 'cloud-bridge-error', detail: String((e && e.message) || e).slice(0, 300) });
    return;
  }
  const t = String(text || '').trim();
  if (!t) { out({ ok: false, reason: 'cloud-model-empty' }); return; }
  out({ ok: true, text: t });
}

main().catch((e) => { out({ ok: false, reason: 'cloud-bridge-error', detail: String((e && e.message) || e).slice(0, 300) }); });
