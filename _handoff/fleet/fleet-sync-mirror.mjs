// fleet-sync-mirror.mjs — pure helpers to mirror the cronista DIGEST into SYNC.md.
//
// The fleet runs 24/7 in a worktree the project rarely opens. This mirror appends a
// compact, dated 5-line snapshot under a managed "## Fleet (auto)" section of the
// branch SYNC.md so a fresh session sees the fleet's pulse without cd-ing into the
// fleet worktree. Pure + idempotent: re-running replaces the managed block in place.
"use strict";

export const BEGIN = "<!-- fleet-auto:begin -->";
export const END = "<!-- fleet-auto:end -->";

// Compose the 5-line dated mirror block. Pure — every value is injected by the caller.
export function composeFleetMirror({
  date, iso, round, pillars, peakGpu, gpuCap,
  rounds, incidents, incoherences, wins, total, avoided, twoFactor,
}) {
  const tf = twoFactor == null ? "n/d" : twoFactor;
  return [
    `- **${date}** — cronista round ${round} · ${pillars} pillars · GPU peak ${peakGpu}/cap ${gpuCap}`,
    `- rounds (cumulative): ${rounds} · incidents: ${incidents} · incoherences now: ${incoherences}`,
    `- measured wins: ${wins}/${total} · est cloud tokens avoided: ${avoided} ($0, all local)`,
    `- open two-factor proposals (Paulo gate): ${tf}`,
    `- source: _handoff/fleet/cronista/DIGEST.md · updated ${iso}`,
  ].join("\n");
}

// Upsert the managed section into SYNC.md text. Idempotent by construction: the
// block lives between BEGIN/END markers; a re-run replaces exactly that span, so
// same-day re-runs produce identical text and never append duplicate sections.
export function upsertFleetSection(syncText, block) {
  const section = `${BEGIN}\n## Fleet (auto)\n\n${block}\n${END}`;
  const text = syncText || "";
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b !== -1 && e !== -1 && e > b) {
    return text.slice(0, b) + section + text.slice(e + END.length);
  }
  const sep = text.length === 0 ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return text + sep + section + "\n";
}
