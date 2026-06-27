'use client';

import { useState } from 'react';

/* ════════════════════════════════════════════════════════════════════
   Site v2 · Wave 3 — Cockpit section ("your pane of glass").

   Framing (ESTUDO §0/§2): the panel is NOT the hero. The product is the
   autonomy — you stop piloting. This section is the *proof* that while the
   machine drives, you never fall out of the loop. The faithful VS Code
   cockpit mock on the right is evidence, not the pitch.

   Self-contained on purpose: this wave owns ONLY this file and may run
   before Wave 0 lands the global v2 amber tokens, so the section scopes its
   own tokens + styles under `.cockpit-section`. No globals touched, no
   shared components imported (keeps the amber palette faithful to the
   prototype instead of inheriting the site's rose theme). Wave 7 reconciles.

   Honesty (the moat, inviolable): $0.00 is muted — never green. Advisory
   savings render green only where > 0. Mirrors cockpit v0.16.34.
   ════════════════════════════════════════════════════════════════════ */

type TabKey = 'ck' | 'ss' | 'hd' | 'dc';
type Mode = 'LazyMoo' | 'Moo' | 'CrazyMoo';

const MODES: Mode[] = ['LazyMoo', 'Moo', 'CrazyMoo'];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ck', label: 'Cockpit' },
  { key: 'ss', label: 'Sessions' },
  { key: 'hd', label: 'Handoff' },
  { key: 'dc', label: 'Doctor' },
];

// Left column — what the cockpit gives you. Copy carried from the prototype;
// the lede already says the panel isn't the product, so these stay factual.
const FEATURES: { b: string; rest: string }[] = [
  {
    b: '🐮 Live sessions, grouped by project.',
    rest: ' See every Claude Code agent at once — branch, model, tokens, whose turn it is. No more "what is session #3 doing?"',
  },
  {
    b: '⇄ One-click handoff.',
    rest: " Package a session's full state into a clean block you paste straight into Cowork — or hand off to a fresh agent. Context survives across sessions and machines.",
  },
  {
    b: '📊 Decisions feed.',
    rest: ' Every prompt’s tier, model, confidence and escalation rule — expand any row. Honest by default: $0.00 is muted, never green.',
  },
  {
    b: '🩺 Doctor.',
    rest: ' Engine, tracker and pipeline health with one-click fixes. Mooter Score tells you how well-tuned your setup is.',
  },
  {
    b: 'LazyMoo · Moo · CrazyMoo.',
    rest: ' Pick how aggressively the machine routes — conservative, balanced, or maximum-local. Per session, no paste.',
  },
];

type Tier = 'local' | 'haiku' | 'sonnet' | 'opus';
type State = 'needs you' | 'running' | 'done';

// Fleet-view with outcome per agent (the category-defining asset — Cursor /
// Composio / Antigravity). Illustrative of the author's own fleet run; the
// session names map to real waves, the outcomes are the kind of result line
// the cockpit shows. No invented savings claims here.
const FLEET: {
  cow: string;
  name: string;
  tier: Tier;
  state: State;
  worked: string;
  outcome: string;
  ask?: string;
}[] = [
  {
    cow: '🐮',
    name: 'EXEC MASTERPROMPT — Rankings',
    tier: 'opus',
    state: 'needs you',
    worked: 'worked 22m 04s · 18 files',
    outcome: 'paused for approval',
    ask: 'approve tier-mix table copy',
  },
  {
    cow: '🐄',
    name: 'Master-prompt — Live Sessions',
    tier: 'sonnet',
    state: 'running',
    worked: 'worked 14m 22s · 12 files',
    outcome: '⮑ Wired cockpit ⇄ tracker',
  },
  {
    cow: '🐄',
    name: '3rd-Brain Auto-Loader',
    tier: 'local',
    state: 'running',
    worked: 'worked 6m 41s · 4 files',
    outcome: '⮑ Vault preload on every prompt',
  },
  {
    cow: '🐄',
    name: 'moo-loop — safe loop',
    tier: 'haiku',
    state: 'done',
    worked: 'worked 9m 03s · 7 files',
    outcome: '⮑ Gate B rebased + pushed',
  },
  {
    cow: '🐄',
    name: 'Fleet executor',
    tier: 'local',
    state: 'done',
    worked: 'worked 11m 12s · 9 files',
    outcome: '⮑ Reviewed PR #127',
  },
];

const DOCTOR: { led: string; name: string; tk: string; kind: 'save' | 'warn' }[] = [
  { led: '🟢', name: 'Engine', tk: 'healthy', kind: 'save' },
  { led: '🟢', name: 'Tracker :7821', tk: 'guarded', kind: 'save' },
  { led: '🟡', name: 'Ollama models', tk: '1 update', kind: 'warn' },
  { led: '🟢', name: 'classify.js', tk: 'frozen ✓', kind: 'save' },
];

// Improved handoff — the version that fixes the old block's holes: full
// titles, a concrete ASK under ACTION, DONE collapsed into a counter, FLAGS
// and NEXT. Plain-text twin (below) is what the Copy button writes.
const HANDOFF_TEXT = `⇄ MOO PROJECT HANDOFF → paste into Cowork
project: mooter · 5 sessions · clean
▸ ACTION (needs you)
  🟡 EXEC MASTERPROMPT — Rankings R0→R3
     ask: approve tier-mix table copy
▸ DONE: 4 (3rd-brain, fleet, loop, live)
▸ FLAGS: 0 uncommitted · 0 unpushed
▸ NEXT: review R3 → merge wave
⇄ END`;

const tierClass: Record<Tier, string> = {
  local: 'cs-b-local',
  haiku: 'cs-b-haiku',
  sonnet: 'cs-b-sonnet',
  opus: 'cs-b-opus',
};

export default function CockpitSection() {
  const [tab, setTab] = useState<TabKey>('ck');
  const [mode, setMode] = useState<Mode>('Moo');
  const [copied, setCopied] = useState(false);

  const pending = FLEET.find((s) => s.state === 'needs you');

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(HANDOFF_TEXT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the block is visible to copy by hand */
    }
  }

  return (
    <section id="cockpit" className="cockpit-section" aria-labelledby="cockpit-h2">
      <div className="cs-wrap">
        <div className="cs-eyebrow">The cockpit · your pane of glass</div>
        <h2 id="cockpit-h2" className="cs-h2">
          You never fall out of the loop.
        </h2>
        <p className="cs-lede">
          The panel isn&rsquo;t the product — the autonomy is. But while the machine drives, the VS
          Code cockpit shows you everything: every session, every routing decision, the running
          spend, and a one-click handoff. <b>v0.16.34</b>.
        </p>

        <div className="cs-cockwrap">
          {/* ── left: what it gives you ── */}
          <ul className="cs-feat">
            {FEATURES.map((f) => (
              <li key={f.b}>
                <b>{f.b}</b>
                {f.rest}
              </li>
            ))}
          </ul>

          {/* ── right: faithful cockpit mock, floating over the bg ── */}
          <div className="cs-stage">
            <div className="cs-cockpit" role="group" aria-label="mooter cockpit preview">
              <div className="cs-cock-h">
                🐮 mooter <span style={{ color: 'var(--ink3)' }}>· Claude Code</span>
                <span className="cs-score">{mode} 100%</span>
              </div>

              <div className="cs-tabs" role="tablist" aria-label="Cockpit panels">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    id={`cs-tab-${t.key}`}
                    aria-selected={tab === t.key}
                    aria-controls={`cs-pane-${t.key}`}
                    className={tab === t.key ? 'cs-on' : undefined}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Cockpit tab ── */}
              {tab === 'ck' && (
                <div className="cs-pane" role="tabpanel" id="cs-pane-ck" aria-labelledby="cs-tab-ck">
                  <div className="cs-modes" role="group" aria-label="Routing mode">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        aria-pressed={mode === m}
                        className={mode === m ? 'cs-on' : undefined}
                        onClick={() => setMode(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <div className="cs-hero-save">
                    <div className="cs-sm">SAVED VS ALL-OPUS · advisory · this session</div>
                    <div className="cs-big">$0.73</div>
                    <div className="cs-sm">
                      65.8% below all-Opus · real executed{' '}
                      <span className="cs-muted-money">$0.00</span> · 0 local dispatches yet
                    </div>
                  </div>

                  <div className="cs-label">Next prompt model</div>
                  <div className="cs-codeline">
                    <span className="cs-d">🐮</span> Auto — let {mode} decide
                  </div>
                </div>
              )}

              {/* ── Sessions tab → fleet-view with outcome + approvals ── */}
              {tab === 'ss' && (
                <div className="cs-pane" role="tabpanel" id="cs-pane-ss" aria-labelledby="cs-tab-ss">
                  {pending && (
                    <div className="cs-approve">
                      <div className="cs-ah">
                        <span className="cs-led" aria-hidden="true" /> needs you
                      </div>
                      <div className="cs-an">{pending.name}</div>
                      <div className="cs-aask">ask: {pending.ask}</div>
                      <div className="cs-approve-actions">
                        <button className="cs-primary" type="button">
                          Approve
                        </button>
                        <button type="button">Open</button>
                      </div>
                    </div>
                  )}

                  <div className="cs-yourturn">● 1 your turn · 8 recent</div>

                  <div className="cs-fleet">
                    {FLEET.map((s) => (
                      <div className="cs-sess" key={s.name}>
                        <div className="cs-sess-top">
                          <span className="cs-cow">{s.cow}</span>
                          <span className="cs-nm">{s.name}</span>
                          <span
                            className={
                              'cs-state' +
                              (s.state === 'needs you'
                                ? ' cs-needs'
                                : s.state === 'running'
                                  ? ' cs-run'
                                  : '')
                            }
                          >
                            {s.state}
                          </span>
                          <span className={'cs-badge ' + tierClass[s.tier]}>{s.tier}</span>
                        </div>
                        <div className="cs-meta">
                          {s.worked} · <span className="cs-out">{s.outcome}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Handoff tab → improved block ── */}
              {tab === 'hd' && (
                <div className="cs-pane" role="tabpanel" id="cs-pane-hd" aria-labelledby="cs-tab-hd">
                  <div className="cs-label">⇄ Moo project handoff → paste into Cowork</div>
                  <div className="cs-handoff-demo">
                    <span className="cs-hh">⇄ MOO PROJECT HANDOFF</span>
                    {'\n'}project: mooter · 5 sessions · clean
                    {'\n'}▸ <span className="cs-yl">ACTION (needs you)</span>
                    {'\n'}  🟡 EXEC MASTERPROMPT — Rankings R0→R3
                    {'\n'}     ask: approve tier-mix table copy
                    {'\n'}▸ <span className="cs-ok">DONE: 4</span> (3rd-brain, fleet, loop, live)
                    {'\n'}▸ FLAGS: 0 uncommitted · 0 unpushed
                    {'\n'}▸ NEXT: review R3 → merge wave
                    {'\n'}
                    <span className="cs-hh">⇄ END</span>
                  </div>
                  <button className="cs-handoff-btn" type="button" onClick={copyHandoff}>
                    {copied ? 'Copied ✓' : '📋 Copy handoff'}
                  </button>
                </div>
              )}

              {/* ── Doctor tab ── */}
              {tab === 'dc' && (
                <div className="cs-pane" role="tabpanel" id="cs-pane-dc" aria-labelledby="cs-tab-dc">
                  {DOCTOR.map((d) => (
                    <div className="cs-doc" key={d.name}>
                      <span aria-hidden="true">{d.led}</span>
                      <span className="cs-nm">{d.name}</span>
                      <span className={'cs-tk cs-' + d.kind}>{d.tk}</span>
                    </div>
                  ))}
                  <div className="cs-sm" style={{ marginTop: 10 }}>
                    Mooter Score 8/8 · one-click fixes ready
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cockpit-section{
          --bg:#0B0A09; --bg2:#121110; --bg3:#1A1816; --line:#2A2724;
          --ink:#F4EFE7; --ink2:#B8AFA2; --ink3:#7C746A;
          --moo:#E8B04B; --moo2:#F2C66A; --save:#5FB87A;
          --local:#5FB87A; --haiku:#6FA8DC; --sonnet:#C39BD3; --opus:#E8835A;
          --cs-mono:"SF Mono",ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;
          --cs-sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
          position:relative; padding:92px 0; border-top:1px solid var(--line);
          background:var(--bg); color:var(--ink);
          font-family:var(--cs-sans); line-height:1.55;
        }
        .cockpit-section .cs-wrap{max-width:1140px;margin:0 auto;padding:0 24px}
        .cockpit-section .cs-eyebrow{font-family:var(--cs-mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--moo);margin-bottom:14px}
        .cockpit-section .cs-h2{font-size:clamp(26px,3.4vw,40px);line-height:1.12;letter-spacing:-.02em;font-weight:700;margin:0 0 14px}
        .cockpit-section .cs-lede{color:var(--ink2);font-size:17px;max-width:640px;margin:0 0 34px}
        .cockpit-section .cs-lede b{color:var(--ink2)}

        .cockpit-section .cs-cockwrap{display:grid;grid-template-columns:1.1fr 300px;gap:30px;align-items:start}

        .cockpit-section .cs-feat{list-style:none;margin:0;padding:0}
        .cockpit-section .cs-feat li{padding:9px 0;border-top:1px solid var(--line);color:var(--ink2);font-size:14px}
        .cockpit-section .cs-feat li:first-child{border-top:0}
        .cockpit-section .cs-feat b{color:var(--ink)}

        /* floating mock + soft amber glow (Conductor-style, no OS chrome) */
        .cockpit-section .cs-stage{position:relative;display:flex;justify-content:center}
        .cockpit-section .cs-stage::before{content:"";position:absolute;inset:-44px -24px;
          background:radial-gradient(60% 55% at 50% 26%, rgba(232,176,75,.16), transparent 70%);
          z-index:0;pointer-events:none}
        .cockpit-section .cs-cockpit{position:relative;z-index:1;background:var(--bg2);border:1px solid var(--line);
          border-radius:14px;overflow:hidden;width:300px;max-width:100%;font-size:12px;
          box-shadow:0 28px 60px -26px rgba(0,0,0,.85), 0 0 0 1px rgba(232,176,75,.04);
          transition:transform .25s ease, box-shadow .25s ease}
        .cockpit-section .cs-cockpit:hover{transform:translateY(-3px);
          box-shadow:0 38px 72px -26px rgba(0,0,0,.9), 0 0 0 1px rgba(232,176,75,.12)}
        .cockpit-section .cs-cock-h{display:flex;align-items:center;gap:7px;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--bg3);font-family:var(--cs-mono);font-size:11px;color:var(--ink2)}
        .cockpit-section .cs-cock-h .cs-score{margin-left:auto;color:var(--moo)}

        .cockpit-section .cs-tabs{display:flex;border-bottom:1px solid var(--line);font-family:var(--cs-mono);font-size:10.5px}
        .cockpit-section .cs-tabs button{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--ink3);padding:9px 4px;cursor:pointer;transition:color .15s}
        .cockpit-section .cs-tabs button:hover{color:var(--ink2)}
        .cockpit-section .cs-tabs button.cs-on{color:var(--moo);border-bottom-color:var(--moo)}
        .cockpit-section .cs-pane{padding:14px}

        .cockpit-section .cs-modes{display:flex;gap:6px;margin-bottom:12px}
        .cockpit-section .cs-modes button{flex:1;font-family:var(--cs-mono);font-size:10px;padding:6px 2px;border-radius:7px;border:1px solid var(--line);background:var(--bg3);color:var(--ink3);cursor:pointer;transition:.15s}
        .cockpit-section .cs-modes button:hover{color:var(--ink2)}
        .cockpit-section .cs-modes button.cs-on{color:var(--moo);border-color:var(--moo)}

        .cockpit-section .cs-hero-save{background:var(--bg3);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px}
        .cockpit-section .cs-hero-save .cs-big{font-size:24px;font-weight:750;color:var(--save)}
        .cockpit-section .cs-sm{font-family:var(--cs-mono);font-size:10px;color:var(--ink3)}
        .cockpit-section .cs-muted-money{color:var(--ink3)}

        .cockpit-section .cs-label{font-family:var(--cs-mono);font-size:10px;color:var(--ink3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em}
        .cockpit-section .cs-codeline{background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-family:var(--cs-mono);font-size:11.5px;color:var(--ink2);display:flex;align-items:center;gap:8px}
        .cockpit-section .cs-codeline .cs-d{color:var(--moo)}

        /* approvals — Mission-Control control-plane feel, not a passive dashboard */
        .cockpit-section .cs-approve{background:rgba(232,176,75,.08);border:1px solid rgba(232,176,75,.35);border-radius:9px;padding:9px 10px;margin-bottom:10px}
        .cockpit-section .cs-approve .cs-ah{font-family:var(--cs-mono);font-size:10px;color:var(--moo);display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.06em}
        .cockpit-section .cs-led{width:7px;height:7px;border-radius:50%;background:var(--moo);box-shadow:0 0 8px var(--moo);display:inline-block}
        .cockpit-section .cs-approve .cs-an{font-size:11.5px;color:var(--ink);margin:5px 0 2px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cockpit-section .cs-approve .cs-aask{font-family:var(--cs-mono);font-size:10px;color:var(--ink2)}
        .cockpit-section .cs-approve-actions{display:flex;gap:6px;margin-top:8px}
        .cockpit-section .cs-approve-actions button{flex:1;font-family:var(--cs-mono);font-size:10px;border-radius:6px;padding:5px;cursor:pointer;border:1px solid var(--line);background:var(--bg3);color:var(--ink2);transition:.15s}
        .cockpit-section .cs-approve-actions button:hover{color:var(--ink)}
        .cockpit-section .cs-approve-actions .cs-primary{background:var(--moo);border-color:var(--moo);color:#1A1206;font-weight:600}
        .cockpit-section .cs-approve-actions .cs-primary:hover{background:var(--moo2);color:#1A1206}

        .cockpit-section .cs-yourturn{font-family:var(--cs-mono);font-size:10px;color:var(--moo);margin-bottom:6px}

        /* fleet rows with outcome per agent */
        .cockpit-section .cs-fleet{margin-top:2px}
        .cockpit-section .cs-sess{display:flex;flex-direction:column;gap:3px;padding:9px 0;border-top:1px solid var(--line);font-family:var(--cs-mono);font-size:11px}
        .cockpit-section .cs-sess-top{display:flex;align-items:center;gap:7px}
        .cockpit-section .cs-sess .cs-cow{font-size:13px}
        .cockpit-section .cs-sess .cs-nm{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
        .cockpit-section .cs-sess .cs-meta{color:var(--ink3);font-size:10px;padding-left:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cockpit-section .cs-sess .cs-out{color:var(--ink2)}
        .cockpit-section .cs-state{font-size:9.5px;padding:1px 6px;border-radius:5px;border:1px solid var(--line);color:var(--ink3);white-space:nowrap}
        .cockpit-section .cs-state.cs-needs{color:var(--moo);border-color:rgba(232,176,75,.5)}
        .cockpit-section .cs-state.cs-run{color:var(--save);border-color:rgba(95,184,122,.4)}

        .cockpit-section .cs-badge{font-family:var(--cs-mono);font-size:9.5px;padding:1px 6px;border-radius:5px;border:1px solid var(--line)}
        .cockpit-section .cs-b-local{color:var(--local);border-color:rgba(95,184,122,.4)}
        .cockpit-section .cs-b-haiku{color:var(--haiku);border-color:rgba(111,168,220,.4)}
        .cockpit-section .cs-b-sonnet{color:var(--sonnet);border-color:rgba(195,155,211,.4)}
        .cockpit-section .cs-b-opus{color:var(--opus);border-color:rgba(232,131,90,.5)}

        .cockpit-section .cs-handoff-demo{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;font-family:var(--cs-mono);font-size:10.5px;color:var(--ink2);margin-top:4px;line-height:1.6;max-height:184px;overflow:auto;white-space:pre-wrap;word-break:break-word}
        .cockpit-section .cs-handoff-demo .cs-hh{color:var(--moo)}
        .cockpit-section .cs-handoff-demo .cs-ok{color:var(--save)}
        .cockpit-section .cs-handoff-demo .cs-yl{color:var(--moo2)}
        .cockpit-section .cs-handoff-btn{width:100%;margin:10px 0 0;background:rgba(232,176,75,.08);border:1px dashed rgba(232,176,75,.5);color:var(--moo);border-radius:8px;padding:8px;font-family:var(--cs-mono);font-size:11px;cursor:pointer;transition:.15s}
        .cockpit-section .cs-handoff-btn:hover{background:rgba(232,176,75,.14)}

        .cockpit-section .cs-doc{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line);font-family:var(--cs-mono);font-size:11px}
        .cockpit-section .cs-doc:first-child{border-top:0}
        .cockpit-section .cs-doc .cs-nm{color:var(--ink2);flex:1}
        .cockpit-section .cs-doc .cs-tk{color:var(--ink3);font-size:10px}
        .cockpit-section .cs-doc .cs-tk.cs-save{color:var(--save)}
        .cockpit-section .cs-doc .cs-tk.cs-warn{color:var(--moo2)}

        @media(max-width:960px){
          .cockpit-section .cs-cockwrap{grid-template-columns:1fr;gap:34px}
          .cockpit-section .cs-stage{justify-content:flex-start}
        }
        @media (prefers-reduced-motion: reduce){
          .cockpit-section .cs-cockpit{transition:none}
          .cockpit-section .cs-cockpit:hover{transform:none}
        }
      `}</style>
    </section>
  );
}
