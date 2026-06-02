import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 11 PR-D (rubric C4) — footer credits Claude Code + Anthropic's models.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('Wave 11 PR-D — build-with-Claude credit (C4)', () => {
  it('footer credits Claude Code + Anthropic models', () => {
    const src = read('components/Footer.tsx');
    expect(src).toContain('Built for Claude Code');
    expect(src).toContain('made with Claude Code');
    expect(src).toMatch(/Anthropic/);
  });
});
