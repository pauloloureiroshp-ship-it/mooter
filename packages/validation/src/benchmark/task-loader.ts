// Benchmark task loader + objective grader (Wave 30 Phase L).

import { existsSync, readFileSync } from "node:fs";
import type { Tier } from "../types.ts";

export interface CorrectnessCheck {
  kind: "regex-present" | "regex-absent" | "contains-any";
  pattern?: string;
  any?: string[];
  note?: string;
}

export interface BenchmarkTask {
  id: string;
  segment: string;
  tier: Tier;
  prompt: string;
  check?: CorrectnessCheck;
}

export interface BenchmarkTaskSet {
  version: number;
  note?: string;
  tasks: BenchmarkTask[];
}

export function loadTasks(path: string): BenchmarkTaskSet {
  if (!existsSync(path)) throw new Error(`task set not found: ${path}`);
  const set = JSON.parse(readFileSync(path, "utf8")) as BenchmarkTaskSet;
  const v = validateTaskSet(set);
  if (!v.ok) throw new Error(`invalid task set: ${v.errors.join("; ")}`);
  return set;
}

export function validateTaskSet(set: BenchmarkTaskSet): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!set || !Array.isArray(set.tasks)) {
    return { ok: false, errors: ["tasks must be an array"] };
  }
  const ids = new Set<string>();
  for (const t of set.tasks) {
    if (!t.id) errors.push("task missing id");
    if (ids.has(t.id)) errors.push(`duplicate id ${t.id}`);
    ids.add(t.id);
    if (!t.prompt) errors.push(`${t.id}: missing prompt`);
    if (!["T0", "T1", "T2", "T3"].includes(t.tier)) errors.push(`${t.id}: bad tier ${t.tier}`);
  }
  return { ok: errors.length === 0, errors };
}

export interface GradeResult {
  pass: boolean;
  reason: string;
}

/** Objective grade of a model output against a task's correctness check. */
export function gradeOutput(output: string, check?: CorrectnessCheck): GradeResult {
  if (!check) return { pass: true, reason: "no objective check (defer to judge)" };
  const text = output ?? "";
  switch (check.kind) {
    case "regex-present": {
      if (!check.pattern) return { pass: false, reason: "regex-present: no pattern" };
      const ok = new RegExp(check.pattern, "im").test(text);
      return { pass: ok, reason: ok ? `matched /${check.pattern}/` : `did not match /${check.pattern}/` };
    }
    case "regex-absent": {
      if (!check.pattern) return { pass: false, reason: "regex-absent: no pattern" };
      const present = new RegExp(check.pattern, "im").test(text);
      return { pass: !present, reason: present ? `unexpectedly matched /${check.pattern}/` : "absent as required" };
    }
    case "contains-any": {
      const any = check.any ?? [];
      const lower = text.toLowerCase();
      const hit = any.find((s) => lower.includes(s.toLowerCase()));
      return { pass: !!hit, reason: hit ? `contains "${hit}"` : `none of ${JSON.stringify(any)}` };
    }
    default:
      return { pass: false, reason: `unknown check kind` };
  }
}
