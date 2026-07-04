// scheduler.mjs — Fleet Commander · ① the Scheduler (quota of ATTENTION, not GPU).
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §4①. The scarce resource is the human's
// attention, not FLOPs. So this ranks loops by staleness × impact × hit-rate(measured)
// and hands out at most what the human can actually review:
//   • foreground preemption is ABSOLUTE — if the human is on the GPU, the fleet yields;
//   • a GLOBAL human-queue cap (≤5-7) — a full review queue PAUSES generation
//     (17 loops × 3 = 51 would be the "dump 50" the thesis condemns);
//   • a per-loop open-proposal cap (≤3);
//   • hit-rate is weighted by a Beta(1,1) prior so a cold-start loop sits at 0.5,
//     neither punished nor rewarded (reuses the Wave-30 Bandit idea).
//
// Pure + dependency-free. The Commander feeds it live gpu-snapshot + Ledger-derived
// loop stats; the ranking itself is a pure function, so it is trivially testable.

"use strict";

export const DEFAULT_CAPS = Object.freeze({ perLoopOpen: 3, globalHumanQueue: 6 });

function clamp01(x) { return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)); }

/**
 * Hit-rate with a Beta(1,1) (Laplace) prior — Thompson-style cold start.
 * measuredWins / measuredTotal count only proposals whose `measured` confirmed a
 * gain (H2), NOT mere approvals. With no history → (0+1)/(0+2) = 0.5.
 */
export function hitRateWithPrior(loop) {
  const wins = Math.max(0, loop?.measuredWins ?? 0);
  const total = Math.max(wins, loop?.measuredTotal ?? 0);
  return (wins + 1) / (total + 2);
}

/**
 * Priority = staleness(hours since last run) × impact(0..1) × hitRate. Higher runs
 * sooner. A loop that ships junk sinks on its own (hit-rate), with proof — never a
 * hand-tuned demotion.
 */
export function computePriority(loop, { now = 0 } = {}) {
  const last = Number.isFinite(loop?.lastRunAt) ? loop.lastRunAt : 0;
  const stalenessHours = Math.max(0, (now - last) / (60 * 60 * 1000));
  const impact = clamp01(loop?.impact ?? 0.5);
  return stalenessHours * impact * hitRateWithPrior(loop);
}

/**
 * Pick the next loop to run — or null with a reason. Order of gates matters: the
 * two "yield entirely" conditions (foreground, full queue) come first, THEN
 * eligibility, THEN priority ranking.
 *
 * ctx: { now, gpu:{ foregroundBusy }, humanQueueSize, caps }
 * @returns { pick, priority?, reason, ranked? }
 */
export function pickNext(loops, ctx = {}) {
  const { now = 0, gpu = null, humanQueueSize = 0, caps = DEFAULT_CAPS } = ctx;

  // The fleet lives on IDLE VRAM. If the human is on the GPU, we are invisible or we failed.
  if (gpu && gpu.foregroundBusy) {
    return { pick: null, reason: "foreground-preemption: GPU in use by the human" };
  }
  // A full review queue is the signal to STOP producing — protect the human's attention.
  if (humanQueueSize >= caps.globalHumanQueue) {
    return { pick: null, reason: `human queue full (${humanQueueSize}/${caps.globalHumanQueue}) — pause generation` };
  }

  const eligible = (Array.isArray(loops) ? loops : []).filter((l) =>
    l && l.state !== "paused" && l.state !== "suspended" && (l.openProposals ?? 0) < caps.perLoopOpen);
  if (!eligible.length) {
    return { pick: null, reason: "no eligible loop (all capped / paused / suspended)" };
  }

  const ranked = eligible
    .map((l) => ({ loop: l, priority: computePriority(l, { now }) }))
    .sort((a, b) => b.priority - a.priority);

  return { pick: ranked[0].loop, priority: ranked[0].priority, reason: "highest staleness×impact×hit-rate", ranked };
}
