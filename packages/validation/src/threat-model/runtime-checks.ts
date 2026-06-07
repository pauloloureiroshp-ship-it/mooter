// Runtime threat-vector probes (Wave 30 Phase I).
//
// Lightweight, local, deterministic checks that surface the most actionable
// threat-model findings (see docs/security/THREAT_MODEL.md). Each probe is pure
// over its inputs so it is unit-testable; `runtimeThreatProbes` gathers the
// machine-local ones from ~/.mooter. Probes NEVER auto-remediate — they report.

import { statSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { mooterPath } from "../../../synthesis/src/config.ts";
import { EXPECTED_CLASSIFY_SHA } from "../../../synthesis/src/state/central-state.ts";

export type ProbeStatus = "ok" | "warn" | "fail";
export type ProbeSeverity = "low" | "medium" | "high";

export interface ProbeResult {
  id: string;
  vector: string;
  severity: ProbeSeverity;
  status: ProbeStatus;
  detail: string;
}

/** Vector 1/doctrine: classify.js integrity. */
export function probeClassifySha(actualSha: string | null): ProbeResult {
  if (!actualSha) {
    return { id: "classify-sha", vector: "doctrine-gate", severity: "high", status: "warn", detail: "classify.js not located" };
  }
  const ok = actualSha === EXPECTED_CLASSIFY_SHA;
  return {
    id: "classify-sha",
    vector: "doctrine-gate",
    severity: "high",
    status: ok ? "ok" : "fail",
    detail: ok ? "classify.js sha intact" : "classify.js sha MISMATCH — doctrine gate tampered",
  };
}

/** Vector 3: secret-file permissions (group/other-readable is a leak risk). */
export function probeSecretPerms(path: string): ProbeResult {
  const id = `perms:${basename(path)}`;
  if (!existsSync(path)) {
    return { id, vector: "hub-token", severity: "high", status: "ok", detail: "absent" };
  }
  const mode = statSync(path).mode & 0o777;
  const leaky = (mode & 0o077) !== 0;
  return {
    id,
    vector: "hub-token",
    severity: "high",
    status: leaky ? "warn" : "ok",
    detail: leaky ? `group/other-readable (mode 0${mode.toString(8)})` : `0${mode.toString(8)}`,
  };
}

/** Vector 1: explicit telemetry consent (no silent data flow). */
export function probeTelemetryConsent(consent: unknown): ProbeResult {
  const c = consent as { telemetry?: boolean; accepted?: boolean } | null;
  const explicit = !!c && (typeof c.telemetry === "boolean" || typeof c.accepted === "boolean");
  return {
    id: "telemetry-consent",
    vector: "privacy",
    severity: "medium",
    status: explicit ? "ok" : "warn",
    detail: explicit ? "consent recorded explicitly" : "no explicit consent record (telemetry stays off)",
  };
}

export interface ProbeSummary {
  worst: ProbeStatus;
  failures: number;
  warnings: number;
  results: ProbeResult[];
}

const RANK: Record<ProbeStatus, number> = { ok: 0, warn: 1, fail: 2 };

export function summarizeProbes(results: ProbeResult[]): ProbeSummary {
  let worst: ProbeStatus = "ok";
  let failures = 0;
  let warnings = 0;
  for (const r of results) {
    if (RANK[r.status] > RANK[worst]) worst = r.status;
    if (r.status === "fail") failures++;
    else if (r.status === "warn") warnings++;
  }
  return { worst, failures, warnings, results };
}

export interface RuntimeProbeOptions {
  /** sha256 of the live classify.js (caller computes; lets the probe stay path-agnostic). */
  classifySha?: string | null;
  /** consent.json contents, if already read. */
  consent?: unknown;
  /** secret files to perm-check; defaults to the known ~/.mooter secrets. */
  secretFiles?: string[];
}

/** Gather the machine-local probes into one summary. */
export function runtimeThreatProbes(opts: RuntimeProbeOptions = {}): ProbeSummary {
  const secretFiles = opts.secretFiles ?? [
    mooterPath(".telemetry_secret"),
    mooterPath("auth.json"),
    mooterPath("credentials.json"),
  ];
  const results: ProbeResult[] = [
    probeClassifySha(opts.classifySha ?? null),
    ...secretFiles.map((f) => probeSecretPerms(f)),
    probeTelemetryConsent(opts.consent ?? null),
  ];
  return summarizeProbes(results);
}
