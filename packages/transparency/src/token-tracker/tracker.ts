// Wave 32 (Phase C) — runtime glue for the inline token tracker.
//
// The tracker is OPT-IN: it emits a prefix only when MOOTER_INLINE_TRACKER=1
// (or the caller passes enabled:true). Off by default so existing command
// output and tests stay byte-stable.

import { formatPrefix, TrackInfo } from "./prefix-formatter.ts";
import { Tier, Backend } from "./color-coder.ts";

export function isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MOOTER_INLINE_TRACKER === "1" || env.MOOTER_INLINE_TRACKER === "true";
}

/** High-resolution elapsed-ms timer. */
export function startTimer(): () => number {
  const t0 = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - t0) / 1e6;
}

/**
 * Build the prefix line for a command run. A pure-local CLI command that calls
 * no model is honestly T0/local/0-tok/$0 — that is the accurate default, not a
 * placeholder.
 */
export function buildCommandPrefix(
  partial: Partial<TrackInfo> & { ms: number },
): string {
  const info: TrackInfo = {
    tier: (partial.tier as Tier) ?? "T0",
    backend: (partial.backend as Backend) ?? "local",
    model: partial.model ?? "local",
    ms: partial.ms,
    tokens: partial.tokens ?? 0,
    costUsd: partial.costUsd ?? 0,
  };
  return formatPrefix(info);
}

/**
 * Convenience wrapper: time a synchronous or async command, optionally emitting
 * the inline prefix to `write` when enabled. Returns the function's result. The
 * command may report its real tier/backend/tokens/cost by returning a
 * `{ track?: Partial<TrackInfo> }`-shaped object; otherwise the local default
 * applies.
 */
export async function withInlineTracker<T extends { track?: Partial<TrackInfo> } | unknown>(
  fn: () => T | Promise<T>,
  opts: { enabled?: boolean; write?: (s: string) => void } = {},
): Promise<T> {
  const enabled = opts.enabled ?? isEnabled();
  const write = opts.write ?? ((s: string) => process.stderr.write(s + "\n"));
  const stop = startTimer();
  const result = await fn();
  if (enabled) {
    const track = (result && typeof result === "object" && "track" in (result as any))
      ? ((result as any).track as Partial<TrackInfo>)
      : {};
    write(buildCommandPrefix({ ...track, ms: stop() }));
  }
  return result;
}
