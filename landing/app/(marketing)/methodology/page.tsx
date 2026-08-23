'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import ProgressBar from '@/components/ProgressBar';
import ProviderLogo, { type Provider } from '@/components/ProviderLogo';
import { calculateSavings, type Hardware } from '@/lib/cost-calculator';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import versionInfo from '@/app/version.json';

const HARDWARE: { id: Hardware; label: string; sub: string }[] = [
  { id: 'none', label: 'No discrete GPU', sub: 'MacBook Air, basic laptop, Chromebook' },
  { id: '8gb', label: '8 GB GPU', sub: 'RTX 3060/4060, M1 Pro 16GB' },
  { id: '16gb', label: '16 GB GPU', sub: 'RTX 4070, M2/M3 Pro 32GB' },
  { id: '24gb_plus', label: '24+ GB GPU', sub: 'RTX 4090, RTX 5090, M2/M3/M4 Max' },
];

const OS = [
  { id: 'macos', label: 'macOS', sub: 'Apple Silicon recommended' },
  { id: 'linux', label: 'Linux', sub: 'Ubuntu 22+ / Arch' },
  { id: 'windows', label: 'Windows', sub: 'WSL2 required' },
] as const;

type OsId = (typeof OS)[number]['id'];

const SUBS: { logo: Provider; name: string; plans: string[] }[] = [
  { logo: 'anthropic', name: 'Anthropic Claude', plans: ['Free', 'Pro', 'Max', 'Team', 'API'] },
  { logo: 'openai', name: 'OpenAI ChatGPT', plans: ['Free', 'Plus', 'Pro', 'Codex', 'API'] },
  // Google Gemini removed: calculator metrics fabricated; restore when backed by real data
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

const TIER_META = [
  { t: 'T0', label: 'local · Ollama' },
  { t: 'T1', label: 'haiku · gpt-4o-mini' },
  { t: 'T2', label: 'sonnet · gpt-4o' },
  { t: 'T3', label: 'opus · o1-pro' },
] as const;

// reduced-motion-safe count-up: settles instantly when the OS asks for less motion.
function useCountUp(target: number, deps: unknown[]) {
  const [value, setValue] = useState(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const from = value;
    const start = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, deps);
  return value;
}

export default function MethodologyPage() {
  const [hardware, setHardware] = useState<Hardware>('24gb_plus');
  const [os, setOs] = useState<OsId>('macos');
  const [subs, toggleSub] = useReducer(
    (state: Record<Provider, boolean>, logo: Provider) => ({ ...state, [logo]: !state[logo] }),
    { anthropic: true, openai: true } as Record<Provider, boolean>,
  );
  const [promptsPerDay, setPromptsPerDay] = useState(80);
  const [pctCritical, setPctCritical] = useState(8);

  const r = calculateSavings({ hardware, promptsPerDay, pctCritical });

  const baseline = useCountUp(r.baseline_monthly, [r.baseline_monthly]);
  const withMooter = useCountUp(r.with_mooter_monthly, [r.with_mooter_monthly]);
  const saved = useCountUp(r.saved_monthly, [r.saved_monthly]);

  const stackRows: [string, string, 'ok' | 'no'][] = [
    [hardware === 'none' ? '—' : '✓', hardware === 'none' ? 'No local tier (no discrete GPU)' : `All local models (${HARDWARE.find((h) => h.id === hardware)?.label})`, hardware === 'none' ? 'no' : 'ok'],
    [subs.anthropic ? '✓' : '—', 'Sonnet & Opus (Anthropic)', subs.anthropic ? 'ok' : 'no'],
    [subs.openai ? '✓' : '—', 'GPT-4o (OpenAI)', subs.openai ? 'ok' : 'no'],
  ];

  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }} className="m-pad m-pad-y">
      <Eyebrow>Methodology</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, margin: '0 0 10px' }}>
        Show me my number.
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, marginBottom: 36 }}>
        Plug in your actual setup — hardware, OS, subscriptions, usage. Mooter projects your tier mix and monthly
        cost against the all-Opus baseline, computed live from the same per-tier costs as the benchmark below.
        Every routing decision is logged so you can verify it yourself.
      </p>

      <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT — inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Step 1 — hardware */}
          <Card padding={18}>
            <Eyebrow>Step 1 · Hardware</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {HARDWARE.map((h) => {
                const sel = hardware === h.id;
                return (
                  <label
                    key={h.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      background: sel ? 'var(--color-accent-12)' : 'var(--color-surface-2)',
                      border: `1px solid ${sel ? 'var(--color-accent-25)' : 'var(--color-border)'}`,
                      transition: 'background 120ms ease, border-color 120ms ease',
                    }}
                  >
                    <input
                      type="radio" name="hw" checked={sel} onChange={() => setHardware(h.id)}
                      style={{ accentColor: 'var(--color-accent)', flexShrink: 0 }}
                    />
                    <span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--color-accent)' : 'var(--color-text)' }}>{h.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>{h.sub}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {hardware === 'none' ? (
              <p style={{ color: 'var(--color-yellow)', fontSize: 13, marginTop: 10 }}>
                T0 local tier disabled. Mooter still saves on T1/T2/T3 cloud routing.
              </p>
            ) : null}
          </Card>

          {/* Step 2 — OS */}
          <Card padding={18}>
            <Eyebrow>Step 2 · Operating system</Eyebrow>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {OS.map((o) => {
                const sel = os === o.id;
                return (
                  <button
                    key={o.id} type="button" onClick={() => setOs(o.id)}
                    style={{
                      flex: 1, padding: '12px', textAlign: 'left', cursor: 'pointer', borderRadius: 8,
                      background: sel ? 'var(--color-accent-12)' : 'var(--color-surface-2)',
                      border: `1px solid ${sel ? 'var(--color-accent-25)' : 'var(--color-border)'}`,
                      transition: 'background 120ms ease, border-color 120ms ease',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--color-accent)' : 'var(--color-text)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>{o.sub}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 3 — subscriptions */}
          <Card padding={18}>
            <Eyebrow>Step 3 · Subscriptions</Eyebrow>
            <div style={{ marginTop: 6 }}>
              {SUBS.map((p) => {
                const on = subs[p.logo];
                return (
                  <button
                    key={p.name} type="button" onClick={() => toggleSub(p.logo)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', cursor: 'pointer',
                      background: 'transparent', border: 'none', borderBottom: '1px dashed var(--color-border)', textAlign: 'left',
                    }}
                    aria-pressed={on}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontSize: 10, color: 'var(--color-bg)',
                        background: on ? 'var(--color-accent)' : 'transparent',
                        border: on ? 'none' : '1px solid var(--color-border-light)',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <ProviderLogo provider={p.logo} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: on ? 'var(--color-text)' : 'var(--color-muted)' }}>{p.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--color-muted)' }}>
                      {on ? 'routing on' : 'off'}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 4 — usage */}
          <Card padding={18}>
            <Eyebrow>Step 4 · Usage pattern</Eyebrow>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)', marginTop: 12 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                Prompts per day <span className="num" style={{ color: 'var(--color-text)', fontWeight: 600 }}>{promptsPerDay}</span>
              </span>
              <input type="range" min={5} max={400} value={promptsPerDay} onChange={(e) => setPromptsPerDay(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </label>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)', marginTop: 12 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                % critical (T3) <span className="num" style={{ color: 'var(--color-text)', fontWeight: 600 }}>{pctCritical}%</span>
              </span>
              <input type="range" min={0} max={40} value={pctCritical} onChange={(e) => setPctCritical(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </label>
          </Card>
        </div>

        {/* RIGHT — live output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card accent padding={20} style={{ background: 'linear-gradient(135deg, var(--color-accent-08), transparent 60%)' }}>
            <Eyebrow>Your monthly projection</Eyebrow>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>without mooter</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 600, color: 'var(--color-muted)', textDecoration: 'line-through', textDecorationColor: 'var(--color-accent)', marginTop: 6 }}>{fmt(baseline)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>all-Opus on every prompt</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>with mooter</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 600, color: 'var(--color-text)', marginTop: 6 }}>{fmt(withMooter)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>mooter-routed</div>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>saved</div>
                <div className="num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-green)', marginTop: 6 }}>{fmt(saved)}</div>
                <div className="num" style={{ fontSize: 13, color: 'var(--color-green)', fontWeight: 600 }}>{r.saved_pct.toFixed(0)}%</div>
              </div>
            </div>
            {/*
              A ressalva vive AQUI, colada ao numero, e nao no fundo da pagina.
              Esta calculadora chegou a mostrar 92,6% enquanto o heroi da mesma
              landing publicava 47% — dois numeros para a mesma coisa, no mesmo
              site. A tabela de distribuicao por GPU que a alimenta nao vem de
              medicao nenhuma: e um cenario. Quem le o numero tem de ler isto.
            */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)', fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--color-text)' }}>Hypothetical scenario, not a measurement.</strong>{' '}
              The tier distribution above is an assumed profile per GPU class, and the per-prompt costs are token
              estimates. This project records no tokens, so it has no measured cost and publishes no savings
              percentage — see the <a href="/#honest-numbers" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>honest numbers</a>.
              What <em>is</em> measured: 101 of 123 classified prompts were routed to a local or cheap tier.
            </div>
          </Card>

          {/* tier distribution */}
          <Card padding={20}>
            <Eyebrow>Predicted tier distribution</Eyebrow>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {TIER_META.map(({ t, label }) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="num" style={{ width: 30, fontSize: 12.5, color: 'var(--color-muted)' }}>{t}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)', minWidth: 120 }}>{label}</span>
                  <ProgressBar pct={r.tier_distribution[t] * 100} color={TIER_COLORS_WEB[t]} />
                  <span className="num" style={{ width: 44, textAlign: 'right', fontSize: 12.5 }}>{(r.tier_distribution[t] * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Card>

          {/* stack compatibility */}
          <Card padding={18}>
            <Eyebrow>Your stack supports</Eyebrow>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stackRows.map(([icon, label, kind]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span aria-hidden style={{ width: 14, color: kind === 'ok' ? 'var(--color-green)' : 'var(--color-muted)' }}>{icon}</span>
                  <span style={{ color: kind === 'ok' ? 'var(--color-text)' : 'var(--color-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Concrete persona case */}
      <div style={{ marginTop: 40, padding: '20px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>A concrete case</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.7, maxWidth: 760, margin: 0 }}>
          <strong>Solo founder, Claude Code Max plan, RTX 4090, ~80 prompts/day, ~8% critical.</strong> Most of the day
          is renames, commits, small edits and &ldquo;explain this&rdquo; — those route to <strong>T0 local (free)</strong>.
          The ~8% that&apos;s real debugging or a cross-file refactor goes to <strong>Sonnet/Opus</strong>. Set those inputs
          above to see this profile&apos;s monthly figure — it&apos;s computed from the same per-tier costs as the N=34
          benchmark below, not a marketing number. Your mix (and your savings) shift with how much you keep local.
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
          confidence intervals and mis-routing analysis. Pinned to mooter v{versionInfo.version}.
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
