/* mooter-v1-cockpit.jsx — VS Code "MOOTER: COCKPIT" plugin, full design.
   Exactly 5 tabs (Cockpit · Setup · Herd · Decisions · Doctor), designed at
   300px (sidebar) with a 560px reflow proof. Keyboard-navigable tabs.
   Honesty rules: lead with the REAL number; muted for $0 / advisory; never
   green for a zero; coverage labels; every empty/degraded state carries a CTA.
   All data is MOCK. Exposed: CockpitArtboard */

const { MooterMark: CkMark } = window;

/* VS Code native surface tokens — webview inherits the editor theme.
   Mooter identity shows only through accents (rose, green, the cow). */
const V = {
  side: '#1f1f1f', head: '#191919', editor: '#1e1e1e', activity: '#2b2b2b',
  border: '#2d2d2d', line: '#262626', text: '#cfcfcf', dim: '#8a8076', faint: '#5f5a55',
  chip: '#161616',
};
const ROSE = 'var(--accent)';
const GREEN = 'var(--tier-0)';
const AMBER = '#D9B45A';

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
const TIER_COLOR = { T0: GREEN, T1: 'var(--tier-1)', T2: 'var(--tier-2)', T3: 'var(--tier-3)' };

const SCORE = [
  ['Claude Code detected', true],
  ['Mooter engine installed', true],
  ['Ollama running', true],
  ['Local model pulled', true],
  ['Subscription profile', false],
  ['Monthly budget', false],
  ['Statusline enabled', false],
  ['First routed prompt', false],
];

const TIER_MIX = [
  ['T0', 'local · free', 0.42],
  ['T1', 'haiku', 0.27],
  ['T2', 'sonnet', 0.23],
  ['T3', 'opus', 0.08],
];

const DECISIONS = [
  { tier: 'T0', prev: 'rename userId across file', model: 'qwen2.5-coder', t: '2m', conf: 0.97, rule: 'mechanical-edit', why: 'Pure rename, no reasoning. Matched rule mechanical-edit (regex, 0 LLM cost). Kept local.' },
  { tier: 'T2', prev: 'draft the auth system map', model: 'claude-sonnet', t: '14m', conf: 0.88, rule: 'arch-medium', why: 'Architecture intent + medium complexity. Routed to Sonnet over Opus — saved $0.31 on this turn.' },
  { tier: 'T3', prev: 'billing schema migration plan', model: 'claude-opus', t: '1h', conf: 0.95, rule: 'hard-keep-opus', why: 'High-stakes migration. Confidence to downroute below threshold — kept on Opus deliberately.' },
  { tier: 'T0', prev: 'write the commit message', model: 'qwen2.5-coder', t: '1h', conf: 0.99, rule: 'trivial', why: 'Trivial generation. Local model, free.' },
];

/* ---------- tiny primitives ---------- */
function Pill({ children, color = V.dim, bg = 'transparent', border = V.border }) {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>{children}</span>;
}
function Eyb({ children }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: V.dim }}>{children}</div>;
}
function Card({ children, accent }) {
  return <div style={{ background: V.chip, border: `1px solid ${accent ? 'var(--accent-25)' : V.border}`, borderRadius: 9, padding: '12px 13px' }}>{children}</div>;
}
function Btn({ children, primary, onClick, full }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: primary ? 600 : 500,
      padding: '7px 11px', borderRadius: 6, cursor: 'pointer', width: full ? '100%' : 'auto',
      background: primary ? ROSE : 'transparent', color: primary ? '#1a1411' : V.text,
      border: `1px solid ${primary ? ROSE : V.border}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>{children}</button>
  );
}

/* segmented control (mode / model) — keyboard friendly */
function Segment({ items, value, onChange, compact }) {
  return (
    <div role="group" style={{ display: 'inline-flex', background: V.chip, border: `1px solid ${V.border}`, borderRadius: 6, padding: 2, gap: 2 }}>
      {items.map((it) => {
        const on = it.k === value;
        return (
          <button key={it.k} onClick={() => onChange(it.k)} aria-pressed={on} title={it.note || it.label} style={{
            padding: compact ? '3px 7px' : '4px 9px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4, border: 'none',
            background: on ? ROSE : 'transparent', color: on ? '#1a1411' : V.text, fontWeight: on ? 600 : 400,
          }}>{it.emoji ? <span>{it.emoji}</span> : null}{it.label}</button>
        );
      })}
    </div>
  );
}

/* lightweight dropdown */
function Dropdown({ label, items, value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const cur = items.find((i) => i.k === value) || items[0];
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', cursor: 'pointer',
        background: V.chip, border: `1px solid ${V.border}`, borderRadius: 6, color: V.text,
        fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: '100%',
      }}>
        {cur.tier ? <span style={{ color: TIER_COLOR[cur.tier], fontWeight: 700 }}>{cur.tier}</span> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label ? label + ' ' : ''}{cur.short || cur.label}</span>
        <span style={{ color: V.dim }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, minWidth: 200, background: '#202020', border: `1px solid ${V.border}`, borderRadius: 7, padding: 4, boxShadow: '0 18px 50px -16px rgba(0,0,0,0.8)' }}>
          {items.map((it) => (
            <button key={it.k} onClick={() => { onChange(it.k); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 8px', cursor: 'pointer',
              background: it.k === value ? 'var(--accent-12)' : 'transparent', border: 'none', borderRadius: 5,
              color: V.text, fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'left',
            }}>
              {it.tier ? <span style={{ color: TIER_COLOR[it.tier], fontWeight: 700, width: 18 }}>{it.tier}</span> : <span style={{ width: 18 }} />}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, color, w = 96, h = 26 }) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===========================================================
   TAB BODIES
   =========================================================== */
function CockpitTab({ scenario, mode, setMode, nextModel, setNextModel }) {
  const offline = scenario === 'degraded';
  const firstRun = scenario === 'firstrun';
  const passed = SCORE.filter((c) => c[1]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* HERO — saved vs all-Opus */}
      <div style={{ background: 'var(--surface)', border: `1px solid ${offline ? AMBER : 'var(--accent-25)'}`, borderRadius: 10, padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>Saved vs all-Opus</Eyb>
          <Pill>token-estimated · advisory</Pill>
        </div>
        {firstRun ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: V.dim }}>$0.00</div>
            <div style={{ fontSize: 11.5, color: V.dim, marginTop: 4, lineHeight: 1.5 }}>No routed prompts yet. Your savings appear here after the first one.</div>
            <div style={{ marginTop: 10 }}><Btn primary full>Route my first prompt →</Btn></div>
          </div>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', color: offline ? V.text : GREEN }}>$25.95</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: GREEN }}>47% below</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim, marginTop: 3 }}>real <span style={{ color: V.text }}>$25.95</span> vs naive <span style={{ color: V.dim }}>$48.90</span></div>
              </div>
              <Sparkline values={[2, 3, 2.4, 4, 3.2, 5, 4.6, 6.1]} color={offline ? V.dim : GREEN} />
            </div>
            {offline && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'rgba(217,180,90,0.08)', border: `1px solid ${AMBER}`, borderRadius: 7 }}>
                <span style={{ color: AMBER }}>⚠</span>
                <span style={{ fontSize: 10.5, color: V.text, flex: 1 }}>tracker offline · last known <span style={{ color: V.dim }}>(3h ago)</span></span>
                <button style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: AMBER, background: 'transparent', border: `1px solid ${AMBER}`, borderRadius: 5, padding: '2px 7px', cursor: 'pointer' }}>reconnect</button>
              </div>
            )}
          </React.Fragment>
        )}
      </div>

      {/* mode + next-prompt model */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <Eyb>mode</Eyb>
          <Segment items={MODES} value={mode} onChange={setMode} compact />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>next prompt</Eyb>
          <Dropdown items={MODELS} value={nextModel} onChange={setNextModel} />
        </div>
      </Card>

      {/* Mooter Score — gradient bar + fix buttons */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Eyb>Mooter Score</Eyb>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: passed >= 6 ? GREEN : AMBER }}>{passed}/8</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, overflow: 'hidden', background: V.border, display: 'flex' }}>
          <div style={{ width: `${(passed / 8) * 100}%`, background: 'linear-gradient(90deg, #D46A5A, #D9B45A 55%, #4CAF6A)' }} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {SCORE.filter((c) => !c[1]).slice(0, 3).map(([label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: V.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <button style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: ROSE, background: 'transparent', border: '1px solid var(--accent-25)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}>fix →</button>
            </div>
          ))}
        </div>
      </Card>

      {/* tier mix */}
      <Card>
        <Eyb>tier mix · last 30d</Eyb>
        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {TIER_MIX.map(([tier, label, pct]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: TIER_COLOR[tier], width: 18 }}>{tier}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 3, background: V.border, overflow: 'hidden' }}>
                <div style={{ width: `${pct * 100}%`, height: '100%', background: TIER_COLOR[tier], opacity: 0.6 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim, width: 30, textAlign: 'right' }}>{Math.round(pct * 100)}%</span>
            </div>
          ))}
        </div>
      </Card>

      <Btn primary full>+ New Claude Code session</Btn>
    </div>
  );
}

function WizardStep({ n, title, done, children, todo }) {
  return (
    <div style={{ display: 'flex', gap: 11 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          background: done ? GREEN : 'transparent', color: done ? '#0d1a10' : (todo ? AMBER : V.dim),
          border: done ? 'none' : `1px solid ${todo ? AMBER : V.border}` }}>{done ? '✓' : n}</span>
        {n < 5 && <span style={{ width: 1, flex: 1, background: V.border, marginTop: 4, minHeight: 8 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? V.text : (todo ? V.text : V.dim) }}>{title}</div>
        <div style={{ marginTop: 6 }}>{children}</div>
      </div>
    </div>
  );
}

function SetupTab({ scenario }) {
  const firstRun = scenario === 'firstrun';
  const [budget, setBudget] = React.useState(5);
  // Ollama state cycles: online (default) / offline / absent — shown via control
  const [ollama, setOllama] = React.useState('online');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <Eyb>get to a perfect setup</Eyb>
        <div style={{ marginTop: 12 }}>
          <WizardStep n={1} title="Claude Code detected" done>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim }}>v2.1.168 · ~/.claude</div>
          </WizardStep>
          <WizardStep n={2} title="Mooter engine installed" done>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim }}>hook registered · v1.38.5</div>
          </WizardStep>
          <WizardStep n={3} title="Account & keys" done>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Pill color={GREEN} border={GREEN}>Anthropic: Max ✓</Pill>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: V.faint }}>via Claude Code OAuth · keys never shown</span>
            </div>
          </WizardStep>
          <WizardStep n={4} title="Ollama & model" done={ollama === 'online'} todo={ollama !== 'online'}>
            {/* three states */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {['absent', 'offline', 'online'].map((s) => (
                <button key={s} onClick={() => setOllama(s)} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '3px 4px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${ollama === s ? ROSE : V.border}`, background: ollama === s ? 'var(--accent-12)' : 'transparent', color: ollama === s ? V.text : V.dim }}>{s}</button>
              ))}
            </div>
            {ollama === 'online' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                <span style={{ color: GREEN }}>● online</span> · recommends <span style={{ fontFamily: 'var(--font-mono)', color: ROSE }}>qwen2.5-coder:7b</span> for your RTX 4090
                <div style={{ marginTop: 7 }}><Btn full>✓ pulled · 5.1 GB</Btn></div>
              </div>
            )}
            {ollama === 'offline' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                <span style={{ color: AMBER }}>● installed · not running</span>
                <div style={{ marginTop: 7 }}><Btn primary full>Start Ollama</Btn></div>
              </div>
            )}
            {ollama === 'absent' && (
              <div style={{ fontSize: 11, color: V.text, lineHeight: 1.5 }}>
                Ollama isn't installed. T0 will fall back to Haiku until it is.
                <div style={{ marginTop: 7 }}><Btn primary full>Install Ollama →</Btn></div>
              </div>
            )}
          </WizardStep>
          <WizardStep n={5} title="Slash commands" done={!firstRun} todo={firstRun}>
            {firstRun ? (
              <div><Btn primary full>Install 16 /mooter commands</Btn></div>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim }}>16 installed · <span style={{ color: GREEN }}>up to date</span></div>
            )}
          </WizardStep>
        </div>
      </Card>

      {/* below the wizard */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {[
          ['Hardware', 'RTX 4090 · 24 GB VRAM · 64 GB RAM'],
          ['Software', 'Node 22 · Claude Code 2.1.168 · Ollama 0.5'],
          ['Subscriptions', 'Anthropic Max · detected via OAuth'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 8, borderBottom: `1px solid ${V.line}` }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: V.dim, flexShrink: 0 }}>{k}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.text, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
        {/* budget editor */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: V.dim }}>Budget</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: V.text }}>${budget}.00 <span style={{ color: V.dim }}>/mo</span></span>
          </div>
          <input type="range" min={1} max={50} value={budget} onChange={(e) => setBudget(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 6 }} aria-label="Monthly budget" />
        </div>
      </div>
    </div>
  );
}

function HerdTab({ scenario }) {
  if (scenario === 'firstrun') {
    return (
      <div style={{ textAlign: 'center', padding: '36px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 26 }}>🐮</span>
        <div style={{ fontSize: 12.5, color: V.text }}>No agents running yet.</div>
        <Btn primary>Spawn an agent</Btn>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <Card accent>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyb>active run · wf-a3f</Eyb>
          <Pill color={GREEN} border={GREEN}>running</Pill>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: V.text }}>3<span style={{ color: V.dim }}>/7</span></span>
          <span style={{ fontSize: 11, color: V.dim }}>agents done · 4.2k tokens</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < 3 ? GREEN : V.border }} />)}
        </div>
      </Card>

      <div>
        <Eyb>spawns</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[['reviewer', 'T2', 'done', GREEN], ['test-writer', 'T0', 'running', AMBER], ['doc-gen', 'T1', 'queued', V.dim]].map(([name, tier, status, c]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: V.chip, border: `1px solid ${V.border}`, borderRadius: 7 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: TIER_COLOR[tier], width: 16 }}>{tier}</span>
              <span style={{ fontSize: 11.5, color: V.text, flex: 1 }}>{name}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: V.dim, width: 48, textAlign: 'right' }}>{status}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyb>tokens · llm × agent</Eyb>
        <div className="m-scroll-x" style={{ marginTop: 8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 10, width: '100%' }}>
            <thead><tr style={{ color: V.dim }}>{['', 'reviewer', 'test', 'doc'].map((h) => <th key={h} style={{ textAlign: h ? 'right' : 'left', padding: '4px 6px', fontWeight: 400 }}>{h}</th>)}</tr></thead>
            <tbody>{[['haiku', '—', '0.4k', '0.6k'], ['sonnet', '2.1k', '—', '—'], ['local', '—', '1.1k', '—']].map((r) => (
              <tr key={r[0]} style={{ borderTop: `1px solid ${V.line}` }}>{r.map((c, i) => <td key={i} style={{ textAlign: i ? 'right' : 'left', padding: '5px 6px', color: i === 0 ? V.dim : (c === '—' ? V.faint : V.text) }}>{c}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DecisionsTab({ scenario }) {
  const [open, setOpen] = React.useState(1);
  if (scenario === 'firstrun') {
    return (
      <div style={{ textAlign: 'center', padding: '36px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22, color: V.dim }}>⌁</span>
        <div style={{ fontSize: 12.5, color: V.text }}>No routing decisions logged yet.</div>
        <Btn primary>Route my first prompt →</Btn>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* insights strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['cache-hit', '31%', V.text, 'measured 126/408'], ['conf. Δ', '+4pp', GREEN, 'vs last week'], ['quant', 'Q4_K_M', V.text, 'local default'], ['hub sync', 'off', V.dim, 'opt-in']].map(([k, v, c, sub]) => (
          <div key={k} style={{ background: V.chip, border: `1px solid ${V.border}`, borderRadius: 8, padding: '9px 10px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: V.dim }}>{k}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: V.faint, marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div>
        <Eyb>recent decisions</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DECISIONS.map((d, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ background: V.chip, border: `1px solid ${isOpen ? 'var(--accent-25)' : V.border}`, borderRadius: 7, overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: TIER_COLOR[d.tier], width: 16, flexShrink: 0 }}>{d.tier}</span>
                  <span style={{ fontSize: 11, color: V.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.prev}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: V.dim, flexShrink: 0 }}>{d.t}</span>
                  <span style={{ color: V.dim, flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 10px 10px 34px' }}>
                    <div style={{ fontSize: 10.5, color: V.dim, lineHeight: 1.55 }}>{d.why}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <Pill>{d.model}</Pill>
                      <Pill color={d.conf > 0.9 ? GREEN : AMBER} border={d.conf > 0.9 ? GREEN : AMBER}>conf {Math.round(d.conf * 100)}%</Pill>
                      <Pill>rule: {d.rule}</Pill>
                      <span style={{ marginLeft: 'auto', color: AMBER, fontSize: 12, letterSpacing: 1, cursor: 'pointer' }} title="rate this routing">★★★★☆</span>
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

function DoctorTab({ scenario }) {
  const degraded = scenario === 'degraded';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {degraded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 11px', background: 'rgba(217,180,90,0.08)', border: `1px solid ${AMBER}`, borderRadius: 8 }}>
          <span style={{ color: AMBER, fontSize: 14 }}>⚠</span>
          <span style={{ fontSize: 11, color: V.text, flex: 1 }}>Mooter CLI not responding on :7821.</span>
          <button style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#1a1411', background: AMBER, border: 'none', borderRadius: 5, padding: '4px 9px', cursor: 'pointer' }}>restart</button>
        </div>
      )}
      <div>
        <Eyb>all checks · {SCORE.filter((c) => c[1]).length}/8</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {SCORE.map(([label, ok]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', background: V.chip, border: `1px solid ${V.border}`, borderRadius: 7 }}>
              <span style={{ color: ok ? GREEN : AMBER, fontFamily: 'var(--font-mono)', fontSize: 12, width: 12 }}>{ok ? '✓' : '○'}</span>
              <span style={{ fontSize: 11.5, color: V.text, flex: 1 }}>{label}</span>
              {!ok && <button style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: ROSE, background: 'transparent', border: '1px solid var(--accent-25)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>fix →</button>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyb>4-layer sandbox</Eyb>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[['network', 'deny by default'], ['filesystem', 'workspace only'], ['secrets', 'redacted from prompts'], ['config', 'read-only mount']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', background: V.chip, border: `1px solid ${V.border}`, borderRadius: 7 }}>
              <span style={{ color: GREEN, fontSize: 11 }}>●</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.text, width: 78 }}>{k}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: V.dim, flex: 1, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   THE PLUGIN (sidebar webview)
   =========================================================== */
const TABS = ['Cockpit', 'Setup', 'Herd', 'Decisions', 'Doctor'];

function CockpitPlugin({ width = 300, scenario = 'happy' }) {
  const [tab, setTab] = React.useState('Cockpit');
  const [mode, setMode] = React.useState('moo');
  const [nextModel, setNextModel] = React.useState('auto');
  const tabRefs = React.useRef({});
  const passed = SCORE.filter((c) => c[1]).length;
  const ccPaired = scenario !== 'degraded';

  const onTabKey = (e, i) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const ni = (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      setTab(TABS[ni]);
      const el = tabRefs.current[TABS[ni]];
      if (el) el.focus();
    }
  };

  return (
    <div style={{ width, flexShrink: 0, background: V.side, borderRight: `1px solid ${V.border}`, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: V.text, minWidth: 0, height: '100%' }}>
      {/* HEADER — compact, 2 tight rows */}
      <div style={{ background: V.head, borderBottom: `1px solid ${V.border}`, padding: '9px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CkMark size={18} />
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>mooter</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: V.dim }}>· auth-svc</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: ccPaired ? GREEN : AMBER }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ccPaired ? GREEN : AMBER }} />Claude Code {ccPaired ? '✓' : '✗'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Segment items={MODES} value={mode} onChange={setMode} compact />
          <Dropdown label="next:" items={MODELS} value={nextModel} onChange={setNextModel} />
          <span title="Mooter Score — 4 of 8 checks" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: V.dim, border: `1px solid ${V.border}`, borderRadius: 9999, padding: '2px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: passed >= 6 ? GREEN : AMBER }} />Score {passed}/8
          </span>
        </div>
      </div>

      {/* TABS — exactly 5, keyboard navigable, no wrap */}
      <div role="tablist" aria-label="Cockpit sections" style={{ display: 'flex', background: V.head, borderBottom: `1px solid ${V.border}` }}>
        {TABS.map((t, i) => {
          const on = t === tab;
          return (
            <button key={t} ref={(el) => (tabRefs.current[t] = el)} role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              onClick={() => setTab(t)} onKeyDown={(e) => onTabKey(e, i)} style={{
                flex: 1, padding: '8px 2px', fontSize: 11, cursor: 'pointer', background: 'transparent', border: 'none',
                borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', color: on ? V.text : V.dim,
                fontWeight: on ? 600 : 400, fontFamily: 'var(--font-sans)', outlineOffset: '-2px',
              }}>{t}</button>
          );
        })}
      </div>

      {/* BODY */}
      <div role="tabpanel" style={{ flex: 1, overflowY: 'auto', padding: '12px 11px 16px' }}>
        {tab === 'Cockpit' && <CockpitTab scenario={scenario} mode={mode} setMode={setMode} nextModel={nextModel} setNextModel={setNextModel} />}
        {tab === 'Setup' && <SetupTab scenario={scenario} />}
        {tab === 'Herd' && <HerdTab scenario={scenario} />}
        {tab === 'Decisions' && <DecisionsTab scenario={scenario} />}
        {tab === 'Doctor' && <DoctorTab scenario={scenario} />}
      </div>

      {/* statusline */}
      <div style={{ borderTop: `1px solid ${V.border}`, padding: '6px 11px', background: V.head, fontFamily: 'var(--font-mono)', fontSize: 10, color: V.dim, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: ROSE }}>🐮</span>
        <span>{MODES.find((m) => m.k === mode).label}</span>
        <span>· <span style={{ color: GREEN }}>T0</span> ready</span>
        <span style={{ marginLeft: 'auto', color: V.faint }}>CLI is the contract</span>
      </div>
    </div>
  );
}

/* ===========================================================
   PAGE — VS Code frame + width/scenario controls
   =========================================================== */
function CockpitArtboard() {
  const [width, setWidth] = React.useState(300);
  const [scenario, setScenario] = React.useState('happy');
  const showEditor = width <= 360;

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: 'clamp(16px, 4vw, 48px) clamp(12px, 4vw, 48px) 64px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 8 }}>§ cockpit · vs code plugin</div>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, margin: 0, maxWidth: 760 }}>
            The router, in your editor's sidebar.
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 680, marginTop: 12 }}>
            One design system, a second render target. Five tabs, designed for a 300px sidebar. The chrome inherits VS Code's theme so it feels native; Mooter shows through the accents, the hero card and the cow. All data is mock.
          </p>
        </div>

        {/* controls */}
        <div className="m-stack" style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>width</span>
            <Segment items={[{ k: 300, label: '300px' }, { k: 560, label: '560px' }]} value={width} onChange={setWidth} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>scenario</span>
            <Segment items={[{ k: 'happy', label: 'happy' }, { k: 'firstrun', label: 'first-run' }, { k: 'degraded', label: 'degraded' }]} value={scenario} onChange={setScenario} />
          </div>
        </div>

        {/* VS Code window */}
        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${V.border}`, boxShadow: '0 40px 120px -40px rgba(0,0,0,0.8)', background: V.editor }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#181818', borderBottom: `1px solid ${V.border}` }}>
            <span style={{ display: 'flex', gap: 7 }}>{['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}</span>
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: V.dim }}>auth.ts — mooter — Visual Studio Code</span>
          </div>
          <div style={{ display: 'flex', height: 660 }}>
            <div className="m-hide" style={{ width: 48, flexShrink: 0, background: V.activity, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '14px 0' }}>
              {['❑', '⑂', '⌕', '⚐'].map((ic, i) => <span key={i} style={{ fontSize: 16, color: V.faint }}>{ic}</span>)}
              <span style={{ fontSize: 18, borderLeft: '2px solid var(--accent)', width: '100%', textAlign: 'center', lineHeight: 1 }}>🐮</span>
            </div>
            <CockpitPlugin width={width} scenario={scenario} />
            {showEditor && (
              <div className="m-hide" style={{ flex: 1, background: V.editor, padding: '16px 20px', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.8, color: V.faint, overflow: 'hidden' }}>
                {[['export async function ', 'authenticate', '(req) {'], ['  const token = ', 'await getToken', '(req)'], ['  if (!token) ', 'throw new', ' AuthError()'], ['  return ', 'verify', '(token)'], ['}']].map((ln, i) => (
                  <div key={i}><span style={{ color: V.faint, marginRight: 16, userSelect: 'none' }}>{i + 1}</span><span style={{ color: '#6a8cc7' }}>{ln[0]}</span><span style={{ color: '#b07fc7' }}>{ln[1] || ''}</span><span style={{ color: V.dim }}>{ln[2] || ''}</span></div>
                ))}
                <div style={{ marginTop: 24, color: V.faint, fontSize: 11 }}># the cockpit lives in the sidebar — the editor stays out of the way</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '5px 14px', background: '#161616', borderTop: `1px solid ${V.border}`, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: V.dim }}>
            <span style={{ color: ROSE }}>🐮 mooter</span>
            <span>Score {SCORE.filter((c) => c[1]).length}/8</span>
            <span style={{ marginLeft: 'auto' }}>Community project · not affiliated with Anthropic</span>
          </div>
        </div>

        {/* design notes */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 22 }}>
          {[
            ['honesty', 'Hero leads with the real $25.95 (green = genuine positive). In first-run, $0.00 is muted with a CTA — never green for a zero. Estimates carry “token-estimated · advisory”.'],
            ['≤5 tabs', 'Exactly five tabs fit a 300px sidebar with no wrap. Arrow keys move between them; focus is visible (role=tab).'],
            ['native + brand', 'Surfaces inherit VS Code greys; Mooter shows through rose, the warm hero card and the cow. No “green on everything.”'],
          ].map(([k, v]) => (
            <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>{k}</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CockpitArtboard });
