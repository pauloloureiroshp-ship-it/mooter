'use strict';

// Wave 10 · A.1 — Cinematic statusline helpers.
//
// Pure, dependency-free functions consumed by statusline-multi.js to render the
// "Variant C" layout: a colored sparkline of the last 10 routing decisions plus
// a local-vs-cloud split bar. The sparkline is the screenshot-worthy element —
// at a glance you see mostly low gray bars (local doing the work) with rare tall
// pink spikes (Opus only when it matters).

const ANSI = {
  gray:  '\x1b[90m', // T0 local — cheap, the common case
  blue:  '\x1b[36m', // T1/T2 cloud — mid cost
  pink:  '\x1b[38;5;211m', // T3 opus — expensive, should be rare
  reset: '\x1b[0m',
};

// Bar height grows with tier (cost): T0 lowest, T3 full block.
const TIER_BAR   = { T0: '▁', T1: '▃', T2: '▅', T3: '█' };
const TIER_COLOR = { T0: ANSI.gray, T1: ANSI.blue, T2: ANSI.blue, T3: ANSI.pink };

/**
 * Render the last 10 decisions as a colored sparkline, one cell per decision.
 *   ▁ T0 (gray) · ▃ T1 / ▅ T2 (blue) · █ T3 (pink)
 * Unknown/absent tiers render as a faint dot. Returns '' when empty.
 * @param {Array<{tier?:string}>} events
 * @param {{color?:boolean}} [opts]  color:false → plain glyphs (used by tests)
 * @returns {string}
 */
function tierSparkline(events, opts = {}) {
  const last10 = Array.isArray(events) ? events.slice(-10) : [];
  if (!last10.length) return '';
  const color = opts.color !== false;
  return last10
    .map((e) => {
      const t = e && e.tier;
      const bar = TIER_BAR[t] || '·';
      if (!color) return bar;
      return `${TIER_COLOR[t] || ANSI.gray}${bar}${ANSI.reset}`;
    })
    .join('');
}

/**
 * Local-vs-cloud split. T0 is local; T1..T3 are cloud. Unknown tiers ignored.
 * @param {Array<{tier?:string}>} events
 * @returns {{local:number, cloud:number, pct:number}} pct = % local (0..100)
 */
function localCloudSplit(events) {
  const arr = Array.isArray(events) ? events : [];
  let local = 0;
  let cloud = 0;
  for (const e of arr) {
    const t = e && e.tier;
    if (t === 'T0') local++;
    else if (t === 'T1' || t === 'T2' || t === 'T3') cloud++;
  }
  const total = local + cloud;
  return { local, cloud, pct: total ? Math.round((local / total) * 100) : 0 };
}

/**
 * A 10-cell bar showing the % of decisions that ran locally.
 *   "████████░░ 70% local"
 * @param {number} pct 0..100
 * @returns {string}
 */
function localBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const width = 10;
  const filled = Math.round((p / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${p}% local`;
}

module.exports = { tierSparkline, localCloudSplit, localBar };
