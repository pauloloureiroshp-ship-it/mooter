// Wave 58 batch 4 (A.13) — pure-helper tests for the admin MatrixPanel.
// landing vitest is node-env; we test the pure logic only (no JSX/RTL).

import { describe, it, expect } from 'vitest';
import {
  type MatrixCell,
  tesBucket,
  bucketColor,
  filterCells,
  modelPricePer1k,
  toCsv,
  toJson,
  HIGH_THRESHOLD,
  MID_THRESHOLD,
} from './_matrix_state';

function cell(over: Partial<MatrixCell> = {}): MatrixCell {
  return {
    model: 'claude-opus-4-7',
    category: 'coding.backend',
    score: 0.88,
    source: 'SWE-bench Verified',
    measured: true,
    tes: 100,
    tes_status: 'ok',
    ...over,
  };
}

describe('tesBucket — TES→colour bucket (null never fabricated)', () => {
  it('null / undefined TES → pending (never a numeric bucket)', () => {
    expect(tesBucket(null)).toBe('pending');
    expect(tesBucket(undefined)).toBe('pending');
  });
  it('NaN / negative → pending', () => {
    expect(tesBucket(Number.NaN)).toBe('pending');
    expect(tesBucket(-5)).toBe('pending');
  });
  it('>= HIGH_THRESHOLD → high', () => {
    expect(tesBucket(HIGH_THRESHOLD)).toBe('high');
    expect(tesBucket(HIGH_THRESHOLD + 1)).toBe('high');
  });
  it('between MID and HIGH → mid', () => {
    expect(tesBucket(MID_THRESHOLD)).toBe('mid');
    expect(tesBucket(HIGH_THRESHOLD - 1)).toBe('mid');
  });
  it('0..MID → low', () => {
    expect(tesBucket(0)).toBe('low');
    expect(tesBucket(MID_THRESHOLD - 1)).toBe('low');
  });
  it('respects custom thresholds', () => {
    expect(tesBucket(10, 100, 5)).toBe('mid');
    expect(tesBucket(200, 100, 5)).toBe('high');
  });
});

describe('bucketColor — distinct colour per bucket; pending is grey-transparent', () => {
  it('each bucket maps to a non-empty colour', () => {
    for (const b of ['high', 'mid', 'low', 'pending'] as const) {
      expect(bucketColor(b)).toMatch(/rgba?\(/);
    }
  });
  it('pending colour differs from high', () => {
    expect(bucketColor('pending')).not.toBe(bucketColor('high'));
  });
});

describe('modelPricePer1k — known/free/unknown (never guessed)', () => {
  it('free local models → 0', () => {
    expect(modelPricePer1k('qwen3-30b')).toBe(0);
    expect(modelPricePer1k('qwen3.6')).toBe(0);
    expect(modelPricePer1k('qwen3:30b')).toBe(0); // ':' tag = local
  });
  it('known priced models → real per-1k rate', () => {
    expect(modelPricePer1k('claude-opus-4-7')).toBeCloseTo(0.005, 6);
    expect(modelPricePer1k('claude-sonnet-4-6')).toBeCloseTo(0.003, 6);
    expect(modelPricePer1k('claude-haiku-4-5')).toBeCloseTo(0.001, 6);
  });
  it('unknown/pending-price models → null (we never invent a rate)', () => {
    expect(modelPricePer1k('claude-opus-4-8')).toBeNull();
    expect(modelPricePer1k('gpt-5')).toBeNull();
    expect(modelPricePer1k('claude-fable-5')).toBeNull();
  });
});

describe('filterCells — category + cost cap, pure', () => {
  const cells: MatrixCell[] = [
    cell({ model: 'claude-opus-4-7', category: 'coding.backend' }),
    cell({ model: 'claude-haiku-4-5', category: 'coding.backend' }),
    cell({ model: 'claude-opus-4-8', category: 'coding.backend' }), // unknown price
    cell({ model: 'qwen3-30b', category: 'reasoning.math' }), // free
  ];

  it('no filter → all cells unchanged', () => {
    expect(filterCells(cells)).toHaveLength(4);
  });
  it('category filter restricts to that category', () => {
    const out = filterCells(cells, { category: 'reasoning.math' });
    expect(out).toHaveLength(1);
    expect(out[0].model).toBe('qwen3-30b');
  });
  it('cost cap keeps cheap+free, drops expensive and (default) unknown-price', () => {
    const out = filterCells(cells, { maxCostPer1k: 0.001 });
    const models = out.map((c) => c.model).sort();
    // haiku ($0.001) ✓, qwen ($0) ✓; opus-4-7 ($0.005) ✗; opus-4-8 (unknown) ✗ by default
    expect(models).toEqual(['claude-haiku-4-5', 'qwen3-30b']);
  });
  it('includeUnpriced keeps unknown-price models under a cap', () => {
    const out = filterCells(cells, { maxCostPer1k: 0.001, includeUnpriced: true });
    expect(out.some((c) => c.model === 'claude-opus-4-8')).toBe(true);
  });
  it('does not mutate the input array', () => {
    const copy = [...cells];
    filterCells(cells, { category: 'coding.backend' });
    expect(cells).toEqual(copy);
  });
});

describe('toCsv — header + pending rendered as literal, score escaping', () => {
  it('emits the stable header row', () => {
    expect(toCsv([]).split('\n')[0]).toBe('model,category,score,source,measured,tes,tes_status');
  });
  it('pending TES renders as the literal "pending", never a number', () => {
    const csv = toCsv([cell({ tes: null, tes_status: 'pending', score: null, measured: false, source: 'unknown' })]);
    const row = csv.split('\n')[1];
    expect(row).toContain(',pending,'); // tes column
    expect(row).toMatch(/,pending$/); // tes_status column
  });
  it('numeric TES is the raw value', () => {
    const csv = toCsv([cell({ tes: 12.5, tes_status: 'ok' })]);
    expect(csv.split('\n')[1]).toContain(',12.5,');
  });
  it('escapes commas/quotes in source per RFC-4180', () => {
    const csv = toCsv([cell({ source: 'Bench, "v2"' })]);
    expect(csv).toContain('"Bench, ""v2"""');
  });
  it('null score → empty field', () => {
    const csv = toCsv([cell({ score: null })]);
    // model,category,,source... → empty score between two commas
    expect(csv.split('\n')[1]).toMatch(/^claude-opus-4-7,coding\.backend,,/);
  });
});

describe('toJson — preserves null TES, carries honesty note', () => {
  it('round-trips and keeps tes:null (no coercion to a number)', () => {
    const json = toJson([cell({ tes: null, tes_status: 'pending' })]);
    const parsed = JSON.parse(json);
    expect(parsed.cells[0].tes).toBeNull();
    expect(parsed.count).toBe(1);
    expect(parsed._note).toMatch(/pending/i);
    expect(parsed._note).toMatch(/[Nn]ever a fabricated number/);
  });
});
