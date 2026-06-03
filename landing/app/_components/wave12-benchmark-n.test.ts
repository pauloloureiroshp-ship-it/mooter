import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 D1-1 — benchmark N reconciliation. Canonical N = 34 (wave1-benchmark
// README: "34 prompts × 3 arms"). The fabricated "142 prompts" must never
// reappear on any marketing page. Guard against recurrence.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const PAGES = [
  'app/(marketing)/under-the-hood/page.tsx',
  'app/(marketing)/methodology/page.tsx',
];

describe('Wave 12 D1-1 — benchmark N is canonical (34, never 142)', () => {
  for (const p of PAGES) {
    it(`${p} has no fabricated "142 prompts"`, () => {
      expect(read(p)).not.toMatch(/142\s*prompts/i);
    });
  }
  it('under-the-hood cites the canonical 34-prompt benchmark', () => {
    expect(read('app/(marketing)/under-the-hood/page.tsx')).toContain('34 prompts');
  });
});
