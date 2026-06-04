// Wave 14 Day 1 (F-2) — VersionBadge staleness logic.
// landing vitest is node-env (no React testing library), so we test the pure
// helper (fresh vs stale derivation), not rendered JSX.

import { describe, it, expect } from 'vitest';
import { versionBadgeInfo, STALE_SYNC_DAYS } from './VersionBadge';

const NOW = Date.parse('2026-06-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('versionBadgeInfo', () => {
  it('fresh sync (< 7d) shows the version as-is, not stale', () => {
    const info = versionBadgeInfo('1.2.0', daysAgo(2), NOW);
    expect(info).not.toBeNull();
    expect(info!.stale).toBe(false);
    expect(info!.daysSince).toBe(2);
    expect(info!.label).toBe('v1.2.0');
  });

  it('stale sync (> 7d) marks the version stale with days-since', () => {
    const info = versionBadgeInfo('0.9.1', daysAgo(52), NOW);
    expect(info).not.toBeNull();
    expect(info!.stale).toBe(true);
    expect(info!.daysSince).toBe(52);
    expect(info!.label).toBe('v0.9.1 (52d ago, stale)');
  });

  it('exactly at the threshold is not yet stale', () => {
    const info = versionBadgeInfo('1.0.0', daysAgo(STALE_SYNC_DAYS), NOW);
    expect(info!.stale).toBe(false);
  });

  it('strips a leading "v" and tolerates no sync timestamp / no version', () => {
    expect(versionBadgeInfo('v1.5.0', null, NOW)).toEqual({
      stale: false,
      daysSince: null,
      label: 'v1.5.0',
    });
    expect(versionBadgeInfo(null, daysAgo(99), NOW)).toBeNull();
  });
});
