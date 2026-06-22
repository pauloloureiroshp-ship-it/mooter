// Deterministic graders for the Council Quality Eval — NO LLM, pure + side-effect-free
// (except gradeByExecution, which runs the model's Python against fixed assertions).
// Split out from quality-eval.ts so the grading logic is unit-tested in the council suite
// without calling any model. Hygiene: the verifiable subset is graded HERE, never by a judge.

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GradeItem {
  id: string;
  verifiable: boolean;
  grading: string;
  ground_truth?: string;
}

const lc = (s: string) => (s || "").toLowerCase();
const norm = (s: string) => lc(s).replace(/\s+/g, " ").trim();

/** First yes/no polarity asserted (first hit, so a "yes/no" menu doesn't fool it). */
export function polarity(answer: string): "yes" | "no" | null {
  const m = lc(answer).match(/\b(yes|no)\b/);
  return m ? (m[1] as "yes" | "no") : null;
}
export function allNumbers(answer: string): string[] {
  return (answer.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => x.replace(/,/g, ""));
}
export const REFUSAL_MARKERS = [
  "cannot", "can't", "not a known", "no data", "unable", "do not have", "don't have",
  "cannot be determined", "insufficient", "not enough information", "made up", "fictional",
  "not a real", "no such", "not exist", "not possible to", "unknown", "i don't know",
];

/** Tiny boolean grammar for `contains:` specs. Leaves = phrases (case-insensitive
 *  substring); UPPERCASE AND/OR + parens are operators (AND binds tighter than OR); a
 *  leaf with lowercase " or " / "/" is an OR-of-alternatives; "mentions" is a noise word. */
export function evalContains(expr: string, answer: string): boolean {
  const hay = lc(answer);
  const toks: string[] = [];
  let buf = "";
  const flush = () => { if (buf.trim()) toks.push(buf.trim()); buf = ""; };
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(" || ch === ")") { flush(); toks.push(ch); continue; }
    if (expr.slice(i, i + 5) === " AND ") { flush(); toks.push("AND"); i += 4; continue; }
    if (expr.slice(i, i + 4) === " OR ") { flush(); toks.push("OR"); i += 3; continue; }
    buf += ch;
  }
  flush();
  let pos = 0;
  const peek = () => toks[pos];
  const leafMatch = (leaf: string): boolean => {
    const cleaned = leaf.replace(/\bmentions\b/gi, " ").trim();
    const alts = cleaned.split(/\s+or\s+|\//i).map((a) => a.trim()).filter(Boolean);
    return alts.some((a) => hay.includes(lc(a)));
  };
  const parseExpr = (): boolean => {
    let v = parseTerm();
    while (peek() === "OR") { pos++; const r = parseTerm(); v = v || r; }
    return v;
  };
  const parseTerm = (): boolean => {
    let v = parseFactor();
    while (peek() === "AND") { pos++; const r = parseFactor(); v = v && r; }
    return v;
  };
  const parseFactor = (): boolean => {
    if (peek() === "(") { pos++; const v = parseExpr(); if (peek() === ")") pos++; return v; }
    const leaf = peek(); pos++; return leaf ? leafMatch(leaf) : false;
  };
  return parseExpr();
}

/** Extract the model's code (first fenced block, else raw text). */
export function extractCode(answer: string): string {
  const m = answer.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  return (m ? m[1] : answer).trim();
}

export const PY_ASSERTIONS: Record<string, string> = {
  c01: "assert add(2,3)==5 and add(-1,1)==0",
  c02: "assert is_palindrome('A man, a plan, a canal: Panama')==True and is_palindrome('race a car')==False",
  c05: "assert fizzbuzz(15)=='FizzBuzz' and fizzbuzz(9)=='Fizz' and fizzbuzz(10)=='Buzz' and fizzbuzz(7)=='7'",
  c08: "assert dedup([3,1,3,2,1])==[3,1,2]",
};

/** Run the model's Python against the item's fixed assertions. true=pass, false=fail,
 *  null=not auto-executable (no assertions / python missing). */
export function gradeByExecution(id: string, answer: string): boolean | null {
  const assertions = PY_ASSERTIONS[id];
  if (!assertions) return null;
  const code = extractCode(answer);
  if (!code) return false;
  const dir = mkdtempSync(join(tmpdir(), "council-exec-"));
  const file = join(dir, "t.py");
  try {
    writeFileSync(file, code + "\n" + assertions + "\nprint('PASS')\n");
    const out = execFileSync("python", [file], { timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }).toString();
    return out.includes("PASS");
  } catch {
    return false;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** Deterministic correctness for a verifiable item. null = not auto-gradable here. */
export function gradeVerifiable(item: GradeItem, answer: string): boolean | null {
  const g = item.grading;
  const gt = item.ground_truth ?? "";
  if (g === "exact_number") return allNumbers(answer).includes(allNumbers(gt)[0]);
  if (g === "exact_yesno" || g === "yesno_plus_reason") return polarity(answer) === polarity(gt);
  if (g === "exact_yesno_no") return polarity(answer) === "no";
  if (g === "exact_fraction") {
    const want = (gt.match(/\d+\s*\/\s*\d+/) ?? [""])[0].replace(/\s/g, "");
    const hay = answer.replace(/\s/g, "");
    if (want && hay.includes(want)) return true;
    const [a, b] = want.split("/").map(Number);
    if (a && b) { const dec = (a / b).toFixed(3); return answer.includes(dec) || answer.includes(dec.replace(/0+$/, "")); }
    return false;
  }
  if (g === "exact_label") return norm(answer).includes(norm(gt));
  if (g === "set_match") {
    const opts = gt.match(/\b[A-E]\b/g) ?? [];
    return opts.length > 0 && opts.every((o) => new RegExp(`\\b${o}\\b`).test(answer));
  }
  if (g === "refusal_correct") return REFUSAL_MARKERS.some((m) => lc(answer).includes(m));
  if (g.startsWith("contains:")) return evalContains(g.slice("contains:".length), answer);
  if (g.startsWith("test:")) return gradeByExecution(item.id, answer);
  return null;
}

/** Wilson score interval for a binomial proportion (95% by default). */
export function wilson(successes: number, n: number, z = 1.96): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 0, p: 0 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { lo: Math.max(0, (center - margin) / d), hi: Math.min(1, (center + margin) / d), p };
}
