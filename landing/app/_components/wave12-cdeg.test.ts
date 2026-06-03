import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 PR C+D+E+G — landing depth/differentiation/privacy/persona.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('Wave 12 C/D/E/G landing', () => {
  it('C: under-the-hood lists 2026 models, attributed (not mooter benchmarks)', () => {
    const s = read('app/(marketing)/under-the-hood/page.tsx');
    expect(s).toContain('Qwen3-Coder-Next');
    expect(s).toContain('Llama 4 Scout');
    expect(s).toMatch(/vendor\/community-reported/i);
    expect(s).toContain('qwen2.5-coder'); // default stays
  });

  it('D: compare names Cline/Aider/Roo honestly (agents, not routers)', () => {
    const s = read('app/(marketing)/compare/page.tsx');
    expect(s).toContain('Cline');
    expect(s).toContain('Aider');
    expect(s).toContain('Roo Code');
    expect(s).toMatch(/not LLM routers/i);
  });

  it('E: privacy has explicit opt-out command + no-prompt-text + cloud-router comparison', () => {
    const s = read('app/(marketing)/privacy/page.tsx');
    expect(s).toContain('mooter quiet --telemetry-off');
    expect(s).toMatch(/no prompt text/i);
    expect(s).toContain('cloud routers');
  });

  it('G: hero has persona+task-split subline', () => {
    const s = read('app/page.tsx');
    expect(s).toMatch(/vibe coder on a Max plan/i);
    expect(s).toContain('local (free)');
  });
});
