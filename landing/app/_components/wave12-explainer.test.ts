import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 PR-F (rubric C3) — /under-the-hood: DoRA SVG + PEFT cite + 2026
// Triton + classify.js/hook explainer with line/file citations.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const UTH = 'app/(marketing)/under-the-hood/page.tsx';

describe('Wave 12 PR-F — technical depth (C3)', () => {
  it('has a DoRA decomposition SVG diagram', () => {
    const s = read(UTH);
    expect(s).toContain('<svg');
    expect(s).toMatch(/aria-label="LoRA and DoRA weight decomposition"/);
  });
  it('cites HuggingFace PEFT + 2026 fused Triton', () => {
    const s = read(UTH);
    expect(s).toContain('huggingface.co/docs/peft');
    expect(s).toMatch(/Triton/);
  });
  it('explains the router with file citations (classify.js + hook + arbiter)', () => {
    const s = read(UTH);
    expect(s).toContain('classify.js');
    expect(s).toContain('arbiter.js');
    expect(s).toContain('inject_context.js');
    expect(s).toContain('UserPromptSubmit');
    expect(s).toContain('PATTERN_COUNT');
  });
});
