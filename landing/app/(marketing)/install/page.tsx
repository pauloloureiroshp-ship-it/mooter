import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import TerminalCard from '@/components/TerminalCard';
import Btn from '@/components/Btn';
import Dotgrid from '@/components/Dotgrid';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import versionInfo from '@/app/version.json';
import InstallCommand from './InstallCommand';

export const metadata: Metadata = {
  title: 'Install mooter — one command',
  description: 'One command. Routing starts on your next prompt. Mooter installs as a Claude Code hook and maps your environment on first run.',
};

// Real install.sh flags (landing/public/install.sh, line 16) — no invented flags.
const FLAGS: Array<[string, string]> = [
  ['--dry-run', 'preview every change, write nothing'],
  ['--no-path', "skip the PATH shim in ~/.local/bin"],
  ['--force', 're-run a clean install over an existing one'],
  ['--channel=<name>', 'pin a release channel'],
];

// Transcribed from install.sh header (lines 7-14) — the 7 things it actually does.
const STEPS: string[] = [
  'verify Claude Code + Node 18 (degrades gracefully without Ollama / API key)',
  'copy the routing runtime to ~/.claude/tools/router/',
  'copy the mooter CLI to ~/.mooter/cli/',
  'drop the PATH shim at ~/.local/bin/mooter',
  'write the env file ~/.mooter/env (sourced by your shell)',
  'register hooks in ~/.claude/settings.json (non-destructive merge)',
  'pull qwen2.5:3b (~1.9 GB) for the free local T0 tier, if Ollama is present',
];

// What the classifier does with four representative prompts. Tiers are the real
// ladder (T0 local → T3 Opus); the floor for destructive prompts is honest.
const SMOKE: Array<[string, string, keyof typeof TIER_COLORS_WEB]> = [
  ['write a commit message for this change', 'T0/T1', 'T0'],
  ['my app crashes when I click submit on mobile', 'T2', 'T2'],
  ['design the multi-tenant auth architecture', 'T3', 'T3'],
  ['rm -rf the production database', 'T3 (floored)', 'T3'],
];

// Mirrors install.sh post-install "Next steps" (lines 336-342) — verbatim commands.
const NEXT: Array<[string, string, string, string]> = [
  ['01', 'Load the env', 'source ~/.mooter/env', 'Or just open a new terminal — routing is live from there.'],
  ['02', 'Verify the install', 'mooter doctor', 'Runs 10 checks against the runtime and your environment.'],
  ['03', 'Launch with routing', 'mooter', 'Opens Claude Code with the hook active on your next prompt.'],
  ['04', 'Uninstall anytime', 'mooter uninstall', 'Removes the shim, runtime and hooks. No residue.'],
];

const cards = [
  { icon: '🔍', title: 'Hardware probe', body: 'Detects your GPU, VRAM, and installed Ollama models.' },
  { icon: '🔑', title: 'Subscription mapping', body: 'Reads your Anthropic / OpenAI / Google subscription tiers.' },
  { icon: '🐮', title: 'Pack recommendations', body: 'Suggests 3 Moo Packs that fit your stack.' },
];

export default function InstallPage() {
  const version = versionInfo.version;
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <Dotgrid />
      <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Eyebrow>Install · 30 seconds, one command</Eyebrow>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '2px 10px' }}>
            v{version}
          </span>
        </div>
        <h1 style={{ fontSize: 'clamp(38px, 6vw, 60px)', fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.03em', lineHeight: 1.04 }}>
          One command. Routing starts on your next prompt.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 32, lineHeight: 1.6 }}>
          No proxy, no config files. Mooter installs as a Claude Code hook and maps your environment on first run.
          It probes your machine, registers the hook, and pulls the local models your hardware can run.
        </p>

        <InstallCommand command="bash <(curl -fsSL https://mooter.ai/install.sh)" />

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-muted)', marginTop: 16 }}>
          {FLAGS.map(([flag, desc]) => (
            <span key={flag} title={desc}>
              <span style={{ color: 'var(--color-text)' }}>{flag}</span>
            </span>
          ))}
        </div>

        <div className="install-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 40 }}>
          {cards.map((c) => (
            <Card key={c.title}>
              <div style={{ fontSize: 24 }} aria-hidden="true">{c.icon}</div>
              <div style={{ fontWeight: 600, marginTop: 10 }}>{c.title}</div>
              <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 6 }}>{c.body}</p>
            </Card>
          ))}
        </div>

        {/* what the installer does + smoke test */}
        <div className="install-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 24, marginTop: 56, alignItems: 'start' }}>
          <Card padding={24}>
            <Eyebrow>What the installer does</Eyebrow>
            <ol style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {STEPS.map((s, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontSize: 14, lineHeight: 1.5 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)', width: 18, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: 'var(--color-text)' }}>{s}</span>
                </li>
              ))}
            </ol>
            <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--color-muted)' }}>
              Safe to re-run. <span style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)' }}>--dry-run</span> previews every change before it touches your machine.
            </p>
          </Card>

          <TerminalCard
            title="smoke test · classify.js"
            headerRight={<span style={{ color: 'var(--color-green)', fontSize: 11.5 }}>4/4 sane</span>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5 }}>
              {SMOKE.map(([prompt, label, tier]) => (
                <div key={prompt} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    <span style={{ color: 'var(--color-term-dim)' }}>&ldquo;</span>{prompt}<span style={{ color: 'var(--color-term-dim)' }}>&rdquo;</span>
                  </span>
                  <span style={{ color: TIER_COLORS_WEB[tier], fontWeight: 700, whiteSpace: 'nowrap' }}>→ {label}</span>
                </div>
              ))}
              <div style={{ paddingTop: 2, fontSize: 11.5, color: 'var(--color-term-dim)' }}>
                Destructive prompts are floored at T3 — the classifier never downgrades a deploy or a delete.
              </div>
            </div>
          </TerminalCard>
        </div>

        {/* first five minutes */}
        <div style={{ marginTop: 56 }}>
          <Eyebrow>Your first five minutes</Eyebrow>
          <div className="install-next" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 8 }}>
            {NEXT.map(([n, title, cmd, desc]) => (
              <Card key={n} padding={20} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-accent)' }}>{n}</span>
                <strong style={{ fontSize: 15, marginTop: 8, marginBottom: 8 }}>{title}</strong>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--color-term-fg)', background: 'var(--color-term-bg)', border: '1px solid var(--color-term-border)', borderRadius: 6, padding: '6px 9px', display: 'block', overflowX: 'auto', whiteSpace: 'nowrap' }}>{cmd}</code>
                <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 10, lineHeight: 1.5 }}>{desc}</div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn href="/commands" size="lg">See the /mooter commands →</Btn>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
            Runs on macOS, Linux, and Windows (via bash). Telemetry stays off unless you run /mooter share.
          </span>
        </div>

        <div style={{ marginTop: 36, color: 'var(--color-term-dim)', fontFamily: 'var(--mono)', fontSize: 14 }}>
          $ claude <span style={{ color: 'var(--color-text)' }}>&ldquo;rename this variable&rdquo;</span>
          <div style={{ marginTop: 4 }}>↳ mooter routed to <span style={{ color: 'var(--color-green)' }}>T0 local</span> · saved this call</div>
          <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 12 }}>
            *illustrative — mooter runs entirely in your terminal after install; no sign-in required.
          </div>
        </div>

        <p style={{ marginTop: 28, fontSize: 12, color: 'var(--color-muted)' }}>
          Community project · not affiliated with Anthropic.
        </p>
      </div>
      <style>{`
        @media (max-width: 768px){
          .install-cards{ grid-template-columns: 1fr !important; }
          .install-2col{ grid-template-columns: 1fr !important; }
          .install-next{ grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px){
          .install-next{ grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
