#!/usr/bin/env node
/**
 * Unit tests for backtest.js and update-router.js.
 * Uses node:test (no deps). Run with: node backtest.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  analyze,
  buildTuning,
  signature,
  sampleWeight,
  isHonoredUpgrade,
  computeCorrectionRepeats,
} = require('./backtest.js');
const patterns = require('./patterns.js');

// ── signature() ────────────────────────────────────────────────────────────

test('signature: lowercases and keeps first 3 meaningful words', () => {
  assert.equal(signature('Review Final Antes de Fazer Push'), 'review final antes');
  assert.equal(signature('  Olá,  mundo!  '), 'olá mundo');
  assert.equal(signature(''), '');
  assert.equal(signature(undefined), '');
});

test('signature: strips punctuation across unicode', () => {
  assert.equal(signature('porquê? isto não funciona.'), 'porquê isto não');
});

// ── analyze() ──────────────────────────────────────────────────────────────

const FIXTURE = [
  // high-risk preview — must be filtered out of all candidate buckets
  { prompt_preview: 'review final antes de push', prompt_len: 28, tier: 'T3', confidence: 0.75 },
  { prompt_preview: 'deploy para produção agora', prompt_len: 26, tier: 'T3', confidence: 0.9 },
  // legitimate short+high-tier noise — should be proposed as demote
  { prompt_preview: 'decompõe o sprint 9', prompt_len: 20, tier: 'T2', confidence: 0.7 },
  { prompt_preview: 'decompõe o sprint 10', prompt_len: 21, tier: 'T2', confidence: 0.7 },
  // low-conf short — should be proposed as promote-to-T0 candidate
  { prompt_preview: 'ok vamos', prompt_len: 8, tier: 'T2', confidence: 0.45 },
  // trivial T0 baseline
  { prompt_preview: 'que horas são', prompt_len: 14, tier: 'T0', confidence: 0.8 },
];

test('analyze: counts tiers correctly', () => {
  const s = analyze(FIXTURE);
  assert.equal(s.total, 6);
  assert.equal(s.byTier.T3, 2);
  assert.equal(s.byTier.T2, 3);
  assert.equal(s.byTier.T0, 1);
});

test('analyze: HIGH_RISK previews never enter demote candidates', () => {
  const s = analyze(FIXTURE);
  const patterns = s.topDemote.map(d => d.pattern);
  assert.ok(!patterns.some(p => /review final/.test(p)), 'review final must be filtered');
  assert.ok(!patterns.some(p => /deploy/.test(p)), 'deploy must be filtered');
});

test('analyze: legitimate short+high-tier noise appears in demote candidates', () => {
  const s = analyze(FIXTURE);
  const patterns = s.topDemote.map(d => d.pattern);
  assert.ok(patterns.some(p => p.startsWith('decompõe o sprint')));
});

test('analyze: short low-conf becomes promote candidate', () => {
  const s = analyze(FIXTURE);
  assert.ok(s.promoteToT0.some(p => p.startsWith('ok vamos')));
});

test('analyze: empty decisions returns zero sample', () => {
  const s = analyze([]);
  assert.equal(s.total, 0);
  assert.equal(s.topDemote.length, 0);
});

// ── buildTuning() ──────────────────────────────────────────────────────────

test('buildTuning: emits complexity_threshold within expected range', () => {
  const s = analyze(FIXTURE);
  const t = buildTuning(s);
  assert.ok(t.complexity_threshold >= 0.25 && t.complexity_threshold <= 0.35);
  assert.ok(Array.isArray(t.promote_to_t0_patterns));
  assert.ok(Array.isArray(t.demote_from_t3_patterns));
  assert.ok(typeof t.generated_at === 'string');
  assert.equal(t.sample_size, 6);
});

test('buildTuning: tighter threshold on higher noise ratio', () => {
  // Stack the deck: 5 short+high-tier, 1 trivial → noiseRatio = 5/6 ≈ 0.83
  const noisy = [
    { prompt_preview: 'a b c', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'd e f', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'g h i', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'j k l', prompt_len: 5, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'm n o', prompt_len: 5, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'trivia', prompt_len: 7, tier: 'T0', confidence: 0.8 },
  ];
  const t = buildTuning(analyze(noisy));
  assert.equal(t.complexity_threshold, 0.25);
});

// ── update-router idempotency (integration) ────────────────────────────────

test('update-router: TUNED block is idempotent across runs', () => {
  const ROUTER = path.join(os.homedir(), '.claude', 'tools', 'router');
  const CLASSIFY = path.join(ROUTER, 'classify.js');
  const UPDATE = path.join(ROUTER, 'update-router.js');

  // Snapshot current classify.js
  const before = fs.readFileSync(CLASSIFY, 'utf8');

  const run1 = spawnSync(process.execPath, [UPDATE], { encoding: 'utf8' });
  assert.equal(run1.status, 0, `update-router run1 failed: ${run1.stderr}`);
  const after1 = fs.readFileSync(CLASSIFY, 'utf8');

  const run2 = spawnSync(process.execPath, [UPDATE], { encoding: 'utf8' });
  assert.equal(run2.status, 0, `update-router run2 failed: ${run2.stderr}`);
  const after2 = fs.readFileSync(CLASSIFY, 'utf8');

  assert.equal(after1, after2, 'second run must be a no-op (idempotent)');

  // ⚠️ 2026-08-29 — aqui exigia-se `exactly one TUNED block must exist` dentro do
  // `classify.js`. Isso e HOJE o oposto do que o projecto garante: o ficheiro esta
  // FROZEN com sha `427d8c0b` verificado no CI, e injectar-lhe um bloco quebraria
  // a invariante mais dura que temos. O mecanismo mudou por essa razao — o
  // `update-router` escreve agora em `tuning-state.json` ("no changes
  // (tuning-state.json already current)"), fora do ficheiro congelado.
  //
  // O teste ficou a guardar o mecanismo pre-freeze e por isso era um vermelho que
  // so podia ficar verde violando o freeze. Passa a guardar o que importa de
  // facto, e que e uma garantia MAIS FORTE: correr o tuner NAO pode mexer no
  // ficheiro congelado.
  const SHA_FROZEN = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';
  const sha = require('crypto').createHash('sha256').update(after2).digest('hex');
  assert.equal(sha, SHA_FROZEN,
    'update-router mexeu no classify.js FROZEN — isto e um incidente, nao uma falha de teste');
  assert.equal(before, after2, 'o tuner nao pode reescrever o classificador congelado');

  // E a afinacao tem de viver algures: fora do ficheiro congelado.
  assert.ok(fs.existsSync(path.join(ROUTER, 'tuning-state.json')),
    'o tuning saiu do classify.js — tem de existir em tuning-state.json');
});

test('classify.js: high-risk prompts ignore TUNED demote/promote', () => {
  const CLASSIFY = path.join(os.homedir(), '.claude', 'tools', 'router', 'classify.js');
  const r = spawnSync(
    process.execPath,
    [CLASSIFY, 'review final antes de fazer push'],
    { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: 'fake' } }
  );
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.tier, 'T3', 'pre-push must stay T3 regardless of TUNED patterns');
});

// ── v0.6 cost model (pricing.js + savings-tracker.js token math) ────────────

const pricing = require('./pricing.js');
const tracker = require('./savings-tracker.js');

test('pricing: Opus turn costs 4-60× a Haiku turn of same size', () => {
  const opus = pricing.priceTurn('claude-opus-4-6', 10000, 1000);
  const haiku = pricing.priceTurn('claude-haiku-4-5', 10000, 1000);
  const ratio = opus / haiku;
  // 2026-04-16 Opus 4.6 dropped to $5/$25 — ratio vs Haiku $1/$5 is now ~5×,
  // not the 18-60× it was at the old $15/$75 rate.
  assert.ok(ratio >= 4 && ratio <= 60,
    `Opus/Haiku ratio was ${ratio.toFixed(1)}, expected 4-60 (post-2026-04 Opus 4.6 pricing).`);
});

test('pricing: Ollama is strictly free and unknown models fall back', () => {
  assert.equal(pricing.priceTurn('qwen2.5:3b', 99999, 99999), 0);
  assert.equal(pricing.priceTurn('ollama:whatever', 1, 1), 0);
  const fallback = pricing.priceTurn('completely-unknown-model', 1_000_000, 1_000_000);
  // Fallback is Sonnet-tier {3, 15} → 18 USD exactly
  assert.ok(fallback > 0 && fallback < 100, 'fallback should be finite and non-zero');
});

test('pricing: estimateTurnCost scales monotonically with prompt length', () => {
  const small = pricing.estimateTurnCost('T3', 100);
  const medium = pricing.estimateTurnCost('T3', 5000);
  const large = pricing.estimateTurnCost('T3', 50000);
  assert.ok(small < medium, 'small < medium');
  assert.ok(medium < large, 'medium < large');
  // Large prompt on Opus should be realistic (~$0.50-$5 range)
  assert.ok(large > 0.1, `expected large Opus prompt > $0.10, got $${large.toFixed(4)}`);
});

test('savings-tracker: isSystemPrompt filters Claude Code hook echoes', () => {
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '<task-notification> hello' }), true);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '<system-reminder> foo' }), true);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: 'que horas são' }), false);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '' }), false);
});

test('savings-tracker: computeMetrics excludes system prompts from counts', () => {
  const lines = [
    JSON.stringify({ event: 'classified', tier: 'T0', prompt_len: 14, prompt_preview: 'que horas são' }),
    JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 400, prompt_preview: '<task-notification> hook' }),
    JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 800, prompt_preview: 'refactor the vault' }),
    JSON.stringify({ event: 'option_a_hit', prompt_len: 14 }),
  ];
  const m = tracker.computeMetrics(lines);
  assert.equal(m.prompts, 2, '2 user prompts after filtering');
  assert.equal(m.system_prompts_filtered, 1, '1 system prompt filtered');
  assert.equal(m.option_a_hits, 1, '1 Option-A hit counted');
  assert.equal(m.by_tier.T0, 1);
  assert.equal(m.by_tier.T3, 1);
  assert.ok(m.guaranteed_saved > 0, 'Option-A hit should produce guaranteed savings');
  assert.ok(m.real_cost_estimated > 0, 'T3 prompt should produce non-zero estimated cost');
  assert.equal(m.version, '0.7.0');
});

test('savings-tracker: saved_pct is a percentage, real_cost < naive_cost', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(JSON.stringify({ event: 'classified', tier: 'T0', prompt_len: 50, prompt_preview: 'q' + i }));
  }
  lines.push(JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 5000, prompt_preview: 'big refactor' }));
  const m = tracker.computeMetrics(lines);
  assert.ok(m.real_cost_estimated < m.naive_cost, 'router should save money on T0-heavy corpus');
  assert.ok(m.saved_pct > 50 && m.saved_pct < 100, `expected 50-100%, got ${m.saved_pct}`);
});

// ── v0.6.1 user override (in-prompt model pinning) ─────────────────────────

function classifyPrompt(prompt, env) {
  const CLASSIFY = path.join(os.homedir(), '.claude', 'tools', 'router', 'classify.js');
  const r = spawnSync(process.execPath, [CLASSIFY, prompt],
    { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  assert.equal(r.status, 0, `classify.js failed for "${prompt}": ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ── v0.10.1 guardrail regression: adversarial probe 2026-04-18 caught these ──
//    all of the following were leaking to T0 gemma4 before patterns.js fix

test('HIGH_RISK regression: "vou fazer push" → T3 (PT naked push)', () => {
  const r = classifyPrompt('vou fazer push');
  assert.equal(r.tier, 'T3', 'naked push is production-touching');
});

test('HIGH_RISK regression: "git push origin main" → T3', () => {
  const r = classifyPrompt('git push origin main');
  assert.equal(r.tier, 'T3', 'any `git push` is production-touching');
});

test('HIGH_RISK regression: "estou pronto para merge" → T3', () => {
  const r = classifyPrompt('estou pronto para merge');
  assert.equal(r.tier, 'T3', 'PT "pronto para merge" is a release gate');
});

test('HIGH_RISK regression: "ready to ship" → T3', () => {
  const r = classifyPrompt('ready to ship this feature');
  assert.equal(r.tier, 'T3', 'EN "ready to ship" is a release gate');
});

test('HIGH_RISK regression: "ship it" → T3', () => {
  const r = classifyPrompt('all looks good, ship it');
  assert.equal(r.tier, 'T3', '"ship it" is a release signal');
});

test('HIGH_RISK regression: "preciso de push" → T3', () => {
  const r = classifyPrompt('preciso de push agora');
  assert.equal(r.tier, 'T3', 'PT "preciso de push" is a release gate');
});

test('user override: positive "usa o opus" pins T3 + Opus', () => {
  const r = classifyPrompt('usa o opus para revisar isto rapidamente');
  assert.equal(r.tier, 'T3');
  assert.equal(r.recommended_model, 'claude-opus-4-6');
  assert.equal(r.user_override.honored, true);
  assert.equal(r.user_override.kind, 'positive');
  assert.equal(r.user_override.requested, 'opus');
});

test('user override: short form "@sonnet" pins T2 + Sonnet', () => {
  const r = classifyPrompt('@sonnet diagnostica este bug do websocket');
  assert.equal(r.tier, 'T2');
  assert.equal(r.recommended_model, 'claude-sonnet-4-6');
  assert.equal(r.user_override.honored, true);
  assert.equal(r.user_override.kind, 'short');
});

test('user override: forced "force ollama" pins T0', () => {
  const r = classifyPrompt('force ollama para esta tarefa simples');
  assert.equal(r.tier, 'T0');
  assert.equal(r.recommended_backend, 'ollama');
  assert.equal(r.user_override.honored, true);
  assert.equal(r.user_override.kind, 'forced');
});

test('user override: negative "sem opus" demotes one tier', () => {
  // Trigger a normally-T3 prompt then negate
  const r = classifyPrompt('sem opus, faz uma análise rápida deste código');
  // The base prompt is short → T0 already, so refusal-reason "already_at_T0"
  assert.equal(r.user_override.kind, 'negative');
  assert.equal(r.user_override.honored, false);
  assert.equal(r.user_override.reason, 'already_at_T0');
});

test('user override: HIGH_RISK refuses downgrade ("usa ollama para deploy de produção")', () => {
  const r = classifyPrompt('usa ollama para fazer o deploy de produção');
  assert.equal(r.tier, 'T3', 'high-risk must stay T3');
  assert.equal(r.user_override.honored, false);
  assert.equal(r.user_override.reason, 'high_risk_signal_present');
  assert.equal(r.escalation_rule, 'user_override_refused_high_risk');
});

test('user override: HIGH_RISK refuses negative "@haiku review final antes de push"', () => {
  const r = classifyPrompt('@haiku review final antes de push');
  assert.equal(r.tier, 'T3', 'pre-push must stay T3 even with @haiku request');
  assert.equal(r.user_override.honored, false);
});

test('user override: assignment "model: gemini" pins Gemini Flash T0', () => {
  const r = classifyPrompt('model: gemini — explica este snippet');
  assert.equal(r.tier, 'T0');
  assert.equal(r.recommended_model, 'gemini-2.5-flash');
  assert.equal(r.recommended_backend, 'gemini');
  assert.equal(r.user_override.honored, true);
  assert.equal(r.user_override.kind, 'assigned');
});

test('user override: NO override leaves classifier output untouched', () => {
  const r = classifyPrompt('refactora a arquitetura para multi-tenant');
  assert.equal(r.tier, 'T3', 'architecture should still escalate via heuristic');
  assert.ok(!r.user_override, 'no override field when no in-prompt request');
});

// ── v0.7 quality intent (natural-language quality promotion) ───────────────

test('quality intent: "preciso do teu melhor modelo" sets quality_intent=true', () => {
  const r = classifyPrompt('Claude preciso do teu melhor modelo para isto');
  assert.equal(r.quality_intent, true);
  // Short+ambiguous (T0) → promoted to T1 → jumped to T2 (no API key path)
  assert.ok(r.tier === 'T1' || r.tier === 'T2', `expected T1/T2, got ${r.tier}`);
  assert.ok(r.escalation_rule.includes('quality_intent'));
});

test('quality intent: "pensa bem" promotes one tier', () => {
  const r = classifyPrompt('pensa bem antes de responder a isto');
  assert.equal(r.quality_intent, true);
  assert.ok(r.escalation_rule.includes('quality_intent'));
});

test('quality intent: EN "think hard" triggers promotion', () => {
  const r = classifyPrompt('think hard about this carefully');
  assert.equal(r.quality_intent, true);
});

test('quality intent: "ultrathink" triggers promotion', () => {
  const r = classifyPrompt('ultrathink this problem');
  assert.equal(r.quality_intent, true);
});

test('quality intent: "give me your best effort" triggers promotion', () => {
  const r = classifyPrompt('give me your best effort on this');
  assert.equal(r.quality_intent, true);
});

test('quality intent: caps at T3 (does not go above)', () => {
  const r = classifyPrompt('pensa bem na arquitetura do deploy para produção');
  assert.equal(r.tier, 'T3');
  assert.equal(r.quality_intent, true);
});

test('quality intent: @haiku user override wins over quality intent', () => {
  const r = classifyPrompt('@haiku pensa bem nisto');
  assert.equal(r.tier, 'T1', 'user override must win — Haiku pinned');
  assert.equal(r.user_override.honored, true);
  assert.equal(r.quality_intent, true, 'quality_intent detection still runs');
});

test('quality intent: NO trigger on neutral prompt', () => {
  const r = classifyPrompt('lista os ficheiros modified hoje');
  assert.equal(r.quality_intent, false);
});

// ── v0.7 sub-tier routing (code/math/general specialists) ──────────────────

test('sub-tier: code prompt at T0 → qwen2.5-coder specialist', () => {
  const r = classifyPrompt('explica o que faz esta função async await');
  assert.equal(r.tier, 'T0');
  assert.equal(r.t0_subtier, 'code');
  assert.equal(r.recommended_model, 'qwen2.5-coder:14b');
});

test('sub-tier: math prompt at T0 → deepseek-r1 specialist', () => {
  const r = classifyPrompt('calcula o integral de x ao quadrado');
  assert.equal(r.tier, 'T0');
  assert.equal(r.t0_subtier, 'math');
  // ⚠️ 2026-08-29 — este teste exigia `deepseek-r1-distill-qwen:14b` e falhava
  // desde que o `classify.js` passou a `ollama_math: 'deepseek-r1:7b'` (linha 168,
  // FROZEN sha 427d8c0b). Como o ficheiro nao pode ser alterado, o teste NUNCA
  // podia voltar ao verde: nao era um sinal, era um vermelho permanente — e um
  // vermelho permanente ensina a suite inteira a ser ignorada.
  // Passa a afirmar o contrato REAL: o default congelado, e o env que o sobrepoe.
  assert.equal(r.recommended_model, 'deepseek-r1:7b', 'default congelado em classify.js:168');
});

test('sub-tier: math — ROUTER_OLLAMA_MATH sobrepoe o default congelado', () => {
  // Isto e o que vale a pena guardar: o modelo e configuravel sem tocar no
  // ficheiro FROZEN. Fixar o nome do modelo era guardar a escolha; guardar o
  // override e guardar a capacidade.
  const r = classifyPrompt('calcula o integral de x ao quadrado',
    { ROUTER_OLLAMA_MATH: 'deepseek-r1-distill-qwen:14b' });
  assert.equal(r.t0_subtier, 'math');
  assert.equal(r.recommended_model, 'deepseek-r1-distill-qwen:14b');
});

test('sub-tier: general prompt at T0 → gemma4:e4b (v0.10 default)', () => {
  const r = classifyPrompt('lista os ficheiros modificados hoje');
  assert.equal(r.tier, 'T0');
  assert.equal(r.t0_subtier, 'general');
  // ⚠️ 2026-08-29 — dizia `gemma4:e4b`, e o `classify.js` (FROZEN) tem
  // `ollama_general: 'qwen2.5:3b'` (linha 164). O proprio comentario do ficheiro
  // explica porque: "Best-general selection runs in inject_context.js via
  // bestOllamaT0() against hw-capability" — a escolha do melhor modelo geral
  // SAIU do classificador de proposito, para depender do hardware real em vez de
  // um nome fixo. O teste ficou a guardar o contrato antigo.
  assert.equal(r.recommended_model, 'qwen2.5:3b',
    'fallback seguro congelado; a escolha do melhor geral vive em inject_context.js');
});

test('sub-tier: non-T0 decision has t0_subtier=null', () => {
  const r = classifyPrompt('refactora a arquitetura para multi-tenant');
  assert.equal(r.tier, 'T3');
  assert.equal(r.t0_subtier, null);
});

test('sub-tier: math symbol triggers specialist', () => {
  const r = classifyPrompt('resolve a equação com ∫x²dx');
  assert.equal(r.tier, 'T0');
  assert.equal(r.t0_subtier, 'math');
});

// ── v0.7 pricing registry (sub-tier specialists present) ───────────────────

test('pricing: qwen2.5-coder is free and has code strengths', () => {
  const entry = pricing.PRICES['qwen2.5-coder:14b-q4'];
  assert.ok(entry, 'qwen2.5-coder:14b-q4 must exist in registry');
  assert.equal(entry.input, 0);
  assert.equal(entry.output, 0);
  assert.ok(entry.strengths.includes('code'));
  assert.equal(entry.subtier, 'code');
});

test('pricing: deepseek-r1-distill is free and has math strengths', () => {
  const entry = pricing.PRICES['deepseek-r1-distill-qwen:14b'];
  assert.ok(entry, 'deepseek-r1-distill-qwen:14b must exist in registry');
  assert.equal(entry.input, 0);
  assert.ok(entry.strengths.includes('math'));
  assert.equal(entry.subtier, 'math');
});

test('pricing: specialists produce zero cost via priceTurn', () => {
  assert.equal(pricing.priceTurn('qwen2.5-coder:14b-q4', 10000, 1000), 0);
  assert.equal(pricing.priceTurn('deepseek-r1-distill-qwen:14b', 10000, 1000), 0);
});

// ── v0.7 backtest quality_intent + cache metrics ───────────────────────────

test('backtest analyze: counts quality_intent_hits', () => {
  const { analyze: analyzeFn } = require('./backtest.js');
  const fixture = [
    { prompt_preview: 'normal prompt', prompt_len: 50, tier: 'T0', confidence: 0.8, quality_intent: false },
    { prompt_preview: 'preciso do teu melhor', prompt_len: 30, tier: 'T2', confidence: 0.75, quality_intent: true },
    { prompt_preview: 'ultrathink this', prompt_len: 20, tier: 'T2', confidence: 0.75, quality_intent: true },
  ];
  const stats = analyzeFn(fixture);
  assert.equal(stats.qualityIntentHits, 2);
});

test('backtest analyze: counts cache_hits separately from total', () => {
  const { analyze: analyzeFn } = require('./backtest.js');
  const fixture = [
    { prompt_preview: 'cached one', prompt_len: 20, tier: 'T0', confidence: 0.8, cache_hit: true },
    { prompt_preview: 'cached two', prompt_len: 20, tier: 'T0', confidence: 0.8, cache_hit: true },
    { prompt_preview: 'fresh', prompt_len: 30, tier: 'T0', confidence: 0.8, cache_hit: false },
  ];
  const stats = analyzeFn(fixture);
  assert.equal(stats.cacheHits, 2);
  assert.equal(stats.total, 3);
});

// ── v0.7.2 turn latency (computeLatency pairing) ───────────────────────────

test('latency: pairs classified + turn_end by session_id', () => {
  const tracker = require('./savings-tracker.js');
  const now = Date.now();
  const lines = [
    JSON.stringify({ event: 'classified', ts_ms: now - 10000, session_id: 's1', tier: 'T2', prompt_len: 500, prompt_preview: 'bug hunt' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now - 7000,  session_id: 's1' }),
    JSON.stringify({ event: 'classified', ts_ms: now - 6000,  session_id: 's1', tier: 'T0', prompt_len: 30, prompt_preview: 'list files' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now - 4500,  session_id: 's1' }),
  ];
  const l = tracker.computeLatency(lines);
  assert.ok(l, 'latency result should not be null');
  assert.equal(l.sample_size, 2);
  assert.ok(l.p50_ms > 0);
  assert.ok(l.opus_baseline_ms_est > 0);
});

test('latency: drops anomalous turns longer than 10 minutes', () => {
  const tracker = require('./savings-tracker.js');
  const now = Date.now();
  const lines = [
    JSON.stringify({ event: 'classified', ts_ms: now - 3600000, session_id: 's1', tier: 'T2', prompt_len: 500, prompt_preview: 'user walked away' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now,           session_id: 's1' }),
    JSON.stringify({ event: 'classified', ts_ms: now - 5000,    session_id: 's2', tier: 'T0', prompt_len: 30, prompt_preview: 'quick one' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now - 2000,    session_id: 's2' }),
  ];
  const l = tracker.computeLatency(lines);
  assert.equal(l.sample_size, 1, 'only the realistic turn counts');
});

test('latency: returns null when no pairs exist', () => {
  const tracker = require('./savings-tracker.js');
  const lines = [
    JSON.stringify({ event: 'classified', ts_ms: Date.now(), session_id: 's1', tier: 'T2', prompt_len: 500, prompt_preview: 'unclosed' }),
  ];
  assert.equal(tracker.computeLatency(lines), null);
});

test('latency: Opus baseline scales with tier mix', () => {
  const tracker = require('./savings-tracker.js');
  const now = Date.now();
  // Heavy T3 corpus → high Opus baseline
  const heavy = [
    JSON.stringify({ event: 'classified', ts_ms: now - 5000, session_id: 'h', tier: 'T3', prompt_len: 5000, prompt_preview: 'architecture' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now,        session_id: 'h' }),
  ];
  // Heavy T0 corpus → low Opus baseline
  const light = [
    JSON.stringify({ event: 'classified', ts_ms: now - 1000, session_id: 'l', tier: 'T0', prompt_len: 30, prompt_preview: 'simple' }),
    JSON.stringify({ event: 'turn_end',   ts_ms: now,        session_id: 'l' }),
  ];
  const hl = tracker.computeLatency(heavy);
  const ll = tracker.computeLatency(light);
  assert.ok(hl.opus_baseline_ms_est > ll.opus_baseline_ms_est * 2);
});

// ── v0.8 Haiku arbiter ─────────────────────────────────────────────────────

const arbiter = require('./arbiter.js');

test('arbiter: extractDecision parses canonical Haiku JSON output', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"multi-step bug hunt with reproduction steps"}' }],
  });
  const d = arbiter.extractDecision(fakeApiResp);
  assert.ok(d);
  assert.equal(d.tier, 'T2');
  assert.equal(d.subagent, 'model-reasoner');
});

test('arbiter: extractDecision tolerates markdown fences', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: 'Here:\n```json\n{"tier":"T3","subagent":"model-architect","reasoning":"refactor multi-file auth"}\n```' }],
  });
  const d = arbiter.extractDecision(fakeApiResp);
  assert.ok(d);
  assert.equal(d.tier, 'T3');
});

test('arbiter: extractDecision rejects invalid tier', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: '{"tier":"T5","subagent":"model-architect","reasoning":"x"}' }],
  });
  assert.equal(arbiter.extractDecision(fakeApiResp), null);
});

test('arbiter: extractDecision rejects unknown subagent', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: '{"tier":"T2","subagent":"fake-agent","reasoning":"x"}' }],
  });
  assert.equal(arbiter.extractDecision(fakeApiResp), null);
});

test('arbiter: extractDecision rejects API error responses', () => {
  const errResp = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } });
  assert.equal(arbiter.extractDecision(errResp), null);
});

test('arbiter: arbitrate returns null without API key (no _mockResponse)', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(arbiter.arbitrate('hello world'), null);
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

test('arbiter: arbitrate honors _mockResponse and returns parsed decision', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"debug investigation"}' }],
  });
  const savedSwitch = process.env.MOOTER_ARBITER_DISABLE;
  delete process.env.MOOTER_ARBITER_DISABLE;
  try {
    const r = arbiter.arbitrate('why does this websocket reconnect flap?', {
      _mockResponse: fakeApiResp,
      _skipCache: true,
    });
    assert.ok(r);
    assert.equal(r.tier, 'T2');
    assert.equal(r.subagent, 'model-reasoner');
    assert.equal(r.cached, false);
  } finally {
    if (savedSwitch === undefined) delete process.env.MOOTER_ARBITER_DISABLE;
    else process.env.MOOTER_ARBITER_DISABLE = savedSwitch;
  }
});

test('arbiter: dedicated switch wins with or without ANTHROPIC_API_KEY', () => {
  const fakeApiResp = JSON.stringify({
    content: [{ type: 'text', text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"would call Haiku"}' }],
  });
  const savedSwitch = process.env.MOOTER_ARBITER_DISABLE;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.MOOTER_ARBITER_DISABLE = '1';
  try {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-inherited-friend-build-key';
    assert.equal(arbiter.arbitrate('ambiguous prompt with inherited key', {
      _mockResponse: fakeApiResp,
      _skipCache: true,
    }), null);

    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(arbiter.arbitrate('ambiguous prompt without key', {
      _mockResponse: fakeApiResp,
      _skipCache: true,
    }), null);
  } finally {
    if (savedSwitch === undefined) delete process.env.MOOTER_ARBITER_DISABLE;
    else process.env.MOOTER_ARBITER_DISABLE = savedSwitch;
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

test('arbiter: hashKey includes system prompt version for cache invalidation', () => {
  const k1 = arbiter.hashKey('same prompt');
  const k2 = arbiter.hashKey('same prompt');
  assert.equal(k1, k2, 'same prompt → same key');
  assert.equal(k1.length, 64, 'SHA-256 hex');
});

// ── v0.9: decomposition tests ─────────────────────────────────────────────
test('arbiter v0.9: extractDecision parses decomposition object', () => {
  const payload = {
    content: [{
      type: 'text',
      text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"multi","decomposition":{"applicable":true,"subtasks":[{"description":"summarize file A","tier":"T0","rationale":"trivial"},{"description":"find bug in file B","tier":"T2","rationale":"reasoning"}]}}',
    }],
  };
  const d = arbiter.extractDecision(JSON.stringify(payload));
  assert.ok(d);
  assert.ok(d.decomposition);
  assert.equal(d.decomposition.applicable, true);
  assert.equal(d.decomposition.subtasks.length, 2);
  assert.equal(d.decomposition.subtasks[0].tier, 'T0');
});

test('arbiter v0.9: extractDecision normalizes decomposition as bare array', () => {
  const payload = {
    content: [{
      type: 'text',
      text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"multi","decomposition":[{"task":"a","tier":"T0"},{"task":"b","tier":"T1"}]}',
    }],
  };
  const d = arbiter.extractDecision(JSON.stringify(payload));
  assert.ok(d);
  assert.ok(d.decomposition);
  assert.equal(d.decomposition.applicable, true);
  assert.equal(d.decomposition.subtasks.length, 2);
});

test('arbiter v0.9: decomposition with < 2 subtasks is non-applicable', () => {
  const payload = {
    content: [{
      type: 'text',
      text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"small","decomposition":{"applicable":true,"subtasks":[{"description":"one","tier":"T0"}]}}',
    }],
  };
  const d = arbiter.extractDecision(JSON.stringify(payload));
  assert.ok(d);
  assert.equal(d.decomposition.applicable, false);
});

test('arbiter: VALID_SUBAGENTS covers all 5 frugal subagents', () => {
  assert.ok(arbiter.VALID_SUBAGENTS.has('local-summarizer'));
  assert.ok(arbiter.VALID_SUBAGENTS.has('local-transformer'));
  assert.ok(arbiter.VALID_SUBAGENTS.has('cheap-triage'));
  assert.ok(arbiter.VALID_SUBAGENTS.has('model-reasoner'));
  assert.ok(arbiter.VALID_SUBAGENTS.has('model-architect'));
  assert.equal(arbiter.VALID_SUBAGENTS.size, 5);
});

// ── v0.7: patterns.js shared source of truth ──────────────────────────────
test('patterns v0.7: exports the 5 canonical arrays', () => {
  assert.ok(Array.isArray(patterns.HIGH_RISK));
  assert.ok(Array.isArray(patterns.MED_RISK));
  assert.ok(Array.isArray(patterns.LOW_RISK));
  assert.ok(Array.isArray(patterns.TRIVIAL));
  assert.ok(Array.isArray(patterns.TUNING_EXCLUDE));
  assert.ok(patterns.HIGH_RISK.length > 0);
  assert.ok(patterns.TUNING_EXCLUDE.length > 0);
});

test('patterns v0.7: every pattern is a RegExp (no string leaks)', () => {
  const all = [
    ...patterns.HIGH_RISK,
    ...patterns.MED_RISK,
    ...patterns.LOW_RISK,
    ...patterns.TRIVIAL,
    ...patterns.TUNING_EXCLUDE,
  ];
  for (const p of all) {
    assert.ok(p instanceof RegExp, `expected RegExp, got ${typeof p}: ${p}`);
  }
});

test('patterns v0.7: TUNING_EXCLUDE is a superset of HIGH_RISK', () => {
  // Every source-level HIGH_RISK pattern must be present in TUNING_EXCLUDE.
  // We compare by .source because RegExp instances aren't === comparable.
  const excludeSources = new Set(patterns.TUNING_EXCLUDE.map((r) => r.source));
  for (const hr of patterns.HIGH_RISK) {
    assert.ok(
      excludeSources.has(hr.source),
      `TUNING_EXCLUDE missing HIGH_RISK pattern: ${hr.source}`
    );
  }
});

test('patterns v0.7: classify.js imports HIGH_RISK from patterns.js', () => {
  // Read classify.js source and assert it does NOT define HIGH_RISK inline.
  // If someone re-inlines it, this test catches the regression.
  const classifySrc = fs.readFileSync(path.join(__dirname, 'classify.js'), 'utf8');
  assert.ok(
    /require\(['"]\.\/patterns['"]\)/.test(classifySrc),
    'classify.js must require("./patterns")'
  );
  assert.ok(
    !/^const HIGH_RISK = \[/m.test(classifySrc),
    'classify.js must NOT define HIGH_RISK inline'
  );
});

test('patterns v0.7: backtest.js imports TUNING_EXCLUDE from patterns.js', () => {
  const backtestSrc = fs.readFileSync(path.join(__dirname, 'backtest.js'), 'utf8');
  assert.ok(
    /require\(['"]\.\/patterns['"]\)/.test(backtestSrc),
    'backtest.js must require("./patterns")'
  );
  // The old inline HIGH_RISK_MARKERS definition must be gone.
  assert.ok(
    !/^const HIGH_RISK_MARKERS = \[/m.test(backtestSrc),
    'backtest.js must NOT define HIGH_RISK_MARKERS inline'
  );
});

test('patterns v0.7: HIGH_RISK still matches production-critical tokens', () => {
  // Regression: make sure the move to patterns.js didn't drop any strict
  // matcher. Spot-check the most load-bearing tokens.
  const mustMatch = [
    'git push --force',
    'drop table users',
    'rm -rf /',
    'migration plan',
    'architect this system',
    'refactor the auth layer',
    'touch local.env before deploy', // .env matches via \b\.env\b after word char
    'review final antes do merge',
    'package.json dependency bump',
    '.github/workflows/ci.yml',
  ];
  for (const text of mustMatch) {
    const hit = patterns.HIGH_RISK.some((r) => r.test(text));
    assert.ok(hit, `HIGH_RISK should match: "${text}"`);
  }
});

test('patterns v0.7: TUNING_EXCLUDE catches v0.9 hardening additions', () => {
  // The broader tuning-exclude markers added in v0.9 must still catch
  // their intended prompts, even though classify.js HIGH_RISK stays strict.
  const mustExclude = [
    'git push',           // bare push — excluded from auto-tuning
    'merge this branch',  // bare merge
    'review this diff',   // bare review
    'database schema change',
    'alter schema users',
    '--force flag',
  ];
  for (const text of mustExclude) {
    const hit = patterns.TUNING_EXCLUDE.some((r) => r.test(text));
    assert.ok(hit, `TUNING_EXCLUDE should match: "${text}"`);
  }
});

// ── B4 (2026-04-19): Implicit signal weight boost ──────────────────────────

test('B4 sampleWeight: returns 1 when boost disabled (pre-B4 behaviour preserved)', () => {
  const d = { prompt_preview: 'foo', explicit_rating: 0, shadow_demote: true };
  assert.equal(sampleWeight(d, { boost: false }), 1);
});

test('B4 sampleWeight: explicit_rating=0 weighs 10 when boost enabled', () => {
  const d = { prompt_preview: 'foo', explicit_rating: 0 };
  assert.equal(sampleWeight(d, { boost: true }), 10);
});

test('B4 sampleWeight: shadow_demote weighs 5 when boost enabled', () => {
  const d = { prompt_preview: 'foo', shadow_demote: true };
  assert.equal(sampleWeight(d, { boost: true }), 5);
});

test('B4 sampleWeight: honored user_override upgrade weighs 10', () => {
  const d = {
    prompt_preview: 'decompõe o sprint 11',
    tier: 'T3',
    user_override: { honored: true, kind: 'short', original_tier: 'T1' },
  };
  assert.equal(sampleWeight(d, { boost: true }), 10);
});

test('B4 sampleWeight: honored downgrade override does NOT count as upgrade', () => {
  const d = {
    prompt_preview: 'foo',
    tier: 'T1',
    user_override: { honored: true, kind: 'negative', original_tier: 'T3' },
  };
  assert.equal(sampleWeight(d, { boost: true }), 1);
});

test('B4 sampleWeight: refused (honored=false) override does NOT count', () => {
  const d = {
    prompt_preview: 'foo',
    tier: 'T3',
    user_override: { honored: false, kind: 'short', original_tier: 'T3' },
  };
  assert.equal(sampleWeight(d, { boost: true }), 1);
});

test('B4 sampleWeight: accepted feedback weighs 0.5 (weaker than default)', () => {
  const d = { prompt_preview: 'foo', feedback_signal: 'accepted' };
  assert.equal(sampleWeight(d, { boost: true }), 0.5);
});

test('B4 sampleWeight: repeat ≥2 in 7d multiplies weight ×5 (capped ×50)', () => {
  const repeats = new Map([['decompõe o sprint', 3]]);
  const d = {
    prompt_preview: 'decompõe o sprint 11',
    explicit_rating: 0, // base weight 10
  };
  // 10 * 5 = 50 (capped)
  assert.equal(sampleWeight(d, { boost: true, repeats }), 50);
});

test('B4 isHonoredUpgrade: returns true only for honored tier upgrades', () => {
  assert.equal(isHonoredUpgrade({ tier: 'T3', user_override: { honored: true, original_tier: 'T1' } }), true);
  assert.equal(isHonoredUpgrade({ tier: 'T1', user_override: { honored: true, original_tier: 'T1' } }), false);
  assert.equal(isHonoredUpgrade({ tier: 'T1', user_override: { honored: true, kind: 'negative', original_tier: 'T3' } }), false);
  assert.equal(isHonoredUpgrade({ tier: 'T3', user_override: { honored: false, original_tier: 'T1' } }), false);
  assert.equal(isHonoredUpgrade({ tier: 'T3' }), false);
});

test('B4 analyze: boost=false produces byte-identical topDemote to pre-B4', () => {
  const FIX = [
    { prompt_preview: 'decompõe o sprint 9', prompt_len: 20, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'decompõe o sprint 10', prompt_len: 21, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'decompõe o sprint 11', prompt_len: 21, tier: 'T2', confidence: 0.7 },
  ];
  const noOpt = analyze(FIX); // env-driven (off by default in tests)
  const explicitOff = analyze(FIX, { boost: false });
  assert.deepEqual(noOpt.topDemote, explicitOff.topDemote);
  // Every event counts as ×1 → weight equals count.
  assert.equal(explicitOff.topDemote[0].count, 3);
});

test('B4 analyze: boost=true reshuffles topDemote — correction signals dominate', () => {
  // signature() takes the first 3 lowercased words, so repeated prompts must
  // share the first 3 tokens to collapse into a single signature.
  const FIX = [
    // three low-signal "noisy" prompts on same signature → count 3, weight 3
    { prompt_preview: 'noise pattern one extra', prompt_len: 20, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'noise pattern one extra', prompt_len: 20, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'noise pattern one extra', prompt_len: 20, tier: 'T2', confidence: 0.7 },
    // one explicit /mooter-bad rating on a different signature → count 1, weight 10.
    // prompt_len is set >50 so the length-based heuristic does NOT double-push
    // this event into shortHighTier; only the explicit_rating=0 path should fire.
    {
      prompt_preview: 'gold signal rated', prompt_len: 120, tier: 'T3',
      explicit_rating: 0,
    },
  ];
  const unweighted = analyze(FIX, { boost: false });
  const weighted = analyze(FIX, { boost: true });

  // Unweighted: "noise pattern one" wins by frequency (count 3 > 1)
  assert.equal(unweighted.topDemote[0].pattern, 'noise pattern one');
  // Weighted: "gold signal rated" wins by weight (10 > 3)
  assert.equal(weighted.topDemote[0].pattern, 'gold signal rated');
  assert.equal(weighted.topDemote[0].count, 10);
});

test('B4 analyze: under-route candidates surface honored upgrade overrides', () => {
  // Same first 3 words → both events collapse into one signature.
  const FIX = [
    {
      prompt_preview: 'reescreve este parser agora',
      prompt_len: 30, tier: 'T3', confidence: 0.99,
      user_override: { honored: true, kind: 'short', original_tier: 'T1' },
    },
    {
      prompt_preview: 'reescreve este parser já',
      prompt_len: 30, tier: 'T3', confidence: 0.99,
      user_override: { honored: true, kind: 'positive', original_tier: 'T2' },
    },
  ];
  const weighted = analyze(FIX, { boost: true });
  assert.ok(weighted.weightBoost.enabled);
  assert.equal(weighted.weightBoost.topUnderRoute.length, 1);
  assert.equal(weighted.weightBoost.topUnderRoute[0].pattern, 'reescreve este parser');

  const off = analyze(FIX, { boost: false });
  // When boost is off, under-route bucket stays empty — zero behavioural drift.
  assert.equal(off.weightBoost.enabled, false);
  assert.equal(off.weightBoost.topUnderRoute.length, 0);
});

test('B4 computeCorrectionRepeats: counts corrections per signature within 7d', () => {
  const now = Date.now();
  const dayMs = 86400000;
  const decisions = [
    // 3 corrections on same sig within 7d
    { ts: new Date(now - 1 * dayMs).toISOString(), prompt_preview: 'decompõe o sprint a', explicit_rating: 0 },
    { ts: new Date(now - 2 * dayMs).toISOString(), prompt_preview: 'decompõe o sprint b', explicit_rating: 0 },
    { ts: new Date(now - 3 * dayMs).toISOString(), prompt_preview: 'decompõe o sprint c', shadow_demote: true },
    // 1 correction outside 7d (should be excluded)
    { ts: new Date(now - 30 * dayMs).toISOString(), prompt_preview: 'decompõe o sprint d', explicit_rating: 0 },
    // non-correction event (should be excluded)
    { ts: new Date(now - 1 * dayMs).toISOString(), prompt_preview: 'other pattern', tier: 'T2' },
  ];
  const repeats = computeCorrectionRepeats(decisions);
  assert.equal(repeats.get('decompõe o sprint'), 3);
  assert.equal(repeats.get('other pattern'), undefined);
});

test('B4 analyze: tester-generated events still skipped under boost', () => {
  const FIX = [
    {
      prompt_preview: 'tester synthetic prompt',
      prompt_len: 20, tier: 'T3',
      source: 'mooter-tester',
      user_override: { honored: true, kind: 'short', original_tier: 'T1' },
    },
  ];
  const weighted = analyze(FIX, { boost: true });
  assert.equal(weighted.weightBoost.topUnderRoute.length, 0);
});

// ── Wave-2 calibration mode (--calibration-only) ─────────────────────────
//
// Tests run the actual CLI via spawnSync against a fixture decisions.log
// pointed to by MOOTER_DECISIONS_LOG. Validates the three-state honesty
// surface: warning (drift confirmed) / note (gap visible but unreliable)
// / both null (nothing to report).

const BACKTEST_PATH = path.join(__dirname, 'backtest.js');

function runCalibration(events, lastN = 1000) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-bt-cal-'));
  const tmpLog = path.join(tmpDir, 'decisions.log');
  fs.writeFileSync(tmpLog, events.map((e) => JSON.stringify(e)).join('\n'));
  try {
    const r = spawnSync(process.execPath, [
      BACKTEST_PATH,
      '--calibration-only',
      `--last-n=${lastN}`,
    ], {
      encoding: 'utf8',
      env: { ...process.env, MOOTER_DECISIONS_LOG: tmpLog },
      timeout: 10_000,
    });
    if (r.status !== 0) {
      throw new Error(`backtest exit ${r.status}: ${r.stderr}`);
    }
    return JSON.parse(r.stdout);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

test('calibration: empty log → note=no_executed_events_in_log, warning=null', () => {
  const r = runCalibration([]);
  assert.equal(r.samples, 0);
  assert.equal(r.warning, null);
  assert.equal(r.note, 'no_executed_events_in_log');
});

test('calibration: low accuracy + few samples → note=below_min_sample_count, warning=null', () => {
  // 5 samples in 0.8-1.0 bin, all outcome != ok → 0% accuracy, count<100.
  const events = Array.from({ length: 5 }, (_, i) => ({
    event: 'executed',
    confidence: 0.9,
    outcome: 'deferred',
    tier: 'T1',
    ts: new Date(Date.now() - i * 1000).toISOString(),
  }));
  const r = runCalibration(events);
  assert.equal(r.samples, 5);
  assert.equal(r.bins['0.8-1.0'].count, 5);
  assert.equal(r.bins['0.8-1.0'].accuracy, 0);
  assert.equal(r.warning, null);
  assert.equal(r.note, 'below_min_sample_count');
});

test('calibration: low accuracy + many samples → warning=calibration_below_threshold', () => {
  // 120 samples, 50% ok → accuracy 0.5 < 0.9, count >= 100 → warning.
  const events = [];
  for (let i = 0; i < 120; i++) {
    events.push({
      event: 'executed',
      confidence: 0.9,
      outcome: i < 60 ? 'ok' : 'deferred',
      tier: 'T1',
      ts: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  const r = runCalibration(events);
  assert.equal(r.bins['0.8-1.0'].count, 120);
  assert.ok(r.bins['0.8-1.0'].accuracy < 0.9);
  assert.equal(r.warning, 'calibration_below_threshold');
  // note stays null when warning fires — they are mutually exclusive
  assert.equal(r.note, null);
});

test('calibration: high accuracy + many samples → both null (clean)', () => {
  // 120 samples, all ok → accuracy 1.0, no alert and no note.
  const events = Array.from({ length: 120 }, (_, i) => ({
    event: 'executed',
    confidence: 0.9,
    outcome: 'ok',
    tier: 'T1',
    ts: new Date(Date.now() - i * 1000).toISOString(),
  }));
  const r = runCalibration(events);
  assert.equal(r.bins['0.8-1.0'].accuracy, 1);
  assert.equal(r.warning, null);
  assert.equal(r.note, null);
});

test('calibration: MOOTER_DECISIONS_LOG override is honoured', () => {
  // Sentinel: a deliberately bizarre confidence ensures the report came
  // from the fixture, not the real decisions.log.
  const events = [{ event: 'executed', confidence: 0.95, outcome: 'ok', tier: 'T1', ts: new Date().toISOString() }];
  const r = runCalibration(events);
  assert.equal(r.samples, 1);
  assert.equal(r.bins['0.8-1.0'].count, 1);
});

// ── Wave-3 ECE-light extension ────────────────────────────────────────

test('calibration: bins_fine has all 5 buckets', () => {
  const events = [{ event: 'executed', confidence: 0.9, outcome: 'ok', tier: 'T1', ts: new Date().toISOString() }];
  const r = runCalibration(events);
  assert.ok(r.bins_fine, 'bins_fine present');
  const keys = Object.keys(r.bins_fine).sort();
  assert.deepEqual(keys, ['0.0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0']);
  // The single high-confidence sample lands in 0.8-1.0; lower bins are empty.
  assert.equal(r.bins_fine['0.8-1.0'].count, 1);
  assert.equal(r.bins_fine['0.0-0.2'].count, 0);
  assert.equal(r.bins_fine['0.2-0.4'].count, 0);
  // mid is 0.9 for the top bin (representative confidence)
  assert.equal(r.bins_fine['0.8-1.0'].mid, 0.9);
});

test('calibration: ECE is zero when accuracy matches confidence midpoint', () => {
  // 100 events at confidence=0.9 with 90% accuracy → ECE for 0.8-1.0 bin
  // should be close to zero (|0.9 - 0.9| × 1.0 weight = 0).
  const events = [];
  for (let i = 0; i < 100; i++) {
    events.push({
      event: 'executed',
      confidence: 0.9,
      outcome: i < 90 ? 'ok' : 'deferred',
      tier: 'T1',
      ts: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  const r = runCalibration(events);
  assert.ok(r.bins_fine['0.8-1.0'].count === 100);
  assert.ok(r.bins_fine['0.8-1.0'].accuracy === 0.9);
  assert.ok(typeof r.ece === 'number', 'ece is numeric');
  // |0.9 - 0.9| = 0 → ECE ≈ 0 (within rounding to 4 decimals)
  assert.ok(r.ece < 0.001, `expected ECE near zero for perfectly-calibrated bin; got ${r.ece}`);
});

test('calibration: ECE rises when bin accuracy diverges from midpoint', () => {
  // 100 events at confidence=0.9 with 0% accuracy → |accuracy - mid| = 0.9
  // Weight = 1.0 → ECE = 0.9.
  const events = [];
  for (let i = 0; i < 100; i++) {
    events.push({
      event: 'executed',
      confidence: 0.9,
      outcome: 'deferred',
      tier: 'T1',
      ts: new Date(Date.now() - i * 1000).toISOString(),
    });
  }
  const r = runCalibration(events);
  assert.ok(r.ece >= 0.85 && r.ece <= 0.95, `expected ECE near 0.9 for fully miscalibrated; got ${r.ece}`);
});

// ── linha `null` no log (2026-08-19) ────────────────────────────────────────

/**
 * `JSON.parse('null')` NAO lanca: devolve null. O `catch` do loadDecisions so
 * apanhava JSON ilegivel, nunca JSON legivel que nao e um evento — e o null
 * entrava na lista. Trinta linhas abaixo, `resolveFeedback` faz `e.event` e o
 * backtest inteiro morria com um TypeError.
 *
 * Medido no log real desta maquina: 3 linhas em 337. Uma so bastava para o
 * passo do backtest do `/mooter-update` falhar em qualquer maquina.
 */
test('uma linha `null` no log nao derruba o backtest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-bt-'));
  const log = path.join(dir, 'decisions.log');
  fs.writeFileSync(log, [
    JSON.stringify({ event: 'classified', tier: 'T2', session_id: 's1' }),
    'null',
    '{ isto nao e json',
    '"uma string solta"',
    '42',
    JSON.stringify({ event: 'turn_end', session_id: 's1' }),
  ].join('\n') + '\n');

  const anterior = process.env.MOOTER_DECISIONS_LOG;
  process.env.MOOTER_DECISIONS_LOG = log;
  try {
    // Recarregado para apanhar o LOG_PATH novo (e resolvido no topo do modulo).
    delete require.cache[require.resolve('./backtest.js')];
    const bt = require('./backtest.js');
    assert.equal(typeof bt.loadDecisions, 'function',
      'sem o export, este teste passava sem exercitar nada — a forma mais discreta de mentir');
    const carregadas = bt.loadDecisions();
    assert.equal(carregadas.length, 2, 'so os dois eventos reais entram');
    for (const e of carregadas) {
      assert.equal(typeof e, 'object');
      assert.notEqual(e, null, 'um null na lista e o TypeError a acontecer trinta linhas depois');
    }
    // E a prova de que o crash original nao volta: o consumidor le `.event`.
    assert.doesNotThrow(() => carregadas.filter((e) => e.event === 'turn_end'));
  } finally {
    if (anterior === undefined) delete process.env.MOOTER_DECISIONS_LOG;
    else process.env.MOOTER_DECISIONS_LOG = anterior;
    delete require.cache[require.resolve('./backtest.js')];
  }
});
