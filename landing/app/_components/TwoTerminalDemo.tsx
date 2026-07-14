'use client';

import { useEffect, useRef, useState } from 'react';
import Eyebrow from '@/components/Eyebrow';
import MonoNum from '@/components/MonoNum';

// TwoTerminalDemo — the two-terminal live-typing savings showpiece (Wave 60).
// Same six prompts streamed into vanilla Claude Code (everything → Opus) vs
// Claude Code + mooter (routed across T0–T3). The cumulative math is internally
// consistent and lands on the author's real 47%. HONESTY: the hard prompt (the
// schema migration) stays on Opus on BOTH sides — mooter only routes down when
// quality holds. Wording stays "comparable quality on routine tasks" — never the
// banned over-claim about identical outputs.

interface DemoPrompt {
  p: string;
  van: number;
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  tcolor: string;
  model: string;
  cost: number;
  note: string;
}

const DEMO_PROMPTS: DemoPrompt[] = [
  { p: 'fix the typo in the README', van: 0.04, tier: 'T0', tcolor: 'var(--color-tier-0)', model: 'qwen2.5-coder · local', cost: 0.0, note: 'trivial → local' },
  { p: 'rename `userId` across the repo', van: 0.06, tier: 'T0', tcolor: 'var(--color-tier-0)', model: 'qwen2.5-coder · local', cost: 0.0, note: 'mechanical → local' },
  { p: 'explain why this test is flaky', van: 0.12, tier: 'T1', tcolor: 'var(--color-tier-1)', model: 'claude-haiku', cost: 0.02, note: 'light reasoning → haiku' },
  { p: 'draft the system map for the auth refactor', van: 0.4, tier: 'T2', tcolor: 'var(--color-tier-2)', model: 'claude-sonnet', cost: 0.08, note: 'arch · medium → sonnet' },
  { p: 'design the billing schema migration plan', van: 0.52, tier: 'T3', tcolor: 'var(--color-tier-3)', model: 'claude-opus', cost: 0.52, note: 'hard → kept on opus' },
  { p: 'write the commit message', van: 0.03, tier: 'T0', tcolor: 'var(--color-tier-0)', model: 'qwen2.5-coder · local', cost: 0.0, note: 'trivial → local' },
];

const fmt = (n: number) => '$' + n.toFixed(2);

type Phase = 'typing' | 'routing' | 'counted' | 'finished';
interface DemoState {
  idx: number;
  typed: number;
  phase: Phase;
  completed: number;
}

export default function TwoTerminalDemo() {
  const [runId, setRunId] = useState(0);
  const [st, setSt] = useState<DemoState>({ idx: 0, typed: 0, phase: 'typing', completed: 0 });
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only start once scrolled into view (and not at all under reduced-motion).
  useEffect(() => {
    if (reduceMotion) {
      setSt({ idx: DEMO_PROMPTS.length - 1, typed: 0, phase: 'finished', completed: DEMO_PROMPTS.length });
      return;
    }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  useEffect(() => {
    if (!started || reduceMotion) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));
    (async () => {
      setSt({ idx: 0, typed: 0, phase: 'typing', completed: 0 });
      await wait(500);
      for (let i = 0; i < DEMO_PROMPTS.length; i++) {
        if (cancelled) return;
        const text = DEMO_PROMPTS[i].p;
        for (let c = 1; c <= text.length; c++) {
          if (cancelled) return;
          setSt({ idx: i, typed: c, phase: 'typing', completed: i });
          await wait(16);
        }
        await wait(230);
        if (cancelled) return;
        setSt({ idx: i, typed: text.length, phase: 'routing', completed: i });
        await wait(520);
        if (cancelled) return;
        setSt({ idx: i, typed: text.length, phase: 'counted', completed: i + 1 });
        await wait(560);
      }
      if (!cancelled) setSt((s) => ({ ...s, phase: 'finished' }));
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [runId, started, reduceMotion]);

  const done = DEMO_PROMPTS.slice(0, st.completed);
  const vanillaTotal = done.reduce((a, b) => a + b.van, 0);
  const mooterTotal = done.reduce((a, b) => a + b.cost, 0);
  const finished = st.phase === 'finished';
  const allVan = DEMO_PROMPTS.reduce((a, b) => a + b.van, 0);
  const allMoo = DEMO_PROMPTS.reduce((a, b) => a + b.cost, 0);
  const pctSaved = Math.round((1 - allMoo / allVan) * 100);

  const showCurrent = st.phase !== 'finished';
  const cur = DEMO_PROMPTS[st.idx];
  const curTyped = cur ? cur.p.slice(0, st.typed) : '';
  const bodyMinH = DEMO_PROMPTS.length * 46 + 16;

  const promptCell = (text: string, active: boolean) => (
    <div
      style={{
        color: 'var(--color-term-fg)',
        fontSize: 12.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      }}
    >
      <span style={{ color: 'var(--color-term-dim)' }}>$ </span>
      <span style={{ color: active ? 'var(--color-accent)' : 'var(--color-term-fg)' }}>{text}</span>
      {active && st.phase === 'typing' && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 14,
            marginLeft: 1,
            marginBottom: -2,
            background: 'var(--color-accent)',
            animation: 'blink 1s step-end infinite',
          }}
        />
      )}
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div className="m-pad m-pad-y" style={{ padding: '56px 0 8px' }}>
        <Eyebrow>§ live · same prompts, two bills</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, marginBottom: 8 }}>
          <h2
            style={{
              fontFamily: 'var(--font)',
              fontSize: 'clamp(30px, 4.6vw, 46px)',
              fontWeight: 700,
              letterSpacing: '-0.035em',
              lineHeight: 1.04,
              margin: 0,
              maxWidth: 760,
            }}
          >
            Same prompts. Comparable quality on routine tasks.
            <br />
            One bill is <span style={{ color: 'var(--color-accent)' }}>{pctSaved}% smaller</span>.
          </h2>
          <button
            type="button"
            onClick={() => setRunId((r) => r + 1)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12.5,
              color: 'var(--color-text)',
              cursor: 'pointer',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '9px 16px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ↻ {finished || reduceMotion ? 'replay trace' : 'running…'}
          </button>
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 680, marginTop: 4, marginBottom: 32 }}>
          Same prompts, both terminals at once. The hard one stays on Opus on <em>both</em> sides. Mooter only routes down when quality holds.
        </p>

        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* ── VANILLA ── */}
          <div
            style={{
              background: 'var(--color-term-bg)',
              border: '1px solid var(--color-term-border)',
              borderRadius: 10,
              overflow: 'hidden',
              fontFamily: 'var(--mono)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: 'var(--color-term-header)',
                borderBottom: '1px solid var(--color-term-border)',
                fontSize: 11.5,
              }}
            >
              <span style={{ display: 'inline-flex', gap: 7 }} aria-hidden="true">
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
              </span>
              <span style={{ color: 'var(--color-term-dim)' }}>claude · vanilla</span>
              <span style={{ marginLeft: 'auto', color: 'var(--color-tier-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-tier-3)' }} />
                everything → opus
              </span>
            </div>
            <div style={{ padding: '14px 16px', minHeight: bodyMinH, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {done.map((d, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 4, marginBottom: 4 }}>
                  {promptCell(d.p, false)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2 }}>
                    <span style={{ color: 'var(--color-tier-3)' }}>└─ → claude-opus</span>
                    <span style={{ color: 'var(--color-tier-3)' }}>{fmt(d.van)}</span>
                  </div>
                </div>
              ))}
              {showCurrent && cur && (
                <div style={{ paddingBottom: 4 }}>
                  {promptCell(curTyped, true)}
                  {st.phase === 'routing' && (
                    <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--color-tier-3)' }}>
                      └─ → claude-opus <span style={{ color: 'var(--color-term-dim)' }}>(no routing)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--color-term-border)', padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-term-dim)', fontSize: 11.5 }}>running cost</span>
              <span style={{ color: 'var(--color-tier-3)', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(vanillaTotal)}</span>
            </div>
          </div>

          {/* ── MOOTER ── */}
          <div
            style={{
              background: 'var(--color-term-bg)',
              border: '1px solid var(--color-accent-25)',
              borderRadius: 10,
              overflow: 'hidden',
              fontFamily: 'var(--mono)',
              boxShadow: '0 0 0 1px var(--color-accent-08), 0 20px 60px -30px rgba(232,136,138,0.4)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: 'var(--color-term-header)',
                borderBottom: '1px solid var(--color-term-border)',
                fontSize: 11.5,
              }}
            >
              <span style={{ display: 'inline-flex', gap: 7 }} aria-hidden="true">
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
              </span>
              <span style={{ color: 'var(--color-term-dim)' }}>
                claude <span style={{ color: 'var(--color-accent)' }}>+ mooter</span>
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="mpulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)', animation: 'mpulse 1.6s ease-in-out infinite' }} />
                routed
              </span>
            </div>
            <div style={{ padding: '14px 16px', minHeight: bodyMinH, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {done.map((d, i) => (
                <div key={i} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 4, marginBottom: 4 }}>
                  {promptCell(d.p, false)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2 }}>
                    <span style={{ color: 'var(--color-term-dim)' }}>
                      └─ <span style={{ color: d.tcolor, fontWeight: 600 }}>{d.tier}</span> {d.model}
                    </span>
                    <span style={{ color: d.cost === 0 ? 'var(--color-green)' : 'var(--color-term-fg)' }}>{d.cost === 0 ? 'free' : fmt(d.cost)}</span>
                  </div>
                </div>
              ))}
              {showCurrent && cur && (
                <div style={{ paddingBottom: 4 }}>
                  {promptCell(curTyped, true)}
                  {st.phase === 'routing' && (
                    <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--color-term-dim)' }}>
                      └─ classify <span style={{ color: 'var(--color-green)' }}>14ms</span> →{' '}
                      <span style={{ color: cur.tcolor, fontWeight: 600 }}>{cur.tier}</span>{' '}
                      <span style={{ color: 'var(--color-term-dim)' }}>{cur.note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--color-term-border)', padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-term-dim)', fontSize: 11.5 }}>running cost</span>
              <span style={{ color: 'var(--color-green)', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(mooterTotal)}</span>
            </div>
          </div>
        </div>

        {/* reveal bar */}
        <div
          style={{
            marginTop: 24,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            borderRadius: 14,
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            flexWrap: 'wrap',
            opacity: finished ? 1 : 0.5,
            transition: 'opacity .4s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font)', fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-accent)' }}>{pctSaved}%</span>
            <span style={{ color: 'var(--color-muted)', fontSize: 14 }}>cheaper on this trace</span>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--color-border)' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-term-dim)' }}>
            <span style={{ color: 'var(--color-tier-3)' }}>{fmt(allVan)}</span> vanilla →{' '}
            <span style={{ color: 'var(--color-green)' }}>{fmt(allMoo)}</span> routed
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--color-muted)', maxWidth: 380, lineHeight: 1.5 }}>
            *Illustrative trace. The headline <MonoNum color="var(--color-text)">{pctSaved}%</MonoNum> is measured across the author&apos;s
            real <MonoNum color="var(--color-text)">658</MonoNum> routed calls — not this six-prompt demo, and not a community average.
          </div>
        </div>
      </div>
    </div>
  );
}
