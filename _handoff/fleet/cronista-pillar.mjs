#!/usr/bin/env node
// cronista-pillar.mjs — the Fleet's chronicler round (FASE3 F1).
//
// A `runPillar` for the "cronista" loop. Each round it READS every pillar's
// STATE/ledger/OUTBOX/DECISIONS, verifies fleet-wide invariants, and pre-bakes the
// artefacts a human (or a fresh session) needs BEFORE they need them:
//   • cronista/DIGEST.md          — one executive view of the whole fleet.
//   • <pillar>/HANDOFF_NEXT.md    — a resume-ready handoff per roster pillar.
//
// It NEVER corrects another pillar's work — it only reports (charter: "report only,
// never fix"). Destructive intent (archiving legacy masterprompts, etc.) is a
// PROPOSAL line in DECISIONS.md, never an action (two-factor).
//
// Invariants checked (all $0, deterministic — no LLM judgment where arithmetic will do):
//   1. classify.js sha == the CI-frozen constant.
//   2. observed GPU peak (heartbeat) <= gpuHeavyConcurrent cap.
//   3. every pillar ledger line parses and carries {ts,pillar,event}.
//   4. no pillar is stalled (>2 rounds behind the fleet max while active).
//   5. U2: re-verify ONE recent quantitative claim by re-deriving it from the raw
//      token counts on the same ledger line (a moo grading its own arithmetic).

"use strict";

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJSON } from "./local-pillar.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const FLEET_DIR = HERE;

// The CI-enforced freeze (Mooter hard invariant). A mismatch is a fleet-stopping
// incoherence, reported — never patched here.
const CLASSIFY_SHA = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f";

function abs(p) { return isAbsolute(p) ? p : resolve(REPO, p); }
function readJSON(path, fallback) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; } }
function readText(path) { try { return readFileSync(path, "utf8"); } catch { return ""; } }
function ledgerLines(path) {
  const t = readText(path);
  if (!t) return [];
  return t.trim().split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { __bad: l }; } });
}

function sha256(path) {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); } catch { return null; }
}

// Gather a compact, honest snapshot of one pillar from disk.
function snapshotPillar(p) {
  const dir = abs(p.workdir);
  const state = readJSON(join(dir, "STATE.json"), {});
  const lines = ledgerLines(join(dir, "ledger.jsonl"));
  const rounds = lines.filter((l) => l.event === "round");
  const last = rounds[rounds.length - 1] || null;
  const policy = readJSON(join(dir, "STANDING_POLICY.json"), {});
  const badLines = lines.filter((l) => l.__bad || !l.ts || !l.pillar || !l.event).length;
  const avoided = rounds
    .map((l) => (typeof l.est_cloud_tokens_avoided === "number" ? l.est_cloud_tokens_avoided : 0))
    .reduce((a, b) => a + b, 0);
  return {
    id: p.id, dir, policy, state,
    round: Number(state.round) || 0,
    wins: Number(state.measuredWins) || 0,
    total: Number(state.measuredTotal) || 0,
    lastRunTs: state.last_run_ts || null,
    incidents: lines.filter((l) => l.event === "incident").length,
    lastAvoided: last ? last.est_cloud_tokens_avoided : "n/d",
    sumAvoided: avoided,
    badLines,
    last,
    charter: policy.charter || "",
    success: Array.isArray(policy.success_criteria) ? policy.success_criteria.join(" · ") : "",
  };
}

// U2: re-derive the last numeric est_cloud_tokens_avoided from its own token counts.
export function u2Reverify(snaps) {
  for (let i = snaps.length - 1; i >= 0; i--) {
    const l = snaps[i].last;
    if (l && typeof l.est_cloud_tokens_avoided === "number" && (l.prompt_tokens != null || l.eval_tokens != null)) {
      const derived = (l.prompt_tokens || 0) + (l.eval_tokens || 0);
      return { pillar: snaps[i].id, round: l.round, claimed: l.est_cloud_tokens_avoided, derived, ok: derived === l.est_cloud_tokens_avoided };
    }
  }
  return null;
}

export async function cronistaPillar(loop, { now } = {}) {
  const clock = now || (() => Date.now());
  const iso = () => new Date(clock()).toISOString();
  const fleet = readJSON(join(FLEET_DIR, "fleet.json"), { pillars: [], caps: {} });
  const others = (fleet.pillars || []).filter((p) => p.id !== "cronista");
  const snaps = others.map(snapshotPillar);

  const incoherences = [];

  // 1 · classify freeze
  const sha = sha256(abs("tools/router/classify.js"));
  const shaOk = sha === CLASSIFY_SHA;
  if (!shaOk) incoherences.push(`classify.js sha mismatch (${sha || "unreadable"} != frozen)`);

  // 2 · GPU cap vs observed peak
  const heartbeat = readJSON(join(FLEET_DIR, "fleet-heartbeat.json"), {});
  const gpuCap = fleet.caps?.gpuHeavyConcurrent ?? 1;
  const peakGpu = Number(heartbeat.summary_peakGpu) || 0;
  const gpuOk = peakGpu <= gpuCap;
  if (!gpuOk) incoherences.push(`gpu peak ${peakGpu} > cap ${gpuCap}`);

  // 3 · ledger schema
  const badTotal = snaps.reduce((a, s) => a + s.badLines, 0);
  if (badTotal > 0) incoherences.push(`${badTotal} malformed ledger line(s) across ${snaps.filter((s) => s.badLines).map((s) => s.id).join(", ")}`);

  // 4 · stalled pillars
  const maxRound = snaps.reduce((m, s) => Math.max(m, s.round), 0);
  const stalled = snaps.filter((s) => s.round > 0 && maxRound - s.round > 2 && s.state.status !== "paused");
  for (const s of stalled) incoherences.push(`pillar '${s.id}' stalled: round ${s.round} vs fleet max ${maxRound}`);

  // 5 · U2 re-verification
  const u2 = u2Reverify(snaps);
  if (u2 && !u2.ok) incoherences.push(`U2: ${u2.pillar} r${u2.round} est_avoided ${u2.claimed} != derived ${u2.derived}`);

  const totals = {
    rounds: snaps.reduce((a, s) => a + s.round, 0),
    wins: snaps.reduce((a, s) => a + s.wins, 0),
    total: snaps.reduce((a, s) => a + s.total, 0),
    avoided: snaps.reduce((a, s) => a + s.sumAvoided, 0),
    incidents: snaps.reduce((a, s) => a + s.incidents, 0),
  };

  // ── DIGEST.md (executive) ──
  const rows = snaps
    .map((s) => `| ${s.id} | ${s.round} | ${s.wins}/${s.total} | ${s.lastAvoided} | ${s.lastRunTs || "—"} | ${s.state.status || "cold"} |`)
    .join("\n");
  const digest =
    `# Cronista DIGEST — ${iso()}\n\n` +
    `**Fleet:** ${snaps.length} pillars · rounds ${totals.rounds} · measured wins ${totals.wins}/${totals.total} · ` +
    `est cloud tokens avoided ${totals.avoided} · incidents ${totals.incidents}\n\n` +
    `**GPU (heartbeat):** peakGpu ${peakGpu} / cap ${gpuCap} · last round ${heartbeat.round ?? "—"} · dry_run ${heartbeat.dry_run ?? "—"}\n\n` +
    `## Per pillar\n\n| pillar | round | wins/total | last est_avoided | last_run | status |\n|---|---|---|---|---|---|\n${rows}\n\n` +
    `## Invariants\n` +
    `- classify.js sha: ${shaOk ? "OK" : "**MISMATCH**"}\n` +
    `- gpu cap: ${gpuOk ? `OK (peak ${peakGpu} ≤ ${gpuCap})` : `**VIOLATION** (peak ${peakGpu} > ${gpuCap})`}\n` +
    `- ledger schema: ${badTotal === 0 ? "OK" : `**${badTotal} bad line(s)**`}\n` +
    `- stalled: ${stalled.length === 0 ? "none" : `**${stalled.map((s) => s.id).join(", ")}**`}\n` +
    `- U2 re-verify: ${u2 ? `${u2.pillar} r${u2.round} claimed ${u2.claimed} vs derived ${u2.derived} → ${u2.ok ? "OK" : "**MISMATCH**"}` : "n/d (no numeric claim yet)"}\n\n` +
    `## Incoherences (report-only — the fleet never auto-fixes another pillar)\n` +
    `${incoherences.length ? incoherences.map((i) => `- ${i}`).join("\n") : "- none"}\n`;
  try { writeFileSync(join(FLEET_DIR, "DIGEST.md"), digest); } catch { /* digest is advisory */ }

  // ── HANDOFF_NEXT.md per roster pillar (pre-baked, resume-ready) ──
  for (const s of snaps) {
    if (s.state.status === "paused") continue;
    const outboxTail = readText(join(s.dir, "OUTBOX.md")).slice(-800);
    const handoff =
      `# HANDOFF — ${s.id} (pre-baked ${iso()})\n\n` +
      `**Round:** ${s.round} · wins ${s.wins}/${s.total} · incidents ${s.incidents}\n\n` +
      `**Charter:** ${s.charter || "(none)"}\n\n` +
      `**Success criterion:** ${s.success || "(none)"}\n\n` +
      `**Last artefact (OUTBOX tail):**\n\n${outboxTail || "(none yet)"}\n\n` +
      `**Resume:** fresh session → \`FLEET_MAX_ROUNDS=1 node _handoff/fleet/fleet-local-launch.mjs\`. ` +
      `STATE.json + ledger.jsonl on disk are authoritative (crash-only); nothing lives only in a process.\n`;
    try { writeFileSync(join(s.dir, "HANDOFF_NEXT.md"), handoff); } catch { /* handoff is advisory */ }
  }

  // ── cronista's own ledger + STATE ──
  const cronDir = FLEET_DIR + "/cronista";
  const prev = readJSON(join(cronDir, "STATE.json"), {});
  const round = (Number(prev.round) || 0) + 1;
  try {
    appendFileSync(join(cronDir, "ledger.jsonl"), JSON.stringify({
      ts: iso(), pillar: "cronista", round, event: "round", engine: "cronista-local",
      quota_source: "local-$0", delta: "n/d",
      pillars_seen: snaps.length, incoherences: incoherences.length,
      u2_ok: u2 ? u2.ok : "n/d",
    }) + "\n");
  } catch { /* never crash the fleet */ }
  try {
    atomicWriteJSON(join(cronDir, "STATE.json"), {
      ...prev, status: "active", pillar: "cronista", round,
      last_run_ts: iso(), sessionId: `fleet-r${round}-cronista`,
      measuredWins: (Number(prev.measuredWins) || 0) + (incoherences.length === 0 ? 1 : 0),
      measuredTotal: (Number(prev.measuredTotal) || 0) + 1,
      updated_at: iso(),
    });
  } catch { /* state advisory */ }

  // ── proposal (qualitative — reports harmony; passes the gate via honesty section) ──
  const body =
    `## Cronista round ${round} — fleet coherence report\n\n` +
    `${snaps.length} pillars, ${totals.rounds} rounds, ${incoherences.length} incoherence(s). See DIGEST.md.\n\n` +
    `### o que NÃO verifiquei / pode falhar se\n` +
    `- Só verifiquei o que está no disco (STATE/ledger/heartbeat); ` +
    `pode falhar se um pilar escreveu estado corrompido entre a minha leitura e a ronda dele, ` +
    `ou se o heartbeat estiver atrasado. Não corrijo nada — só reporto.\n`;
  return {
    proposal: { id: `prop-cronista-r${round}`, state: "drafted", reversible: true, run_event_id: `run-cronista-r${round}`, body, claims: [] },
    events: [],
    engine: "cronista-local",
    costUsd: 0,
    gpuMinutes: 0,
  };
}

export default cronistaPillar;
