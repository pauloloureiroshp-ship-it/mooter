'use strict';

// Tier-mix view helpers (Wave 2.5 Day 3). Pure functions consumed by
// statusline-multi.js to render a rotating "last 10 tier distribution" chip
// (view B) alternating with the default cost chips (view A).

/**
 * Count the tier of the last 10 events into a fixed T0..T3 breakdown string.
 * Events with an unknown/absent tier are ignored. Always returns all four
 * buckets so the chip width stays stable as the mix shifts.
 * @param {Array<{ tier?: string }>} events
 * @returns {string}
 */
function tierMixLast10(events) {
  const last10 = Array.isArray(events) ? events.slice(-10) : [];
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of last10) {
    const t = e && e.tier;
    if (t === 'T0' || t === 'T1' || t === 'T2' || t === 'T3') counts[t]++;
  }
  return `last10: T0:${counts.T0} T1:${counts.T1} T2:${counts.T2} T3:${counts.T3}`;
}

/**
 * Choose the statusline view, alternating A↔B every 5 ticks. The statusline is
 * called roughly once per second, so each view holds for ~5s before flipping.
 * @param {Array<unknown>} _events  reserved for future content-aware selection
 * @param {number} tickCount
 * @returns {'A'|'B'}
 */
function pickView(_events, tickCount) {
  const n = Number.isFinite(tickCount) ? Math.floor(tickCount) : 0;
  return Math.floor(n / 5) % 2 === 0 ? 'A' : 'B';
}

module.exports = { tierMixLast10, pickView };
