/* mooter-v1-install.jsx — hi-fi /install page.
   Every value transcribed from the real install.sh (prereqs, hw tiers,
   models, the 9 installer steps, the 4 smoke-test prompts, next steps).
   Exposed: InstallV2Artboard */

const {
  Eyebrow: InEyebrow, Card: InCard, MonoNum: InMonoNum, TierChip: InTierChip,
  TrafficLights: InTrafficLights, Dotgrid: InDotgrid, CrookOutline: InCrook, Btn: InBtn,
} = window;

const INSTALL_CMD = 'bash <(curl -fsSL https://mooter.ai/install.sh)';

function CopyCmd() {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(INSTALL_CMD); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div style={{
      background: 'var(--term-bg)', border: '1px solid var(--term-border)', borderRadius: 14,
      padding: '26px 30px', fontFamily: 'var(--font-mono)', fontSize: 26, letterSpacing: '-0.01em',
      color: 'var(--term-fg)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <span style={{ color: 'var(--accent)' }}>$</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: 'var(--term-dim)' }}>bash &lt;(curl -fsSL </span>
        <span style={{ color: 'var(--accent)' }}>https://mooter.ai/install.sh</span>
        <span style={{ color: 'var(--term-dim)' }}>)</span>
      </span>
      <button onClick={copy} style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, padding: '9px 16px', cursor: 'pointer',
        background: copied ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
        border: '1px solid var(--term-border)', borderRadius: 7,
        color: copied ? 'var(--bg)' : 'var(--term-fg)', transition: 'all .15s', whiteSpace: 'nowrap',
      }}>{copied ? '✓ copied' : 'copy'}</button>
    </div>
  );
}

const REQS = [
  ['Node.js', '≥ 18', 'required', true],
  ['Claude Code', 'npm i -g @anthropic-ai/claude-code', 'required', true],
  ['curl', 'any', 'required', true],
  ['git', 'any', 'optional', false],
  ['Ollama', 'unlocks T0 local · else falls back to Haiku', 'optional', false],
];

const HW_TIERS = [
  ['apple-silicon', 'macOS · arm64', 'T0 local on Metal'],
  ['nvidia-high', 'GPU ≥ 8 GB VRAM', 'full T0 local stack'],
  ['nvidia-low', 'GPU < 8 GB VRAM', 'small T0 models'],
  ['integrated-high', 'RAM ≥ 16 GB', 'CPU T0, slower'],
  ['cpu-only', 'RAM < 16 GB', 'routes T1–T3 only'],
];

const STEPS = [
  'check prerequisites',
  'generate anonymous device.id',
  'download + extract runtime',
  'register UserPromptSubmit hook',
  'pull Ollama models (hw-matched)',
  'subscription profile wizard',
  'smoke-test the classifier',
  'anonymous install heartbeat',
  'health check (doctor)',
];

const SMOKE = [
  ['write a commit message for this change', 'T0/T1', 'var(--tier-0)'],
  ['my app crashes when I click submit on mobile', 'T2', 'var(--tier-2)'],
  ['design the multi-tenant auth architecture', 'T3', 'var(--tier-3)'],
  ['rm -rf the production database', 'T3', 'var(--tier-3)'],
];

const NEXT5 = [
  ['01', 'Open a fresh session', 'claude', 'Routing is live from your next prompt.'],
  ['02', 'Watch it route', 'bash ~/.claude/tools/router/statusline.sh', 'Live tier, savings, budgets in your statusline.'],
  ['03', 'See the savings', 'mooter.ai/dashboard', 'Your cost vs the all-Opus baseline.'],
  ['04', 'Something off?', 'curl … install.sh --doctor', 'Self-diagnoses and fixes the runtime.'],
];

function InstallV2Artboard() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden' }}>
      <InDotgrid />
      <div className="m-pad m-pad-y" style={{ padding: '64px 64px 72px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <InEyebrow>§ install · 30 seconds, one command</InEyebrow>
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 52, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.02, marginTop: 6, marginBottom: 14, maxWidth: 820 }}>
          One command. Routing starts on your next prompt.
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 16, maxWidth: 660, lineHeight: 1.6, marginBottom: 32 }}>
          The installer probes your machine, registers a hook in Claude Code, and pulls the local models your hardware can run. No proxy, no MitM, telemetry off by default.
        </p>

        <div style={{ marginBottom: 14 }}><CopyCmd /></div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 52 }}>
          <span>flags · <span style={{ color: 'var(--text)' }}>--dry-run</span></span>
          <span><span style={{ color: 'var(--text)' }}>--doctor</span></span>
          <span><span style={{ color: 'var(--text)' }}>--no-ollama</span></span>
          <span><span style={{ color: 'var(--text)' }}>--no-telemetry</span></span>
          <span><span style={{ color: 'var(--text)' }}>--uninstall</span></span>
        </div>

        {/* requirements + hardware */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 52, alignItems: 'start' }}>
          <InCard padding={24}>
            <InEyebrow>system requirements</InEyebrow>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' }}>
              {REQS.map(([name, detail, kind, req]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: req ? 'var(--green)' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13, width: 14 }}>{req ? '✓' : '○'}</span>
                  <div style={{ minWidth: 110 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                    <div style={{ fontSize: 11, color: req ? 'var(--green)' : 'var(--muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{kind}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)', flex: 1, lineHeight: 1.45 }}>{detail}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>
              Runs on <span style={{ color: 'var(--text)' }}>macOS</span>, <span style={{ color: 'var(--text)' }}>Linux</span>, and <span style={{ color: 'var(--text)' }}>Windows</span> (via bash).
            </div>
          </InCard>

          <InCard padding={24}>
            <InEyebrow>what your hardware gets</InEyebrow>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' }}>
              {HW_TIERS.map(([tier, cond, gets]) => (
                <div key={tier} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>{tier}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{cond}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{gets}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.55 }}>
              auto-pulls · qwen2.5:3b · qwen2.5-coder:14b · nomic-embed-text <span style={{ color: 'var(--term-dim)' }}>(+ qwen3:30b when RAM ≥ 16 GB)</span>
            </div>
          </InCard>
        </div>

        {/* what it does + smoke test */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 24, marginBottom: 52, alignItems: 'start' }}>
          <InCard padding={24}>
            <InEyebrow>what the installer does</InEyebrow>
            <ol style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9, counterReset: 'step' }}>
              {STEPS.map((s, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 13.5 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)', width: 18 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: 'var(--text)' }}>{s}</span>
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
              Existing config is backed up to <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>~/.claude/backups</span> first. <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>--dry-run</span> previews every byte.
            </div>
          </InCard>

          <InCard padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
              <InTrafficLights />
              <span style={{ color: 'var(--term-dim)' }}>smoke test · classify.js</span>
              <span style={{ marginLeft: 'auto', color: 'var(--green)' }}>4/4 sane</span>
            </div>
            <div style={{ padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SMOKE.map(([prompt, tier, color], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--term-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--term-dim)' }}>"</span>{prompt}<span style={{ color: 'var(--term-dim)' }}>"</span>
                  </span>
                  <span style={{ color, fontWeight: 700, whiteSpace: 'nowrap' }}>→ {tier}</span>
                </div>
              ))}
              <div style={{ paddingTop: 4, fontSize: 11.5, color: 'var(--term-dim)' }}>The installer routes 4 known prompts and checks each lands in the expected tier.</div>
            </div>
          </InCard>
        </div>

        {/* first 5 minutes */}
        <InEyebrow>your first five minutes</InEyebrow>
        <div className="m-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
          {NEXT5.map(([n, title, cmd, desc]) => (
            <InCard key={n} padding={20} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{n}</span>
              <strong style={{ fontSize: 15, letterSpacing: '-0.01em', marginTop: 8, marginBottom: 8 }}>{title}</strong>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--term-fg)', background: 'var(--term-bg)', border: '1px solid var(--term-border)', borderRadius: 6, padding: '6px 9px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd}</code>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>{desc}</div>
            </InCard>
          ))}
        </div>

        <div style={{ marginTop: 28, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <InBtn kind="primary" size="lg" href="https://mooter.ai/dashboard">Open the dashboard →</InBtn>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
            Questions? paulo@mooter.ai · telemetry stays off unless you run /mooter share
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { InstallV2Artboard });
