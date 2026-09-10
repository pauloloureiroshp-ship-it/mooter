// Onboarding v2 · W0 — the four honest KPIs that replace the savings surfaces.
//
// WHY THIS FILE EXISTS. Until 2026-09-10 the dashboard published
// "% saved vs all-Opus" derived from `decisions x $0.015` — a MODELLED
// all-Opus cost, never a measured one. The owner's rule (ADR-onboarding-v2,
// R2) is that no savings number ships without a real pair: >= 20 tasks with
// tokens measured on BOTH sides. Measured by the adversary the same day:
// 0 of 156 ledger events carry structured token fields. So the honest screen
// is not a smaller savings number — it is four different numbers, one of
// which is `n/d` and says why.
//
// Pure functions, no React, no I/O: the landing vitest suite is node-env, so
// every derivation is unit-tested here rather than through the component.

/** A rendered KPI. `value` is already display-ready; `null` means `n/d`. */
export interface Kpi {
  key: 'tasks' | 'local_coverage' | 'window_preserved' | 'esr';
  label: string;
  /** Display string, or null when the honest answer is `n/d`. */
  value: string | null;
  /** Sub-label: the estimate caveat, or the reason the value is `n/d`. */
  note: string;
  /** True when the number is derived, not directly measured (R4: label it). */
  estimated: boolean;
}

/**
 * Minimum paired tasks (tokens measured on both sides) before any savings
 * rate may be shown. Owner decision 2026-08-24, restated in ADR-onboarding-v2.
 */
export const MIN_MEASURED_PAIRS = 20;

/** Tier keys that execute on the user's own hardware (no paid window used). */
export const LOCAL_TIERS = ['T0'] as const;

export interface KpiInput {
  /** Routing decisions counted for this user (real, synced). */
  tasksRouted: number;
  /** Per-tier fractions from the user's own sync, e.g. { T0: 0.66, ... }. */
  tierDistribution?: Record<string, number> | null;
  /**
   * Tasks with tokens measured on BOTH sides (local run + cloud reference).
   * W4 is the wave that starts populating this; today it is 0 everywhere.
   */
  measuredPairs?: number;
}

/** Fraction (0..1) of tasks that ran on local tiers, or null when unknown. */
export function localFraction(dist?: Record<string, number> | null): number | null {
  if (!dist) return null;
  let sum = 0;
  let sawAny = false;
  for (const t of LOCAL_TIERS) {
    const v = Number(dist[t]);
    if (Number.isFinite(v)) { sum += v; sawAny = true; }
  }
  if (!sawAny) return null;
  return Math.max(0, Math.min(1, sum));
}

/**
 * The four KPIs, in display order. Never throws, never fabricates: every
 * branch that cannot be measured returns `value: null` plus the reason.
 */
export function computeKpis(input: KpiInput): Kpi[] {
  const tasks = Number.isFinite(input.tasksRouted) && input.tasksRouted > 0
    ? Math.floor(input.tasksRouted)
    : 0;
  const frac = localFraction(input.tierDistribution);
  const pairs = Number.isFinite(input.measuredPairs) ? Number(input.measuredPairs) : 0;

  const tasksKpi: Kpi = {
    key: 'tasks',
    label: 'Tasks routed',
    value: tasks > 0 ? tasks.toLocaleString('en-US') : null,
    note: tasks > 0
      ? 'counted by your own router, synced from your devices'
      : 'n/d - no routed task has reached your account yet',
    estimated: false,
  };

  const coverageKpi: Kpi = {
    key: 'local_coverage',
    label: 'Local coverage',
    value: frac == null ? null : `${Math.round(frac * 100)}%`,
    note: frac == null
      ? 'n/d - no tier breakdown synced yet; run `mooter sync`'
      : `${Math.round(frac * tasks).toLocaleString('en-US')} of ${tasks.toLocaleString('en-US')} tasks ran on your own hardware`,
    estimated: false,
  };

  // Window preserved: tasks that never touched a paid window. We count TASKS,
  // not tokens, because tokens are not measured yet - hence `estimated`.
  const preserved = frac == null ? null : Math.round(frac * tasks);
  const windowKpi: Kpi = {
    key: 'window_preserved',
    label: 'Window preserved (estimated)',
    value: preserved == null ? null : preserved.toLocaleString('en-US'),
    note: preserved == null
      ? 'n/d - needs a tier breakdown to know what stayed off your paid window'
      : 'estimated - tasks never dispatched to a paid window, counted as tasks, not tokens',
    estimated: true,
  };

  const esrKpi: Kpi = {
    key: 'esr',
    label: 'ESR',
    value: null,
    note: pairs > 0
      ? `n/d - needs ${MIN_MEASURED_PAIRS} tasks with tokens measured on both sides; you have ${pairs}`
      : `n/d - needs ${MIN_MEASURED_PAIRS} tasks with tokens measured on both sides; nothing measured yet`,
    estimated: false,
  };

  return [tasksKpi, coverageKpi, windowKpi, esrKpi];
}

/**
 * The one-line answer to "how much did I save?" (state C8 of the state map).
 * Kept here so the copy has exactly one home and the test can pin it.
 */
export const NO_SAVINGS_ANSWER =
  'We do not publish a savings number without tokens measured on both sides. What we do show: tasks routed, local coverage, window preserved.';
