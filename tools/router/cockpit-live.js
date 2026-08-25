'use strict';

// cockpit-live — terminal "Agents-live" cockpit (FASE 4), rendered from the cockpit-feed.
// This is the CLI form of the swimlane the VSCode cockpit (mooter-cockpit vsix) shows from
// the same JSON feed: one lane per agent with a 🦙 local / ✨ Claude badge, status, and
// tokens/$ when real (else "—"). Pure string function. The cockpit lights up by polling
// the feed (which lights up on ~/.mooter/workflows/active-run.json).

const { render6Seg } = require('./statusline-firstmagic');

const STATUS_GLYPH = { run: '⏳', done: '✓', queued: '·', blocked: '⚠️' };

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function dash(v, fmt) { return v == null ? '—' : fmt(v); }

function renderCockpit(feed) {
  const L = [];
  L.push('┌─ 🐮 Mooter cockpit — Agents-live ' + '─'.repeat(24));
  if (!feed || !feed.active) {
    L.push('│ idle — no active run (waiting on ~/.mooter/workflows/active-run.json)');
    L.push('└' + '─'.repeat(56));
    return L.join('\n');
  }

  const maestro = feed.maestro ? (feed.maestro.model || feed.maestro.provider) : '—';
  L.push(`│ run ${dash(feed.run_id, (x) => x)} · maestro ${maestro} · ${dash(feed.run_secs, (s) => s + 's')}`);
  const risk = feed.risk.blocked === null ? '—' : (feed.risk.blocked > 0 ? '⚠️ ' + feed.risk.blocked + ' blocked' : '🟢 clear');
  L.push(`│ 🦙 local Moos live: ${dash(feed.moos_live, (n) => n)} (HW cap ${feed.moos_cap})  ·  risk: ${risk}  ·  verify: ${feed.verify === 'pass' ? '🟢' : feed.verify === 'fail' ? '🔴' : '—'}`);
  L.push('│ ' + '─'.repeat(54));

  if (feed.lanes === null) {
    L.push('│   (agent lanes n/d — spawns directory unreadable)');
  } else if (!feed.lanes.length) {
    L.push('│   (no agent lanes yet — spawns/<id>/state.json empty)');
  } else {
    for (const lane of feed.lanes) {
      const g = STATUS_GLYPH[lane.status] || '·';
      const tok = dash(lane.tokens, (t) => `${t}tok`);
      const usd = dash(lane.usd, (u) => `$${(+u).toFixed(4)}`);
      L.push(`│  ${lane.badge} ${g} ${pad(lane.label, 32)} ${pad(lane.model || '—', 10)} ${pad(tok, 9)} ${usd}`);
    }
  }

  L.push('│ ' + '─'.repeat(54));
  const s = feed.savings;
  L.push(`│ savings: ${s ? `$${(+s.actual_usd || 0).toFixed(4)} vs $${(+s.counterfactual_usd || 0).toFixed(4)} all-Opus (−${s.saved_pct}%)` : '— (no measured run tokens)'}`);
  L.push('│');
  L.push('│ ' + render6Seg(feed));
  L.push('└' + '─'.repeat(56));
  return L.join('\n');
}

module.exports = { renderCockpit };

if (require.main === module) {
  const { buildFeed } = require('./cockpit-feed');
  process.stdout.write(renderCockpit(buildFeed({ nowMs: Date.now() })) + '\n');
}
