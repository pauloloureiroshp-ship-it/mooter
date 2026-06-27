import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Dotgrid from '@/components/Dotgrid';
import BenchmarkFrontier from '@/components/site/sections/BenchmarkFrontier';

// Wave 5 — /benchmark · the contrafactual.
// Thesis (ESTUDO §7 · research §3): an aggregator shows what got *used*; a router
// is the only thing that also sees what would have happened otherwise — the
// counterfactual. So it can measure by the TASK, not the token. Every number on
// this page is illustrative *structure*, labelled as such; the headline figures
// must come from the real tracker ("neste run"), never inflated.

export const metadata: Metadata = {
  title: 'Benchmark — the counterfactual · mooter',
  description:
    "OpenRouter shows what got used. mooter shows whether it was the right call. A router sees both the choice it made and the one it didn't — so it can measure by the task, not the token: tier-mix, quality retained, $/successful task, escalation.",
  openGraph: {
    title: 'mooter benchmark — measured by the task, not the token',
    description:
      'The Pareto frontier, router metrics, and a per-task table. Illustrative structure until the real tracker fills it — reproducible via git clone.',
    type: 'website',
  },
};

export default function BenchmarkPage() {
  return (
    <section
      className="m-pad m-pad-y"
      style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px', overflow: 'hidden' }}
    >
      <Dotgrid />
      <div style={{ position: 'relative' }}>
        <Eyebrow>§ benchmark · the contrafactual</Eyebrow>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.05, textWrap: 'balance' }}>
          OpenRouter shows what got used.
          <br />
          <span style={{ color: 'var(--color-accent)' }}>We show whether it was the right call.</span>
        </h1>
        <p style={{ color: 'var(--color-text-2, var(--color-text))', fontSize: 19, maxWidth: 720, lineHeight: 1.55, marginBottom: 10 }}>
          A router is the only thing that sees both what it chose <em>and</em> what would have happened otherwise.
          That counterfactual unlocks metrics no model leaderboard can show — measured by the{' '}
          <strong style={{ color: 'var(--color-text)' }}>task</strong>, not the token.
        </p>

        <BenchmarkFrontier />
      </div>
    </section>
  );
}
