import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import MonoNum from '@/components/MonoNum';
import WorkflowChip from './WorkflowChip';

export const metadata: Metadata = {
  title: 'Workflow — live visibility, local & free',
  description:
    'Watch your workflow live. The same idea as Claude Code dynamic workflows, run locally and free. A persistent statusline chip shows every agent, the progress, and the token spend as the run advances.',
};

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

const DOTGRID = {
  position: 'absolute' as const,
  inset: 0,
  pointerEvents: 'none' as const,
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export default function WorkflowPage() {
  return (
    <div style={SECTION_BG}>
      <div style={DOTGRID} aria-hidden />
      <div className="workflow-wrap" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <Eyebrow>§ workflow · live visibility</Eyebrow>
        <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 10, marginBottom: 14, maxWidth: 900 }}>
          Watch your workflow live. Same idea as Claude Code&apos;s dynamic workflows.{' '}
          <span style={{ color: 'var(--color-accent)' }}>Local. Free.</span>
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 36 }}>
          A persistent chip in your statusline shows every agent in the run, the progress, and the token spend —
          updating live as the workflow advances.
        </p>

        {/* the live chip, hero of the section */}
        <div style={{ marginBottom: 36, maxWidth: 560 }}>
          <WorkflowChip />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
            ↑ live · dots advance every 500ms as agents complete
          </div>
        </div>

        {/* same shape, two bills */}
        <div className="workflow-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'stretch' }}>
          <Card padding={22} style={{ display: 'flex', flexDirection: 'column' }}>
            <Eyebrow>Claude Code · dynamic workflows</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', marginTop: 6, marginBottom: 16 }}>cloud-run · billed per token</div>
            <WorkflowChip cloud />
            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-term-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>est. run cost</span>
              <span style={{ color: 'var(--color-tier-3)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>$0.45</span>
            </div>
          </Card>

          <Card padding={22} style={{ display: 'flex', flexDirection: 'column', borderColor: 'var(--color-accent-25)', background: 'linear-gradient(150deg, var(--color-accent-06), transparent 55%)' }}>
            <Eyebrow>Mooter Workflow Engine · Wave 28</Eyebrow>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', marginTop: 6, marginBottom: 16 }}>local-run · shipped 2026-06-07</div>
            <WorkflowChip />
            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-term-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>measured run cost</span>
              <span style={{ color: 'var(--color-green)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>$0.0028</span>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 18, fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.6 }}>
          <span>
            Same shape, different bill. Demo run measured <MonoNum color="var(--color-green)">$0.0028</MonoNum> locally
            vs an estimated <MonoNum color="var(--color-tier-3)">$0.45</MonoNum> in the cloud — a{' '}
            <MonoNum color="var(--color-text)">160×</MonoNum> gap on this run.
          </span>
        </div>
      </div>
      <style>{`@media (max-width: 760px){ .workflow-cards{ grid-template-columns: 1fr !important; } .workflow-wrap{ padding: 48px 20px 56px !important; } }`}</style>
    </div>
  );
}
