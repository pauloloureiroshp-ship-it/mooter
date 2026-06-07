// Runnable CI gate entry (Wave 30 Phase F).
//
//   tsx src/ci/cli.ts gate <baseline.json> <current.json> [thresholdPp]
//
// Prints the PR-comment markdown to stdout and exits 1 if the current MLWR
// regressed past the threshold, 0 otherwise, 2 on usage error. The GitHub
// workflow captures stdout into a comment and uses the exit code as the gate.

import { readFileSync, existsSync } from "node:fs";
import { detectRegression } from "./regression-detect.ts";
import { formatPrComment } from "./pr-comment.ts";
import type { BenchmarkSummary } from "../types.ts";

function readSummary(p: string): BenchmarkSummary {
  return JSON.parse(readFileSync(p, "utf8")) as BenchmarkSummary;
}

const [cmd, basePath, curPath, thr] = process.argv.slice(2);

if (cmd !== "gate" || !basePath || !curPath || !existsSync(basePath) || !existsSync(curPath)) {
  process.stderr.write("usage: cli.ts gate <baseline.json> <current.json> [thresholdPp]\n");
  process.exit(2);
}

const base = readSummary(basePath);
const cur = readSummary(curPath);
const reg = detectRegression(base.mlwr, cur.mlwr, thr ? Number(thr) : 5);
process.stdout.write(formatPrComment(base, cur, reg) + "\n");
process.exit(reg.regressed ? 1 : 0);
