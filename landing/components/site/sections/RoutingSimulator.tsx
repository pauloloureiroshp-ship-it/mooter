'use client';

import { useEffect, useRef, useState } from 'react';

// RoutingSimulator — site v2 / Wave 2 · signature moment #2.
//
// A faithful, copyable replay of one real routed run. The PRESENTATION is
// scripted (play / step / scrub), but every number and every routing decision
// is what the product would actually produce — a labelled replay, not staged
// future. The hard prompt (the schema migration) stays on Opus on BOTH sides;
// mooter only routes down when quality holds.
//
// Honesty rules baked in (the moat):
//   · $0.000 renders muted/grey — never green. Green only for real savings > 0.
//   · Baseline is always "vs all-Opus", labelled "pricing snapshot 2026-06".
//   · The "why" panel surfaces the signal that fired the tier (intent /
//     complexity / confidence) so a sceptic can audit the decision.
//
// Self-contained on purpose: the canonical palette lives as locally-scoped CSS
// custom properties so the section renders correctly regardless of the Wave 0
// token foundation, and so it owns only this one file. It falls back to the
// project's --mono / --font tokens when they exist.

type Tier = 'local' | 'haiku' | 'sonnet' | 'opus';

interface Decision {
  /** The prompt as typed at the terminal. */
  p: string;
  /** Deterministic classifier signals (the audit trail). */
  intent: string;
  complexity: 'low' | 'mid' | 'high';
  /** Classifier confidence for this decision — part of the replay snapshot. */
  conf: number;
  /** Chosen tier + the concrete model string the router picked. */
  tier: Tier;
  model: string;
  /** Routed cost vs the all-Opus baseline cost (USD, this run). */
  rou: number;
  opus: number;
  /** Plain-language reason the router landed here — derived from the signals. */
  reason: string;
}

// Exact port of the prototype `RUN` array (6 prompts). Numbers are the bill
// this run produced; conf/reason expose the deterministic signal behind each tier.
const RUN: Decision[] = [
  {
    p: 'make this button rounded',
    intent: 'edit', complexity: 'low', conf: 0.96,
    tier: 'local', model: 'qwen2.5-coder:7b', rou: 0.0, opus: 0.04,
    reason: 'low-complexity edit → runs on local, $0 cost',
  },
  {
    p: 'rename getUser → fetchUser everywhere',
    intent: 'refactor', complexity: 'low', conf: 0.94,
    tier: 'local', model: 'qwen2.5-coder:7b', rou: 0.0, opus: 0.035,
    reason: 'mechanical refactor → local handles it, $0 cost',
  },
  {
    p: 'explain what this regex does',
    intent: 'explain', complexity: 'low', conf: 0.91,
    tier: 'haiku', model: 'claude-haiku', rou: 0.002, opus: 0.03,
    reason: 'light reasoning clears on Haiku — no flagship needed',
  },
  {
    p: 'add a loading state to the form',
    intent: 'feature', complexity: 'mid', conf: 0.82,
    tier: 'sonnet', model: 'claude-sonnet', rou: 0.011, opus: 0.045,
    reason: 'mid-complexity feature → Sonnet, Opus would be overkill',
  },
  {
    p: 'why is the auth token expiring early?',
    intent: 'debug', complexity: 'mid', conf: 0.78,
    tier: 'sonnet', model: 'claude-sonnet', rou: 0.014, opus: 0.052,
    reason: 'mid-complexity debug → Sonnet holds the quality bar',
  },
  {
    p: 'design a single→multi-tenant schema migration',
    intent: 'architect', complexity: 'high', conf: 0.93,
    tier: 'opus', model: 'claude-opus (stays!)', rou: 0.18, opus: 0.18,
    reason: 'high-complexity architecture → stays on Opus (quality floor)',
  },
];

const STEPS = RUN.length; // 6
const STEP_MS = 1100; // autoplay cadence ~1.1s / step

const TIER_LABEL: Record<Tier, string> = { local: 'local', haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' };

const fmt3 = (n: number) => '$' + n.toFixed(3);
const fmt2 = (n: number) => '$' + n.toFixed(2);

// Canonical totals (whole run) — drives the headline so it can never drift.
const ALL_VAN = RUN.reduce((a, r) => a + r.opus, 0); // 0.382
const ALL_ROU = RUN.reduce((a, r) => a + r.rou, 0); // 0.207
const HEADLINE_PCT = Math.round((1 - ALL_ROU / ALL_VAN) * 100); // 46

export default function RoutingSimulator() {
  const [step, setStep] = useState(0); // 0..STEPS — number of decisions revealed
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  const stepRef = useRef(step);
  stepRef.current = step;

  // Reduced-motion: no autoplay; start on the final state so totals are visible.
  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    if (mq?.matches) {
      setReduced(true);
      setStep(STEPS);
    }
  }, []);

  // requestAnimationFrame autoplay loop (timestamp accumulator — no setInterval).
  useEffect(() => {
    if (!playing || reduced) return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let primed = false;
    const tick = (ts: number) => {
      if (!primed) {
        primed = true;
        last = ts;
        raf = requestAnimationFrame(tick);
        return;
      }
      acc += ts - last;
      last = ts;
      if (acc >= STEP_MS) {
        acc = 0;
        const next = stepRef.current + 1;
        if (next >= STEPS) {
          setStep(STEPS);
          setPlaying(false);
          return;
        }
        setStep(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced]);

  const togglePlay = () => {
    if (reduced) {
      setStep(STEPS);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step >= STEPS) setStep(0); // replay from the top
    setPlaying(true);
  };

  const stepOnce = () => {
    setPlaying(false);
    setStep((s) => (s >= STEPS ? 0 : s + 1));
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false);
    setStep(Number(e.target.value));
  };

  // Derived running state for the revealed prefix.
  const done = RUN.slice(0, step);
  const van = done.reduce((a, r) => a + r.opus, 0);
  const rou = done.reduce((a, r) => a + r.rou, 0);
  const pct = van > 0 ? Math.round((1 - rou / van) * 100) : 0;
  const counts: Record<Tier, number> = { local: 0, haiku: 0, sonnet: 0, opus: 0 };
  for (const r of done) counts[r.tier]++;

  // The decision currently in focus (most recently revealed) drives the "why" panel.
  const focusIdx = step > 0 ? step - 1 : -1;
  const focus = focusIdx >= 0 ? RUN[focusIdx] : null;

  const playLabel = reduced
    ? '↻ Show result'
    : playing
      ? '❚❚ Pause'
      : step >= STEPS
        ? '↻ Replay'
        : '▶ Play';

  const liveSummary =
    step === 0
      ? 'Run not started.'
      : `Step ${step} of ${STEPS}. Routed cost ${fmt3(rou)}, ${pct}% cheaper than all-Opus ${fmt3(van)}.`;

  const tiers: Tier[] = ['local', 'haiku', 'sonnet', 'opus'];

  return (
    <section className="rsim-root" id="sim" aria-labelledby="rsim-title">
      <style>{CSS}</style>

      <div className="rsim-wrap">
        <header className="rsim-head">
          <p className="rsim-eyebrow">Live · same prompts, two bills</p>
          <h2 className="rsim-h2" id="rsim-title">
            Same six prompts. One bill is{' '}
            <span className="rsim-accent">{HEADLINE_PCT}% smaller</span>.
          </h2>
          <p className="rsim-lede">
            Step through a real routed run. The hard one — the schema migration — stays on Opus on{' '}
            <em>both</em> sides. Mooter only routes down when quality holds.
          </p>
        </header>

        <div className="rsim-grid">
          {/* ── LEFT · terminal stream ── */}
          <div className="rsim-term">
            <div className="rsim-chrome">
              <span className="rsim-dot" style={{ background: 'var(--rsim-opus)' }} />
              <span className="rsim-dot" style={{ background: 'var(--rsim-moo)' }} />
              <span className="rsim-dot" style={{ background: 'var(--rsim-local)' }} />
              <span className="rsim-chrome-t">claude + mooter · routed</span>
            </div>

            <div className="rsim-stream" role="log" aria-label="Routing trace">
              {RUN.map((r, i) => {
                const revealed = i < step;
                const active = i === step - 1;
                const saves = r.rou === r.opus;
                return (
                  <div
                    key={r.p}
                    className={
                      'rsim-blk' +
                      (revealed ? ' rsim-blk--done' : '') +
                      (active ? ' rsim-blk--active' : '')
                    }
                  >
                    <div className="rsim-p">{`$ claude "${r.p}"`}</div>
                    <div className="rsim-meta">
                      ├─ classify <span className="rsim-k">~8ms</span> · intent={r.intent} complexity=
                      {r.complexity}
                    </div>
                    <div className="rsim-meta rsim-arrow">
                      └─ route → <span className={`rsim-badge rsim-badge--${r.tier}`}>{TIER_LABEL[r.tier]}</span>{' '}
                      {r.model}{' '}
                      {saves ? (
                        <span className="rsim-flag">· hard task, stays flagship</span>
                      ) : (
                        <span className="rsim-save">· saves ${(r.opus - r.rou).toFixed(3)} vs opus</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rsim-controls">
              <button type="button" className="rsim-btn" onClick={togglePlay} aria-label={playing ? 'Pause autoplay' : 'Play the routed run'}>
                {playLabel}
              </button>
              <button type="button" className="rsim-btn" onClick={stepOnce}>
                Step ›
              </button>
              <input
                type="range"
                className="rsim-scrub"
                min={0}
                max={STEPS}
                step={1}
                value={step}
                onChange={onScrub}
                aria-label="Scrub through the routed run"
                aria-valuemin={0}
                aria-valuemax={STEPS}
                aria-valuenow={step}
                aria-valuetext={
                  focus ? `Step ${step} of ${STEPS} — ${focus.intent}, routed to ${focus.tier}` : `Step 0 of ${STEPS} — not started`
                }
              />
              <span className="rsim-steplabel" aria-hidden="true">
                {step} / {STEPS}
              </span>
            </div>
          </div>

          {/* ── RIGHT · cost + why + tier mix ── */}
          <div className="rsim-side">
            <div className="rsim-box">
              <h3 className="rsim-box-h">Running cost</h3>
              <div className="rsim-vsrow">
                <span className="rsim-lbl">claude · vanilla (all-Opus)</span>
                <span className={'rsim-val ' + (van > 0 ? 'rsim-val--opus' : 'rsim-val--muted')}>{fmt3(van)}</span>
              </div>
              <div className="rsim-vsrow">
                <span className="rsim-lbl">claude + mooter (routed)</span>
                <span className={'rsim-val ' + (rou > 0 ? 'rsim-val--routed' : 'rsim-val--muted')}>{fmt3(rou)}</span>
              </div>
              {step > 0 ? (
                <div className="rsim-savechip">
                  {pct}% cheaper · {fmt2(van)} → {fmt2(rou)}
                </div>
              ) : (
                <div className="rsim-savechip rsim-savechip--idle">— press play</div>
              )}
              {/* Screen-reader live announcement of the cost as it changes. */}
              <div className="rsim-sr" aria-live="polite">
                {liveSummary}
              </div>
            </div>

            <div className="rsim-box">
              <h3 className="rsim-box-h">Why this tier</h3>
              {focus ? (
                <div className="rsim-why">
                  <div className="rsim-why-grid">
                    <span className="rsim-why-k">intent</span>
                    <span className="rsim-why-v">{focus.intent}</span>
                    <span className="rsim-why-k">complexity</span>
                    <span className="rsim-why-v">{focus.complexity}</span>
                    <span className="rsim-why-k">confidence</span>
                    <span className="rsim-why-v">{focus.conf.toFixed(2)}</span>
                    <span className="rsim-why-k">tier</span>
                    <span className="rsim-why-v">
                      <span className={`rsim-badge rsim-badge--${focus.tier}`}>{TIER_LABEL[focus.tier]}</span>
                    </span>
                  </div>
                  <p className="rsim-why-reason">{focus.reason}</p>
                </div>
              ) : (
                <p className="rsim-why-idle">Press play to step through the run — each decision shows the signal that fired it.</p>
              )}
            </div>

            <div className="rsim-box">
              <h3 className="rsim-box-h">Tier mix · this run</h3>
              <div className="rsim-tierbar" role="img" aria-label={tierMixLabel(counts, step)}>
                {step > 0 ? (
                  tiers.map((t) =>
                    counts[t] > 0 ? (
                      <span
                        key={t}
                        className="rsim-tierseg"
                        style={{ width: `${(counts[t] / step) * 100}%`, background: `var(--rsim-${t})` }}
                      />
                    ) : null,
                  )
                ) : (
                  <span className="rsim-tierseg rsim-tierseg--empty" style={{ width: '100%' }} />
                )}
              </div>
              <div className="rsim-tierlegend">
                {tiers.map((t) => (
                  <span key={t} className="rsim-leg">
                    <b style={{ background: `var(--rsim-${t})` }} />
                    {t}
                  </span>
                ))}
              </div>
              <p className="rsim-honest">
                <span className="rsim-led" aria-hidden="true" /> Replay of a real run · pricing snapshot 2026-06 ·{' '}
                <a className="rsim-link" href="#benchmark">
                  see the log
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function tierMixLabel(counts: Record<Tier, number>, step: number): string {
  if (step === 0) return 'Tier mix — run not started';
  const parts = (['local', 'haiku', 'sonnet', 'opus'] as Tier[])
    .filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${t}`);
  return `Tier mix after ${step} of ${STEPS} prompts: ${parts.join(', ')}`;
}

// Scoped styles. Canonical site-v2 palette as locally-scoped custom properties
// (falls back to the project's --mono / --font tokens when present). All pseudo
// elements, media queries and keyframes live here — inline styles only carry the
// per-step dynamic values (segment widths, dot colours).
const CSS = `
.rsim-root{
  --rsim-bg:#0B0A09; --rsim-bg2:#121110; --rsim-bg3:#1A1816; --rsim-line:#2A2724;
  --rsim-ink:#F4EFE7; --rsim-ink2:#B8AFA2; --rsim-ink3:#8C8478;
  --rsim-moo:#E8B04B; --rsim-save:#5FB87A;
  --rsim-local:#5FB87A; --rsim-haiku:#6FA8DC; --rsim-sonnet:#C39BD3; --rsim-opus:#E8835A;
  --rsim-mono:var(--mono, var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace));
  --rsim-sans:var(--font, var(--font-sans, 'Inter', system-ui, -apple-system, sans-serif));
  display:block;
  background:var(--rsim-bg);
  color:var(--rsim-ink);
  font-family:var(--rsim-sans);
  padding:clamp(48px,7vw,96px) 0;
}
.rsim-wrap{ max-width:1080px; margin:0 auto; padding:0 24px; }

.rsim-eyebrow{
  font-family:var(--rsim-mono); font-size:12px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--rsim-moo); margin:0 0 14px;
}
.rsim-h2{
  font-family:var(--rsim-sans); font-weight:800; margin:0 0 12px;
  font-size:clamp(1.7rem,1.2rem+2.4vw,2.8rem); line-height:1.05; letter-spacing:-0.03em;
  max-width:18ch;
}
.rsim-accent{ color:var(--rsim-moo); }
.rsim-lede{ color:var(--rsim-ink2); font-size:clamp(15px,14px+.3vw,17px); line-height:1.55; max-width:640px; margin:0 0 28px; }
.rsim-lede em{ font-style:italic; color:var(--rsim-ink); }

.rsim-grid{ display:grid; grid-template-columns:1fr 360px; gap:18px; align-items:start; }
@media (max-width:980px){ .rsim-grid{ grid-template-columns:1fr; } }

/* terminal */
.rsim-term{
  background:var(--rsim-bg2); border:1px solid var(--rsim-line); border-radius:16px;
  overflow:hidden; display:flex; flex-direction:column;
}
.rsim-chrome{ display:flex; align-items:center; gap:8px; padding:11px 14px; border-bottom:1px solid var(--rsim-line); background:var(--rsim-bg3); }
.rsim-dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }
.rsim-chrome-t{ margin-left:8px; font-family:var(--rsim-mono); font-size:12px; color:var(--rsim-ink3); }

.rsim-stream{ font-family:var(--rsim-mono); font-size:12.5px; line-height:1.65; padding:16px 18px; flex:1; min-height:360px; }
.rsim-blk{ margin-bottom:14px; padding-left:10px; border-left:2px solid transparent; opacity:.25; transition:opacity .45s ease, border-color .45s ease; }
.rsim-blk:last-child{ margin-bottom:0; }
.rsim-blk--done{ opacity:1; }
.rsim-blk--active{ border-left-color:var(--rsim-moo); }
.rsim-p{ color:var(--rsim-ink); word-break:break-word; }
.rsim-meta{ color:var(--rsim-ink2); }
.rsim-arrow{ color:var(--rsim-ink3); }
.rsim-k{ color:var(--rsim-moo); }
.rsim-save{ color:var(--rsim-save); }
.rsim-flag{ color:var(--rsim-opus); }

.rsim-badge{
  display:inline-block; font-family:var(--rsim-mono); font-size:10.5px;
  padding:1px 7px; border-radius:5px; border:1px solid var(--rsim-line); margin:0 2px;
}
.rsim-badge--local{ color:var(--rsim-local); border-color:rgba(95,184,122,.45); }
.rsim-badge--haiku{ color:var(--rsim-haiku); border-color:rgba(111,168,220,.45); }
.rsim-badge--sonnet{ color:var(--rsim-sonnet); border-color:rgba(195,155,211,.45); }
.rsim-badge--opus{ color:var(--rsim-opus); border-color:rgba(232,131,90,.55); }

.rsim-controls{ display:flex; align-items:center; gap:12px; padding:12px 16px; border-top:1px solid var(--rsim-line); background:var(--rsim-bg3); }
.rsim-btn{
  background:var(--rsim-bg2); border:1px solid var(--rsim-line); color:var(--rsim-ink);
  border-radius:8px; padding:7px 12px; font-size:13px; font-weight:600; cursor:pointer;
  font-family:var(--rsim-sans); white-space:nowrap; transition:border-color .2s ease;
}
.rsim-btn:hover{ border-color:var(--rsim-ink3); }
.rsim-btn:focus-visible{ outline:2px solid var(--rsim-moo); outline-offset:2px; }

.rsim-scrub{ flex:1; min-width:60px; -webkit-appearance:none; appearance:none; height:4px; background:var(--rsim-line); border-radius:3px; outline:none; cursor:pointer; }
.rsim-scrub::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:15px; height:15px; border-radius:50%; background:var(--rsim-moo); border:none; cursor:pointer; }
.rsim-scrub::-moz-range-thumb{ width:15px; height:15px; border-radius:50%; background:var(--rsim-moo); border:none; cursor:pointer; }
.rsim-scrub:focus-visible{ outline:2px solid var(--rsim-moo); outline-offset:4px; }
.rsim-steplabel{ font-family:var(--rsim-mono); font-size:11px; color:var(--rsim-ink3); min-width:34px; text-align:right; }

/* side */
.rsim-side{ display:flex; flex-direction:column; gap:14px; }
.rsim-box{ background:var(--rsim-bg2); border:1px solid var(--rsim-line); border-radius:16px; padding:18px; }
.rsim-box-h{ font-family:var(--rsim-mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--rsim-ink3); margin:0 0 14px; font-weight:600; }

.rsim-vsrow{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:8px; }
.rsim-lbl{ color:var(--rsim-ink2); font-size:13px; }
.rsim-val{ font-family:var(--rsim-mono); font-size:18px; font-weight:600; transition:color .3s ease; }
.rsim-val--opus{ color:var(--rsim-opus); }
.rsim-val--routed{ color:var(--rsim-save); }
.rsim-val--muted{ color:var(--rsim-ink3); }

.rsim-savechip{ margin-top:8px; text-align:center; font-family:var(--rsim-mono); font-size:13px; border-radius:8px; padding:8px; background:rgba(95,184,122,.1); border:1px solid rgba(95,184,122,.3); color:var(--rsim-save); }
.rsim-savechip--idle{ background:transparent; border-color:var(--rsim-line); color:var(--rsim-ink3); }

.rsim-why-grid{ display:grid; grid-template-columns:auto 1fr; gap:6px 14px; align-items:center; }
.rsim-why-k{ font-family:var(--rsim-mono); font-size:11px; letter-spacing:.04em; color:var(--rsim-ink3); }
.rsim-why-v{ font-family:var(--rsim-mono); font-size:13px; color:var(--rsim-ink); }
.rsim-why-reason{ margin:14px 0 0; padding-top:12px; border-top:1px solid var(--rsim-line); color:var(--rsim-ink2); font-size:13px; line-height:1.5; }
.rsim-why-idle{ margin:0; color:var(--rsim-ink3); font-size:13px; line-height:1.5; }

.rsim-tierbar{ display:flex; height:10px; border-radius:6px; overflow:hidden; margin:0 0 12px; background:var(--rsim-bg3); }
.rsim-tierseg{ display:block; height:100%; transition:width .5s cubic-bezier(.4,0,.2,1); }
.rsim-tierseg--empty{ background:var(--rsim-bg3); }
.rsim-tierlegend{ display:flex; flex-wrap:wrap; gap:10px; font-family:var(--rsim-mono); font-size:11px; color:var(--rsim-ink2); }
.rsim-leg b{ display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:middle; }

.rsim-honest{ display:flex; align-items:center; gap:8px; font-family:var(--rsim-mono); font-size:11px; color:var(--rsim-ink2); margin:14px 0 0; }
.rsim-led{ width:7px; height:7px; border-radius:50%; background:var(--rsim-save); box-shadow:0 0 8px var(--rsim-save); flex-shrink:0; }
.rsim-link{ color:var(--rsim-moo); text-decoration:none; border-bottom:1px solid transparent; }
.rsim-link:hover{ border-bottom-color:var(--rsim-moo); }
.rsim-link:focus-visible{ outline:2px solid var(--rsim-moo); outline-offset:2px; }

.rsim-sr{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

@media (prefers-reduced-motion: reduce){
  .rsim-blk{ transition:none; }
  .rsim-val{ transition:none; }
  .rsim-tierseg{ transition:none; }
  .rsim-btn{ transition:none; }
}
`;
