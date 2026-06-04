'use client';

// Wave 14 Day 1 (F-2) — stale-aware CLI version chip.
//
// The version label comes from the last synced heartbeat. When a device hasn't
// synced in a while, that version is no longer trustworthy (e.g. it can keep
// showing v0.9 long after the user upgraded). Rather than fabricating freshness
// or hiding the data, we mark it stale once the last sync is older than the
// threshold and surface "how long ago" so the user knows to run `mooter sync`.
//
// Pure logic is exported + unit-tested (landing vitest is node-env, no RTL);
// the JSX is a thin shell over it, matching the page's inline-style idiom.

import React from 'react';

export const STALE_SYNC_DAYS = 7;

export interface VersionBadgeInfo {
  /** True when the last sync is older than STALE_SYNC_DAYS. */
  stale: boolean;
  /** Whole days since the last sync, or null when no sync timestamp exists. */
  daysSince: number | null;
  /** Display text, e.g. "v1.2.0" or "v0.9.1 (52d ago, stale)". */
  label: string;
}

/**
 * Derive the version label + staleness from a version string and a last-sync
 * timestamp. Pure — accepts `nowMs` so it is deterministic under test. Returns
 * null when there is no version to show (caller renders nothing).
 */
export function versionBadgeInfo(
  version: string | null | undefined,
  lastSync: Date | string | number | null | undefined,
  nowMs: number = Date.now(),
): VersionBadgeInfo | null {
  if (!version) return null;
  const v = String(version).replace(/^v/, '');

  const syncMs =
    lastSync == null
      ? NaN
      : lastSync instanceof Date
      ? lastSync.getTime()
      : new Date(lastSync).getTime();

  if (!Number.isFinite(syncMs)) {
    // No usable sync timestamp — show the version as-is, no staleness claim.
    return { stale: false, daysSince: null, label: `v${v}` };
  }

  const daysSince = Math.floor((nowMs - syncMs) / 86_400_000);
  if (daysSince > STALE_SYNC_DAYS) {
    return { stale: true, daysSince, label: `v${v} (${daysSince}d ago, stale)` };
  }
  return { stale: false, daysSince, label: `v${v}` };
}

export function VersionBadge({
  version,
  lastSync,
  nowMs,
  style,
}: {
  version: string | null | undefined;
  lastSync: Date | string | number | null | undefined;
  nowMs?: number;
  style?: React.CSSProperties;
}) {
  const info = versionBadgeInfo(version, lastSync, nowMs);
  if (!info) return null;
  return (
    <span
      style={{
        fontFamily: 'var(--mono)',
        ...(info.stale ? { color: 'var(--muted)' } : null),
        ...style,
      }}
      title={
        info.stale && info.daysSince != null
          ? `Last sync ${info.daysSince}d ago — version may be outdated. Run \`mooter sync\` to refresh.`
          : undefined
      }
    >
      {info.label}
    </span>
  );
}
