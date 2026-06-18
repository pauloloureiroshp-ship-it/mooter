'use client';

import Eyebrow from '@/components/Eyebrow';
import Dotgrid from '@/components/Dotgrid';
import Btn from '@/components/Btn';
import versionInfo from '../../version.json';

// Wave 60 — design-mock parity for the sessions page (SessionsArtboard).
// HONESTY NOTE: the mock framed this as "coming soon", but `mooter sessions`
// (watch / quota / handoff + 9 subcommands) actually ships in packages/cli today
// (SYNC.md, packages/cli/src/commands/sessions.ts). Reverting to "coming soon"
// would be a false claim, so we keep the honest "live in the CLI" framing and
// the real command descriptions from the prior page — only the *web* board is
// still terminal-first. Numbers are descriptive, none fabricated.

const BULLETS: { cmd: string; text: string }[] = [
  {
    cmd: 'mooter sessions watch',
    text: 'Live cross-session board: age, prompts, tier mix, ~saved, branch, and the active workflow — every Claude Code session discovered from local transcripts.',
  },
  {
    cmd: 'mooter sessions quota',
    text: 'An honest 5-hour usage forecast — a local rate projection, not a server quota, so it never pretends to know Anthropic limits it cannot see.',
  },
  {
    cmd: 'mooter sessions handoff <id>',
    text: 'A context summary so another session can pick up the thread. No prompt text leaves the machine.',
  },
];

export default function SessionsPage() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden', minHeight: '78vh' }}>
      <Dotgrid />
      <div className="m-pad m-pad-y" style={{ position: 'relative', padding: '96px 40px', maxWidth: 820, margin: '0 auto' }}>
        <Eyebrow>Cross-session intelligence</Eyebrow>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 54px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.04, margin: '6px 0 18px' }}>
          Every session, one screen.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
          If you run Claude Code seriously, you have three or four sessions open and they are blind to
          each other. Mooter discovers them all from the local transcripts and gives the routing
          intelligence a cross-session view — so routing advice reflects everything you do, not just
          this terminal.
        </p>

        <ul style={{ margin: '0 0 36px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 620 }}>
          {BULLETS.map((b, i) => (
            <li key={b.cmd} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 14.5, lineHeight: 1.55 }}>
              <span aria-hidden="true" style={{ color: 'var(--color-accent)', fontFamily: 'var(--mono)', fontSize: 12, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ color: 'var(--color-text)' }}>
                <code style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)', background: 'var(--color-surface-2)', padding: '1px 6px', borderRadius: 5, fontSize: 13 }}>
                  {b.cmd}
                </code>{' '}
                <span style={{ color: 'var(--color-muted)' }}>— {b.text}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Honest status chip: the CLI board is live today; the web view is still
            terminal-first. Pulse is opacity/transform only and respects
            prefers-reduced-motion via the .mpulse-dot rule in globals.css. */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
          <span
            className="mpulse-dot"
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-green)', animation: 'mpulse 1.8s ease-in-out infinite' }}
          />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-muted)' }}>
            live in the CLI today · web board <span style={{ color: 'var(--color-text)' }}>terminal-first for now</span>
          </span>
        </div>

        <div style={{ marginTop: 40, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn href="/" variant="secondary" size="md">
            ← Back home
          </Btn>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
            open source · MIT · v{versionInfo.version}
          </span>
        </div>
      </div>
    </section>
  );
}
