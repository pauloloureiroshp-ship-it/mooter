// decisions_v2.js — unit tests (Wave 19 Day 3, 19.B).
// Proves: (1) a classify decision maps to the {ts,op,tier,llm,tokens_in,
// tokens_out,reason,via} schema with reasons derived from real fields only;
// (2) the writer is metadata-only — prompt / prompt_preview NEVER leak — and
// writes its own JSONL without touching decisions.log.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v2 = require('./decisions_v2.js');

test('recordFromDecision maps the schema + derives reasons from real fields', () => {
  // classify_score path
  const r1 = v2.recordFromDecision(
    { task_category: 'cross_file_change', tier: 'T2', recommended_model: 'claude-sonnet-4-6', confidence: 0.75, recommended_backend: 'claude_subagent' },
    { ts: '2026-06-05T10:30:00Z' },
  );
  assert.deepEqual(r1, {
    ts: '2026-06-05T10:30:00Z',
    op: 'cross_file_change',
    tier: 'T2',
    llm: 'sonnet',
    // C1.3 — `null`, e nao `0`. Esta funcao corre no hook de UserPromptSubmit,
    // ANTES de a execucao existir: um `0` aqui afirmava uma medicao («esta
    // chamada gastou zero tokens») onde a verdade e «ainda nao ha o que medir».
    tokens_in: null,
    tokens_out: null,
    tokens_fonte: null,
    reason: 'classify_score=0.75 T2',
    via: 'claude_subagent',
    auto_skill: null,
    auto_skill_conf: null,
  });

  // escalation_rule wins over the score; subagent is the via
  const r2 = v2.recordFromDecision({ tier: 'T3', recommended_model: 'opus', escalation_rule: 'beast_intent_force_t3', suggested_subagent: 'model-architect' });
  assert.equal(r2.reason, 'beast_intent_force_t3');
  assert.equal(r2.via, 'model-architect');
  assert.equal(r2.llm, 'opus');

  // safety boost is normalized to its kind
  const r3 = v2.recordFromDecision({ tier: 'T3', safety_boost_applied: true, safety_boost_reason: 'architectural_keyword: schema' });
  assert.equal(r3.reason, 'safety_boost_architectural_keyword');

  // local tier default llm + tokens passthrough when present
  const r4 = v2.recordFromDecision({ tier: 'T0', task_category: 'summarize_file', tokens_in: 1200, tokens_out: 300, via: 'local-summarizer' });
  assert.equal(r4.llm, 'qwen3:30b');
  assert.equal(r4.tokens_in, 1200);
  assert.equal(r4.tokens_out, 300);
  assert.equal(r4.tokens_fonte, 'medido', 'tokens presentes sem fonte declarada sao indistinguiveis de inventados');
  assert.equal(r4.via, 'local-summarizer');
  // no directive → auto_skill stays null (never fabricated)
  assert.equal(r4.auto_skill, null);
  assert.equal(r4.auto_skill_conf, null);

  // Cockpit v2 W1: a decision that carried an auto-skill directive records it.
  const r5 = v2.recordFromDecision({
    tier: 'T1', task_category: 'diagram', recommended_model: 'haiku',
    auto_skill: 'anthropic-skills:canvas-design', auto_skill_conf: 0.92,
  });
  assert.equal(r5.auto_skill, 'anthropic-skills:canvas-design');
  assert.equal(r5.auto_skill_conf, 0.92);
});

test('writer is metadata-only (zero PII) and does not touch decisions.log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-v2-'));
  const v2log = path.join(dir, 'decisions_v2.jsonl');
  const legacy = path.join(dir, 'decisions.log');
  fs.writeFileSync(legacy, '{"event":"classified","tier":"T2"}\n'); // pre-existing legacy line
  const legacyBefore = fs.readFileSync(legacy, 'utf8');

  // A decision carrying prompt text + prompt_preview (the PII fields).
  v2.appendFromDecision(
    {
      tier: 'T0', task_category: 'summarize_file', recommended_model: 'qwen3:30b', confidence: 0.9,
      prompt: 'SECRET user prompt with private data',
      prompt_preview: 'SECRET user prompt with private data',
    },
    { logPath: v2log, ts: '2026-06-05T11:00:00Z' },
  );

  const written = fs.readFileSync(v2log, 'utf8').trim();
  const rec = JSON.parse(written);
  // Exactly the schema fields — nothing else.
  assert.deepEqual(Object.keys(rec).sort(), [...v2.SCHEMA_FIELDS].sort());
  assert.ok(!written.includes('SECRET'), 'no prompt text leaked');
  assert.ok(!('prompt' in rec) && !('prompt_preview' in rec), 'PII fields stripped');
  assert.equal(rec.op, 'summarize_file');
  assert.equal(rec.llm, 'qwen3:30b');

  // decisions.log is untouched by the v2 writer (backwards-compat).
  assert.equal(fs.readFileSync(legacy, 'utf8'), legacyBefore);

  fs.rmSync(dir, { recursive: true, force: true });
});

/* ── C1.3: tokens medidos, e a recusa de os inventar ─────────────────────── */

test('appendMeasured recusa escrever sem tokens finitos', () => {
  const os_ = require('os'); const fs_ = require('fs'); const path_ = require('path');
  const dir = fs_.mkdtempSync(path_.join(os_.tmpdir(), 'dv2-'));
  const logPath = path_.join(dir, 'd.jsonl');
  assert.equal(v2.appendMeasured({ tier: 'T2' }, { logPath }), null, 'escreveu uma decisao sem medicao nenhuma');
  assert.equal(v2.appendMeasured({ tier: 'T2', tokens_in: '', tokens_out: null }, { logPath }), null,
    'Number("") e 0 — coagir isso poria um zero inventado no corpus');
  assert.equal(v2.appendMeasured({ tier: 'T2', tokens_in: NaN }, { logPath }), null);
  // Finitude nao chega: `-1` e finito e nao e uma contagem de tokens. Sem esta
  // metade, um negativo entrava rotulado `medido` e contava como cobertura.
  assert.equal(v2.appendMeasured({ tier: 'T2', tokens_in: -1, tokens_out: -20 }, { logPath }), null,
    'um negativo nao e uma medicao');
  assert.equal(fs_.existsSync(logPath), false, 'criou o ficheiro sem ter escrito nada');
  fs_.rmSync(dir, { recursive: true, force: true });
});

test('appendMeasured escreve o que MEDIU, e diz que mediu', () => {
  const os_ = require('os'); const fs_ = require('fs'); const path_ = require('path');
  const dir = fs_.mkdtempSync(path_.join(os_.tmpdir(), 'dv2-'));
  const logPath = path_.join(dir, 'd.jsonl');
  const rec = v2.appendMeasured(
    { op: 'cross_file_change', tier: 'T3', llm: 'claude-opus-4-6', tokens_in: 21878, tokens_out: 26, via: 'mooter-codex' },
    { logPath, ts: '2026-09-02T11:24:00Z' },
  );
  assert.equal(rec.tokens_in, 21878);
  assert.equal(rec.tokens_out, 26);
  assert.equal(rec.tokens_fonte, 'medido');
  assert.equal(rec.llm, 'opus');
  assert.equal(rec.via, 'mooter-codex');
  const linhas = fs_.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(linhas.length, 1);
  assert.deepEqual(Object.keys(JSON.parse(linhas[0])).sort(), [...v2.SCHEMA_FIELDS].sort(),
    'a linha escrita saiu fora do esquema — o whitelist e a defesa de privacidade');
  fs_.rmSync(dir, { recursive: true, force: true });
});

test('um zero MEDIDO passa — e a diferenca toda entre 0 e n/d', () => {
  const os_ = require('os'); const fs_ = require('fs'); const path_ = require('path');
  const dir = fs_.mkdtempSync(path_.join(os_.tmpdir(), 'dv2-'));
  const logPath = path_.join(dir, 'd.jsonl');
  const rec = v2.appendMeasured({ tier: 'T0', tokens_in: 0, tokens_out: 0 }, { logPath });
  assert.equal(rec.tokens_in, 0);
  assert.equal(rec.tokens_fonte, 'medido', 'um zero medido tem de ficar distinguivel de um zero inventado');
  fs_.rmSync(dir, { recursive: true, force: true });
});

test('o conector escreve no corpus — e nunca deixa a telemetria partir um job', () => {
  const fs_ = require('fs'); const path_ = require('path');
  const seamless = fs_.readFileSync(
    path_.join(__dirname, '..', '..', 'packages', 'mooter-bridge', 'seamless.js'), 'utf8');
  assert.match(seamless, /dec\.appendMeasured\(/, 'o conector mede os tokens e nao os entrega ao corpus');
  const i = seamless.indexOf('dec.appendMeasured(');
  const bloco = seamless.slice(seamless.lastIndexOf('try {', i), seamless.indexOf('}', i + 400));
  assert.match(bloco, /^\s*try \{/, 'a escrita nao esta protegida — um corpus ilegivel derrubaria o job');
});
