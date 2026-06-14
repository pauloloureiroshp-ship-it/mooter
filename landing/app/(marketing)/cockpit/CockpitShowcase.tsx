'use client';

import { useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import Btn from '@/components/Btn';
import MooterMark from '@/components/MooterMark';

// Wave 60 — port of _handoff/mock/export-source/mooter-v1-cockpit.jsx
// (CockpitArtboard + CockpitPlugin + tab bodies) into real TSX. The VS Code
// chrome hardcodes neutral greys on purpose ("inherits the editor theme");
// Mooter shows through the rose accent, the warm hero card and the cow only.
// All cockpit data is MOCK — labelled "illustrative · mock data" in the chrome.
// Honest numbers only: 47% / 658 / $25.95 / $48.90. No banned over-claims.

// ── VS Code native surface greys (reference theme, not Mooter brand) ──────────
const V = {
  side: '#1f1f1f',
  head: '#191919',
  editor: '#1e1e1e',
  activity: '#2b2b2b',
  border: '#2d2d2d',
  line: '#262626',
  text: '#cfcfcf',
  dim: '#8a8076',
  faint: '#5f5a55',
  chip: '#161616',
} as const;

// Brand shows through accents only.
const ROSE = 'var(--color-accent)';
const ROSE_25 = 'var(--color-accent-25)';
const ROSE_12 = 'var(--color-accent-12)';
const GREEN = 'var(--color-tier-0)';
const AMBER = '#D9B45A';
const TIER_COLOR: Record<string, string> = {
  T0: 'var(--color-tier-0)',
  T1: 'var(--color-tier-1)',
  T2: 'var(--color-tier-2)',
  T3: 'var(--color-tier-3)',
};
const MONO = 'var(--mono)';
const SANS = 'var(--font)';

type Scenario = 'happy' | 'firstrun' | 'degraded';
type Width = 300 | 560;

const MODES = [
  { k: 'lazy', emoji: '🐄', label: 'LazyMoo', note: 'cheapest path' },
  { k: 'moo', emoji: '🐮', label: 'Moo', note: 'balanced' },
  { k: 'crazy', emoji: '🐂', label: 'CrazyMoo', note: 'quality first' },
];
const MODELS = [
  { k: 'auto', label: 'Auto (router decides)', tier: '' },
  { k: 't0', label: 'qwen2.5-coder · local', tier: 'T0' },
  { k: 't1', label: 'claude-haiku', tier: 'T1' },
  { k: 't2', label: 'claude-sonnet', tier: 'T2' },
  { k: 't3', label: 'claude-opus', tier: 'T3' },
];

// 4 of 8 checks pass — the honest "Mooter Score 4/8".
const SCORE: [string, boolean][] = [
  ['Claude Code detected', true],
  ['Mooter engine installed', true],
  ['Ollama running', true],
  ['Local model pulled', true],
  ['Subscription profile', false],
  ['Monthly budget', false],
  ['Statusline enabled', false],
  ['First routed prompt', false],
];

const TIER_MIX: [string, string, number][] = [
  ['T0', 'local · free', 0.42],
  ['T1', 'haiku', 0.27],
  ['T2', 'sonnet', 0.23],
  ['T3', 'opus', 0.08],
];

const TABS = ['Cockpit', 'Setup', 'Herd', 'Decisions', 'Doctor'] as const;
type Tab = (typeof TABS)[number];

// ── tiny primitives (cockpit-local, VS-Code-themed) ──────────────────────────
function Pill({
  children,
  color = V.dim,
  bg = 'transparent',
  border = V.border,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  border?: string;
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: '1px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function Eyb({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: V.dim,
      }}
    >
      {children}
    </div>
  );
}

function CkCard({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        background: V.chip,
        border: `1px solid ${accent ? ROSE_25 : V.border}`,
        borderRadius: 9,
        padding: '12px 13px',
      }}
    >
      {children}
    </div>
  );
}

function CkBtn({
  children,
  primary,
  full,
}: {
  children: ReactNode;
  primary?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        fontFamily: SANS,
        fontSize: 11.5,
        fontWeight: primary ? 600 : 500,
        padding: '7px 11px',
        borderRadius: 6,
        cursor: 'pointer',
        width: full ? '100%' : 'auto',
        background: primary ? ROSE : 'transparent',
        color: primary ? '#1a1411' : V.text,
        border: `1px solid ${primary ? ROSE : V.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function Segment<T extends string | number>({
  items,
  value,
  onChange,
  compact,
}: {
  items: { k: T; label: string; emoji?: string; note?: string }[];
  value: T;
  onChange: (k: T) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      style={{
        display: 'inline-flex',
        background: V.chip,
        border: `1px solid ${V.border}`,
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      {items.map((it) => {
        const on = it.k === value;
        return (
          <button
            key={String(it.k)}
            type="button"
            onClick={() => onChange(it.k)}
            aria-pressed={on}
            title={it.note || it.label}
            style={{
              padding: compact ? '3px 7px' : '4px 9px',
              fontSize: 11,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: MONO,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: on ? ROSE : 'transparent',
              color: on ? '#1a1411' : V.text,
              fontWeight: on ? 600 : 400,
            }}
          >
            {it.emoji ? <span aria-hidden="true">{it.emoji}</span> : null}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Dropdown({
  label,
  items,
  value,
  onChange,
}: {
  label?: string;
  items: { k: string; label: string; tier: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = items.find((i) => i.k === value) || items[0];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 9px',
          cursor: 'pointer',
          background: V.chip,
          border: `1px solid ${V.border}`,
          borderRadius: 6,
          color: V.text,
          fontFamily: MONO,
          fontSize: 11,
          maxWidth: '100%',
        }}
      >
        {cur.tier ? <span style={{ color: TIER_COLOR[cur.tier], fontWeight: 700 }}>{cur.tier}</span> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label ? label + ' ' : ''}
          {cur.label}
        </span>
        <span aria-hidden="true" style={{ color: V.dim }}>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 20,
            minWidth: 200,
            background: '#202020',
            border: `1px solid ${V.border}`,
            borderRadius: 7,
            padding: 4,
            boxShadow: '0 18px 50px -16px rgba(0,0,0,0.8)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.k}
              type="button"
              role="option"
              aria-selected={it.k === value}
              onClick={() => {
                onChange(it.k);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: '100%',
                padding: '6px 8px',
                cursor: 'pointer',
                background: it.k === value ? ROSE_12 : 'transparent',
                border: 'none',
                borderRadius: 5,
                color: V.text,
                fontFamily: MONO,
                fontSize: 11,
                textAlign: 'left',
              }}
            >
              {it.tier ? (
                <span style={{ color: TIER_COLOR[it.tier], fontWeight: 700, width: 18 }}>{it.tier}</span>
              ) : (
                <span style={{ width: 18 }} />
              )}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, color, w = 96, h = 26 }: { values: number[]; color: string; w?: number; h?: number }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── tab bodies ────────────────────────────────────────────────────────────────
function CockpitTab({
  scenario,
  mode,
  setMode,
  nextModel,
  setNextModel,
}: {
  scenario: Scenario;
  mode: string;
  setMode: (k: string) => void;
  nextModel: string;
  setNextModel: (k: string) => void;
}) {
  const offline = scenario === 'degraded';
  const firstRun = scenario === 'firstrun';
  const passed = SCORE.filter((c) => c[1]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* HERO — saved vs all-Opus */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: `1px solid ${offline ? AMBER : ROSE_25}`,
          borderRadius: 10,
          padding: '14px 14px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>Saved vs all-Opus</Eyb>
          <Pill>token-estimated · advisory</Pill>
        </div>
        {firstRun ? (
          <div style={{ marginTop: 8 }}>
            {/* never green for a zero — muted $0.00 with a CTA */}
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: V.dim }}>$0.00</div>
            <div style={{ fontSize: 11.5, color: V.dim, marginTop: 4, lineHeight: 1.5 }}>
              No routed prompts yet. Your savings appear here after the first one.
            </div>
            <div style={{ marginTop: 10 }}>
              <CkBtn primary full>
                Route my first prompt →
              </CkBtn>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 32,
                      fontWeight: 700,
                      letterSpacing: '-0.03em',
                      color: offline ? V.text : GREEN,
                    }}
                  >
                    $25.95
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>47% below</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: V.dim, marginTop: 3 }}>
                  real <span style={{ color: V.text }}>$25.95</span> vs naive <span style={{ color: V.dim }}>$48.90</span>
                </div>
              </div>
              <Sparkline values={[2, 3, 2.4, 4, 3.2, 5, 4.6, 6.1]} color={offline ? V.dim : GREEN} />
            </div>
            {offline && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 9px',
                  background: 'rgba(217,180,90,0.08)',
                  border: `1px solid ${AMBER}`,
                  borderRadius: 7,
                }}
              >
                <span aria-hidden="true" style={{ color: AMBER }}>
                  ⚠
                </span>
                <span style={{ fontSize: 10.5, color: V.text, flex: 1 }}>
                  tracker offline · last known <span style={{ color: V.dim }}>(3h ago)</span>
                </span>
                <button
                  type="button"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: AMBER,
                    background: 'transparent',
                    border: `1px solid ${AMBER}`,
                    borderRadius: 5,
                    padding: '2px 7px',
                    cursor: 'pointer',
                  }}
                >
                  reconnect
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* mode + next-prompt model */}
      <CkCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <Eyb>mode</Eyb>
          <Segment items={MODES} value={mode} onChange={setMode} compact />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>next prompt</Eyb>
          <Dropdown items={MODELS} value={nextModel} onChange={setNextModel} />
        </div>
      </CkCard>

      {/* Mooter Score — gradient bar + fix buttons */}
      <CkCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Eyb>Mooter Score</Eyb>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: passed >= 6 ? GREEN : AMBER }}>
            {passed}/8
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', background: V.border, display: 'flex' }}>
          <div
            style={{
              width: `${(passed / 8) * 100}%`,
              background: 'linear-gradient(90deg, #D46A5A, #D9B45A 55%, #4CAF6A)',
            }}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {SCORE.filter((c) => !c[1])
            .slice(0, 3)
            .map(([label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER, flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 11.5,
                    color: V.text,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
                <button
                  type="button"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: ROSE,
                    background: 'transparent',
                    border: `1px solid ${ROSE_25}`,
                    borderRadius: 5,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  fix →
                </button>
              </div>
            ))}
        </div>
      </CkCard>

      {/* tier mix */}
      <CkCard>
        <Eyb>tier mix · last 30d</Eyb>
        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {TIER_MIX.map(([tier, , pct]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: TIER_COLOR[tier], width: 18 }}>
                {tier}
              </span>
              <div style={{ flex: 1, height: 8, borderRadius: 3, background: V.border, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: TIER_COLOR[tier], opacity: 0.6 }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: V.dim, width: 30, textAlign: 'right' }}>
                {Math.round(pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </CkCard>

      <CkBtn primary full>
        + New Claude Code session
      </CkBtn>
    </div>
  );
}

function WizardStep({
  n,
  title,
  done,
  todo,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  todo?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 11 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            background: done ? GREEN : 'transparent',
            color: done ? '#0d1a10' : todo ? AMBER : V.dim,
            border: done ? 'none' : `1px solid ${todo ? AMBER : V.border}`,
          }}
        >
          {done ? '✓' : n}
        </span>
        {n < 5 && <span style={{ width: 1, flex: 1, background: V.border, marginTop: 4, minHeight: 8 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? V.text : todo ? V.text : V.dim }}>{title}</div>
        <div style={{ marginTop: 6 }}>{children}</div>
      </div>
    </div>
  );
}

function SetupTab({ scenario }: { scenario: Scenario }) {
  const firstRun = scenario === 'firstrun';
  const [budget, setBudget] = useState(5);
  const [ollama, setOllama] = useState<'absent' | 'offline' | 'online'>('online');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CkCard>
        <Eyb>get to a perfect setup</Eyb>
        <div style={{ marginTop: 12 }}>
          <WizardStep n={1} title="Claude Code detected" done>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: V.dim }}>~/.claude · hook registered</div>
          </WizardStep>
          <WizardStep n={2} title="Mooter engine installed" done>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: V.dim }}>regex classifier · &lt;50ms</div>
          </WizardStep>
          <WizardStep n={3} title="Account & keys" done>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Pill color={GREEN} border={GREEN}>
                Anthropic: Max ✓
              </Pill>
              <span style={{ fontFamily: MONO, fontSize: 10, color: V.faint }}>
                via Claude Code OAuth · keys never shown
              </span>
            </div>
          </WizardStep>
          <WizardStep n={4} title="Ollama & model" done={ollama === 'online'} todo={ollama !== 'online'}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['absent', 'offline', 'online'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setOllama(s)}
                  aria-pressed={ollama === s}
                  style={{
                    flex: 1,
                    fontFamily: MONO,
                    fontSize: 9.5,
                    padding: '3px 4px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    border: `1px solid ${ollama === s ? ROSE : V.border}`,
                    background: ollama === s ? ROSE_12 : 'transparent',
                    color: ollama === s ? V.text : V.dim,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {ollama === 'online' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                <span style={{ color: GREEN }}>● online</span> · recommends{' '}
                <span style={{ fontFamily: MONO, color: ROSE }}>qwen2.5-coder:7b</span> for your GPU
                <div style={{ marginTop: 7 }}>
                  <CkBtn full>✓ pulled · 5.1 GB</CkBtn>
                </div>
              </div>
            )}
            {ollama === 'offline' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                <span style={{ color: AMBER }}>● installed · not running</span>
                <div style={{ marginTop: 7 }}>
                  <CkBtn primary full>
                    Start Ollama
                  </CkBtn>
                </div>
              </div>
            )}
            {ollama === 'absent' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                Ollama isn&apos;t installed. T0 will fall back to Haiku until it is.
                <div style={{ marginTop: 7 }}>
                  <CkBtn primary full>
                    Install Ollama →
                  </CkBtn>
                </div>
              </div>
            )}
          </WizardStep>
          <WizardStep n={5} title="Slash commands" done={!firstRun} todo={firstRun}>
            {firstRun ? (
              <div>
                <CkBtn primary full>
                  Install /mooter commands
                </CkBtn>
              </div>
            ) : (
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: V.dim }}>
                installed · <span style={{ color: GREEN }}>up to date</span>
              </div>
            )}
          </WizardStep>
        </div>
      </CkCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {[
          ['Hardware', 'detected locally · GPU + RAM'],
          ['Software', 'Node · Claude Code · Ollama'],
          ['Subscriptions', 'Anthropic Max · detected via OAuth'],
        ].map(([k, val]) => (
          <div
            key={k}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 10,
              paddingBottom: 8,
              borderBottom: `1px solid ${V.line}`,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: V.dim,
                flexShrink: 0,
              }}
            >
              {k}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: V.text, textAlign: 'right' }}>{val}</span>
          </div>
        ))}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: V.dim,
              }}
            >
              Budget
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: V.text }}>
              ${budget}.00 <span style={{ color: V.dim }}>/mo</span>
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-accent)', marginTop: 6 }}
            aria-label="Monthly budget"
          />
        </div>
      </div>
    </div>
  );
}

function HerdTab({ scenario }: { scenario: Scenario }) {
  if (scenario === 'firstrun') {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '36px 10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 26 }}>
          🐮
        </span>
        <div style={{ fontSize: 12.5, color: V.text }}>No agents running yet.</div>
        <CkBtn primary>Spawn an agent</CkBtn>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <CkCard accent>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>active run · wf-a3f</Eyb>
          <Pill color={GREEN} border={GREEN}>
            running
          </Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: V.text }}>
            3<span style={{ color: V.dim }}>/7</span>
          </span>
          <span style={{ fontSize: 11, color: V.dim }}>agents done · 658 tokens</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < 3 ? GREEN : V.border }} />
          ))}
        </div>
      </CkCard>

      <div>
        <Eyb>spawns</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(
            [
              ['reviewer', 'T2', 'done', GREEN],
              ['test-writer', 'T0', 'running', AMBER],
              ['doc-gen', 'T1', 'queued', V.dim],
            ] as [string, string, string, string][]
          ).map(([name, tier, status, c]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: V.chip,
                border: `1px solid ${V.border}`,
                borderRadius: 7,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: TIER_COLOR[tier], width: 16 }}>
                {tier}
              </span>
              <span style={{ fontSize: 11.5, color: V.text, flex: 1 }}>{name}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span style={{ fontFamily: MONO, fontSize: 10, color: V.dim, width: 48, textAlign: 'right' }}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DECISIONS = [
  {
    tier: 'T0',
    prev: 'rename userId across file',
    model: 'qwen2.5-coder',
    t: '2m',
    conf: 0.97,
    rule: 'mechanical-edit',
    why: 'Pure rename, no reasoning. Matched rule mechanical-edit (regex, 0 LLM cost). Kept local.',
  },
  {
    tier: 'T2',
    prev: 'draft the auth system map',
    model: 'claude-sonnet',
    t: '14m',
    conf: 0.88,
    rule: 'arch-medium',
    why: 'Architecture intent + medium complexity. Routed to Sonnet over Opus on this turn.',
  },
  {
    tier: 'T3',
    prev: 'billing schema migration plan',
    model: 'claude-opus',
    t: '1h',
    conf: 0.95,
    rule: 'hard-keep-opus',
    why: 'High-stakes migration. Confidence to downroute below threshold — kept on Opus deliberately.',
  },
  {
    tier: 'T0',
    prev: 'write the commit message',
    model: 'qwen2.5-coder',
    t: '1h',
    conf: 0.99,
    rule: 'trivial',
    why: 'Trivial generation. Local model, free.',
  },
];

function DecisionsTab({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(1);
  if (scenario === 'firstrun') {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '36px 10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 22, color: V.dim }}>
          ⌁
        </span>
        <div style={{ fontSize: 12.5, color: V.text }}>No routing decisions logged yet.</div>
        <CkBtn primary>Route my first prompt →</CkBtn>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(
          [
            ['cache-hit', '31%', V.text, 'measured 126/408'],
            ['conf. Δ', '+4pp', GREEN, 'vs last week'],
            ['quant', 'Q4_K_M', V.text, 'local default'],
            ['hub sync', 'off', V.dim, 'opt-in'],
          ] as [string, string, string, string][]
        ).map(([k, v, c, sub]) => (
          <div
            key={k}
            style={{ background: V.chip, border: `1px solid ${V.border}`, borderRadius: 8, padding: '9px 10px' }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: V.dim,
              }}
            >
              {k}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: V.faint, marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div>
        <Eyb>recent decisions</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DECISIONS.map((d, i) => {
            const isOpen = open === i;
            return (
              <div
                key={d.prev}
                style={{
                  background: V.chip,
                  border: `1px solid ${isOpen ? ROSE_25 : V.border}`,
                  borderRadius: 7,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: TIER_COLOR[d.tier], width: 16, flexShrink: 0 }}
                  >
                    {d.tier}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: V.text,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.prev}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: V.dim, flexShrink: 0 }}>{d.t}</span>
                  <span aria-hidden="true" style={{ color: V.dim, flexShrink: 0 }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 10px 10px 34px' }}>
                    <div style={{ fontSize: 10.5, color: V.dim, lineHeight: 1.55 }}>{d.why}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <Pill>{d.model}</Pill>
                      <Pill color={d.conf > 0.9 ? GREEN : AMBER} border={d.conf > 0.9 ? GREEN : AMBER}>
                        conf {Math.round(d.conf * 100)}%
                      </Pill>
                      <Pill>rule: {d.rule}</Pill>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DoctorTab({ scenario }: { scenario: Scenario }) {
  const degraded = scenario === 'degraded';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {degraded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 11px',
            background: 'rgba(217,180,90,0.08)',
            border: `1px solid ${AMBER}`,
            borderRadius: 8,
          }}
        >
          <span aria-hidden="true" style={{ color: AMBER, fontSize: 14 }}>
            ⚠
          </span>
          <span style={{ fontSize: 11, color: V.text, flex: 1 }}>Mooter CLI not responding on :7821.</span>
          <button
            type="button"
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: '#1a1411',
              background: AMBER,
              border: 'none',
              borderRadius: 5,
              padding: '4px 9px',
              cursor: 'pointer',
            }}
          >
            restart
          </button>
        </div>
      )}
      <div>
        <Eyb>all checks · {SCORE.filter((c) => c[1]).length}/8</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {SCORE.map(([label, ok]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 9px',
                background: V.chip,
                border: `1px solid ${V.border}`,
                borderRadius: 7,
              }}
            >
              <span style={{ color: ok ? GREEN : AMBER, fontFamily: MONO, fontSize: 12, width: 12 }}>
                {ok ? '✓' : '○'}
              </span>
              <span style={{ fontSize: 11.5, color: V.text, flex: 1 }}>{label}</span>
              {!ok && (
                <button
                  type="button"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: ROSE,
                    background: 'transparent',
                    border: `1px solid ${ROSE_25}`,
                    borderRadius: 5,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  fix →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyb>4-layer sandbox</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {(
            [
              ['network', 'deny by default'],
              ['filesystem', 'workspace only'],
              ['secrets', 'redacted from prompts'],
              ['config', 'read-only mount'],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 9px',
                background: V.chip,
                border: `1px solid ${V.border}`,
                borderRadius: 7,
              }}
            >
              <span aria-hidden="true" style={{ color: GREEN, fontSize: 11 }}>
                ●
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: V.text, width: 78 }}>{k}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: V.dim, flex: 1, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── the plugin (sidebar webview) ──────────────────────────────────────────────
function CockpitPlugin({ width, scenario }: { width: Width; scenario: Scenario }) {
  const [tab, setTab] = useState<Tab>('Cockpit');
  const [mode, setMode] = useState('moo');
  const [nextModel, setNextModel] = useState('auto');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const passed = SCORE.filter((c) => c[1]).length;
  const ccPaired = scenario !== 'degraded';

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const ni = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      setTab(TABS[ni]);
      tabRefs.current[TABS[ni]]?.focus();
    }
  };

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        background: V.side,
        borderRight: `1px solid ${V.border}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: SANS,
        color: V.text,
        minWidth: 0,
        height: '100%',
      }}
    >
      {/* HEADER */}
      <div style={{ background: V.head, borderBottom: `1px solid ${V.border}`, padding: '9px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MooterMark size={18} />
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>mooter</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: V.dim }}>· auth-svc</span>
          <span
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: MONO,
              fontSize: 10,
              color: ccPaired ? GREEN : AMBER,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ccPaired ? GREEN : AMBER }} />
            Claude Code {ccPaired ? '✓' : '✗'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Segment items={MODES} value={mode} onChange={setMode} compact />
          <Dropdown label="next:" items={MODELS} value={nextModel} onChange={setNextModel} />
          <span
            title="Mooter Score — 4 of 8 checks"
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: MONO,
              fontSize: 10,
              color: V.dim,
              border: `1px solid ${V.border}`,
              borderRadius: 9999,
              padding: '2px 8px',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: passed >= 6 ? GREEN : AMBER }} />
            Score {passed}/8
          </span>
        </div>
      </div>

      {/* TABS — exactly 5, keyboard navigable, no wrap */}
      <div
        role="tablist"
        aria-label="Cockpit sections"
        style={{ display: 'flex', background: V.head, borderBottom: `1px solid ${V.border}` }}
      >
        {TABS.map((t, i) => {
          const on = t === tab;
          return (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => onTabKey(e, i)}
              style={{
                flex: 1,
                padding: '8px 2px',
                fontSize: 11,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: on ? '2px solid var(--color-accent)' : '2px solid transparent',
                color: on ? V.text : V.dim,
                fontWeight: on ? 600 : 400,
                fontFamily: SANS,
                outlineOffset: '-2px',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* BODY */}
      <div role="tabpanel" style={{ flex: 1, overflowY: 'auto', padding: '12px 11px 16px' }}>
        {tab === 'Cockpit' && (
          <CockpitTab scenario={scenario} mode={mode} setMode={setMode} nextModel={nextModel} setNextModel={setNextModel} />
        )}
        {tab === 'Setup' && <SetupTab scenario={scenario} />}
        {tab === 'Herd' && <HerdTab scenario={scenario} />}
        {tab === 'Decisions' && <DecisionsTab scenario={scenario} />}
        {tab === 'Doctor' && <DoctorTab scenario={scenario} />}
      </div>

      {/* statusline */}
      <div
        style={{
          borderTop: `1px solid ${V.border}`,
          padding: '6px 11px',
          background: V.head,
          fontFamily: MONO,
          fontSize: 10,
          color: V.dim,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        <span aria-hidden="true" style={{ color: ROSE }}>
          🐮
        </span>
        <span>{MODES.find((m) => m.k === mode)?.label}</span>
        <span>
          · <span style={{ color: GREEN }}>T0</span> ready
        </span>
        <span style={{ marginLeft: 'auto', color: V.faint }}>CLI is the contract</span>
      </div>
    </div>
  );
}

// ── feature cards (design notes) ──────────────────────────────────────────────
const NOTES: [string, string][] = [
  [
    'honesty',
    'Hero leads with the real $25.95 (green = genuine positive). In first-run, $0.00 is muted with a CTA — never green for a zero. Estimates carry “token-estimated · advisory”.',
  ],
  [
    '≤5 tabs',
    'Exactly five tabs fit a 300px sidebar with no wrap. Arrow keys move between them; focus is visible (role=tab).',
  ],
  [
    'native + brand',
    'Surfaces inherit VS Code greys; Mooter shows through rose, the warm hero card and the cow. No “green on everything.”',
  ],
];

// ── the page ──────────────────────────────────────────────────────────────────
export default function CockpitShowcase() {
  const [width, setWidth] = useState<Width>(300);
  const [scenario, setScenario] = useState<Scenario>('happy');
  const showEditor = width <= 360;

  const editorLines: [string, string, string][] = [
    ['export async function ', 'authenticate', '(req) {'],
    ['  const token = ', 'await getToken', '(req)'],
    ['  if (!token) ', 'throw new', ' AuthError()'],
    ['  return ', 'verify', '(token)'],
    ['}', '', ''],
  ];

  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        className="m-pad m-pad-y"
        style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}
      >
        {/* HERO */}
        <Eyebrow>§ Cockpit · VS Code plugin</Eyebrow>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.04,
            margin: '0 0 14px',
            maxWidth: 760,
          }}
        >
          The router, in your editor&apos;s sidebar.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.6, maxWidth: 680, marginBottom: 24 }}>
          One design system, a second render target. Five tabs, designed for a 300px sidebar. The chrome inherits VS
          Code&apos;s theme so it feels native; Mooter shows through the accents, the hero card and the cow. All data is
          mock.
        </p>

        {/* CONTROLS — width + scenario toggles */}
        <div
          className="m-stack"
          style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-muted)' }}>width</span>
            <Segment<Width>
              items={[
                { k: 300, label: '300px' },
                { k: 560, label: '560px' },
              ]}
              value={width}
              onChange={setWidth}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-muted)' }}>scenario</span>
            <Segment<Scenario>
              items={[
                { k: 'happy', label: 'happy' },
                { k: 'firstrun', label: 'first-run' },
                { k: 'degraded', label: 'degraded' },
              ]}
              value={scenario}
              onChange={setScenario}
            />
          </div>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: 10.5,
              color: 'var(--color-muted)',
              border: `1px solid var(--color-border)`,
              borderRadius: 999,
              padding: '3px 10px',
            }}
          >
            illustrative · mock data
          </span>
        </div>

        {/* VS CODE WINDOW */}
        <div className="m-scroll-x" style={{ overflowX: 'auto' }}>
          <div
            style={{
              minWidth: width === 560 ? 760 : 520,
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${V.border}`,
              boxShadow: '0 40px 120px -40px rgba(0,0,0,0.8)',
              background: V.editor,
            }}
          >
            {/* title bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 14px',
                background: '#181818',
                borderBottom: `1px solid ${V.border}`,
              }}
            >
              <span style={{ display: 'flex', gap: 7 }}>
                {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                  <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
                ))}
              </span>
              <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 11.5, color: V.dim }}>
                auth.ts — mooter — Visual Studio Code
              </span>
            </div>
            {/* body: activity bar + sidebar + editor */}
            <div style={{ display: 'flex', height: 660 }}>
              <div
                className="m-hide"
                style={{
                  width: 48,
                  flexShrink: 0,
                  background: V.activity,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 18,
                  padding: '14px 0',
                }}
              >
                {['❑', '⑂', '⌕', '⚐'].map((ic, i) => (
                  <span key={i} aria-hidden="true" style={{ fontSize: 16, color: V.faint }}>
                    {ic}
                  </span>
                ))}
                <span
                  aria-hidden="true"
                  style={{ fontSize: 18, borderLeft: '2px solid var(--color-accent)', width: '100%', textAlign: 'center', lineHeight: 1 }}
                >
                  🐮
                </span>
              </div>
              <CockpitPlugin width={width} scenario={scenario} />
              {showEditor && (
                <div
                  className="m-hide"
                  style={{
                    flex: 1,
                    background: V.editor,
                    padding: '16px 20px',
                    fontFamily: MONO,
                    fontSize: 12.5,
                    lineHeight: 1.8,
                    color: V.faint,
                    overflow: 'hidden',
                  }}
                >
                  {editorLines.map((ln, i) => (
                    <div key={i}>
                      <span style={{ color: V.faint, marginRight: 16, userSelect: 'none' }}>{i + 1}</span>
                      <span style={{ color: '#6a8cc7' }}>{ln[0]}</span>
                      <span style={{ color: '#b07fc7' }}>{ln[1]}</span>
                      <span style={{ color: V.dim }}>{ln[2]}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 24, color: V.faint, fontSize: 11 }}>
                    # the cockpit lives in the sidebar — the editor stays out of the way
                  </div>
                </div>
              )}
            </div>
            {/* statusbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '5px 14px',
                background: '#161616',
                borderTop: `1px solid ${V.border}`,
                fontFamily: MONO,
                fontSize: 10.5,
                color: V.dim,
              }}
            >
              <span style={{ color: ROSE }}>🐮 mooter</span>
              <span>Score {SCORE.filter((c) => c[1]).length}/8</span>
              <span style={{ marginLeft: 'auto' }}>Community project · not affiliated with Anthropic</span>
            </div>
          </div>
        </div>

        {/* FEATURE CARDS */}
        <div
          className="m-stack"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 24 }}
        >
          {NOTES.map(([k, v]) => (
            <Card key={k} padding={20} style={{ height: '100%' }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-accent)',
                  marginBottom: 6,
                }}
              >
                {k}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6 }}>{v}</p>
            </Card>
          ))}
        </div>

        {/* INSTALL CTA */}
        <div
          className="m-stack"
          style={{ marginTop: 32, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Btn href="/install" size="lg">
            Install in 30s →
          </Btn>
          <Link href="/under-the-hood" style={{ color: 'var(--color-accent)', fontSize: 14 }}>
            Get the VS Code extension
          </Link>
        </div>
        <p style={{ marginTop: 28, fontSize: 12, color: 'var(--color-muted)' }}>
          Community project · not affiliated with Anthropic. The cockpit above is an illustrative mock — numbers are
          token-estimated and advisory.
        </p>
      </div>
    </section>
  );
}
