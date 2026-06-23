// R2 OFFLINE ANALYSIS (not shipped) — compare winner-selection policies on the per-seat
// probe dump. The council recommendation = winner seat's Phase-1 answer, which is
// policy-independent, so council accuracy under any vote-free policy is EXACT here.
import { readFileSync } from "node:fs";
import { seatCompetence, normalizeAnswer } from "../src/agreement.ts";

const data = JSON.parse(readFileSync(new URL("./perseat-probe.json", import.meta.url), "utf8"));
const rows: any[] = data.rows;
const comp = seatCompetence;

function clusters(seats: any[]) {
  const m = new Map<string, any>();
  for (const s of seats) {
    const k = normalizeAnswer(s.normalized);
    const c = m.get(k) || { key: k, members: [], weight: 0, size: 0, top: 0 };
    c.members.push(s); c.weight += comp(s.seatId); c.size++; c.top = Math.max(c.top, comp(s.seatId));
    m.set(k, c);
  }
  return [...m.values()];
}
const byComp = (a: any, b: any) => comp(b.seatId) - comp(a.seatId) || a.len - b.len || (a.seatId < b.seatId ? -1 : 1);
function winnerOf(seats: any[], order: any) {
  const cs = clusters(seats).sort(order);
  return [...cs[0].members].sort(byComp)[0];
}
const consensusOrder = (a: any, b: any) => b.weight - a.weight || b.size - a.size || b.top - a.top || (a.key < b.key ? -1 : 1);
const competenceOrder = (a: any, b: any) => b.weight - a.weight || b.top - a.top || b.size - a.size || (a.key < b.key ? -1 : 1);
const majorityOrder = (a: any, b: any) => b.size - a.size || b.weight - a.weight || b.top - a.top || (a.key < b.key ? -1 : 1);

const policies: Record<string, (s: any[]) => any> = {
  always14b: (s) => s.find((x) => x.seatId.includes("14b")),
  always7b: (s) => s.find((x) => x.seatId.includes("coder:7b")),
  always3b: (s) => s.find((x) => x.seatId.includes("2.5:3b")),
  agreement_consensus: (s) => winnerOf(s, consensusOrder),
  agreement_competence: (s) => winnerOf(s, competenceOrder),
  majority_then_comp: (s) => winnerOf(s, majorityOrder),
};
const gradable = rows.filter((r) => r.seats.every((s: any) => s.correct !== null));
console.log("gradable items:", gradable.length, "/", rows.length);
for (const [name, fn] of Object.entries(policies)) {
  let correct = 0;
  for (const r of gradable) { const w = fn(r.seats); if (w && w.correct) correct++; }
  console.log(`  ${name.padEnd(22)} ${correct}/${gradable.length} = ${(correct / gradable.length).toFixed(3)}`);
}
const oracle = gradable.filter((r: any) => r.seats.some((s: any) => s.correct)).length;
console.log(`  ${"oracle(any-correct)".padEnd(22)} ${oracle}/${gradable.length} = ${(oracle / gradable.length).toFixed(3)}`);

console.log("\n=== decisive items (seats disagree on correctness) ===");
for (const r of gradable) {
  if (new Set(r.seats.map((s: any) => s.correct)).size > 1) {
    const flags = r.seats.map((s: any) => `${s.seatId.split(":")[1]}=${s.correct ? "Y" : "N"}`).join(" ");
    const cs = clusters(r.seats).sort(consensusOrder);
    const wC = policies.agreement_consensus(r.seats), wK = policies.agreement_competence(r.seats);
    const clus = cs.map((c: any) => `{${c.members.map((m: any) => m.seatId.split(":")[1]).join("+")}}w${c.weight}`).join(" ");
    console.log(`  ${r.id} ${flags} | ${clus} | consensus→${wC.seatId.split(":")[1]}(${wC.correct ? "Y" : "N"}) comp→${wK.seatId.split(":")[1]}(${wK.correct ? "Y" : "N"})`);
  }
}
