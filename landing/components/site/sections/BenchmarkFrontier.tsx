'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

/* ============================================================================
   Wave 5 — /benchmark · the contrafactual (data-viz, CrazyMoo)
   ----------------------------------------------------------------------------
   The differentiating proof: an aggregator (OpenRouter) shows what got *used*;
   a router also sees what it *didn't* pick — the counterfactual. That lets us
   measure by the TASK, not the token.

   HONESTY (the moat — inviolable):
   - Every number here is illustrative *structure*, labelled as such. Headline
     figures must come from the real tracker, labelled "neste run", never inflated.
   - $0.00 is muted, never green. Green is only for real savings > 0. Failures red.
   - Reproducible via `git clone` — the whole shape is in the open.

   No chart libs. SVG + native CSS/RAF only. All motion is gated on an in-view
   trigger and fully disabled under prefers-reduced-motion.
   ========================================================================== */

/* ── tokens (consume the site's existing palette; do not redefine) ─────────── */
const C = {
  local: 'var(--color-tier-0)', // green   — local / qwen
  haiku: 'var(--color-tier-1)', // blue    — Haiku
  sonnet: 'var(--color-tier-2)', // purple — Sonnet
  opus: 'var(--color-tier-3)', // red      — Opus / flagship
  moo: 'var(--color-accent)', // rose      — the routed pick (brand)
  save: 'var(--color-green)',
  danger: 'var(--color-tier-3)',
  ink: 'var(--color-text)',
  ink2: 'var(--color-text-2, var(--color-text))',
  muted: 'var(--color-muted)',
  // NB: the site's --color-faint token is a near-black border colour (#2A2622) that
  // fails AA as text — footnotes use --color-muted (AA on the dark bg) instead.
  faint: 'var(--color-muted)',
  line: 'var(--color-border)',
  line2: 'var(--color-border-light)',
  surface: 'var(--color-surface)',
  surface2: 'var(--color-surface-2)',
} as const;

/* ── motion helpers ───────────────────────────────────────────────────────── */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

function useInView<T extends HTMLElement>(once = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return [ref, inView];
}

/** Count-up that animates toward `value` whenever it changes & is in view. */
function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 850,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLSpanElement>(true);
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !inView) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value; // remember where we ended for the next change
    };
  }, [value, inView, reduced, duration]);

  return (
    <span ref={ref} className="num" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ── quality-floor calculator model (illustrative, monotonic) ─────────────────
   Raise the quality floor → router escalates more → less local, more flagship,
   higher $/task, more escalation, less saved. The story, not a measurement. */
type Floor = 95 | 98 | 99;
const FLOORS: Record<
  Floor,
  { saved: number; quality: number; mix: [number, number, number]; cost: number; escalation: number }
> = {
  95: { saved: 82, quality: 96, mix: [62, 28, 10], cost: 0.04, escalation: 8 },
  98: { saved: 74, quality: 98, mix: [54, 30, 16], cost: 0.06, escalation: 14 },
  99: { saved: 61, quality: 99, mix: [43, 32, 25], cost: 0.09, escalation: 23 },
};
const FLOOR_STEPS: Floor[] = [95, 98, 99];

/* ── per-task table (illustrative structure) ──────────────────────────────────
   Unit = the TASK. mix = [local, mid, flagship] %. trend = savings vs prev window. */
interface TaskRow {
  task: string;
  volume: number; // base = "this week"
  mix: [number, number, number];
  quality: number;
  cost: number;
  escalation: number;
  savings: number;
  trend: number;
}
const TASK_ROWS: TaskRow[] = [
  { task: 'bugfix', volume: 142, mix: [70, 22, 8], quality: 97, cost: 0.03, escalation: 6, savings: 86, trend: 18 },
  { task: 'refactor', volume: 88, mix: [55, 33, 12], quality: 96, cost: 0.05, escalation: 11, savings: 79, trend: 9 },
  { task: 'feature', volume: 64, mix: [44, 38, 18], quality: 95, cost: 0.08, escalation: 17, savings: 71, trend: -6 },
  { task: 'tests', volume: 120, mix: [76, 19, 5], quality: 98, cost: 0.02, escalation: 4, savings: 88, trend: 26 },
  { task: 'docs', volume: 96, mix: [82, 14, 4], quality: 97, cost: 0.015, escalation: 3, savings: 91, trend: 12 },
  { task: 'architecture', volume: 21, mix: [18, 34, 48], quality: 94, cost: 0.17, escalation: 31, savings: 48, trend: -24 },
];
type Win = 'Today' | 'Week' | 'Month';
const WIN_SCALE: Record<Win, number> = { Today: 0.18, Week: 1, Month: 4.3 };

/* ── counterfactual triptych (cost per successful task, illustrative) ───────── */
const TRIPTYCH = [
  { label: 'Real · mooter routed', cost: 0.04, fail: 0, color: C.save, note: 'routed per task' },
  { label: 'All-flagship · all-Opus', cost: 0.22, fail: 0, color: C.opus, note: '5.5× the cost, ~same quality' },
  { label: 'All-cheap · local-only', cost: 0.012, fail: 31, color: C.muted, note: 'cheapest — but fails 31%' },
] as const;
const MAX_TRIP_COST = Math.max(...TRIPTYCH.map((t) => t.cost));

/* ── vs Claude Code (positioning: complement, not attack) ─────────────────── */
type Mark = { v: ReactNode; tone?: 'yes' | 'meh' | 'no' };
const VS_COLS = ['Status quo', 'Claude Code alone', 'Build-it-yourself', 'mooter'] as const;
const VS_ROWS: { dim: string; cells: [Mark, Mark, Mark, Mark] }[] = [
  {
    dim: 'Who picks the model',
    cells: [{ v: 'you, by hand', tone: 'no' }, { v: 'you set it, sticky', tone: 'meh' }, { v: 'you code the rules', tone: 'meh' }, { v: 'deterministic, per prompt', tone: 'yes' }],
  },
  {
    dim: 'Sees the counterfactual',
    cells: [{ v: '—', tone: 'no' }, { v: '—', tone: 'no' }, { v: 'maybe', tone: 'meh' }, { v: 'both choices', tone: 'yes' }],
  },
  {
    dim: 'Local-first $0 tier',
    cells: [{ v: '—', tone: 'no' }, { v: '—', tone: 'no' }, { v: 'DIY', tone: 'meh' }, { v: 'Ollama-first', tone: 'yes' }],
  },
  {
    dim: 'Cost shown per task',
    cells: [{ v: '—', tone: 'no' }, { v: 'per token', tone: 'meh' }, { v: 'DIY', tone: 'meh' }, { v: '$/successful task', tone: 'yes' }],
  },
  {
    dim: 'Learns your routing',
    cells: [{ v: '—', tone: 'no' }, { v: '—', tone: 'no' }, { v: 'DIY', tone: 'meh' }, { v: 'forever', tone: 'yes' }],
  },
];

/* ── tiny presentational helpers ──────────────────────────────────────────── */
function SectionTitle({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        className="mono"
        style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}
      >
        {kicker}
      </div>
      <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
        {children}
      </h2>
    </div>
  );
}

function MixBar({ mix, height = 8 }: { mix: [number, number, number]; height?: number }) {
  const segs: [number, string, string][] = [
    [mix[0], C.local, 'local'],
    [mix[1], C.sonnet, 'mid'],
    [mix[2], C.opus, 'flagship'],
  ];
  return (
    <span
      role="img"
      aria-label={`tier-mix ${mix[0]}% local, ${mix[1]}% mid, ${mix[2]}% flagship`}
      style={{ display: 'flex', width: 92, height, borderRadius: 999, overflow: 'hidden', background: C.line }}
    >
      {segs.map(([w, col, k]) => (
        <span key={k} title={`${k} ${w}%`} style={{ width: `${w}%`, height: '100%', background: col }} />
      ))}
    </span>
  );
}

function Trend({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span
      className="num"
      style={{ color: up ? C.save : C.danger, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}
      title="savings trend vs previous window (illustrative)"
    >
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {v}%
    </span>
  );
}

/* ============================================================================ */
export default function BenchmarkFrontier() {
  const reduced = useReducedMotion();

  return (
    <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 56 }}>
      <Frontier reduced={reduced} />
      <Calculator reduced={reduced} />
      <TaskTable />
      <Triptych reduced={reduced} />
      <VsClaudeCode />
      <HonestNote />
    </div>
  );
}

/* ── 1 · the Pareto frontier ──────────────────────────────────────────────── */
function Frontier({ reduced }: { reduced: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(true);
  const drawn = reduced || inView;

  // model points in the 720×280 viewBox (ported from the prototype)
  const points = [
    { x: 110, y: 205, c: C.local, label: 'qwen local', anchor: 'start' as const, lx: 12, ly: 4 },
    { x: 250, y: 150, c: C.haiku, label: 'Haiku', anchor: 'start' as const, lx: 12, ly: 4 },
    { x: 420, y: 100, c: C.sonnet, label: 'Sonnet', anchor: 'start' as const, lx: 12, ly: 4 },
    { x: 640, y: 60, c: C.opus, label: 'Opus', anchor: 'end' as const, lx: -12, ly: -10 },
  ];

  return (
    <div>
      <SectionTitle kicker="quality × cost · the Pareto frontier">
        No single model sits where the router lands.
      </SectionTitle>
      <div
        ref={ref}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: 'clamp(16px, 3vw, 28px)',
        }}
      >
        <svg
          viewBox="0 0 720 280"
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ maxHeight: 320, display: 'block' }}
          role="img"
          aria-label="Quality versus cost scatter. Local qwen sits low-cost low-quality; Haiku, Sonnet and Opus climb the price-for-quality curve. The mooter-routed point sits above the Pareto frontier — low cost and high quality — where no single model is."
        >
          <title>Quality × cost — the Pareto frontier</title>
          <desc>
            mooter&apos;s routed point sits above the frontier: low cost and high quality, a position no single model
            occupies. Values illustrative.
          </desc>

          {/* axes */}
          <line x1="50" y1="240" x2="700" y2="240" stroke="var(--color-border-light)" />
          <line x1="50" y1="20" x2="50" y2="240" stroke="var(--color-border-light)" />
          <text x="370" y="270" fill="var(--color-muted)" fontSize="11" fontFamily="var(--mono)" textAnchor="middle">
            cost per task →
          </text>
          <text
            x="20"
            y="130"
            fill="var(--color-muted)"
            fontSize="11"
            fontFamily="var(--mono)"
            transform="rotate(-90 20 130)"
            textAnchor="middle"
          >
            quality →
          </text>

          {/* frontier curve — drawn via pathLength on view */}
          <path
            d="M70,210 Q230,90 430,70 T690,55"
            fill="none"
            stroke="var(--color-border-light)"
            strokeWidth="1.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={drawn ? 0 : 1}
            style={{ transition: reduced ? 'none' : 'stroke-dashoffset 1100ms ease-out' }}
          />
          <text x="540" y="92" fill="var(--color-faint, var(--color-muted))" fontSize="9.5" fontFamily="var(--mono)">
            Pareto frontier
          </text>

          {/* model points (staggered) */}
          {points.map((p, i) => (
            <g
              key={p.label}
              style={{
                opacity: drawn ? 1 : 0,
                transform: drawn ? 'none' : 'translateY(8px)',
                transition: reduced ? 'none' : `opacity 420ms ease ${300 + i * 110}ms, transform 420ms ease ${300 + i * 110}ms`,
              }}
            >
              <circle cx={p.x} cy={p.y} r={6} fill={p.c} />
              <text
                x={p.x + p.lx}
                y={p.y + p.ly}
                fill="var(--color-text-2, var(--color-text))"
                fontSize="10"
                fontFamily="var(--mono)"
                textAnchor={p.anchor}
              >
                {p.label}
              </text>
            </g>
          ))}

          {/* mooter routed — above the frontier */}
          <g
            style={{
              opacity: drawn ? 1 : 0,
              transition: reduced ? 'none' : 'opacity 460ms ease 820ms',
            }}
          >
            {!reduced && (
              <circle cx={250} cy={80} r={9} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" opacity={0.5}>
                <animate attributeName="r" values="9;16;9" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={250} cy={80} r={9} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} />
            <text x={266} y={78} fill="var(--color-accent)" fontSize="12" fontFamily="var(--mono)" fontWeight="bold">
              mooter routed
            </text>
            <text x={266} y={92} fill="var(--color-muted)" fontSize="9.5" fontFamily="var(--mono)">
              low cost · high quality — no single model is here
            </text>
          </g>
        </svg>

        {/* visually-hidden equivalent table (a11y + SEO) */}
        <table style={srOnly}>
          <caption>Quality versus cost per task (illustrative)</caption>
          <thead>
            <tr>
              <th>Option</th>
              <th>Relative cost</th>
              <th>Relative quality</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>qwen local</td><td>lowest</td><td>low</td></tr>
            <tr><td>Haiku</td><td>low</td><td>medium</td></tr>
            <tr><td>Sonnet</td><td>medium</td><td>high</td></tr>
            <tr><td>Opus</td><td>highest</td><td>highest</td></tr>
            <tr><td>mooter routed</td><td>low</td><td>high (above the frontier)</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 2 · bench-cards as a live calculator (quality-floor slider) ──────────── */
function Calculator({ reduced }: { reduced: boolean }) {
  const [idx, setIdx] = useState(0); // 0..2 → FLOOR_STEPS
  const floor = FLOOR_STEPS[idx];
  const d = FLOORS[floor];

  const card: CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: '20px 22px',
  };

  return (
    <div>
      <SectionTitle kicker="router metrics · move the floor, watch it recompute">
        Set the quality floor — the savings follow.
      </SectionTitle>

      {/* quality-floor slider */}
      <div
        style={{
          ...card,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <label htmlFor="qfloor" style={{ fontSize: 13.5, color: C.ink2, fontWeight: 600 }}>
          Quality floor
        </label>
        <input
          id="qfloor"
          type="range"
          min={0}
          max={2}
          step={1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-valuetext={`${floor}% quality floor`}
          style={{ flex: '1 1 220px', accentColor: 'var(--color-accent)', cursor: 'pointer', minWidth: 180 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {FLOOR_STEPS.map((f, i) => {
            const active = i === idx;
            return (
              <button
                key={f}
                onClick={() => setIdx(i)}
                aria-pressed={active}
                className="num"
                style={{
                  padding: '5px 11px',
                  borderRadius: 999,
                  fontFamily: 'var(--mono)',
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1A0E0E' : C.muted,
                  background: active ? 'var(--color-accent)' : 'transparent',
                  border: `1px solid ${active ? 'var(--color-accent)' : C.line}`,
                }}
              >
                {f}%
              </button>
            );
          })}
        </div>
      </div>

      {/* the three bench-cards (count-up, recompute on slider change) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="m-stack">
        <div style={card}>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.save, fontFamily: 'var(--mono)', lineHeight: 1 }}>
            <CountUp value={d.saved} suffix="%" />
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            saved vs all-Opus ·{' '}
            <strong style={{ color: C.ink }}>
              <CountUp value={d.quality} suffix="%" />
            </strong>{' '}
            quality retained
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.ink, fontFamily: 'var(--mono)', lineHeight: 1 }}>
            <CountUp value={d.mix[0]} /> / <CountUp value={d.mix[1]} /> / <CountUp value={d.mix[2]} />
          </div>
          <div style={{ marginTop: 10 }}>
            <MixBar mix={d.mix} height={10} />
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>tier-mix · local / mid / flagship</div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.ink, fontFamily: 'var(--mono)', lineHeight: 1 }}>
            <CountUp value={d.cost} prefix="$" decimals={2} />
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
            per successful task · escalation{' '}
            <strong style={{ color: C.ink }}>
              <CountUp value={d.escalation} suffix="%" />
            </strong>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.faint, marginTop: 10, fontFamily: 'var(--mono)' }}>
        illustrative · raising the floor escalates more work to flagship → less saved, higher $/task
        {reduced ? '' : ' (numbers count up on view)'}
      </p>
    </div>
  );
}

/* ── 3 · per-task table (the unit is the task) + window filter ─────────────── */
function TaskTable() {
  const [win, setWin] = useState<Win>('Week');
  const scale = WIN_SCALE[win];
  const rows = useMemo(
    () => TASK_ROWS.map((r) => ({ ...r, vol: Math.max(1, Math.round(r.volume * scale)) })),
    [scale],
  );

  const th: CSSProperties = {
    textAlign: 'left',
    padding: '11px 12px',
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: C.muted,
    fontFamily: 'var(--mono)',
    borderBottom: `1px solid ${C.line2}`,
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = { padding: '12px 12px', fontSize: 13.5, verticalAlign: 'middle', whiteSpace: 'nowrap' };

  return (
    <div>
      <SectionTitle kicker="per task type · measured by the task, not the token">
        Where the savings actually come from.
      </SectionTitle>

      {/* window filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: C.muted }}>window:</span>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
          {(['Today', 'Week', 'Month'] as Win[]).map((w) => {
            const active = w === win;
            return (
              <button
                key={w}
                onClick={() => setWin(w)}
                aria-pressed={active}
                style={{
                  padding: '7px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#1A0E0E' : C.muted,
                  background: active ? 'var(--color-accent)' : 'transparent',
                  border: 'none',
                }}
              >
                {w}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12.5, color: C.faint }}>volumes scale by window · rates & trend illustrative</span>
      </div>

      <div className="m-scroll-x" style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Task type</th>
              <th style={th}>Volume</th>
              <th style={th}>Tier-mix</th>
              <th style={th}>Quality kept</th>
              <th style={th}>$/successful</th>
              <th style={th}>Escalation</th>
              <th style={th}>Savings</th>
              <th style={th}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.task} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 600, color: C.ink }}>{r.task}</td>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: C.ink2 }}>{r.vol}</td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <MixBar mix={r.mix} />
                  </span>
                </td>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: C.ink }}>{r.quality}%</td>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: C.ink }}>${r.cost.toFixed(r.cost < 0.1 ? 3 : 2)}</td>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: r.escalation >= 25 ? C.danger : C.ink2 }}>
                  {r.escalation}%
                </td>
                <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: r.savings > 0 ? C.save : C.muted }}>
                  {r.savings}%
                </td>
                <td style={td}>
                  <Trend v={r.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 1.6 }}>
        The unit is the <strong style={{ color: C.muted }}>task</strong>, not the token — a router scores the whole
        attempt (did it succeed?), which a per-token aggregator cannot. Architecture escalates most (
        <span style={{ color: C.danger }}>31%</span> to flagship) and saves least — exactly where you&apos;d want a
        human in the loop.
      </p>
    </div>
  );
}

/* ── 4 · counterfactual triptych ──────────────────────────────────────────── */
function Triptych({ reduced }: { reduced: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(true);
  const grown = reduced || inView;
  const MINH = 0.06; // floor so the cheapest bar stays visible

  return (
    <div>
      <SectionTitle kicker="the counterfactual · same work, three ways">
        Only the router can price the road not taken.
      </SectionTitle>
      <div
        ref={ref}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: 'clamp(18px, 3vw, 28px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'clamp(14px, 3vw, 32px)',
          alignItems: 'end',
        }}
        className="m-stack"
      >
        {TRIPTYCH.map((t, i) => {
          const ratio = Math.max(MINH, t.cost / MAX_TRIP_COST);
          return (
            <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ height: 180, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div
                  style={{
                    width: '70%',
                    maxWidth: 90,
                    height: grown ? `${ratio * 100}%` : '0%',
                    background: `color-mix(in srgb, ${t.color} 24%, transparent)`,
                    border: `1px solid ${t.color}`,
                    borderRadius: '8px 8px 0 0',
                    transformOrigin: 'bottom',
                    transition: reduced ? 'none' : `height 760ms cubic-bezier(.22,.61,.36,1) ${i * 120}ms`,
                    position: 'relative',
                  }}
                >
                  <span
                    className="num"
                    style={{
                      position: 'absolute',
                      top: -24,
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      fontSize: 15,
                      color: t.color === C.muted ? C.muted : t.color,
                    }}
                  >
                    ${t.cost.toFixed(t.cost < 0.1 ? 3 : 2)}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, textAlign: 'center' }}>{t.label}</div>
              <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.45 }}>{t.note}</div>
              {t.fail > 0 ? (
                <div
                  className="num"
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    color: C.danger,
                    background: `color-mix(in srgb, ${C.danger} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${C.danger} 30%, transparent)`,
                    borderRadius: 999,
                    padding: '3px 10px',
                  }}
                >
                  fails {t.fail}%
                </div>
              ) : (
                <div className="num" style={{ fontSize: 12, fontFamily: 'var(--mono)', color: C.muted }}>0% fail</div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.6, maxWidth: 760 }}>
        Cost per <em>successful</em> task. All-cheap looks best on price alone — until you count the{' '}
        <span style={{ color: C.danger }}>31% that fail</span> and have to be redone. All-flagship never fails but costs{' '}
        5.5×. The router&apos;s job is the only point that&apos;s cheap <em>and</em> doesn&apos;t fall over. Illustrative
        structure.
      </p>
    </div>
  );
}

/* ── 5 · vs Claude Code (complement, don't attack) ────────────────────────── */
function VsClaudeCode() {
  const toneColor = (t?: Mark['tone']) =>
    t === 'yes' ? C.save : t === 'meh' ? 'var(--color-yellow)' : C.muted;

  const th: CSSProperties = {
    padding: '12px 14px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    fontFamily: 'var(--mono)',
    color: C.muted,
    borderBottom: `1px solid ${C.line2}`,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = { padding: '12px 14px', fontSize: 13, textAlign: 'center', verticalAlign: 'middle' };

  return (
    <div>
      <SectionTitle kicker="where it sits · mooter routes for Claude Code, it doesn't replace it">
        Same fleet, four ways to drive it.
      </SectionTitle>
      <div className="m-scroll-x" style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 12, background: C.surface2 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }} />
              {VS_COLS.map((c) => {
                const isMoo = c === 'mooter';
                return (
                  <th key={c} style={{ ...th, color: isMoo ? 'var(--color-accent)' : C.muted }}>
                    {c}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {VS_ROWS.map((row) => (
              <tr key={row.dim} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: C.ink }}>{row.dim}</td>
                {row.cells.map((cell, i) => {
                  const isMoo = i === 3;
                  return (
                    <td
                      key={i}
                      style={{
                        ...td,
                        background: isMoo ? 'var(--color-accent-08)' : undefined,
                        color: toneColor(cell.tone),
                        fontWeight: isMoo ? 700 : 500,
                        fontFamily: 'var(--mono)',
                        fontSize: 12.5,
                      }}
                    >
                      {cell.tone === 'yes' ? '✓ ' : ''}
                      {cell.v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.6, maxWidth: 760 }}>
        mooter sits <em>on top of</em> Claude Code — same agent, same workflow. It just decides which model each prompt
        deserves, keeps the cheap-but-good local tier in play, and shows you the bill per task. Complement, not
        replacement.
      </p>
    </div>
  );
}

/* ── 6 · honest note + reproducibility ────────────────────────────────────── */
function HonestNote() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        background: 'color-mix(in srgb, var(--color-yellow) 7%, transparent)',
        border: `1px solid color-mix(in srgb, var(--color-yellow) 28%, transparent)`,
        borderRadius: 12,
        padding: '16px 18px',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-yellow)', marginTop: 6, flexShrink: 0 }}
      />
      <p style={{ margin: 0, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
        <strong style={{ color: C.ink }}>Illustrative structure.</strong> Every figure above shows the <em>shape</em> of
        the metric, not a measurement. Headline numbers must come from the real tracker, labelled{' '}
        <span className="mono" style={{ color: C.muted }}>&ldquo;neste run&rdquo;</span> — never inflated, never a
        fabricated win. Baseline: <span className="mono" style={{ color: C.muted }}>vs all-Opus · pricing snapshot 2026-06</span>.{' '}
        The whole method is reproducible via{' '}
        <span className="mono" style={{ color: 'var(--color-accent)' }}>git clone</span>.
      </p>
    </div>
  );
}

/* ── visually-hidden helper ───────────────────────────────────────────────── */
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};
