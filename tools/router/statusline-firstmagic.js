'use strict';

// statusline-firstmagic — the 6-segment First Magic statusline (FASE 4), rendered from the
// cockpit-feed view-model. Every segment degrades to "—" when its real data is missing
// (Doctrine: honesty visible, never fabricate). Pure string function — no I/O.
//
//   🐮 maestro:Sonnet · 🦙×4 (cap 2) · ⚠️risk:1 · $0.06 (−61% vs Opus) · verify:🟢 · run:42s

const SEP = ' · ';

function shortModel(m) {
  if (!m) return '—';
  return String(m)
    .replace(/^claude-/, '')
    .replace(/-4-6\[1m\]|-4-6|-4-5.*$/, '')
    .replace(/opus.*/i, 'Opus').replace(/sonnet.*/i, 'Sonnet').replace(/haiku.*/i, 'Haiku')
    .replace(/^qwen.*/i, 'qwen') || '—';
}

function dash(v, fmt) {
  return (v == null || (typeof v === 'number' && !Number.isFinite(v))) ? '—' : fmt(v);
}

function render6Seg(feed) {
  if (!feed || !feed.active) return '🐮 mooter · idle (no active run)';

  const maestro = `🐮 maestro:${feed.maestro ? shortModel(feed.maestro.model || feed.maestro.provider) : '—'}`;

  // local Moos: live count + the HW-aware cap (never invented)
  const moos = `🦙×${dash(feed.moos_live, (n) => n)}${Number.isFinite(feed.moos_cap) ? ` (cap ${feed.moos_cap})` : ''}`;

  const risk = feed.risk && feed.risk.blocked > 0 ? `⚠️risk:${feed.risk.blocked}` : '🟢 risk:0';

  // honest dollar basis required: finite actual_usd + pct + positive counterfactual
  const s = feed.savings;
  const savings = (s && Number.isFinite(s.saved_pct) && Number.isFinite(s.actual_usd) && Number(s.counterfactual_usd) > 0)
    ? `$${s.actual_usd.toFixed(2)} (−${s.saved_pct}% vs Opus)`
    : '$— vs Opus';

  const verify = `verify:${feed.verify === 'pass' ? '🟢' : feed.verify === 'fail' ? '🔴' : '—'}`;

  const run = `run:${dash(feed.run_secs, (s) => `${s}s`)}`;

  return [maestro, moos, risk, savings, verify, run].join(SEP);
}

module.exports = { render6Seg, shortModel };

if (require.main === module) {
  const { buildFeed } = require('./cockpit-feed');
  const now = Date.now();
  process.stdout.write(render6Seg(buildFeed({ nowMs: now })) + '\n');
}
