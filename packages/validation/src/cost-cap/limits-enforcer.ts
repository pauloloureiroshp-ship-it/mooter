// Cost-cap enforcement + anomaly detection (Wave 30 Phase J).
//
// The Workflow Engine's agent() consults `enforceSpawn` before spawning a cloud
// call. A breach throws LimitExceededError (engine surfaces it + a statusline
// alert). The clock is injected so the sliding T3-rate window is deterministic
// in tests.

import {
  type LimitsConfig,
  DEFAULT_LIMITS_CONFIG,
} from "./limits-config.ts";

export type LimitKind =
  | "workflow_cost"
  | "session_cost"
  | "t3_rate"
  | "concurrency";

export interface LimitViolation {
  kind: LimitKind;
  cap: number;
  observed: number;
  message: string;
}

export class LimitExceededError extends Error {
  readonly violation: LimitViolation;
  constructor(v: LimitViolation) {
    super(v.message);
    this.name = "LimitExceededError";
    this.violation = v;
  }
}

const FIVE_MIN_MS = 5 * 60 * 1000;

export interface EnforceSpawnInput {
  workflowId: string;
  estCostUsd?: number;
  /** Is the call about to spawn a T3/cloud-heavy call? Counts toward the rate window. */
  t3?: boolean;
  nowMs: number;
}

export class LimitsEnforcer {
  private readonly cfg: LimitsConfig;
  private sessionSpend = 0;
  private readonly workflowSpend = new Map<string, number>();
  private t3Times: number[] = [];
  private active = 0;

  constructor(cfg: LimitsConfig = DEFAULT_LIMITS_CONFIG) {
    this.cfg = cfg;
  }

  recordSpend(usd: number, opts: { workflowId?: string } = {}): void {
    const amount = Math.max(0, usd);
    this.sessionSpend += amount;
    if (opts.workflowId) {
      this.workflowSpend.set(opts.workflowId, (this.workflowSpend.get(opts.workflowId) ?? 0) + amount);
    }
  }

  recordT3Call(nowMs: number): void {
    this.t3Times.push(nowMs);
  }

  beginWorkflow(): void {
    this.active++;
  }
  endWorkflow(): void {
    this.active = Math.max(0, this.active - 1);
  }

  private pruneT3(nowMs: number): void {
    const cutoff = nowMs - FIVE_MIN_MS;
    this.t3Times = this.t3Times.filter((t) => t >= cutoff);
  }

  checkSessionSpend(addUsd = 0): LimitViolation | null {
    const observed = this.sessionSpend + Math.max(0, addUsd);
    const cap = this.cfg.limits.max_session_cost_usd;
    if (observed > cap) {
      return { kind: "session_cost", cap, observed, message: `session spend $${observed.toFixed(4)} exceeds cap $${cap.toFixed(2)}` };
    }
    return null;
  }

  checkWorkflowSpend(workflowId: string, addUsd = 0): LimitViolation | null {
    const observed = (this.workflowSpend.get(workflowId) ?? 0) + Math.max(0, addUsd);
    const cap = this.cfg.limits.max_workflow_cost_usd;
    if (observed > cap) {
      return { kind: "workflow_cost", cap, observed, message: `workflow ${workflowId} spend $${observed.toFixed(4)} exceeds cap $${cap.toFixed(2)}` };
    }
    return null;
  }

  checkT3Rate(nowMs: number): LimitViolation | null {
    this.pruneT3(nowMs);
    const observed = this.t3Times.length + 1; // include the call we're about to make
    const cap = this.cfg.limits.max_t3_calls_per_5min;
    if (observed > cap) {
      return { kind: "t3_rate", cap, observed, message: `${observed} T3 calls in 5min exceeds cap ${cap}` };
    }
    return null;
  }

  checkConcurrency(): LimitViolation | null {
    const observed = this.active + 1;
    const cap = this.cfg.limits.max_concurrent_workflows;
    if (observed > cap) {
      return { kind: "concurrency", cap, observed, message: `${observed} concurrent workflows exceeds cap ${cap}` };
    }
    return null;
  }

  /** Throws LimitExceededError on the first breach; records the T3 tick on success. */
  enforceSpawn(input: EnforceSpawnInput): void {
    const est = Math.max(0, input.estCostUsd ?? 0);
    const v =
      this.checkWorkflowSpend(input.workflowId, est) ??
      this.checkSessionSpend(est) ??
      (input.t3 ? this.checkT3Rate(input.nowMs) : null);
    if (v) throw new LimitExceededError(v);
    if (input.t3) this.recordT3Call(input.nowMs);
  }

  /** Snapshot for the Phase N statusline chip. */
  status(nowMs: number): {
    sessionSpend: number;
    sessionCap: number;
    t3InWindow: number;
    t3Cap: number;
    active: number;
    ok: boolean;
  } {
    this.pruneT3(nowMs);
    return {
      sessionSpend: Math.round(this.sessionSpend * 10000) / 10000,
      sessionCap: this.cfg.limits.max_session_cost_usd,
      t3InWindow: this.t3Times.length,
      t3Cap: this.cfg.limits.max_t3_calls_per_5min,
      active: this.active,
      ok: this.sessionSpend <= this.cfg.limits.max_session_cost_usd,
    };
  }
}

// ─── anomaly detection ──────────────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Anomaly {
  kind: "unusual_spend" | "provider_outage" | "lora_regression";
  detail: string;
}

/** Flag spend that is `factor`× the historical median (needs ≥ minSamples history). */
export function detectUnusualSpend(
  history: number[],
  current: number,
  factor = 3,
  minSamples = 5,
): Anomaly | null {
  if (history.length < minSamples) return null;
  const med = median(history);
  if (med <= 0) return null;
  if (current > factor * med) {
    return { kind: "unusual_spend", detail: `spend $${current.toFixed(4)} is ${(current / med).toFixed(1)}× the median $${med.toFixed(4)}` };
  }
  return null;
}

/** Flag a provider that returned errors on every recent attempt. */
export function detectProviderOutage(
  recentOutcomes: Array<{ provider: string; ok: boolean }>,
  minAttempts = 3,
): Anomaly | null {
  const byProvider = new Map<string, { total: number; fail: number }>();
  for (const o of recentOutcomes) {
    const e = byProvider.get(o.provider) ?? { total: 0, fail: 0 };
    e.total++;
    if (!o.ok) e.fail++;
    byProvider.set(o.provider, e);
  }
  for (const [provider, e] of byProvider) {
    if (e.total >= minAttempts && e.fail === e.total) {
      return { kind: "provider_outage", detail: `${provider} failed ${e.fail}/${e.total} recent calls` };
    }
  }
  return null;
}
