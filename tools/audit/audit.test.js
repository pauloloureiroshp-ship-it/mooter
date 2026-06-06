// Wave 23 — self-audit infrastructure tests. node:test + assert. One test per module.
// All pure / mock-driven: no Ollama, no Anthropic, no network.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const redactor = require('./audit_pii_redactor.js');
const corpus = require('./audit_corpus_builder.js');
const validator = require('./audit_validator.js');
const insights = require('./audit_insights.js');
const benchmark = require('./audit_benchmark.js');
const pipeline = require('./audit_pipeline.js');

// 1 — PII redactor
test('audit_pii_redactor: strips paths/email/secrets and detects leaks', () => {
  const dirty = 'see /home/paulo/x and /mnt/c/Users/Paulo Loureiro/frugal, mail paulo.loureiro.shp@gmail.com key sk-ant-abcdefghij0123456789XYZ';
  const clean = redactor.redact(dirty);
  assert.ok(!clean.includes('/home/paulo'), 'home path stripped');
  assert.ok(!clean.includes('Paulo Loureiro'), 'user dir stripped');
  assert.ok(!clean.includes('paulo.loureiro.shp@gmail.com'), 'email stripped');
  assert.ok(clean.includes('<ANTHROPIC_KEY>'), 'anthropic key redacted');
  assert.equal(redactor.hasPII(dirty), true);
  assert.equal(redactor.hasPII(clean), false, 'redacted text has no surviving PII');
  // assignment value redaction
  assert.ok(redactor.redact('API_KEY=supersecretvalue').includes('<REDACTED>'));
  // deep object
  const obj = redactor.redactObject({ a: '/home/paulo/f', n: 3, arr: ['Paulo Loureiro'] });
  assert.ok(!JSON.stringify(obj).includes('/home/paulo'));
  assert.equal(obj.n, 3);
});

// 2 — corpus builder
test('audit_corpus_builder: scan-list + 5-line prompt are well-formed', () => {
  const list = corpus.buildScanList();
  assert.ok(list.length > 50, `scan-list has files (${list.length})`);
  for (const f of list.slice(0, 5)) {
    assert.match(f.sha256, /^[a-f0-9]{64}$/, 'sha256 present');
    assert.ok(typeof f.category === 'string' && f.category.length, 'category present');
  }
  // self-audit invariant: the audit code is in its own scan-list
  assert.ok(list.some((f) => f.path.endsWith('tools/audit/audit_corpus_builder.js')), 'audit validates itself');
  const p = corpus.summaryPrompt('x/y.js', 'const a = 1;');
  assert.ok(/EXACTAMENTE 5 linhas/.test(p) && /linha 5/.test(p), 'prompt has strict 5-line format');
});

// 3 — validator
test('audit_validator: parse tolerates fences; histogram + mock validateEntry', async () => {
  const v = validator.parseValidation('```json\n{"drift_level":"minor","evidence":["e"],"missing":[],"fabricated":[],"score_0_to_10":7}\n```');
  assert.equal(v.drift_level, 'minor');
  assert.equal(v.score_0_to_10, 7);
  assert.equal(v.parsed, true);
  const bad = validator.parseValidation('not json at all');
  assert.equal(bad.parsed, false);
  const hist = validator.driftHistogram([
    { validation: { drift_level: 'none', score_0_to_10: 10 }, tokens_in: 5, tokens_out: 2 },
    { validation: { drift_level: 'major', score_0_to_10: 3 }, tokens_in: 5, tokens_out: 2 },
  ]);
  assert.equal(hist.histogram.none, 1);
  assert.equal(hist.histogram.major, 1);
  assert.equal(hist.avg_score, 6.5);
  // mock llmFn — no network
  const entry = { path: 'tools/audit/audit_pipeline.js', sha256: 'x', category: 'audit', summary: 's' };
  const res = await validator.validateEntry(entry, { llmFn: async () => ({ text: '{"drift_level":"none","score_0_to_10":9}', tokens_in: 10, tokens_out: 4 }) });
  assert.equal(res.validation.drift_level, 'none');
  assert.equal(res.tokens_in, 10);
});

// 4 — insights
test('audit_insights: digest + normalize clamps to 50 + report renders sections', () => {
  const digest = insights.buildDigest([{ path: 'a.js', category: 'router', validation: { drift_level: 'minor', score_0_to_10: 6, fabricated: ['f'], missing: [], evidence: [] } }]);
  assert.equal(digest[0].path, 'a.js');
  assert.equal(digest[0].drift, 'minor');
  const many = Array.from({ length: 80 }, (_, i) => ({ title: `t${i}`, category: 'Dead code', severity: 'low', evidence: 'p.js' }));
  const norm = insights.normalizeInsights(many);
  assert.equal(norm.length, 50, 'clamped to 50');
  // tolerate string input with fence + prose
  const fromStr = insights.normalizeInsights('here:\n```json\n[{"title":"x","category":"Stale docs","severity":"high","evidence":"d.md:1"}]\n```');
  assert.equal(fromStr[0].severity, 'high');
  const md = insights.buildReport([{ title: 'Bug', category: 'Security gap', severity: 'high', evidence: 'a.js:1', estimated_fix_effort_minutes: 30, wave_candidate: 'Wave 24' }], { total_files: 10 }, { histogram: { none: 8, minor: 2, major: 0 }, avg_score: 9 });
  assert.match(md, /# Mooter Self-Audit/);
  assert.match(md, /Top 10 critical issues/);
  assert.match(md, /Security gap/);
});

// 5 — benchmark
test('audit_benchmark: rougeL bounds + cost rows + lora gating', () => {
  assert.equal(benchmark.rougeL('a b c', 'a b c'), 1, 'identical → 1');
  assert.equal(benchmark.rougeL('a b c', 'x y z'), 0, 'disjoint → 0');
  assert.ok(benchmark.rougeL('the cat sat', 'the cat ran') > 0 && benchmark.rougeL('the cat sat', 'the cat ran') < 1);
  assert.equal(benchmark.lcsLen('abcd'.split(''), 'abd'.split('')), 3);
  // costBreakdown is robust even with absent stats (returns rows + totals)
  const c = benchmark.costBreakdown();
  assert.ok(Array.isArray(c.rows) && c.rows.length >= 2);
  assert.ok(typeof c.totals.saved_pct === 'number');
  // T0 corpus row is always $0 actual
  const t0 = c.rows.find((r) => r.tier === 'T0');
  assert.equal(t0.cost_actual, 0, 'local T0 is free');
});

// 6 — pipeline
test('audit_pipeline: status reports all phases + infra present', () => {
  const s = pipeline.status();
  assert.equal(s.phase0_infra, true, 'all 6 infra files exist');
  assert.ok('phase1_corpus' in s && 'phase4_benchmark' in s);
  assert.equal(typeof s.phase2_validate.done, 'boolean');
  assert.ok(typeof pipeline.PLAN === 'string' && pipeline.PLAN.includes('Phase 1'));
});
