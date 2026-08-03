#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * handoff-preflight.test.js
 *
 * The point of the preflight is that it CANNOT lie and CANNOT silently omit.
 * These tests pin exactly those two properties — anything else is detail.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const TOOL = path.join(__dirname, 'handoff-preflight.js');
const REPO = path.resolve(__dirname, '..');
const TEMPLATE_ROOT = path.join(REPO, '_handoff', 'templates');
const FIXTURE_ROOT = path.join(TEMPLATE_ROOT, 'fixtures');
const FIXTURE_ID = 'cd89b89c606a7a20';
const FIXTURE_SOURCE = path.join(FIXTURE_ROOT, `${FIXTURE_ID}.source.md`);
const AGENTS = path.join(REPO, 'AGENTS.md');
const PROTOCOL = path.join(REPO, 'docs', 'agent-context', 'AGENT_CONTEXT_PROTOCOL.md');
const pre = require('./handoff-preflight.js');

function run(args = []) {
  return execFileSync(process.execPath, [TOOL, ...args], {
    cwd: REPO, encoding: 'utf8', timeout: 30000,
  });
}

test('--check passes: the skeleton covers every field the spec names', () => {
  // This is the anti-drift gate. If it fails, the spec grew a field and the
  // handoff would ship with a silent hole — the exact bug this tool exists for.
  const out = run(['--check']);
  assert.match(out, /sem drift nos campos parseáveis do spec/);
});

test('spec parsing finds the canonical fields (not an empty set)', () => {
  const { ok, fields } = pre.specFields();
  assert.equal(ok, true, 'PERFECT_HANDOFF_SPEC.md must be readable');
  // A silently-empty parse would make --check pass vacuously — the worst
  // possible failure, since it looks green while asserting nothing.
  assert.ok(fields.length >= 5, `expected the spec to name ≥5 fields, got ${fields.length}`);
  for (const required of ['STATE', 'GATE', 'WORK', 'WORKTREE']) {
    assert.ok(fields.includes(required), `spec must name ${required}`);
  }
});

test('every judgement field renders as a loud TODO, never as blank', () => {
  const out = run();
  // An omitted field must be impossible to mistake for "nothing to report".
  for (const field of ['GOAL', 'INTENT', 'A ÚNICA COISA', 'PENDING', 'RISK']) {
    assert.match(out, new RegExp(`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,120}?<<TODO`),
      `${field} must render a <<TODO>> marker`);
  }
});

test('GATE never claims tests are green without running them', () => {
  const out = run();
  // The golden rule (spec:95): never say ✓ unless it is true. This preflight
  // does not execute suites, so it must say n/d — never a pass.
  assert.match(out, /testes n\/d/);
  assert.doesNotMatch(out, /testes \d+\/\d+ ✓/);
});

test('classify.js sha is measured, not asserted', () => {
  const gate = pre.gateFacts();
  // Either a real verdict or n/d — never an unconditional ✓.
  assert.ok(
    gate.classifySha === 'n/d' || /^✓ intacto$|^✗ DIVERGE/.test(gate.classifySha),
    `unexpected sha verdict: ${gate.classifySha}`,
  );
});

test('STATE is derived from measured git facts, never hardcoded', () => {
  const git = pre.gitFacts();
  assert.ok(
    ['landed', 'parked (precisa push)', 'in-progress (dirty)', 'n/d'].includes(git.state),
    `unexpected derived STATE: ${git.state}`,
  );
  // STATE must agree with the numbers it was derived from.
  if (git.state === 'landed') {
    assert.equal(git.ahead, 0);
    assert.equal(git.dirty, 0);
    assert.equal(git.untracked, 0);
    assert.equal(git.uncommitted, 0);
  }
  if (git.state === 'parked (precisa push)') {
    assert.ok(git.ahead > 0, 'parked implies unpushed commits');
    assert.equal(git.dirty, 0, 'parked implies a clean tree');
    assert.equal(git.untracked, 0, 'parked implies no untracked work');
    assert.equal(git.uncommitted, 0, 'parked implies no uncommitted work');
  }
});

test('P6 council canon is repo-local, exact and parsed without hardcoded keys', () => {
  const canon = pre.parseCouncilQuestions();
  assert.equal(canon.ok, true, canon.err);
  assert.deepEqual(canon.questions, [
    'fonte de verdade', 'escritor único', 'reversível vs irreversível', 'script-first',
    'projeção vs 2ª verdade', 'degradação graciosa', 'frozen/allowlist/n-d', 'custo de reverter',
  ]);
  assert.equal(canon.antiSycophancy, true);

  const arbitraryKeys = Array.from({ length: 8 }, (_, index) => `${index + 1}. **question-${index + 1}**`).join('\n');
  const synthetic = `## Pre-Dispatch Red-Team Gate\n\n${arbitraryKeys}\n\n**Anti-sycophancy:** o gate DEVE produzir ≥1 objeção real ou declarar o que tentou refutar; gate que só aprova = não rodou.\n\n## Next\n`;
  assert.equal(pre.parseCouncilQuestions(synthetic).ok, true, 'production parser must not pin question text');
  assert.equal(pre.parseCouncilQuestions(synthetic.replace('8. **question-8**\n', '')).ok, false);
  assert.equal(pre.parseCouncilQuestions(synthetic.replace('8. **question-8**', '8. **question-7**')).ok, false);
  assert.equal(pre.parseCouncilQuestions(`${synthetic}\n## Pre-Dispatch Red-Team Gate\n`).ok, false);
  assert.equal(pre.parseCouncilQuestions(synthetic.replace('gate que só aprova = não rodou.', 'gate aprovado.')).ok, false);
});

test('--json emits machine-readable facts with the load-bearing keys', () => {
  const j = JSON.parse(run(['--json']));
  for (const k of ['git', 'wts', 'gate', 'canon', 'drift']) {
    assert.ok(k in j, `--json must expose ${k}`);
  }
  assert.ok(Array.isArray(j.wts), 'worktrees must be an array');
});

test('Q&A is recovered verbatim from the transcript, with every option intact', () => {
  const qa = pre.extractQA(null);
  if (!qa.ok) {
    // No transcript on this machine is a legitimate state — but it must degrade
    // to n/d, never to a fabricated decisions block.
    assert.match(pre.renderQA(qa), /^\s*n\/d — /);
    return;
  }
  for (const round of qa.rounds) {
    for (const q of round.questions) {
      assert.ok(q.question.length > 0, 'question text must be present');
      // The spec's hole nº2: a truncated question is worse than no question.
      assert.doesNotMatch(q.question, /\.\.\.$|…$/, 'question must not be truncated');
      assert.ok(q.options.length >= 2, 'a question must carry ALL its options');
      for (const o of q.options) {
        assert.ok(o.label && o.description, 'each option needs label + description');
      }
      assert.ok(q.chosen, 'chosen answer must be present or explicit n/d');
    }
  }
});

test('Q&A without an explicit sid refuses global newest transcript attribution', () => {
  const qa = pre.extractQA(null);
  assert.equal(qa.ok, false);
  assert.match(qa.err, /--sid obrigatório/);
  assert.match(pre.renderQA(qa), /n\/d/);
});

test('renderQA never invents a choice it did not find', () => {
  const fake = {
    ok: true,
    file: '/tmp/x.jsonl',
    rounds: [{
      round: 1,
      questions: [{
        question: 'Q?',
        header: 'h',
        options: [{ label: 'A', description: 'da' }, { label: 'B', description: 'db' }],
        chosen: 'n/d (sem resposta registada no transcript)',
      }],
    }],
  };
  const out = pre.renderQA(fake);
  assert.match(out, /n\/d \(sem resposta registada/);
  // Both options must survive into the render — no silent dropping.
  assert.match(out, /1\) A — da/);
  assert.match(out, /2\) B — db/);
});

test('UNPUSHED spans every worktree, not just the current one', () => {
  const wts = pre.worktrees();
  // A handoff that reports only the current worktree is how unpushed work goes
  // missing — the spec asks for "a soma de todos os worktrees".
  assert.ok(wts.length >= 1);
  for (const w of wts) assert.ok(w.path, 'each worktree needs a path');
});

test('untracked work is RED ALERT and can never derive landed', () => {
  const run = (_cmd, args) => {
    const key = args.join(' ');
    if (key === 'branch --show-current') return 'feat/test';
    if (key === 'rev-parse --short HEAD') return 'abc1234';
    if (key.includes('--symbolic-full-name')) return 'origin/feat/test';
    if (key.startsWith('rev-list')) return '0\t0';
    if (key === 'status --porcelain=v1 -z --untracked-files=all') return '?? new file.md\0';
    if (key.startsWith('diff ')) return '';
    if (key.startsWith('log --format')) return '';
    if (key.startsWith('log -1')) return '2026-07-16T00:00:00Z';
    return null;
  };
  const git = pre.gitFacts(run);
  assert.equal(git.untracked, 1);
  assert.equal(git.uncommitted, 1);
  assert.equal(git.state, 'in-progress (dirty)');
  assert.equal(git.uncommittedPaths.length, 1);
  assert.match(git.uncommittedPaths[0], /new file\.md$/);
});

test('git failure degrades to n/d, never zero, clean or pushed', () => {
  const git = pre.gitFacts(() => null);
  assert.equal(git.state, 'n/d');
  assert.equal(git.upstream, null);
  assert.equal(git.ahead, null);
  assert.equal(git.uncommitted, null);
  assert.equal(git.uncommittedPaths, null);
  const out = pre.render({
    git, wts: null,
    gate: { classifySha: 'n/d', tests: 'n/d' },
    canon: { vault: 'n/d', council: 'n/d', cca: 'n/d', notion: 'n/d' },
    drift: { drifted: false, unknown: [] },
    qa: { ok: false, err: 'n/d', rounds: [] },
  });
  assert.match(out, /STATE:\s+n\/d/);
  assert.match(out, /RED ALERT — uncommitted:\n\s+n\/d/);
  assert.doesNotMatch(out, /pushed ✓|nada por push ou commit/);
});

test('Lingua Franca defines exactly four typed contracts and canonical budgets', () => {
  const parsed = pre.parseMessageContracts();
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.contracts.map((c) => [c.type, c.direction, c.budgetTokens]), [
    ['MASTERPROMPT', 'brain → executor', 8000],
    ['HANDOFF', 'executor → brain', 4000],
    ['DECISION CONTRACT', 'brain → executor', 2000],
    ['BRIEF', 'executor → ledger', 1000],
  ]);
});

test('P3 pins canonical repo references and the FC-8 no-mount exception', () => {
  const agents = fs.readFileSync(AGENTS, 'utf8');
  const protocol = fs.readFileSync(PROTOCOL, 'utf8');
  assert.doesNotMatch(agents, /00-core\/(?:protocolo-comunicacao|onde-vive-o-que)/);
  assert.match(agents, /Canonical repo contract: `docs\/agent-context\/AGENT_CONTEXT_PROTOCOL\.md`/);
  assert.match(agents, /Canonical repo source: this `AGENTS\.md` § Information architecture/);
  assert.equal((agents.match(/Conceptual mirror in Paulo's vault \(maintained by Cowork\)/g) || []).length, 2);
  assert.match(protocol, /consumer cannot mount or access the worktree[\s\S]{0,160}`git diff --stat`[\s\S]{0,160}critical sections/);
  assert.match(protocol, /explicit\s+exception to references over dumps/);
});

test('P5 CCA-F canon has five unique weighted mechanical criteria', () => {
  const canon = pre.parseCcaCriteria();
  assert.equal(canon.ok, true, canon.err);
  assert.equal(canon.criteria.length, 5);
  assert.equal(canon.totalWeight, 100);
  assert.deepEqual(canon.criteria.map((criterion) => [criterion.domain, criterion.weight]), [
    ['Agentic Architecture & Orchestration', 27],
    ['Tool Design & MCP Integration', 18],
    ['Claude Code Config & Workflows', 20],
    ['Prompt Engineering & Structured Output', 20],
    ['Context Management & Reliability', 15],
  ]);
  assert.ok(canon.criteria.every((criterion) => criterion.check && criterion.failure));

  const protocol = fs.readFileSync(PROTOCOL, 'utf8');
  const firstRow = protocol.split(/\r?\n/).find((line) => line.startsWith('| Agentic Architecture'));
  assert.equal(pre.parseCcaCriteria(protocol.replace(`${firstRow}\n`, '')).ok, false);
  assert.equal(pre.parseCcaCriteria(protocol.replace(firstRow, `${firstRow}\n${firstRow}`)).ok, false);
  assert.equal(pre.parseCcaCriteria(protocol.replace('(27%)', '(26%)')).ok, false);
  assert.equal(pre.parseCcaCriteria(`${protocol}\n#### CCA-F standards gate\n`).ok, false);
});

test('P5/P6 footer validators reject false green and accept honest degradation', () => {
  assert.equal(pre.validateCcaFooter('CCA: 5/5\n').ok, true);
  assert.deepEqual(pre.validateCcaFooter('CCA: 5/5\n').warnings, []);
  assert.equal(pre.validateCcaFooter('CCA: 4/5\n').ok, true);
  assert.equal(pre.validateCcaFooter('CCA: n/d/5\n').ok, true);
  assert.ok(pre.validateCcaFooter('CCA: n/d/5\n').warnings.length > 0);
  assert.equal(pre.validateCcaFooter('CCA: 6/5\n').ok, false);
  assert.equal(pre.validateCcaFooter('CCA: 5/4\n').ok, false);
  assert.equal(pre.validateCcaFooter('CCA: n/d/5\nCCA: n/d/5\n').ok, false);
  assert.equal(pre.validateCcaFooter('no footer\n').ok, false);

  const honestUnknown = '🔍 council n/d · objeção mais forte: n/d — ausente · resolvida: n/d — ausente\n';
  const honestVerified = '🔍 council 8/8 · objeção mais forte: segunda verdade derivável · resolvida: parser lê o canon\n';
  assert.equal(pre.validateCouncilFooter(honestUnknown).ok, true);
  assert.ok(pre.validateCouncilFooter(honestUnknown).warnings.length > 0);
  assert.equal(pre.validateCouncilFooter(honestVerified).ok, true);
  assert.equal(pre.validateCouncilFooter(honestVerified.replace('segunda verdade derivável', 'n/d')).ok, false);
  assert.equal(pre.validateCouncilFooter(honestUnknown.replace('n/d — ausente · resolvida', 'objeção real · resolvida')).ok, false);
  assert.equal(pre.validateCouncilFooter('🔍 council 8/8 · objeção mais forte: nenhuma · resolvida: n/d\n').ok, false);
  assert.equal(pre.validateCouncilFooter(`${honestUnknown.trim()}\n${honestUnknown}`).ok, false);
});

test('typed contract parser rejects fifth types and duplicate constitutional rows', () => {
  const protocol = fs.readFileSync(path.join(REPO, 'docs', 'agent-context', 'AGENT_CONTEXT_PROTOCOL.md'), 'utf8');
  const marker = '| `BRIEF` | executor → ledger | minimum durable record | ≤ 1k tokens |';
  const fifth = protocol.replace(marker, `${marker}\n| \`FIFTH_TYPE\` | x → y | forbidden | ≤ 1k tokens |`);
  const duplicate = protocol.replace(marker, `${marker}\n| \`HANDOFF\` | executor → brain | duplicate | ≤ 4k tokens |`);
  const fifthVerdict = pre.validateTypedArtifacts({ protocolText: fifth });
  const duplicateVerdict = pre.validateTypedArtifacts({ protocolText: duplicate });
  assert.equal(fifthVerdict.ok, false);
  assert.match(fifthVerdict.errors.join('\n'), /tipos desconhecidos: FIFTH TYPE/);
  assert.equal(duplicateVerdict.ok, false);
  assert.match(duplicateVerdict.errors.join('\n'), /duplica tipos: HANDOFF/);
});

test('the historical cd89 source is canonical-EOL pinned and parsed losslessly', () => {
  const bytes = fs.readFileSync(FIXTURE_SOURCE);
  const normalized = bytes.toString('utf8').replace(/\r\n?/g, '\n').replace(/\n*$/, '') + '\n';
  assert.equal(Buffer.byteLength(normalized), 1751);
  assert.equal(
    crypto.createHash('sha256').update(normalized).digest('hex'),
    'c397823bef7db788e87c676298f7006a9d59cd719f9cf5c361b25bc7dd7eba6c',
  );
  const brief = pre.parseBrief(bytes.toString('utf8'));
  assert.equal(brief.meta.event_id, FIXTURE_ID);
  assert.equal(brief.sections.files.length, 7);
  assert.equal(brief.sections.guardrails.length, 3);
  assert.equal(brief.sections.acceptance.length, 4);
});

test('all four templates stay within 60 lines and retain load-bearing HANDOFF fields', () => {
  for (const file of Object.values(pre.TYPE_FILES)) {
    const text = fs.readFileSync(path.join(TEMPLATE_ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
    assert.ok(text.replace(/\n+$/, '').split('\n').length <= 60, `${file} exceeds 60 lines`);
  }
  const handoff = fs.readFileSync(path.join(TEMPLATE_ROOT, 'HANDOFF.template.md'), 'utf8');
  for (const field of ['INTENT:', 'TIME:', 'DELTA:', 'RESUME:', 'conf:']) assert.match(handoff, new RegExp(field));
  assert.match(handoff, /status: <STATUS>/, 'lifecycle status must remain in frontmatter');
  assert.match(handoff, /state: <FM_STATE>/, 'machine execution state needs its own placeholder');
  assert.match(handoff, /STATE: <STATE>/, 'execution STATE must remain distinct');
  assert.match(handoff, /^CCA: <CCA_SCORE>\/5$/m);
  const master = fs.readFileSync(path.join(TEMPLATE_ROOT, 'MASTERPROMPT.template.md'), 'utf8');
  const decision = fs.readFileSync(path.join(TEMPLATE_ROOT, 'DECISION_CONTRACT.template.md'), 'utf8');
  for (const text of [master, decision]) {
    assert.match(text, /^🔍 council <COUNCIL_SCORE> · objeção mais forte: <COUNCIL_OBJECTION> · resolvida: <COUNCIL_RESOLUTION>$/m);
  }
});

test('P4 HANDOFF and BRIEF expose stable projectable YAML frontmatter', () => {
  const source = fs.readFileSync(FIXTURE_SOURCE, 'utf8');
  for (const type of ['HANDOFF', 'BRIEF']) {
    const rendered = pre.renderTypedFixture(type, source);
    const verdict = pre.validateProjectionFrontmatter(rendered, type);
    assert.equal(verdict.ok, true, verdict.errors.join('\n'));
    for (const field of pre.PROJECTION_FRONTMATTER_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(verdict.data, field), `${type} omits ${field}`);
    }
    assert.equal(verdict.data.type, type);
    assert.equal(verdict.data.status, 'ready');
    assert.equal(verdict.data.state, 'n/d');
    assert.equal(verdict.data.worktree, 'n/d');
    assert.equal(verdict.data.branch, 'n/d');
    assert.equal(verdict.data.sha, 'n/d');
    assert.equal(verdict.data.uncommitted, 'n/d');
    assert.equal(verdict.data.tests, 'n/d');
    assert.deepEqual(verdict.data.decisions_pending, ['F1', 'F2', 'F3']);
    const missing = rendered.replace(/^tests:.*\n/m, '');
    assert.equal(pre.validateProjectionFrontmatter(missing, type).ok, false);
    const wrongShape = rendered.replace(/^decisions_pending:.*$/m, 'decisions_pending: n/d');
    assert.equal(pre.validateProjectionFrontmatter(wrongShape, type).ok, false);
    const swapped = rendered
      .replace(/^status:.*$/m, 'status: n/d # lifecycle')
      .replace(/^state:.*$/m, 'state: ready # execution');
    assert.equal(pre.validateProjectionFrontmatter(swapped, type).ok, false);
    const executionAsLifecycle = rendered.replace(/^status:.*$/m, 'status: landed # lifecycle');
    assert.equal(pre.validateProjectionFrontmatter(executionAsLifecycle, type).ok, false);
    const badSha = rendered.replace(/^sha:.*$/m, 'sha: not-a-sha');
    assert.equal(pre.validateProjectionFrontmatter(badSha, type).ok, false);
    const badCount = rendered.replace(/^uncommitted:.*$/m, 'uncommitted: many');
    assert.equal(pre.validateProjectionFrontmatter(badCount, type).ok, false);
    const mixedUnknown = rendered.replace(/^decisions_pending:.*$/m, 'decisions_pending: ["n/d", "F1"]');
    assert.equal(pre.validateProjectionFrontmatter(mixedUnknown, type).ok, false);
    const unknown = rendered.replace(/^decisions_pending:.*$/m, 'decisions_pending: ["n/d"]');
    assert.equal(pre.validateProjectionFrontmatter(unknown, type).ok, true);
    const verifiedNone = rendered.replace(/^decisions_pending:.*$/m, 'decisions_pending: []');
    assert.equal(pre.validateProjectionFrontmatter(verifiedNone, type).ok, true);
    const duplicate = rendered.replace(/^tests:.*$/m, 'tests: n/d\ntests: n/d');
    assert.equal(pre.validateProjectionFrontmatter(duplicate, type).ok, false);
  }
});

test('typed renderer is hermetic and deterministic for every fixture type', () => {
  const source = fs.readFileSync(FIXTURE_SOURCE, 'utf8');
  const oldHome = process.env.HOME;
  process.env.HOME = path.join(REPO, 'definitely-missing-home');
  try {
    for (const type of Object.keys(pre.TYPE_FILES)) {
      const a = pre.renderTypedFixture(type, source);
      const b = pre.renderTypedFixture(type, source);
      const crlf = pre.renderTypedFixture(type, source.replace(/\n/g, '\r\n'));
      assert.equal(a, b, `${type} render must be byte-deterministic`);
      assert.equal(a, crlf, `${type} render must normalize CRLF`);
      assert.doesNotMatch(a, /<[A-Z][A-Z0-9_]*>/, `${type} left a placeholder`);
    }
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
  }
});

test('golden fixtures match the renderer and fit their constitutional budgets', () => {
  const verdict = pre.validateTypedArtifacts();
  assert.deepEqual(verdict.errors, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.warnings.length, 3, 'honest n/d footers are non-blocking flags');
  assert.deepEqual(Object.keys(verdict.results).sort(), Object.keys(pre.TYPE_FILES).sort());
  const budgets = new Map(pre.parseMessageContracts().contracts.map((c) => [c.type, c.budgetTokens]));
  for (const [type, result] of Object.entries(verdict.results)) {
    assert.ok(result.estimatedTokens <= budgets.get(type), `${type} exceeds budget`);
  }
});

test('fixtures degrade absent execution truth to n/d plus STOP', () => {
  const source = fs.readFileSync(FIXTURE_SOURCE, 'utf8');
  const master = pre.renderTypedFixture('MASTERPROMPT', source);
  const handoff = pre.renderTypedFixture('HANDOFF', source);
  const decision = pre.renderTypedFixture('DECISION_CONTRACT', source);
  const brief = pre.renderTypedFixture('BRIEF', source);
  assert.match(master, /♻️ REUSE[\s\S]*n\/d[\s\S]*⛔ STOP/);
  assert.match(handoff, /status: ready # lifecycle[\s\S]*STATE: n\/d[^\n]*# execution/);
  assert.match(handoff, /UNPUSHED: n\/d/);
  assert.match(handoff, /RED ALERT[\s\S]*não enumera nenhum full path/);
  assert.match(handoff, /POST_MERGE_REMEDIATION_MASTERPROMPT\.md[\s\S]*POST_MERGE_AUDIT_CODEX_REPORT\.md[\s\S]*PHASE_A_GATE\.md/);
  assert.match(handoff, /⛔ STOP:/);
  assert.match(handoff, /^CCA: n\/d\/5$/m);
  assert.doesNotMatch(handoff, /^CCA: 5\/5$/m);
  assert.match(decision, /\| F1[^\n]+\| n\/d \|/);
  assert.match(decision, /\| F2[^\n]+\| n\/d \|/);
  assert.match(decision, /\| F3[^\n]+\| n\/d \|/);
  assert.doesNotMatch(decision, /\|\s*(APPROVE|CHANGES)\s*\|/);
  for (const out of [master, decision]) {
    assert.match(out, /^🔍 council n\/d · objeção mais forte: n\/d[^\n]+ · resolvida: n\/d[^\n]+$/m);
    assert.doesNotMatch(out, /^🔍 council 8\/8/m);
  }
  assert.match(brief, /CODEX → LEDGER → COWORK/);
  assert.match(brief, /STATUS: ready # lifecycle[\s\S]*STATE: n\/d[^\n]*# execution/);
  assert.match(brief, /uncommitted:[^\n]*F3: n\/d[^\n]*POST_MERGE_REMEDIATION_MASTERPROMPT\.md[\s\S]*⛔ STOP:/);
  for (const out of [master, handoff, decision, brief]) {
    assert.doesNotMatch(out, /pushed ✓|STATE:\s*landed|0 uncommitted|tests?\s+\d+\/\d+\s+✓/i);
    assert.doesNotMatch(out, /execution state is absent|Source claim only|is source base only|records a|source verified|~narrative/i);
  }
});

test('typed validation reads both canons and enforces footer presence', () => {
  const agents = fs.readFileSync(AGENTS, 'utf8');
  const protocol = fs.readFileSync(PROTOCOL, 'utf8');
  const missingQuestion = agents.replace('8. **custo de reverter**\n', '');
  const missingCriterion = protocol.replace(/^\| Agentic Architecture.*\n/m, '');
  assert.match(pre.validateTypedArtifacts({ agentsText: missingQuestion }).errors.join('\n'), /canon council inválido/);
  assert.match(pre.validateTypedArtifacts({ protocolText: missingCriterion }).errors.join('\n'), /canon CCA-F inválido/);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-lf-footers-'));
  try {
    for (const file of Object.values(pre.TYPE_FILES)) fs.copyFileSync(path.join(TEMPLATE_ROOT, file), path.join(temp, file));
    const handoffFile = path.join(temp, 'HANDOFF.template.md');
    fs.writeFileSync(handoffFile, fs.readFileSync(handoffFile, 'utf8').replace(/^CCA:.*\n/m, ''));
    assert.match(pre.validateTypedArtifacts({ templateDir: temp }).errors.join('\n'), /HANDOFF\.template\.md deve conter exatamente CCA/);
    fs.copyFileSync(path.join(TEMPLATE_ROOT, 'HANDOFF.template.md'), handoffFile);
    const masterFile = path.join(temp, 'MASTERPROMPT.template.md');
    fs.writeFileSync(masterFile, fs.readFileSync(masterFile, 'utf8').replace(/^🔍 council.*\n/m, ''));
    assert.match(pre.validateTypedArtifacts({ templateDir: temp }).errors.join('\n'), /MASTERPROMPT\.template\.md deve conter exatamente um rodapé council/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('typed artifact validation returns errors instead of throwing on missing template roots', () => {
  const verdict = pre.validateTypedArtifacts({ templateDir: path.join(REPO, 'definitely-missing-templates') });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.length >= 4);
});

test('--check validates the spec and all typed artifacts through one validator', () => {
  const out = run(['--check']);
  assert.match(out, /sem drift nos campos parseáveis do spec/);
  assert.match(out, /4 templates \+ 4 fixtures honestas/);
  assert.match(run(['--check-templates']), /4 templates \+ 4 fixtures honestas/);
});

test('typed CLI rejects incomplete or unknown fixture requests with exit 2', () => {
  const missing = spawnSync(process.execPath, [TOOL, '--fixture', FIXTURE_SOURCE], { cwd: REPO, encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--fixture FILE e --type TYPE/);
  const unknown = spawnSync(process.execPath, [TOOL, '--fixture', FIXTURE_SOURCE, '--type', 'FIFTH_TYPE'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /tipo desconhecido/);
  const foreign = spawnSync(process.execPath, [TOOL, '--fixture', 'AGENTS.md', '--type', 'BRIEF'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(foreign.status, 2);
  assert.match(foreign.stderr, /somente a source cd89 pinada/);
});

test('typed renderer rejects non-cd89 briefs instead of projecting hardcoded facts', () => {
  const source = fs.readFileSync(FIXTURE_SOURCE, 'utf8').replace(FIXTURE_ID, 'foreign-event');
  assert.throws(() => pre.renderTypedFixture('BRIEF', source), /não corresponde à cd89 pinada/);
  const sameIdDifferentFacts = fs.readFileSync(FIXTURE_SOURCE, 'utf8').replace('F3 tem sete paths', 'F3 tem zero paths');
  assert.throws(() => pre.renderTypedFixture('BRIEF', sameIdDifferentFacts), /não corresponde à cd89 pinada/);
});

test('worktree UNPUSHED uses each branch upstream, never origin/main distance', () => {
  const wts = [{ path: 'C:/repo', branch: 'feat/already-pushed', head: 'abc1234' }];
  const run = (_cmd, args) => {
    const key = args.join(' ');
    if (key.includes('--symbolic-full-name')) return 'origin/feat/already-pushed';
    if (key.startsWith('rev-list')) {
      assert.match(key, /origin\/feat\/already-pushed\.\.\.HEAD/);
      assert.doesNotMatch(key, /origin\/main/);
      return '0\t0';
    }
    if (key === 'status --porcelain=v1 -z --untracked-files=all') return '';
    return null;
  };
  const inventory = pre.unpushedInventory(wts, run);
  assert.equal(inventory.complete, true);
  assert.match(inventory.text, /nada unpushed ou uncommitted/);
  assert.doesNotMatch(inventory.text, /1 unpushed/);
});

test('porcelain -z keeps the leading status space: the first tracked-modified path is never truncated', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-porcelain-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test User');
    fs.mkdirSync(path.join(tmp, 'docs', 'foundation'), { recursive: true });
    const tracked = path.join(tmp, 'docs', 'foundation', 'MEO_GAUNTLET.md');
    fs.writeFileSync(tracked, 'seed\n');
    git('add', 'docs/foundation/MEO_GAUNTLET.md');
    git('commit', '-q', '-m', 'seed');

    // The tracked-modified record sorts FIRST and the untracked one after it: the
    // first record is exactly the one whose leading status space a blind .trim() ate.
    fs.writeFileSync(tracked, 'modified\n');
    fs.writeFileSync(path.join(tmp, 'zz-untracked.md'), 'untracked\n');

    // The REAL sh(), only pointed at the fixture repo. Re-implementing it here would
    // prove the double instead of the tool — which is how this bug survived. The cwd
    // it receives is recorded, not discarded: a runner that swallows cwd cannot see
    // gitFacts pinning one call to a different repo than the rest.
    const seenCwd = [];
    const run = (cmd, args, cwd, opts) => {
      seenCwd.push(cwd);
      return pre.sh(cmd, args, cwd === undefined ? tmp : cwd, opts);
    };

    const raw = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], tmp, { raw: true });
    assert.ok(raw.startsWith(' M '), `raw mode must keep the status code intact, got ${JSON.stringify(raw)}`);

    seenCwd.length = 0;
    const facts = pre.gitFacts(run);
    assert.deepEqual(
      [...new Set(seenCwd)], [undefined],
      `gitFacts pinned some calls to a different repo than the others: ${JSON.stringify(seenCwd)}`,
    );
    const paths = (facts.uncommittedPaths || []).map((p) => p.replace(/\\/g, '/'));
    assert.ok(
      paths.some((p) => p.endsWith('docs/foundation/MEO_GAUNTLET.md')),
      `RED ALERT path truncated: ${JSON.stringify(paths)}`,
    );
    // The exact symptom: the eaten space shifts slice(3) and swallows the first char.
    for (const p of paths) assert.doesNotMatch(p, /\/ocs\/foundation\//);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
});
