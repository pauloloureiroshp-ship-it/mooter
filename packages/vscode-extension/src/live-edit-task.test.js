'use strict';
// live-edit-task.test.js — LP-4.5 §1 contract: the anchored-task agent bridge. Proven against the
// REAL runner process (spawned exactly like the host does) loading a FAKE Agent SDK planted in a
// temp workspace — the whole chain (trust gate → bridge discovery → spawn → stdin protocol →
// canUseTool ALLOWLIST → snapshot-before-edit → streaming progress → verdict) runs end-to-end
// with zero cloud calls. The security core: Bash/Write/WebFetch NEVER run; Read/Edit outside the
// workspace NEVER run; an approved Edit is snapshotted first so revert is real.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LET = require('./live-edit-task.js');

const PAGE = [
  'export default function P() {',
  '  return <section><b>61 moos</b></section>;',
  '}',
  '',
].join('\n');

// Plant a fake @anthropic-ai/claude-agent-sdk whose query() PROBES the permission fence: it asks
// canUseTool for a denylist gauntlet (Bash, WebFetch, Write, Read/Edit outside the workspace) and
// then does legitimate work (Read inside, Edit inside — mutating the file like the real tool
// would after approval). Every canUseTool answer is recorded in spy.json for the assertions.
// mode: 'probe' (the gauntlet) | 'qa' (no tools — a pure question) | 'hang' (drives the timeout).
function plantFakeSdk(root, mode) {
  const dir = path.join(root, 'node_modules', '@anthropic-ai', 'claude-agent-sdk');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: '@anthropic-ai/claude-agent-sdk', version: '0.0.0-fake', type: 'module',
    exports: { '.': { import: './index.mjs' } },
  }), 'utf8');
  let body;
  if (mode === 'probe') {
    body = [
      "import { writeFileSync, readFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'export async function* query({ prompt, options }) {',
      "  const here = dirname(fileURLToPath(import.meta.url));",
      "  const ws = options.cwd;",
      "  const can = options.canUseTool;",
      "  const asks = [];",
      "  const ask = async (tool, input) => { const r = await can(tool, input); asks.push({ tool, input, behavior: r.behavior }); return r; };",
      "  await ask('Bash', { command: 'rm -rf /' });",
      "  await ask('WebFetch', { url: 'https://evil.example' });",
      "  await ask('WebSearch', { query: 'x' });",
      "  await ask('Write', { file_path: join(ws, 'new-file.txt'), content: 'x' });",
      "  await ask('Read', { file_path: join(ws, '..', 'outside-secret.txt') });",
      "  await ask('Edit', { file_path: join(ws, '..', 'outside-secret.txt'), old_string: 'a', new_string: 'b' });",
      "  await ask('Edit', { file_path: join(ws, 'missing.tsx'), old_string: 'a', new_string: 'b' });",
      "  await ask('Read', { file_path: join(ws, 'landing', 'page.tsx') });",
      "  const ed = await ask('Edit', { file_path: join(ws, 'landing', 'page.tsx'), old_string: '61 moos', new_string: '77 moos' });",
      "  if (ed.behavior === 'allow') {",
      "    const f = join(ws, 'landing', 'page.tsx');",
      "    writeFileSync(f, readFileSync(f, 'utf8').replace('61 moos', '77 moos'), 'utf8');",
      "  }",
      "  writeFileSync(join(here, 'spy.json'), JSON.stringify({ prompt, model: options.model, cwd: ws, maxTurns: options.maxTurns, allowedTools: options.allowedTools, disallowedTools: options.disallowedTools, asks }));",
      "  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Atualizei para 77 moos (valor real do repo).' }] } };",
      "  yield { result: 'Atualizei para 77 moos (valor real do repo).' };",
      '}',
    ].join('\n');
  } else if (mode === 'glob') {
    // L1-a/L1-b probe: ask canUseTool for a battery of Glob patterns — traversal ones must be
    // DENIED, legit in-workspace ones ALLOWED. Records every behavior in spy.json.
    body = [
      "import { writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'export async function* query({ options }) {',
      "  const here = dirname(fileURLToPath(import.meta.url));",
      "  const ws = options.cwd;",
      "  const can = options.canUseTool;",
      "  const asks = [];",
      "  const ask = async (input) => { const r = await can('Glob', input); asks.push({ input, behavior: r.behavior }); return r; };",
      "  await ask({ pattern: '../../**/*.env' });",                       // relative traversal -> DENY
      "  await ask({ pattern: '../lens-outside-secret.txt' });",          // relative traversal -> DENY
      "  await ask({ pattern: join(ws, '*') + '/../../lens-outside-secret.txt' });", // absolute, wildcard BEFORE .. -> DENY
      "  await ask({ pattern: '**/*.tsx' });",                            // legit recursive relative -> ALLOW
      "  await ask({ pattern: 'landing/**/*.ts' });",                     // legit relative prefix inside ws -> ALLOW
      "  await ask({ pattern: join(ws, 'landing') + '/**/*.ts' });",      // legit absolute inside ws -> ALLOW
      "  writeFileSync(join(here, 'spy.json'), JSON.stringify({ asks }));",
      "  yield { result: 'done' };",
      '}',
    ].join('\n');
  } else if (mode === 'qa') {
    body = [
      "import { writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'export async function* query({ prompt, options }) {',
      "  const here = dirname(fileURLToPath(import.meta.url));",
      "  const r = await options.canUseTool('Read', { file_path: join(options.cwd, 'landing', 'page.tsx') });",
      "  writeFileSync(join(here, 'spy.json'), JSON.stringify({ prompt, model: options.model, cwd: options.cwd, readBehavior: r.behavior }));",
      "  yield { result: 'Sim — 61 moos bate certo com landing/page.tsx.' };",
      '}',
    ].join('\n');
  } else {
    body = [
      'export async function* query() {',
      '  await new Promise((r) => setTimeout(r, 3600 * 1000));',
      '}',
    ].join('\n');
  }
  fs.writeFileSync(path.join(dir, 'index.mjs'), body, 'utf8');
  return dir;
}

function mkWorkspace(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'let-'));
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', 'page.tsx'), PAGE, 'utf8');
  // The gauntlet's escape target sits OUTSIDE the workspace root, beside it.
  fs.writeFileSync(path.join(root, '..', 'outside-secret.txt'), 'secret', 'utf8');
  const sdkDir = plantFakeSdk(root, mode);
  return { root, sdkDir };
}

const INPUT = {
  instruction: 'atualiza para os números reais do projecto',
  file: 'landing/page.tsx', line: 2, col: 10, tag: 'CommunityPulse',
  nodeSource: '<CommunityPulse total={61} />',
  breadcrumb: 'main › section › CommunityPulse',
};

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('HARD trust gate: anything but trusted===true refuses BEFORE bridge or spawn', async () => {
  const { root } = mkWorkspace('probe');
  try {
    const never = path.join(root, 'never-launch.mjs');
    for (const trusted of [false, undefined, null, 1, 'true']) {
      const r = await LET.runAnchoredTask(INPUT, { wsRoot: root, trusted, runner: never });
      assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'workspace-untrusted' }, 'trusted=' + String(trusted));
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing bridge short-circuits honestly (sdk-bridge-missing), no spawn', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'let-none-'));
  try {
    const r = await LET.runAnchoredTask(INPUT, { wsRoot: root, trusted: true });
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'sdk-bridge-missing' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('mode ladder: auto→Sonnet default; @fable exists but only via the explicit mode; junk mode refused', async () => {
  assert.strictEqual(LET.AGENT_MODEL.auto, 'claude-sonnet-4-6');
  assert.strictEqual(LET.AGENT_MODEL.fable, 'claude-fable-5');
  const r = await LET.runAnchoredTask(Object.assign({}, INPUT, { mode: 't9' }), { wsRoot: 'x', trusted: true, bridge: { available: true, dir: 'x' } });
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'bad-request' });
});

test('e2e ALLOWLIST gauntlet: Bash/WebFetch/WebSearch/Write DENIED; Read/Edit outside ws DENIED; Edit-on-missing-file DENIED; inside work allowed + snapshotted + streamed', async () => {
  const { root, sdkDir } = mkWorkspace('probe');
  try {
    const target = path.join(root, 'landing', 'page.tsx');
    const shaBefore = sha(target);
    const progress = [];
    const r = await LET.runAnchoredTask(INPUT, {
      wsRoot: root, trusted: true, timeoutMs: 30000, onProgress: (ev) => progress.push(ev),
    });
    assert.strictEqual(r.ok, true, 'verdict ok: ' + JSON.stringify(r));
    const spy = JSON.parse(fs.readFileSync(path.join(sdkDir, 'spy.json'), 'utf8'));

    // The session runs IN the workspace (the whole point of an anchored task)…
    assert.strictEqual(fs.realpathSync(spy.cwd), fs.realpathSync(root), 'agent cwd IS the workspace');
    assert.strictEqual(spy.model, 'claude-sonnet-4-6', 'AUTO mode → Sonnet');
    // Gate finding (live proof a): `allowedTools` makes the SDK AUTO-APPROVE without consulting
    // canUseTool — an auto-approved Edit would skip the snapshot. It must NEVER be passed.
    assert.strictEqual(spy.allowedTools, undefined, 'allowedTools NEVER passed (it bypasses canUseTool)');
    for (const t of ['Bash', 'Write', 'WebFetch', 'WebSearch']) {
      assert.ok(spy.disallowedTools.includes(t), t + ' hard-blocked via disallowedTools too');
    }

    // …the anchor + the brief's rules travel in the prompt…
    assert.ok(spy.prompt.includes(INPUT.instruction), 'instruction in prompt');
    assert.ok(spy.prompt.includes('landing/page.tsx:2'), 'file:line anchor');
    assert.ok(spy.prompt.includes(INPUT.nodeSource), 'nodeSource anchor');
    assert.ok(spy.prompt.includes(INPUT.breadcrumb), 'breadcrumb anchor');
    assert.ok(spy.prompt.includes('nunca inventes números'), 'the honesty rule rides along');

    // …and the fence held, ask by ask.
    const by = {};
    for (const a of spy.asks) { by[a.tool + '|' + String((a.input && (a.input.file_path || a.input.url || a.input.command)) || '')] = a.behavior; }
    const behaviors = spy.asks.map((a) => a.tool + ':' + a.behavior).join(',');
    assert.strictEqual(spy.asks[0].behavior, 'deny', 'Bash DENIED: ' + behaviors);
    assert.strictEqual(spy.asks[1].behavior, 'deny', 'WebFetch DENIED');
    assert.strictEqual(spy.asks[2].behavior, 'deny', 'WebSearch DENIED');
    assert.strictEqual(spy.asks[3].behavior, 'deny', 'Write DENIED (not allowlisted — the agent edits, never creates)');
    assert.strictEqual(spy.asks[4].behavior, 'deny', 'Read OUTSIDE the workspace DENIED');
    assert.strictEqual(spy.asks[5].behavior, 'deny', 'Edit OUTSIDE the workspace DENIED');
    assert.strictEqual(spy.asks[6].behavior, 'deny', 'Edit on a missing file DENIED (no snapshot → no revert → no edit)');
    assert.strictEqual(spy.asks[7].behavior, 'allow', 'Read inside the workspace allowed');
    assert.strictEqual(spy.asks[8].behavior, 'allow', 'Edit inside the workspace allowed');
    assert.strictEqual(fs.readFileSync(path.join(root, '..', 'outside-secret.txt'), 'utf8'), 'secret', 'outside file untouched');

    // Verdict: an edits task, with the file listed, the BEFORE bytes snapshotted, and the
    // revert guard stamped from the file as the agent left it.
    assert.strictEqual(r.kind, 'edits');
    assert.strictEqual(r.edits.length, 1);
    assert.strictEqual(r.edits[0].file, 'landing/page.tsx');
    assert.ok(fs.existsSync(r.edits[0].snapshot), 'snapshot exists');
    assert.strictEqual(fs.readFileSync(r.edits[0].snapshot, 'utf8'), PAGE, 'snapshot holds the BEFORE bytes');
    assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(r.edits[0].snapshot)).digest('hex'), shaBefore);
    assert.strictEqual(r.edits[0].shaAfter, sha(target), 'shaAfter stamps the file as the agent left it');
    assert.ok(fs.readFileSync(target, 'utf8').includes('77 moos'), 'the approved edit really landed');
    assert.deepStrictEqual(r.filesRead, ['landing/page.tsx'], 'filesRead reported');
    assert.ok(r.denied.length >= 6, 'denials reported for honesty: ' + JSON.stringify(r.denied));

    // Streaming: the panel saw the denials AND the allowed work while it happened.
    assert.ok(progress.some((e) => e.ev === 'deny' && e.tool === 'Bash'), 'deny streamed');
    assert.ok(progress.some((e) => e.ev === 'tool' && e.tool === 'Read' && e.path === 'landing/page.tsx'), 'read streamed');
    assert.ok(progress.some((e) => e.ev === 'tool' && e.tool === 'Edit' && e.path === 'landing/page.tsx'), 'edit streamed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('L1-a/L1-b: Glob containment — relative ../ AND absolute wildcard-before-.. DENIED; legit patterns allowed', async () => {
  const { root, sdkDir } = mkWorkspace('glob');
  try {
    const r = await LET.runAnchoredTask(INPUT, { wsRoot: root, trusted: true, timeoutMs: 30000 });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const spy = JSON.parse(fs.readFileSync(path.join(sdkDir, 'spy.json'), 'utf8'));
    const b = spy.asks.map((a) => a.behavior);
    assert.strictEqual(b[0], 'deny', 'relative ../../**/*.env DENIED (was silently allowed — L1-a)');
    assert.strictEqual(b[1], 'deny', 'relative ../lens-outside-secret.txt DENIED (L1-a)');
    assert.strictEqual(b[2], 'deny', 'absolute wildcard-before-.. DENIED (L1-b prefix-truncation bypass)');
    assert.strictEqual(b[3], 'allow', 'recursive **/*.tsx still allowed (no false-deny of real globs)');
    assert.strictEqual(b[4], 'allow', 'relative prefix inside ws allowed');
    assert.strictEqual(b[5], 'allow', 'absolute prefix inside ws allowed');
    assert.ok(r.denied.filter((d) => d.tool === 'Glob' && d.why === 'outside-workspace').length >= 3, 'the 3 traversal denials are reported honestly');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('question mode: no edits → kind answer, zero writes, text returned', async () => {
  const { root } = mkWorkspace('qa');
  try {
    const target = path.join(root, 'landing', 'page.tsx');
    const before = sha(target);
    const r = await LET.runAnchoredTask(
      Object.assign({}, INPUT, { instruction: 'estes números estão coerentes com o projecto?' }),
      { wsRoot: root, trusted: true, timeoutMs: 30000 },
    );
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.kind, 'answer', 'a question is an answer, not edits');
    assert.deepStrictEqual(r.edits, [], 'zero edits');
    assert.ok(r.text.includes('61 moos'), 'answer text returned');
    assert.strictEqual(sha(target), before, 'a question NEVER writes');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('hanging agent → host timeout kills the runner and reports task-timeout', async () => {
  const { root } = mkWorkspace('hang');
  try {
    const r = await LET.runAnchoredTask(INPUT, { wsRoot: root, trusted: true, timeoutMs: 1500 });
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'task-timeout' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('revertEdit is sha-guarded: reverts exactly the agent bytes; refuses once anything else wrote the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'let-rev-'));
  try {
    const f = path.join(dir, 'a.tsx');
    fs.writeFileSync(f, 'BEFORE', 'utf8');
    const snap = path.join(dir, 'snap.bin');
    fs.writeFileSync(snap, 'BEFORE', 'utf8');
    fs.writeFileSync(f, 'AFTER-AGENT', 'utf8');
    const edit = { file: 'a.tsx', abs: f, snapshot: snap, shaAfter: LET.sha256File(f) };
    // someone else writes after the agent → refuse, nothing written
    fs.writeFileSync(f, 'SOMEONE-ELSE', 'utf8');
    assert.deepStrictEqual(LET.revertEdit(edit), { ok: false, reason: 'revert-stale' });
    assert.strictEqual(fs.readFileSync(f, 'utf8'), 'SOMEONE-ELSE', 'stale revert writes NOTHING');
    // put the agent state back → revert restores the exact before bytes
    fs.writeFileSync(f, 'AFTER-AGENT', 'utf8');
    assert.deepStrictEqual(LET.revertEdit(edit), { ok: true });
    assert.strictEqual(fs.readFileSync(f, 'utf8'), 'BEFORE');
    // garbage entries refuse
    assert.strictEqual(LET.revertEdit(null).ok, false);
    assert.strictEqual(LET.revertEdit({ abs: f }).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('gitDiffFile: real git diff scoped to the task (snapshot vs now); fail-soft when git is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'let-diff-'));
  try {
    const snap = path.join(dir, 'snap.bin');
    const file = path.join(dir, 'a.tsx');
    fs.writeFileSync(snap, 'line1\nold\nline3\n', 'utf8');
    fs.writeFileSync(file, 'line1\nnew\nline3\n', 'utf8');
    const d = LET.gitDiffFile(snap, file);
    if (d.ok) {
      assert.ok(d.lines.some((l) => l === '-old'), 'removed line present: ' + JSON.stringify(d.lines));
      assert.ok(d.lines.some((l) => l === '+new'), 'added line present');
    }
    const bad = LET.gitDiffFile(snap, file, { gitBin: path.join(dir, 'no-such-git.exe') });
    assert.deepStrictEqual(bad, { ok: false, reason: 'git-unavailable' }, 'no git → honest fallback signal');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
