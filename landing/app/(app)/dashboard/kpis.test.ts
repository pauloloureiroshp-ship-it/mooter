import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeKpis, localFraction, MIN_MEASURED_PAIRS } from './_kpis';

// Onboarding v2 · W0 — the dashboard stops publishing modelled savings.
// Two halves: the derivation is honest (unit), and the banned strings are
// gone from the source that builds the page (grep gate).

describe('KPI derivation (onboarding v2 W0)', () => {
  it('returns exactly four KPIs, in display order', () => {
    const k = computeKpis({ tasksRouted: 0 });
    expect(k.map((x) => x.key)).toEqual([
      'tasks', 'local_coverage', 'window_preserved', 'esr',
    ]);
  });

  it('ESR is always n/d today, and the note says what is missing', () => {
    for (const input of [
      { tasksRouted: 0 },
      { tasksRouted: 5000, tierDistribution: { T0: 0.9, T3: 0.1 } },
      { tasksRouted: 5000, measuredPairs: MIN_MEASURED_PAIRS - 1 },
    ]) {
      const esr = computeKpis(input).find((x) => x.key === 'esr')!;
      expect(esr.value).toBeNull();
      expect(esr.note).toContain('n/d');
      expect(esr.note).toContain(String(MIN_MEASURED_PAIRS));
    }
  });

  it('no KPI ever renders a savings percentage or a dollar amount', () => {
    const k = computeKpis({ tasksRouted: 412, tierDistribution: { T0: 0.66, T1: 0.21, T2: 0.1, T3: 0.03 } });
    for (const kpi of k) {
      expect(kpi.value ?? '').not.toMatch(/\$/);
      expect(`${kpi.label} ${kpi.note}`.toLowerCase()).not.toContain('saved vs');
      expect(`${kpi.label} ${kpi.note}`.toLowerCase()).not.toContain('you saved');
    }
  });

  it('local coverage is the T0 share, and its note counts tasks not dollars', () => {
    const k = computeKpis({ tasksRouted: 100, tierDistribution: { T0: 0.66, T3: 0.34 } });
    const cov = k.find((x) => x.key === 'local_coverage')!;
    expect(cov.value).toBe('66%');
    expect(cov.note).toContain('66 of 100 tasks');
  });

  it('window preserved is labelled estimated (R4) and counts tasks', () => {
    const k = computeKpis({ tasksRouted: 100, tierDistribution: { T0: 0.4 } });
    const w = k.find((x) => x.key === 'window_preserved')!;
    expect(w.estimated).toBe(true);
    expect(w.label).toContain('estimated');
    expect(w.value).toBe('40');
    expect(w.note).toContain('not tokens');
  });

  it('no tier breakdown -> n/d, never a zero pretending to be measured', () => {
    const k = computeKpis({ tasksRouted: 100 });
    expect(k.find((x) => x.key === 'local_coverage')!.value).toBeNull();
    expect(k.find((x) => x.key === 'window_preserved')!.value).toBeNull();
  });

  it('no routed task -> tasks is n/d, not 0', () => {
    const k = computeKpis({ tasksRouted: 0 });
    expect(k.find((x) => x.key === 'tasks')!.value).toBeNull();
  });

  it('localFraction: missing / empty / out-of-range inputs never throw', () => {
    expect(localFraction(null)).toBeNull();
    expect(localFraction(undefined)).toBeNull();
    expect(localFraction({ T3: 1 })).toBeNull();
    expect(localFraction({ T0: 5 })).toBe(1);
    expect(localFraction({ T0: -1 })).toBe(0);
  });
});

describe('banned savings surfaces are gone from /dashboard (R2 + R4)', () => {
  const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

  it('grep for "saved vs" in the dashboard source = 0', () => {
    const hits = src.match(/saved vs/gi) || [];
    expect(hits, `still present ${hits.length}x`).toHaveLength(0);
  });

  it('the savings calculator is gone (component and heading)', () => {
    expect(src).not.toContain('SavingsCalculatorCard');
    expect(src).not.toContain('Savings calculator');
  });

  it('no "savings estimate" copy survives', () => {
    expect(src.toLowerCase()).not.toContain('savings estimate');
  });

  it('the page renders the KPI strip from the pure module, not its own maths', () => {
    expect(src).toContain('<KpiStrip');
    expect(src).toContain("from './_kpis'");
    // The modelled all-Opus arithmetic is gone from the page entirely.
    expect(src).not.toContain('allOpusCost');
    expect(src).not.toContain('savingsPct');
    expect(src).not.toContain('naiveCost');
  });
});
