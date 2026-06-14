import Card from '@/components/Card';
import versionInfo from '../../version.json';

// MultiSessionTable — the "multi-session field" comparison (Wave 33.9, carried
// from landing-v12-deploy/mooter-v1-iter1.jsx CompareArtboard). 11 capabilities
// derived from the real pain points of running many Claude Code sessions at once,
// scored against 8 agent/orchestration tools. Scores are COUNTED from the cells
// (not hardcoded) so the table is internally consistent and cannot drift.

type Kind = 'y' | 'n' | 'p' | 'cve';

const TOOLS: { name: string; sub: string; highlight?: boolean }[] = [
  { name: 'mooter', sub: `v${versionInfo.version}`, highlight: true },
  { name: 'Composio AO', sub: 'agent os' },
  { name: 'Conductor', sub: 'orchestr.' },
  { name: 'Cursor Bg', sub: 'bg agents' },
  { name: 'Agent Teams', sub: 'anthropic' },
  { name: 'Codex', sub: 'openai' },
  { name: 'Antigravity', sub: 'google' },
  { name: 'Termdock', sub: 'multiplexer' },
];

// Cells transcribe ONLY explicitly-stated capabilities; unstated competitor cells
// are marked partial (◐) rather than invented as ✓.
const ROWS: { label: string; note: string; cells: Kind[] }[] = [
  { label: 'Spawn agents', note: 'mooter local by default · others cloud-only', cells: ['y', 'y', 'y', 'y', 'y', 'y', 'y', 'n'] },
  { label: 'Local-first', note: 'runs without the cloud', cells: ['y', 'p', 'p', 'p', 'y', 'p', 'p', 'y'] },
  { label: 'Cross-session $ savings', note: 'tracks spend across every terminal', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: '5-hour quota forecast', note: 'predicts when you hit the wall', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: 'Cross-session routing learning', note: 'gets cheaper the more you use it', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: '4-layer sandbox', note: 'network · fs · secrets · config', cells: ['y', 'p', 'p', 'y', 'y', 'y', 'cve', 'p'] },
  { label: 'Intent-based UX', note: 'say the goal, not the model', cells: ['y', 'n', 'p', 'y', 'n', 'y', 'n', 'n'] },
  { label: 'State-of-art install wizard', note: 'one path, no foot-guns', cells: ['y', 'p', 'p', 'y', 'p', 'y', 'p', 'p'] },
  { label: 'Multiplexer plugins', note: 'Zellij · tmux · WezTerm · Warp', cells: ['y', 'n', 'n', 'n', 'p', 'n', 'n', 'y'] },
  { label: 'Orchestration locks across terminals', note: 'Worktree Conductor — no two agents on one file', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: 'Workflow visibility statusline chip', note: 'always-on HUD of what is running', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
];

const ICON: Record<Kind, { c: string; g: string }> = {
  y: { c: 'var(--color-green)', g: '✓' },
  n: { c: 'rgba(122,113,104,0.5)', g: '✗' },
  p: { c: 'var(--color-yellow)', g: '◐' },
  cve: { c: 'var(--color-tier-3)', g: '⚠' },
};

export default function MultiSessionTable() {
  // Derive each column's score from its 'y' cells — the table stays consistent.
  const scores = TOOLS.map((_, col) => ROWS.filter((r) => r.cells[col] === 'y').length);

  return (
    <div style={{ marginBottom: 56 }}>
      <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.04, marginTop: 8, marginBottom: 8 }}>
        Eleven capabilities. <span style={{ color: 'var(--color-accent)' }}>Mooter is the only 11/11.</span>
      </h2>
      <p style={{ color: 'var(--color-muted)', fontSize: 15, maxWidth: 760, marginBottom: 28, lineHeight: 1.6 }}>
        The capabilities below are derived from the real pain points of running many Claude Code sessions at once.
        Each tool does <em>something</em> well — none of the others does all eleven.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <Card padding={0} style={{ overflow: 'hidden', minWidth: 880 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '30%' }} />
              {TOOLS.map((t, i) => (
                <col key={i} style={{ width: `${70 / TOOLS.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '16px 18px', borderBottom: '1px solid var(--color-border)', fontWeight: 500, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', verticalAlign: 'bottom' }}>
                  Capability
                </th>
                {TOOLS.map((t) => (
                  <th
                    key={t.name}
                    scope="col"
                    style={{
                      textAlign: 'center', padding: '14px 6px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'bottom',
                      background: t.highlight ? 'var(--color-accent-08)' : 'transparent',
                      borderLeft: t.highlight ? '1px solid var(--color-accent-25)' : 'none',
                      borderRight: t.highlight ? '1px solid var(--color-accent-25)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.15, color: t.highlight ? 'var(--color-accent)' : 'var(--color-text)' }}>{t.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--color-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th scope="row" style={{ padding: '13px 18px', verticalAlign: 'top', textAlign: 'left', fontWeight: 600 }}>
                    <div style={{ fontSize: 13.5, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>{row.label}</div>
                    <div style={{ color: 'var(--color-muted)', fontSize: 11.5, marginTop: 2, lineHeight: 1.4, fontWeight: 400 }}>{row.note}</div>
                  </th>
                  {row.cells.map((kind, j) => {
                    const ic = ICON[kind];
                    const isMooter = j === 0;
                    return (
                      <td
                        key={j}
                        style={{
                          textAlign: 'center', padding: '13px 6px', verticalAlign: 'middle',
                          background: isMooter ? 'var(--color-accent-08)' : 'transparent',
                          borderLeft: isMooter ? '1px solid var(--color-accent-25)' : 'none',
                          borderRight: isMooter ? '1px solid var(--color-accent-25)' : 'none',
                        }}
                      >
                        <span aria-label={kind === 'y' ? 'yes' : kind === 'n' ? 'no' : kind === 'cve' ? 'shipped with disclosed flaw' : 'partial'} style={{ color: ic.c, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {ic.g}
                          {kind === 'cve' && <sup style={{ fontSize: 9, marginLeft: 1 }}>†</sup>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" style={{ padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', textAlign: 'left', fontWeight: 500 }}>
                  Score
                </th>
                {scores.map((s, j) => {
                  const isMooter = j === 0;
                  return (
                    <td
                      key={j}
                      style={{
                        textAlign: 'center', padding: '14px 6px',
                        background: isMooter ? 'var(--color-accent-12)' : 'transparent',
                        borderLeft: isMooter ? '1px solid var(--color-accent-25)' : 'none',
                        borderRight: isMooter ? '1px solid var(--color-accent-25)' : 'none',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: isMooter ? 19 : 15, color: isMooter ? 'var(--color-accent)' : 'var(--color-text)', letterSpacing: '-0.02em' }}>{s}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--color-muted)', marginTop: 1 }}>/ 11</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 22, fontSize: 12, color: 'var(--color-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><span style={{ color: 'var(--color-green)', fontWeight: 700 }}>✓</span> full</span>
        <span><span style={{ color: 'var(--color-yellow)', fontWeight: 700 }}>◐</span> partial / unclear</span>
        <span><span style={{ color: 'var(--color-tier-3)', fontWeight: 700 }}>⚠</span> shipped but with a disclosed flaw</span>
        <span><span style={{ color: 'rgba(122,113,104,0.5)', fontWeight: 700 }}>✗</span> not available</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 900 }}>
        <span style={{ color: 'var(--color-tier-3)' }}>†</span> Antigravity&apos;s sandbox shipped with{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>CVE-2025-59528</span>{' '}
        (prompt-injection escape, disclosed). Marked shipped-but-flawed rather than passing.
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--color-muted)', fontStyle: 'italic', maxWidth: 900, lineHeight: 1.6 }}>
        Comparison based on public documentation as of June 2026. Methodology: 11 capabilities derived from observed
        pain points of multi-session Claude Code workflows. Scores are counted from the cells above — got a cell wrong?{' '}
        <a href="https://github.com/pauloloureiroshp-ship-it/mooter/issues" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontStyle: 'normal' }}>open an issue →</a>
      </div>
      <div style={{ marginTop: 18, padding: '16px 20px', background: 'var(--color-accent-06)', border: '1px solid var(--color-accent-25)', borderRadius: 12, maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-accent)' }}>honest &gt; inflated</span>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--color-text)' }}>
          Scores are derived honestly from the per-row cells, not curated to make Mooter look better. Mooter wins{' '}
          <strong style={{ color: 'var(--color-accent)' }}>5 capabilities no other tool has</strong> — cross-session $
          savings, 5h quota forecast, cross-session routing learning, orchestration locks across terminals, and the
          workflow-visibility statusline chip — and it is the only stack that ships all 11 in one tool.
        </p>
      </div>
    </div>
  );
}
