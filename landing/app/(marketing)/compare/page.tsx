import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Eyebrow from '@/components/Eyebrow';

export const metadata: Metadata = {
  title: 'How mooter compares',
  description: 'We are not the only LLM router. We are the one built for Claude Code.',
};

const COLS = ['', 'mooter', 'Claude Code default', 'LiteLLM proxy', 'Continue.dev', 'OpenRouter'];

const ROWS: string[][] = [
  ['Architecture', 'Hook (local)', 'Direct API call', 'HTTP proxy', 'IDE plugin', 'API gateway'],
  ['Local models (Ollama)', '✓ T0 native', '✗', '✓ (configurable)', '✓', '✗'],
  ['Auto-routing by complexity', '✓ T0–T3 axis', '✗ Opus on all', '⚠️ rule-based', '⚠️ manual', '⚠️ tags'],
  ['Domain routing (packs)', '✓ 7+ Moo Packs', '✗', '✗', '✗', '✗'],
  ['Pre-prompt < 50ms overhead', '✓ 14ms p50', 'n/a', '~80–200ms', '~120ms', '~200ms cloud'],
  ['Code/prompts leave machine', '✗ T0 stays local', '✓ all to Anthropic', '✓ through proxy', '✓ to cloud', '✓ via gateway'],
  ['Pack-based specialization', '✓ Moo Packs', '✗', '✗', '⚠️ commands', '✗'],
  ['Adapter Forge (local LoRA)', '✓ Wave 5', '✗', '✗', '✗', '✗'],
  ['Subscription-aware', '✓ tier-detect', '✗', '⚠️ via env', '✗', 'n/a'],
  ['Live statusline HUD', '✓ 3-line', '✗', '✗', '⚠️ side panel', '✗'],
  ['Per-bash tool badge', '✓ per-call tier', '✗', '✗', '✗', '✗'],
  ['Sparkline (last-10 tier mix)', '✓ inline', '✗', '✗', '✗', '✗'],
  ['End-of-session digest', '✓ mooter digest', '✗', '✗', '✗', '✗'],
  ['Cost tracking per-prompt', '✓ real-time', '✗', '✓ in logs', '⚠️ session', '✓ dashboard'],
  ['Open source', '✓ MIT', 'n/a (closed)', '✓ Apache 2', '✓ Apache 2', '✗ (gateway hosted)'],
  ['Free', '✓ forever', 'depends on sub', 'self-host or paid', '✓', '⚠️ markup on API'],
  ['Setup time', '1 command', 'n/a', '30+ min (config)', 'install plugin', 'sign up + key'],
  ['Works without internet', '✓ T0 local', '✗', '✗', '✗', '✗'],
];

function cellColor(v: string): string | undefined {
  if (v.startsWith('✓')) return 'var(--color-green)';
  if (v.startsWith('✗')) return 'var(--color-muted)';
  if (v.startsWith('⚠️')) return 'var(--color-yellow)';
  return undefined;
}

export default async function ComparePage() {
  let lastUpdated = 'unknown';
  try {
    const md = await readFile(join(process.cwd(), 'docs/compare-snapshot.md'), 'utf-8');
    lastUpdated = md.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'unknown';
  } catch {
    lastUpdated = 'unknown';
  }

  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Compare</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 8px' }}>How mooter compares</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 32 }}>
        We&apos;re not the only LLM router. We are the one built for Claude Code.
      </p>

      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 880 }}>
          <thead>
            <tr>
              {COLS.map((c, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i === 0 ? 'left' : 'center',
                    padding: '14px 12px',
                    fontWeight: 600,
                    color: i === 1 ? 'var(--color-accent)' : 'var(--color-muted)',
                    background: i === 1 ? 'var(--color-accent-08)' : 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border-light)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={ri} style={{ borderTop: '1px solid var(--color-border)' }}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '12px',
                      textAlign: ci === 0 ? 'left' : 'center',
                      color: ci === 0 ? 'var(--color-text)' : cellColor(cell) ?? 'var(--color-muted)',
                      fontWeight: ci === 0 ? 600 : 500,
                      background: ci === 1 ? 'var(--color-accent-08)' : undefined,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--color-muted)', fontSize: 13.5, marginTop: 18, maxWidth: 760 }}>
        Last updated {lastUpdated}. Snapshot of public functionality at the time. We checked the docs. If we got
        something wrong, <a href="https://github.com/pauloloureiroshp-ship-it/mooter/issues" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>open an issue</a> and we&apos;ll fix it.
      </p>
      <p style={{ color: 'var(--color-faint, var(--color-muted))', fontSize: 12.5, marginTop: 8 }}>
        Cursor / Copilot / Cody are AI coding assistants, not LLM routers — mooter complements rather than replaces them.
      </p>
    </section>
  );
}
