'use client';

import { useState } from 'react';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import ProgressBar from '@/components/ProgressBar';
import { calculateSavings, type Hardware } from '@/lib/cost-calculator';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';

const HARDWARE: { id: Hardware; label: string }[] = [
  { id: 'none', label: 'No discrete GPU (MacBook Air, basic laptop)' },
  { id: '8gb', label: '8 GB GPU (RTX 3060/4060, M1 Pro 16GB)' },
  { id: '16gb', label: '16 GB GPU (RTX 4070, M2 Pro 32GB)' },
  { id: '24gb_plus', label: '24+ GB GPU (RTX 4090/5090, M3 Max, A100)' },
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

export default function MethodologyPage() {
  const [hardware, setHardware] = useState<Hardware>('24gb_plus');
  const [promptsPerDay, setPromptsPerDay] = useState(80);
  const [pctCritical, setPctCritical] = useState(8);

  const r = calculateSavings({ hardware, promptsPerDay, pctCritical });
  const tiers = ['T0', 'T1', 'T2', 'T3'] as const;

  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Methodology</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 8px' }}>What it costs. What you save.</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 40 }}>
        Baseline = what your prompts would cost on Opus-only. We log every decision so you can verify.
      </p>

      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Inputs */}
        <Card padding={26}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Your dev machine</div>
          {HARDWARE.map((h) => (
            <label key={h.id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '7px 0', cursor: 'pointer', color: hardware === h.id ? 'var(--color-text)' : 'var(--color-muted)', fontSize: 14 }}>
              <input type="radio" name="hw" checked={hardware === h.id} onChange={() => setHardware(h.id)} />
              {h.label}
            </label>
          ))}
          {hardware === 'none' ? (
            <p style={{ color: 'var(--color-yellow)', fontSize: 13, marginTop: 8 }}>
              T0 local tier disabled. Mooter still saves on T1/T2/T3 cloud routing.
            </p>
          ) : null}

          <div style={{ fontWeight: 600, margin: '22px 0 8px' }}>Usage</div>
          <label style={{ display: 'block', fontSize: 14, color: 'var(--color-muted)' }}>
            Prompts per day: <span className="num" style={{ color: 'var(--color-text)' }}>{promptsPerDay}</span>
            <input type="range" min={5} max={400} value={promptsPerDay} onChange={(e) => setPromptsPerDay(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
          </label>
          <label style={{ display: 'block', fontSize: 14, color: 'var(--color-muted)', marginTop: 12 }}>
            % critical (T3): <span className="num" style={{ color: 'var(--color-text)' }}>{pctCritical}%</span>
            <input type="range" min={0} max={40} value={pctCritical} onChange={(e) => setPctCritical(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
          </label>
        </Card>

        {/* Live output */}
        <Card accent padding={26}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
            <span style={{ color: 'var(--color-muted)' }}>Without mooter</span>
            <span className="num">{fmt(r.baseline_monthly)} / mo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
            <span style={{ color: 'var(--color-muted)' }}>With mooter</span>
            <span className="num">{fmt(r.with_mooter_monthly)} / mo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700, padding: '12px 0', borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <span>Saved</span>
            <span className="num" style={{ color: 'var(--color-green)' }}>{fmt(r.saved_monthly)} ({r.saved_pct.toFixed(0)}%)</span>
          </div>

          <div style={{ fontWeight: 600, margin: '14px 0 10px', fontSize: 14 }}>Tier distribution</div>
          {tiers.map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span className="num" style={{ width: 70, fontSize: 12.5, color: 'var(--color-muted)' }}>{t}</span>
              <ProgressBar pct={r.tier_distribution[t] * 100} color={TIER_COLORS_WEB[t]} />
              <span className="num" style={{ width: 44, textAlign: 'right', fontSize: 12.5 }}>{(r.tier_distribution[t] * 100).toFixed(0)}%</span>
            </div>
          ))}
        </Card>
      </div>

      {/* D6 — concrete persona case (rubric C5) */}
      <div style={{ marginTop: 40, padding: '20px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--r-lg, 14px)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>A concrete case</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.7, maxWidth: 720, margin: 0 }}>
          <strong>Solo founder, Claude Code Max plan, RTX 4090, ~80 prompts/day, ~8% critical.</strong> Most of the day
          is renames, commits, small edits and &ldquo;explain this&rdquo; — those route to <strong>T0 local (free)</strong>.
          The ~8% that&apos;s real debugging or a cross-file refactor goes to <strong>Sonnet/Opus</strong>. Set those inputs
          in the calculator above to see this profile&apos;s monthly figure — it&apos;s computed from the same per-tier costs
          as the N=34 benchmark below, not a marketing number. Your mix (and your savings) shift with how much you keep local.
        </p>
      </div>

      {/* Benchmark proof */}
      <div style={{ marginTop: 56 }}>
        <h2 style={{ fontSize: 26, fontWeight: 600, marginBottom: 6 }}>Benchmark proof</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 15, marginBottom: 18 }}>
          Cost per prompt on a 34-prompt blind-judged validation set.
        </p>
        {[
          { name: 'Mooter', cost: 0.022, color: 'var(--color-accent)' },
          { name: 'Sonnet-only', cost: 0.028, color: 'var(--color-tier-2)' },
          { name: 'Opus-only', cost: 0.034, color: 'var(--color-tier-3)' },
        ].map((b) => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 130, fontSize: 14 }}>{b.name}</span>
            <ProgressBar pct={(b.cost / 0.042) * 100} color={b.color} height={14} />
            <span className="num" style={{ width: 64, fontSize: 13 }}>${b.cost.toFixed(3)}</span>
          </div>
        ))}
      </div>

      {/* Reproduce it yourself */}
      <div style={{ marginTop: 44, paddingTop: 28, borderTop: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Reproduce it yourself</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 15, marginBottom: 14, maxWidth: 720 }}>
          The benchmark is pre-registered and open. 34 prompts × 3 arms (mooter, Sonnet-only,
          Opus-only) with a blind LLM judge — design, prompts, raw rows and per-pack diagnostics
          all live in the repo. Clone it and run the harness:
        </p>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--color-term-fg)', background: 'var(--color-term-bg)', border: '1px solid var(--color-term-border)', borderRadius: 8, padding: '14px 16px', whiteSpace: 'pre', overflowX: 'auto' }}>
          {`git clone https://github.com/pauloloureiroshp-ship-it/mooter
cd mooter/packages/router/scripts/wave1-benchmark
tsx run.ts            # full run: 34 × 3 arms → outputs/`}
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 12, maxWidth: 720 }}>
          See <span style={{ fontFamily: 'var(--mono)' }}>wave1-benchmark/README.md</span> +{' '}
          <span style={{ fontFamily: 'var(--mono)' }}>BENCHMARK_DESIGN.md</span> for the full method,
          confidence intervals and mis-routing analysis.
        </p>
        <p style={{ color: 'var(--color-yellow)', fontSize: 13, marginTop: 12, maxWidth: 720 }}>
          N=34 is a small set — only medium-to-large effects are detectable. On this cloud-only set
          mooter matches the quality bar at lower cost per prompt; the larger savings come from
          routing simple work to free local T0, which this set doesn&apos;t isolate.
        </p>
      </div>
      <style>{`@media (max-width: 900px){ .calc-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
