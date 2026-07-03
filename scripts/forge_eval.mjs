#!/usr/bin/env node
// Adapter Forge — F4 gate: adapter-vs-base measured A/B ($0, local Ollama, no cloud).
//
// Closes the measurement loop of docs/strategy/ADAPTER_FORGE.md §5 Fase 4 / §6 AF-05/AF-03:
//   - verifiable items → graded DETERMINISTICALLY (gabarito), NEVER by an LLM.
//   - open items       → BLIND PAIRWISE judge, order randomized BOTH ways, CROSS-VENDOR
//                        (a different model family than base/candidate → no self-preference).
//   - per-SLICE gate (AF-05): fail if ANY capability slice regresses > ε (not the mean).
//   - Wilson score CI on every proportion.
// Methodology mirrors the council harness (frugal-council quality-eval.ts / quality-grade.ts).
//
// NULL-CALIBRATION (the $0 proof with no trained adapter): run base == candidate.
// A sound harness returns delta ≈ 0 and open win-share ≈ 0.5 → it does not fabricate gain.
//
//   node scripts/forge_eval.mjs --base=qwen2.5-coder:7b --null-calibration --limit=6
//   node scripts/forge_eval.mjs --base=qwen2.5-coder:7b --candidate=<adapter> --judge=gemma3:12b
//
// $0: inference only on local Ollama. CC never runs training. classify.js untouched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// ───────────────────────── pure helpers (unit-tested, no I/O) ─────────────────────────
const lc = (s) => (s || '').toLowerCase();
const norm = (s) => lc(s).replace(/\s+/g, ' ').trim();

/** Deterministic correctness for a verifiable golden item. null = not auto-gradable. */
export function gradeVerifiable(item, answer) {
  const g = item.grading;
  const gt = item.ground_truth ?? '';
  if (g === 'exact') {
    const a = norm(answer), want = norm(gt);
    // yes/no gabarito: first-polarity — a trailing waffle ("yes, but actually no")
    // can't flip the first assertion, and "no" never matches inside "know"/"cannot".
    if (want === 'yes' || want === 'no') {
      const m = a.match(/\b(yes|no)\b/);
      return m ? m[1] === want : false;
    }
    // fraction gabarito: tolerate prose + whitespace ("the answer is 3/10.")
    const frac = (gt.match(/\d+\s*\/\s*\d+/) ?? [''])[0].replace(/\s/g, '');
    if (frac) return answer.replace(/\s/g, '').includes(frac);
    // else: WORD-BOUNDARY anchored containment — no short-substring false positives
    // (the false-PASS risk a ship-gate must never take). See pre-push review nit.
    const esc = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return want ? new RegExp(`(^|\\W)${esc}(\\W|$)`, 'i').test(a) : false;
  }
  if (g === 'json_equal') {
    const m = answer.match(/\{[\s\S]*\}/);
    if (!m) return false;
    try { return JSON.stringify(sortKeys(JSON.parse(m[0]))) === JSON.stringify(sortKeys(JSON.parse(gt))); }
    catch { return false; }
  }
  return null; // rubric-only / unknown → treated as open
}
function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]));
  return o;
}

/** Wilson score interval for a binomial proportion (95% by default). */
export function wilson(successes, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 0, p: 0 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { lo: Math.max(0, (center - margin) / d), hi: Math.min(1, (center + margin) / d), p };
}

const RUBRIC_PREFACE =
  'You are an impartial judge. Compare two answers to the same question. Judge ONLY by ' +
  'correctness, soundness, and usefulness. LENGTH-NEUTRAL: a concise correct answer must ' +
  'NOT be penalised for being shorter, and verbosity must NOT be rewarded. Ignore style and ' +
  "formatting. If they are equally good, say tie. End your reply with exactly one line: " +
  "'VERDICT: 1' or 'VERDICT: 2' or 'VERDICT: tie'.";

export function parseVerdict(text) {
  const m = (text || '').match(/VERDICT:\s*(1|2|tie)/i);
  if (m) return m[1].toLowerCase();
  const t = (text || '').trim().toLowerCase();
  if (/\btie\b/.test(t.slice(-20))) return 'tie';
  const last = (t.match(/\b(1|2)\b/g) ?? []).pop();
  return last ?? null;
}

/** Blind pairwise judge, BOTH orders → 'B' (candidate) / 'A' (base) / 'tie'.
 *  judgeFn(prompt) => Promise<string> is injected (Ollama in prod, a fake in tests). */
export async function judgePairwise(question, rubric, ansA, ansB, judgeFn) {
  const once = async (r1, r2) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const out = await judgeFn(`${RUBRIC_PREFACE}\n\nRUBRIC for a good answer: ${rubric}\n\nQUESTION:\n${question}\n\n--- Response 1 ---\n${r1}\n\n--- Response 2 ---\n${r2}\n\nWhich response is better?`);
      const v = parseVerdict(out);
      if (v !== null) return v;
    }
    return null;
  };
  const o1 = await once(ansA, ansB); // Response1=A, Response2=B
  const o2 = await once(ansB, ansA); // Response1=B, Response2=A
  const map1 = o1 === '1' ? 'A' : o1 === '2' ? 'B' : o1 === 'tie' ? 'tie' : null;
  const map2 = o2 === '1' ? 'B' : o2 === '2' ? 'A' : o2 === 'tie' ? 'tie' : null;
  const score = (m) => (m === 'B' ? 1 : m === 'A' ? -1 : 0);
  const s = score(map1) + score(map2);
  return { verdict: s > 0 ? 'B' : s < 0 ? 'A' : 'tie', order1: map1, order2: map2 };
}

// ───────────────────────── orchestrator (I/O injected) ─────────────────────────
/** generate(model, prompt)=>Promise<{text,error}>, judgeFn(prompt)=>Promise<string>. */
export async function runEval(items, { base, candidate, generate, judgeFn, epsilon = 0.0 }) {
  const rows = [];
  for (const item of items) {
    const [a, b] = await Promise.all([generate(base, item.prompt), generate(candidate, item.prompt)]);
    const row = { id: item.id, capability: item.capability, verifiable: !!item.verifiable };
    if (item.verifiable) {
      row.correctA = gradeVerifiable(item, a.text);
      row.correctB = gradeVerifiable(item, b.text);
    } else {
      const pj = await judgePairwise(item.prompt, item.rubric ?? 'correctness and usefulness', a.text, b.text, judgeFn);
      row.verdict = pj.verdict; // 'B' candidate wins / 'A' base wins / 'tie'
    }
    rows.push(row);
  }
  return aggregate(rows, { epsilon });
}

export function aggregate(rows, { epsilon = 0.0 } = {}) {
  const ver = rows.filter((r) => r.verifiable && r.correctA !== null && r.correctB !== null);
  const open = rows.filter((r) => !r.verifiable && r.verdict);
  const accA = ver.length ? ver.filter((r) => r.correctA).length / ver.length : 0;
  const accB = ver.length ? ver.filter((r) => r.correctB).length / ver.length : 0;
  const winsB = open.filter((r) => r.verdict === 'B').length;
  const winsA = open.filter((r) => r.verdict === 'A').length;
  const decisive = winsB + winsA;

  // per-slice (capability) — AF-05: fail if ANY slice regresses > ε
  const caps = [...new Set(rows.map((r) => r.capability))];
  const slices = {};
  let sliceRegression = null;
  for (const cap of caps) {
    const v = ver.filter((r) => r.capability === cap);
    const o = open.filter((r) => r.capability === cap);
    const sa = v.length ? v.filter((r) => r.correctA).length / v.length : null;
    const sb = v.length ? v.filter((r) => r.correctB).length / v.length : null;
    const ob = o.length ? o.filter((r) => r.verdict === 'B').length : 0;
    const oa = o.length ? o.filter((r) => r.verdict === 'A').length : 0;
    const s = { verif_n: v.length, accA: sa, accB: sb, open_n: o.length, cand_wins: ob, base_wins: oa };
    const verifReg = sa !== null && sb < sa - epsilon;
    // Intentionally strict: a single open-slice loss fails the gate. Conservative
    // (false-FAIL is safe for a ship gate) and correct for safety slices where even
    // one regression must block. Noisy on tiny slices by design — not a bug.
    const openReg = (ob + oa) > 0 && ob < oa; // candidate loses the slice
    s.regressed = verifReg || openReg;
    if (s.regressed && !sliceRegression) sliceRegression = cap;
    slices[cap] = s;
  }

  const winShare = wilson(winsB, decisive);
  const coreOk = accB >= accA - epsilon && !sliceRegression; // AF-01 "core >= baseline-ε"
  return {
    n: rows.length, epsilon,
    verifiable: { n: ver.length, accA, accB, delta: accB - accA, ciA: wilson(ver.filter((r) => r.correctA).length, ver.length), ciB: wilson(ver.filter((r) => r.correctB).length, ver.length) },
    open: { n: open.length, decisive, cand_wins: winsB, base_wins: winsA, cand_win_share: winShare },
    slices, slice_regression: sliceRegression,
    gate: { core_ok: coreOk, verdict: coreOk ? 'PASS' : 'FAIL' },
  };
}

// ───────────────────────── live wiring (Ollama) ─────────────────────────
function parseArgs(argv) {
  const a = { base: 'qwen2.5-coder:7b', candidate: null, judge: 'gemma3:12b',
    golden: path.join(REPO, 'audit', 'forge', 'golden', 'core-frozen.jsonl'),
    report: path.join(REPO, 'audit', 'forge', 'eval-report.json'),
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    epsilon: 0.0, limit: 0, seed: 3407, nullCalibration: false, timeoutMs: 120000 };
  for (const arg of argv) {
    if (arg === '--null-calibration') { a.nullCalibration = true; continue; }
    const m = /^--([^=]+)=(.*)$/.exec(arg); if (!m) continue;
    const [, k, v] = m;
    if (k === 'base') a.base = v; else if (k === 'candidate') a.candidate = v;
    else if (k === 'judge') a.judge = v; else if (k === 'golden') a.golden = path.resolve(v);
    else if (k === 'report') a.report = path.resolve(v); else if (k === 'host') a.host = v;
    else if (k === 'epsilon') a.epsilon = Number(v); else if (k === 'limit') a.limit = Number(v);
    else if (k === 'seed') a.seed = Number(v);
  }
  if (a.nullCalibration) a.candidate = a.base;
  return a;
}

function loadGolden(p, limit) {
  const items = fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
  return limit > 0 ? items.slice(0, limit) : items;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.candidate) { console.error('[forge-eval] need --candidate=<model|adapter> or --null-calibration'); process.exit(1); }
  const mkOllama = (opts) => async (model, prompt) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(`${opts.host}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, seed: opts.seed } }), signal: ctrl.signal });
      if (!res.ok) return { text: '', error: `ollama HTTP ${res.status}` };
      const j = await res.json();
      return { text: j.response ?? '', error: null };
    } catch (e) { return { text: '', error: String(e.message || e) }; } finally { clearTimeout(to); }
  };
  const generate = mkOllama(a);
  const judgeFn = async (prompt) => (await generate(a.judge, prompt)).text;

  const items = loadGolden(a.golden, a.limit);
  console.log(`[forge-eval] base=${a.base} candidate=${a.candidate}${a.nullCalibration ? ' (NULL-CALIBRATION)' : ''} judge=${a.judge} items=${items.length}`);
  const report = await runEval(items, { base: a.base, candidate: a.candidate, generate, judgeFn, epsilon: a.epsilon });
  report.meta = { base: a.base, candidate: a.candidate, judge: a.judge, null_calibration: a.nullCalibration, golden: path.relative(REPO, a.golden), generated_at: new Date().toISOString() };

  fs.mkdirSync(path.dirname(a.report), { recursive: true });
  fs.writeFileSync(a.report, JSON.stringify(report, null, 2) + '\n');
  const v = report.verifiable, o = report.open;
  console.log(`[forge-eval] verifiable: accA=${v.accA.toFixed(3)} accB=${v.accB.toFixed(3)} delta=${v.delta.toFixed(3)} (n=${v.n})`);
  console.log(`[forge-eval] open: candidate wins ${o.cand_wins}/${o.decisive} decisive (share p=${o.cand_win_share.p.toFixed(2)} [${o.cand_win_share.lo.toFixed(2)},${o.cand_win_share.hi.toFixed(2)}])`);
  console.log(`[forge-eval] slice regression: ${report.slice_regression ?? 'none'} → GATE ${report.gate.verdict}`);
  if (a.nullCalibration) {
    const unbiased = Math.abs(v.delta) < 1e-9 && !report.slice_regression;
    console.log(`[forge-eval] NULL-CALIBRATION ${unbiased ? 'OK — harness is unbiased (delta 0, no fabricated gain)' : 'WARN — non-zero delta with identical models (check grader determinism)'}`);
  }
  console.log(`[forge-eval] wrote ${a.report}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
