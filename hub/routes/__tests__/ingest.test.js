// Rankings R2 — ingestor (lib/ingest.js). Pure mapping/normalisation + runIngest
// against mocked AA/OpenRouter and an inline D1 stub. No network, no real DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeName,
  clamp01,
  orPriceToMtok,
  matchAaEntry,
  buildAaCells,
  buildPricingRows,
  runIngest,
  AA_URL,
  OPENROUTER_URL,
} from '../../lib/ingest.js';

const ID_MAP = {
  'gpt-5': { vendor: 'OpenAI', match_name: 'gpt 5', aa_slug: null, openrouter_id: 'openai/gpt-5' },
  'gemini-3.1-pro': { vendor: 'Google', match_name: 'gemini 3.1 pro', aa_slug: null, openrouter_id: 'google/gemini-3.1-pro' },
  'qwen3-30b': { vendor: 'Alibaba', match_name: 'qwen3 30b', aa_slug: null, openrouter_id: null },
};

const AA = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    slug: 'gpt-5',
    model_creator: { name: 'OpenAI' },
    evaluations: {
      artificial_analysis_intelligence_index: 60,
      artificial_analysis_coding_index: 55,
      artificial_analysis_math_index: 70,
      livecodebench: 0.42,
      scicode: 0.3,
    },
    pricing: { price_1m_blended_3_to_1: 3.4375, price_1m_input_tokens: 1.25, price_1m_output_tokens: 10 },
  },
  // gemini present in AA for prices but with no evaluations
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    slug: 'gemini-3-1-pro',
    model_creator: { name: 'Google' },
    evaluations: {},
    pricing: { price_1m_blended_3_to_1: 4.5, price_1m_input_tokens: 2, price_1m_output_tokens: 12 },
  },
];

const OR = [
  { id: 'openai/gpt-5', pricing: { prompt: '0.00000125', completion: '0.00001' } },
  { id: 'google/gemini-3.1-pro', pricing: { prompt: '0.000002', completion: '0.000012' } },
];

function fakeDb() {
  const writes = { cells: 0, prices: 0, rows: [] };
  return {
    prepare(sql) {
      return { _sql: sql, bind: (...a) => ({ _sql: sql, _args: a }) };
    },
    async batch(stmts) {
      for (const s of stmts) {
        if (s._sql.includes('benchmark_cells')) writes.cells++;
        else if (s._sql.includes('pricing_models')) writes.prices++;
        writes.rows.push(s);
      }
      return [];
    },
    _writes: writes,
  };
}

function mockFetch(aa, or) {
  return async (url) => {
    if (url === AA_URL) return { ok: true, status: 200, json: async () => ({ data: aa }) };
    if (url === OPENROUTER_URL) return { ok: true, status: 200, json: async () => ({ data: or }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('normalizeName + clamp01 + orPriceToMtok', () => {
  assert.equal(normalizeName('Claude Opus 4.8'), 'claudeopus48');
  assert.equal(clamp01(0.555555), 0.5556);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(null), null);
  assert.equal(orPriceToMtok('0.00000125'), 1.25); // per-token → $/Mtok
  assert.equal(orPriceToMtok(null), null);
});

test('matchAaEntry matches by exact normalized name', () => {
  const m = matchAaEntry(ID_MAP['gpt-5'], AA);
  assert.ok(m);
  assert.equal(m.entry.id, 'gpt-5');
  assert.equal(m.confidence, 'high');
});

test('buildAaCells maps each AA eval to ONE specific category (coding_index → coding.backend, not broadcast)', () => {
  const cells = buildAaCells(ID_MAP, AA, '2026-06-18');
  const gpt = cells.filter((c) => c.model === 'gpt-5');
  const cats = gpt.map((c) => c.category).sort();
  assert.deepEqual(cats, ['coding.backend', 'coding.competitive', 'reasoning.general', 'reasoning.math', 'reasoning.science']);
  // anti-fabrication: exactly one coding.* from the single coding_index
  assert.equal(gpt.filter((c) => c.category.startsWith('coding.') && c.source === 'artificial-analysis' && c.category !== 'coding.competitive').length, 1);
  // scales: index/100, sub-benchmark already 0–1
  assert.equal(gpt.find((c) => c.category === 'reasoning.general').score, 0.6);
  assert.equal(gpt.find((c) => c.category === 'coding.backend').score, 0.55);
  assert.equal(gpt.find((c) => c.category === 'coding.competitive').score, 0.42);
  for (const c of gpt) {
    assert.equal(c.source, 'artificial-analysis');
    assert.equal(c.as_of, '2026-06-18');
    assert.ok(c.score >= 0 && c.score <= 1);
  }
  // gemini has empty evaluations → no cells
  assert.equal(cells.filter((c) => c.model === 'gemini-3.1-pro').length, 0);
});

test('buildPricingRows prefers AA, cross-checks OpenRouter, never fabricates', () => {
  const rows = buildPricingRows(ID_MAP, AA, OR, '2026-06-18');
  const gpt = rows.find((r) => r.model === 'gpt-5');
  assert.equal(gpt.input_per_mtok, 1.25);
  assert.equal(gpt.output_per_mtok, 10);
  assert.equal(gpt.blended_3to1, 3.4375);
  assert.match(gpt.source, /artificial-analysis/);
  // qwen3-30b: no AA match, no openrouter_id → no row (not fabricated)
  assert.equal(rows.find((r) => r.model === 'qwen3-30b'), undefined);
});

test('buildPricingRows flags >10% input divergence between AA and OpenRouter', () => {
  const orDivergent = [{ id: 'openai/gpt-5', pricing: { prompt: '0.000002', completion: '0.00001' } }]; // 2.0 vs AA 1.25 → >10%
  const rows = buildPricingRows({ 'gpt-5': ID_MAP['gpt-5'] }, AA, orDivergent, '2026-06-18');
  assert.match(rows[0].source, /or-divergent/);
});

test('runIngest writes cells + prices to D1 (idempotent INSERT OR REPLACE)', async () => {
  const db = fakeDb();
  const r = await runIngest({ DB: db, AA_API_KEY: 'k' }, { fetchImpl: mockFetch(AA, OR), now: Date.parse('2026-06-18') });
  assert.equal(r.ok, true);
  assert.equal(r.sources.artificial_analysis, true);
  assert.equal(r.sources.openrouter, true);
  assert.equal(db._writes.cells, 5); // gpt-5's 5 evals
  assert.equal(db._writes.prices, 2); // gpt-5 + gemini
  assert.ok(db._writes.rows.every((s) => s._sql.includes('INSERT OR REPLACE')));
});

test('runIngest degrades to OpenRouter-only when AA_API_KEY is absent', async () => {
  const db = fakeDb();
  const r = await runIngest({ DB: db }, { fetchImpl: mockFetch(AA, OR), now: Date.parse('2026-06-18') });
  assert.equal(r.sources.artificial_analysis, false); // no key → AA skipped
  assert.equal(r.sources.openrouter, true);
  assert.equal(db._writes.cells, 0); // no AA → no benchmark cells
  assert.ok(db._writes.prices >= 1); // OpenRouter prices still ingested
});

test('runIngest is non-fatal when every source is unreachable (writes nothing)', async () => {
  const db = fakeDb();
  const downFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await runIngest({ DB: db, AA_API_KEY: 'k' }, { fetchImpl: downFetch });
  assert.equal(r.ok, false);
  assert.equal(db._writes.cells, 0);
  assert.equal(db._writes.prices, 0);
});
