// R2 DIAGNOSTIC (not shipped) — capture each seat's INDEPENDENT Phase-1 answer on the
// verifiable items and grade it deterministically, so winner-selection policies can be
// compared OFFLINE without the expensive full deliberation. The council recommendation
// is always the winner seat's Phase-1 text, and Phase-1 answers are policy-independent
// (generated before any selection), so council accuracy under a vote-free policy
// (e.g. competence-weighted agreement) is EXACT from this dump, not an approximation.
//
// Seeded (temperature 0 + fixed seed) so it reproduces the seats the committed seed=42
// eval saw. Run from packages/council:
//   ../cli/node_modules/.bin/tsx scripts/perseat-probe.ts            (seed=42)
//   SEED=7 ../cli/node_modules/.bin/tsx scripts/perseat-probe.ts

import { writeFileSync, readFileSync } from "node:fs";
import { gradeVerifiable } from "./quality-grade.ts";
import { normalizeAnswer, seatCompetence } from "../src/agreement.ts";

const SEAT_IDS = (process.env.EVAL_SEATS ?? "qwen2.5-coder:7b,qwen2.5:3b,qwen2.5-coder:14b").split(",").map((s) => s.trim());
const SEED = Number(process.env.SEED ?? process.argv.slice(2).find((a) => a.startsWith("--seed="))?.split("=")[1] ?? 42);
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

interface Item { id: string; category: string; verifiable: boolean; prompt: string; ground_truth?: string; grading: string; }
function loadDataset(): Item[] {
  const url = new URL("../eval/dataset.jsonl", import.meta.url);
  return readFileSync(url, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Item);
}

async function callSeat(id: string, prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: id, prompt, stream: false, options: { temperature: 0, seed: SEED } }),
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { response?: string };
  return json.response ?? "";
}

async function main() {
  const items = loadDataset().filter((i) => i.verifiable);
  console.log(`perseat-probe: ${items.length} verifiable items × ${SEAT_IDS.length} seats, seed=${SEED}`);
  const rows: any[] = [];
  for (const it of items) {
    const answers = await Promise.all(SEAT_IDS.map((id) => callSeat(id, it.prompt)));
    const seats = SEAT_IDS.map((id, k) => {
      const text = answers[k];
      const correct = gradeVerifiable({ id: it.id, verifiable: true, grading: it.grading, ground_truth: it.ground_truth }, text);
      return {
        seatId: id,
        competence: seatCompetence(id),
        correct,
        len: text.trim().length,
        normalized: normalizeAnswer(text).slice(0, 200),
        excerpt: text.trim().slice(0, 300),
      };
    });
    rows.push({ id: it.id, category: it.category, grading: it.grading, gold: it.ground_truth ?? "", seats });
    const flags = seats.map((s) => `${s.seatId.split(":")[1]}=${s.correct === null ? "?" : s.correct ? "Y" : "N"}`).join(" ");
    process.stdout.write(`  ${it.id} [${it.category}] ${flags}\n`);
  }
  const out = new URL("./perseat-probe.json", import.meta.url);
  writeFileSync(out, JSON.stringify({ seed: SEED, seatIds: SEAT_IDS, rows }, null, 2));
  console.log(`\nwrote ${rows.length} rows → scripts/perseat-probe.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
