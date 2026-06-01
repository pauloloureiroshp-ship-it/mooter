import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 9 — prod parity fix. Locks the four dashboard fixes against regression.
const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('dashboard prod-parity (Wave 9)', () => {
  it('language policy: no Portuguese diacritics in the dashboard (EN-only)', () => {
    const matches = src.match(/[ãõçáéíóúâêà]/g) || [];
    expect(matches, `found PT characters: ${matches.join('')}`).toHaveLength(0);
  });

  it('stats label is honest: "% saved vs all-Opus" matches the % value, not "Routed away from Opus"', () => {
    // The value rendered here is `{savingsPct}%`, so the label must read % (not $).
    expect(src).toContain('% saved vs all-Opus');
    expect(src).not.toContain('Routed away from Opus');
  });

  it('pattern count: canonical mirror constant declared', () => {
    expect(src).toMatch(/const\s+PATTERN_COUNT\s*=\s*173\s*;/);
    expect(src).not.toContain('230 samples trained');
    expect(src).not.toContain("'40+ patterns'");
  });

  it('7-features pills match the real classify.js features (not fabricated ones)', () => {
    const real = [
      'has_code_block', 'has_file_refs', 'has_error_trace',
      'is_question', 'has_url', 'lang_detected', 'file_ref_count',
    ];
    const pillBlock = src.slice(src.indexOf('const featurePills'));
    for (const f of real) {
      expect(pillBlock, `featurePills missing ${f}`).toContain(`'${f}'`);
    }
    // fabricated features that were wrongly shown before the fix
    for (const bad of ['quality_intent', 'complexity_score', 'risk_level']) {
      const featurePillsArray = src.slice(
        src.indexOf('const featurePills = ['),
        src.indexOf('];', src.indexOf('const featurePills = [')),
      );
      expect(featurePillsArray, `featurePills should not list ${bad}`).not.toContain(bad);
    }
  });
});
