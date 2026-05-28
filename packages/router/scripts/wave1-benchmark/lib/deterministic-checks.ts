// deterministic-checks.ts — objective correctness signals where feasible (§3.2, §D).
//
// These run BEFORE/alongside the judge. When a check applies and runs, its result
// is authoritative for correctness; otherwise correctness falls back to the judge
// (ran:false). Best-effort and never throws — a check that cannot run degrades to
// ran:false rather than failing the row.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import type { CorrectnessCheck, DeterministicResult } from "./types.ts";

const na = (detail: string): DeterministicResult => ({ ran: false, passed: null, kind: null, detail });

/** Pull the first fenced code block (optionally matching a language list). */
function extractCode(response: string, langs?: string[]): string | null {
  const re = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(response)) !== null) {
    const lang = (m[1] || "").toLowerCase();
    if (!langs || langs.length === 0 || langs.includes(lang)) return m[2];
  }
  // No fenced block matched the languages — fall back to first block of any lang.
  if (langs && langs.length) {
    const any = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/.exec(response);
    if (any) return any[1];
  }
  return null;
}

function checkRegexPresent(check: CorrectnessCheck, response: string): DeterministicResult {
  if (!check.pattern) return na("regex-present: no pattern");
  let re: RegExp;
  try {
    re = new RegExp(check.pattern, "i");
  } catch {
    return na(`regex-present: bad pattern ${check.pattern}`);
  }
  const passed = re.test(response);
  return { ran: true, passed, kind: "regex-present", detail: `/${check.pattern}/i → ${passed}${check.note ? " (" + check.note + ")" : ""}` };
}

function checkJsonValid(response: string): DeterministicResult {
  const code = extractCode(response, ["json"]) ?? response;
  try {
    JSON.parse(code.trim());
    return { ran: true, passed: true, kind: "json-valid", detail: "JSON.parse ok" };
  } catch (e) {
    return { ran: true, passed: false, kind: "json-valid", detail: `JSON.parse: ${(e as Error).message}` };
  }
}

function checkYamlLint(response: string): DeterministicResult {
  const code = extractCode(response, ["yaml", "yml"]) ?? response;
  try {
    yaml.load(code);
    return { ran: true, passed: true, kind: "yaml-lint", detail: "js-yaml load ok" };
  } catch (e) {
    return { ran: true, passed: false, kind: "yaml-lint", detail: `yaml: ${(e as Error).message}` };
  }
}

const MERMAID_HEADERS = [
  "graph", "flowchart", "sequencediagram", "classdiagram", "statediagram",
  "erdiagram", "journey", "gantt", "pie", "mindmap", "timeline", "c4context",
  "c4container", "c4component", "gitgraph", "quadrantchart",
];

/** Lightweight Mermaid sniff: a fenced mermaid block that opens with a known
 *  diagram header and has balanced brackets. Full render needs a browser (§D). */
function checkMermaidSyntax(response: string): DeterministicResult {
  const code = extractCode(response, ["mermaid"]);
  if (!code) return na("mermaid-syntax: no ```mermaid block");
  const firstLine = code.trim().split(/\s|\n/)[0]?.toLowerCase() ?? "";
  const headerOk = MERMAID_HEADERS.some((h) => firstLine.startsWith(h));
  const balanced =
    [...code].reduce((a, c) => a + (c === "[" ? 1 : c === "]" ? -1 : 0), 0) === 0 &&
    [...code].reduce((a, c) => a + (c === "(" ? 1 : c === ")" ? -1 : 0), 0) === 0;
  const passed = headerOk && balanced;
  return {
    ran: true,
    passed,
    kind: "mermaid-syntax",
    detail: `header=${firstLine || "∅"} headerOk=${headerOk} balanced=${balanced}`,
  };
}

/** Best-effort TS syntax/type check via tsc if locally available; else degrade. */
function checkTsCompile(response: string): DeterministicResult {
  const code = extractCode(response, ["ts", "tsx", "typescript"]);
  if (!code) return na("ts-compile: no ```ts block");
  let dir = "";
  try {
    dir = mkdtempSync(join(tmpdir(), "bench-ts-"));
    const file = join(dir, "snippet.tsx");
    writeFileSync(file, code, "utf8");
    try {
      execFileSync(
        "npx",
        ["--no-install", "tsc", "--noEmit", "--skipLibCheck", "--strict", "false", "--jsx", "react-jsx", "--moduleResolution", "bundler", "--module", "esnext", "--target", "es2022", file],
        { encoding: "utf8", timeout: 60_000, stdio: "pipe" },
      );
      return { ran: true, passed: true, kind: "ts-compile", detail: "tsc --noEmit ok" };
    } catch (e) {
      const msg = (e as { stdout?: string; message?: string }).stdout || (e as Error).message || "";
      if (/not found|could not determine executable|tsc: command not found/i.test(msg)) {
        return na("ts-compile: tsc unavailable → judge fallback");
      }
      return { ran: true, passed: false, kind: "ts-compile", detail: `tsc errors: ${msg.slice(0, 300)}` };
    }
  } catch {
    return na("ts-compile: could not run");
  } finally {
    if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function runDeterministicCheck(
  check: CorrectnessCheck | null,
  response: string,
): DeterministicResult | null {
  if (!check) return null;
  switch (check.kind) {
    case "regex-present": return checkRegexPresent(check, response);
    case "json-valid": return checkJsonValid(response);
    case "yaml-lint": return checkYamlLint(response);
    case "mermaid-syntax": return checkMermaidSyntax(response);
    case "ts-compile": return checkTsCompile(response);
    default: return na(`unknown check kind ${(check as { kind: string }).kind}`);
  }
}
