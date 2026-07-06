#!/usr/bin/env node
/**
 * live-edit-task-runner.mjs — LP-4.5 §1 · headless ANCHORED-TASK agent for Live Edit.
 *
 * The LP-4 rewrite bridge (live-edit-sdk-runner.mjs) is a fenced TEXT REWRITE: cwd=tmp, every
 * tool denied, the model sees only the pinned subtree. THIS runner is the opposite deliberately:
 * the pinned node is an ANCHOR for a PROJECT task ("valida estes números com o projecto", "põe
 * números reais"), so the agent must READ the repo and may EDIT the right place — which can be a
 * different file than the node. Same spawn pattern (ELECTRON_RUN_AS_NODE=1, subscription
 * credentials, NO API key in the extension), different permission contract:
 *
 *   ALLOW  Read · Grep · Glob · LS · Edit · MultiEdit — and ONLY inside LE_WS_ROOT.
 *   DENY   everything else (Bash, Write, WebFetch, WebSearch, Task, NotebookEdit, …) and any
 *          allowed tool whose path escapes the workspace (lexical + realpath containment).
 *
 * Every Edit/MultiEdit approval snapshots the file's CURRENT bytes (first touch only) to a temp
 * dir BEFORE the tool runs, so the host can show a real per-file diff (before vs after) and offer
 * a sha-guarded per-file revert that never clobbers anyone else's bytes.
 *
 * ⚠ Like the rewrite bridge, the SDK module itself is import()ed FROM THE WORKSPACE and runs in
 * this process — that is why the host gates this runner on Workspace Trust (P1-A) and never
 * spawns it untrusted. The SDK is NOT bundled in the vsix (zero new deps); the host resolves it
 * via live-edit-cloud.bridgeStatus and passes its directory in LE_SDK_DIR.
 *
 * Protocol: JSON on stdin {instruction, file, line, col, tag, nodeSource, breadcrumb, model} →
 * streaming JSONL on stdout: zero or more progress events {ev:'tool'|'deny', …} while the agent
 * works, then EXACTLY ONE verdict line {ok:true, kind:'answer'|'edits', text, filesRead, edits,
 * denied, model} | {ok:false, reason, detail?}. Exit 0 always — fail-soft; the host parses.
 */
import { readFileSync, writeFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

// Same resolution as live-edit-sdk-runner.mjs: the SDK's own package.json names its entry.
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
  return new Promise((resolvePromise) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => resolvePromise(buf));
  });
}

// Containment: `p` must be the workspace root itself (Grep/Glob over the whole repo is fine) or
// live strictly inside it. Lexical first; then, when the target exists, realpath must ALSO stay
// inside (a symlink pointing out of the workspace is an escape, not a path).
function inWorkspace(root, p) {
  let abs;
  try { abs = resolve(String(p)); } catch { return false; }
  const r = relative(root, abs);
  if (r !== '' && (r.startsWith('..') || isAbsolute(r))) return false;
  try {
    const real = realpathSync(abs);
    const rr = relative(realpathSync(root), real);
    if (rr !== '' && (rr.startsWith('..') || isAbsolute(rr))) return false;
  } catch { /* target does not exist (yet) — the lexical check already vetted the location */ }
  return true;
}

const ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'Edit', 'MultiEdit'];

async function main() {
  const sdkDir = process.env.LE_SDK_DIR || '';
  const wsRoot = process.env.LE_WS_ROOT || '';
  if (!sdkDir) { out({ ok: false, reason: 'sdk-bridge-missing', detail: 'LE_SDK_DIR unset' }); return; }
  if (!wsRoot) { out({ ok: false, reason: 'bad-request', detail: 'LE_WS_ROOT unset' }); return; }
  let req;
  try { req = JSON.parse(await readStdin()); }
  catch { out({ ok: false, reason: 'bad-request', detail: 'stdin not JSON' }); return; }
  const instruction = typeof req.instruction === 'string' ? req.instruction.trim() : '';
  const nodeSource = typeof req.nodeSource === 'string' ? req.nodeSource : '';
  const model = (typeof req.model === 'string' && req.model) ? req.model : 'claude-sonnet-4-6';
  if (!instruction) { out({ ok: false, reason: 'bad-request' }); return; }
  let query;
  try { query = await loadQuery(sdkDir); }
  catch (e) { out({ ok: false, reason: 'sdk-bridge-missing', detail: String((e && e.message) || e).slice(0, 200) }); return; }

  const rel = (p) => {
    try { const r = relative(wsRoot, resolve(String(p))); return r ? r.split(sep).join('/') : '.'; }
    catch { return String(p); }
  };
  let snapDir = null; // lazy — a pure question never creates it
  const edits = []; // [{file(rel), abs, snapshot}] — first-touch order
  const snapped = new Set();
  const filesRead = [];
  const denied = [];
  const deny = (message) => ({ behavior: 'deny', message });

  // The allowlist fence. The SDK calls this before EVERY tool execution; anything not explicitly
  // allowed here never runs. Fail-closed: an error while vetting is a deny, not an allow.
  const canUseTool = async (toolName, input) => {
    try {
      const tool = String(toolName || '');
      if (ALLOWED_TOOLS.indexOf(tool) === -1) {
        if (denied.length < 40) denied.push({ tool, why: 'not-allowlisted' });
        out({ ev: 'deny', tool, why: 'not-allowlisted' });
        return deny('tarefa ancorada: só Read/Grep/Glob/LS/Edit/MultiEdit dentro do workspace — ' + tool + ' está negado');
      }
      const inp = (input && typeof input === 'object') ? input : {};
      // Every path-ish argument must stay inside the workspace. An absent path defaults to the
      // session cwd (= the workspace root) — fine. An absolute Glob pattern is a path too.
      const paths = [];
      if (typeof inp.file_path === 'string' && inp.file_path) paths.push(inp.file_path);
      if (typeof inp.path === 'string' && inp.path) paths.push(inp.path);
      if (typeof inp.notebook_path === 'string' && inp.notebook_path) paths.push(inp.notebook_path);
      if (tool === 'Glob' && typeof inp.pattern === 'string' && inp.pattern) {
        // review L1-a/L1-b: the OLD check only ran for isAbsolute(pattern) and only looked at the
        // literal prefix BEFORE the first wildcard — so (a) a RELATIVE '../' pattern was never
        // checked at all and (b) an ABSOLUTE pattern with a wildcard BEFORE a '..' (e.g.
        // /ws/*/../../secret) had its traversal truncated away. Both enumerated paths OUTSIDE the
        // workspace. Fix: reject any '..' path segment regardless of position/relativity, AND
        // containment-check the resolved prefix (relative resolves against wsRoot — the SDK session
        // cwd — never this runner's cwd, which is os.tmpdir()).
        if (/(^|[\\/])\.\.([\\/]|$)/.test(inp.pattern)) {
          if (denied.length < 40) denied.push({ tool, why: 'outside-workspace', path: String(inp.pattern).slice(0, 200) });
          out({ ev: 'deny', tool, why: 'outside-workspace' });
          return deny('tarefa ancorada: Glob com traversal (..) fora do workspace está negado (' + String(inp.pattern).slice(0, 120) + ')');
        }
        const prefix = inp.pattern.replace(/[*?[{].*$/, '');
        if (prefix) paths.push(isAbsolute(prefix) ? prefix : join(wsRoot, prefix));
      }
      for (const p of paths) {
        if (!inWorkspace(wsRoot, p)) {
          if (denied.length < 40) denied.push({ tool, why: 'outside-workspace', path: String(p).slice(0, 200) });
          out({ ev: 'deny', tool, why: 'outside-workspace' });
          return deny('tarefa ancorada: ' + tool + ' fora do workspace está negado (' + String(p).slice(0, 120) + ')');
        }
      }
      if (tool === 'Edit' || tool === 'MultiEdit') {
        const target = typeof inp.file_path === 'string' ? inp.file_path : '';
        if (!target) return deny('tarefa ancorada: edição sem file_path — negado');
        const abs = resolve(target);
        // Snapshot-or-refuse: the per-file revert the panel promises NEEDS the before-bytes. A
        // file we cannot read now (missing → the agent would be CREATING it, which only Write
        // does — and Write is denied) gets an honest refusal instead of an unrevertable edit.
        if (!snapped.has(abs)) {
          let before;
          try { before = readFileSync(abs); }
          catch { return deny('tarefa ancorada: não consigo snapshotar ' + rel(abs) + ' antes de editar — edição negada (só edito ficheiros existentes e legíveis)'); }
          try {
            if (!snapDir) snapDir = mkdtempSync(join(tmpdir(), 'le-task-snap-'));
            const snap = join(snapDir, 'snap-' + edits.length + '.bin');
            writeFileSync(snap, before);
            snapped.add(abs);
            edits.push({ file: rel(abs), abs, snapshot: snap });
          } catch { return deny('tarefa ancorada: snapshot falhou — edição negada para garantir o reverter'); }
        }
        out({ ev: 'tool', tool, path: rel(abs) });
        return { behavior: 'allow', updatedInput: inp };
      }
      if (tool === 'Read' && typeof inp.file_path === 'string') {
        const r = rel(inp.file_path);
        if (filesRead.indexOf(r) === -1 && filesRead.length < 100) filesRead.push(r);
        out({ ev: 'tool', tool, path: r });
      } else {
        out({ ev: 'tool', tool, path: paths.length ? rel(paths[0]) : null });
      }
      return { behavior: 'allow', updatedInput: inp };
    } catch {
      return deny('tarefa ancorada: verificação de permissão falhou — negado por segurança');
    }
  };

  // The brief's contract, verbatim rules: short PT answers; a QUESTION only answers (zero edits);
  // an EDIT is minimal and lands in the RIGHT place (which may not be the pinned node); numbers
  // come from the repo, never invented.
  const anchor = [];
  if (req.file) anchor.push('- ficheiro: ' + String(req.file) + (Number.isInteger(req.line) ? (':' + req.line) : ''));
  if (req.tag) anchor.push('- elemento: <' + String(req.tag) + '>');
  if (typeof req.breadcrumb === 'string' && req.breadcrumb.trim()) anchor.push('- breadcrumb: ' + req.breadcrumb.trim());
  if (nodeSource.trim()) anchor.push('- fonte do nó (JSX):\n' + nodeSource);
  const p = 'És o agente de tarefas ancoradas do Live Preview. O utilizador fixou (pin) um elemento '
    + 'no preview e pediu uma tarefa sobre o PROJECTO. Regras:\n'
    + '- responde em PT-BR curto;\n'
    + '- se for pergunta, SÓ responde (zero edits) e cita os ficheiros que leste;\n'
    + '- se for edição, faz edits mínimos no sítio CERTO (pode não ser o nó pinado);\n'
    + '- nunca inventes números — lê o repo.\n\n'
    + 'Âncora (o elemento fixado):\n' + (anchor.length ? anchor.join('\n') : '- (sem âncora)') + '\n\n'
    + 'Instrução do utilizador: ' + instruction;

  let text = '';
  try {
    for await (const m of query({
      prompt: p,
      options: {
        model,
        cwd: wsRoot, // the whole point: the agent reads THIS repo (trust-gated host-side)
        maxTurns: 40,
        // ⚠ NEVER pass `allowedTools` here: the SDK AUTO-APPROVES those without consulting
        // canUseTool (proven live in the LP-4.5 gate) — an auto-approved Edit would skip the
        // snapshot and break the diff/revert promise. canUseTool is the ONE fence; the
        // known-dangerous tools are additionally hard-blocked below (belt and suspenders).
        disallowedTools: ['Bash', 'Write', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task', 'KillShell'],
        canUseTool,
      },
    })) {
      if (m && m.type === 'assistant' && m.message && m.message.content) {
        for (const c of m.message.content) { if (c && c.type === 'text') text += c.text; }
      }
      if (m && typeof m.result === 'string') text = m.result;
    }
  } catch (e) {
    out({ ok: false, reason: 'task-bridge-error', detail: String((e && e.message) || e).slice(0, 300) });
    return;
  }
  const t = String(text || '').trim();
  if (!t && !edits.length) { out({ ok: false, reason: 'task-empty' }); return; }
  out({
    ok: true,
    kind: edits.length ? 'edits' : 'answer',
    text: t,
    filesRead,
    edits,
    denied,
    model,
  });
}

main().catch((e) => { out({ ok: false, reason: 'task-bridge-error', detail: String((e && e.message) || e).slice(0, 300) }); });
