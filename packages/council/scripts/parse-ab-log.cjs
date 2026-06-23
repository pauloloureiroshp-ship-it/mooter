// W5: Parse ab-run.log and reconstruct JSONL files for quality-eval-ab.ts analysis
// Extracts item-by-item data from the complete seeded runs captured in ab-run.log
"use strict";
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const scriptDir = path.join(__dirname);
const TEMP = process.env.TEMP || process.env.TMP || "C:/Users/PAULOL~1/AppData/Local/Temp";

const logPath = path.join(scriptDir, "ab-run.log");
const datasetPath = path.join(TEMP, "council-dataset.jsonl");

const logText = readFileSync(logPath, "utf8");
const datasetText = readFileSync(datasetPath, "utf8");

// Load dataset for item metadata
const dataset = datasetText.trim().split(/\r?\n/).map(l => JSON.parse(l));
const datasetById = new Map(dataset.map(d => [d.id, d]));

function parseBlock(blockText) {
  const rows = [];
  const lines = blockText.split(/\r?\n/);

  for (const line of lines) {
    // Verifiable: [N/43] id category (ver) A=✓/✗ B=✓/✗ conf=X
    const verMatch = line.match(/\[(\d+)\/43\]\s+(\S+)\s+\S+\s+\(ver\)\s+A=([✓✗])\s+B=([✓✗]|n\/a)\s+conf=([\d.]+)/);
    if (verMatch) {
      const [, , id, a, b, conf] = verMatch;
      const item = datasetById.get(id);
      if (!item) { console.error("MISSING ITEM:", id); continue; }
      rows.push({
        id, category: item.category, verifiable: true, grading: item.grading,
        costA: 0, latA: 0, costB: 0, latB: 0,
        councilCalls: null, convergence: null, confidence: parseFloat(conf),
        winnerSeat: null,
        correctA: a === "✓" ? true : (a === "✗" ? false : null),
        correctB: b === "✓" ? true : (b === "✗" ? false : null),
      });
      continue;
    }

    // Open: [N/43] id category (open) judge: X/Y → verdict
    const openMatch = line.match(/\[(\d+)\/43\]\s+(\S+)\s+\S+\s+\(open\)\s+judge:\s+([AB])\/([AB])\s+→\s+(tie|COUNCIL|single)/);
    if (openMatch) {
      const [, , id, order1raw, order2raw, verdict] = openMatch;
      const item = datasetById.get(id);
      if (!item) { console.error("MISSING ITEM:", id); continue; }
      const pairwise = verdict === "COUNCIL" ? "B" : verdict === "single" ? "A" : "tie";
      rows.push({
        id, category: item.category, verifiable: false, grading: item.grading,
        costA: 0, latA: 0, costB: 0, latB: 0,
        councilCalls: null, convergence: null, confidence: null,
        winnerSeat: null,
        pairwise,
        order1: order1raw,
        order2: order2raw,
        judgeLatMs: 0,
      });
      continue;
    }
  }
  return rows;
}

// Split log into blocks by "COUNCIL QUALITY EVAL —"
const blocks = logText.split("COUNCIL QUALITY EVAL —");
// blocks[1] = ln-on section, blocks[2] = ln-off section

if (blocks.length < 3) {
  console.error("Expected 2 COUNCIL QUALITY EVAL blocks, found:", blocks.length - 1);
  process.exit(1);
}

const lnOnRows = parseBlock(blocks[1]);
const lnOffRows = parseBlock(blocks[2]);

// Verify counts
const verLnOn = lnOnRows.filter(r => r.verifiable && typeof r.correctB === "boolean");
const verLnOff = lnOffRows.filter(r => r.verifiable && typeof r.correctB === "boolean");
const openLnOn = lnOnRows.filter(r => !r.verifiable && r.pairwise != null);
const openLnOff = lnOffRows.filter(r => !r.verifiable && r.pairwise != null);

console.log("=== EXTRACTION RESULTS ===");
console.log(`ln-on (NEW/length-neutral):  ${lnOnRows.length} items — ${verLnOn.length} verifiable, ${openLnOn.length} open`);
console.log(`ln-off (OLD/legacy):          ${lnOffRows.length} items — ${verLnOff.length} verifiable, ${openLnOff.length} open`);
console.log("");

// Accuracy per arm
const accLnOnA = verLnOn.filter(r=>r.correctA).length;
const accLnOnB = verLnOn.filter(r=>r.correctB).length;
const accLnOffA = verLnOff.filter(r=>r.correctA).length;
const accLnOffB = verLnOff.filter(r=>r.correctB).length;

console.log(`ln-on  single A: ${accLnOnA}/${verLnOn.length} = ${(accLnOnA/verLnOn.length*100).toFixed(1)}%   council B: ${accLnOnB}/${verLnOn.length} = ${(accLnOnB/verLnOn.length*100).toFixed(1)}%`);
console.log(`ln-off single A: ${accLnOffA}/${verLnOff.length} = ${(accLnOffA/verLnOff.length*100).toFixed(1)}%   council B: ${accLnOffB}/${verLnOff.length} = ${(accLnOffB/verLnOff.length*100).toFixed(1)}%`);
console.log("");

// Item-by-item comparison
console.log("=== ITEM-BY-ITEM: ln-on(NEW) vs ln-off(OLD) ===");
console.log("ID      | NEW_A NEW_B | OLD_A OLD_B | Δ(NEW-OLD council)");
console.log("--------|-----------|-----------|-------------------");
const lnOnById = new Map(lnOnRows.map(r => [r.id, r]));
const lnOffById = new Map(lnOffRows.map(r => [r.id, r]));
let newBetter = 0, oldBetter = 0, same = 0;
for (const item of dataset) {
  const a = lnOnById.get(item.id);
  const b = lnOffById.get(item.id);
  if (!a || !b) continue;
  if (item.verifiable) {
    const aB = a.correctB;
    const bB = b.correctB;
    const delta = (aB === true && bB === false) ? "NEW wins" : (aB === false && bB === true) ? "OLD wins" : "same";
    if (delta === "NEW wins") newBetter++;
    else if (delta === "OLD wins") oldBetter++;
    else same++;
    console.log(`${item.id.padEnd(7)} | ${a.correctA?"✓":"✗"}    ${aB?"✓":"✗"}  | ${b.correctA?"✓":"✗"}    ${bB?"✓":"✗"}  | ${delta}`);
  } else {
    const aP = a.pairwise;
    const bP = b.pairwise;
    console.log(`${item.id.padEnd(7)} | open pairwise NEW=${aP} OLD=${bP}`);
  }
}
console.log("");
console.log(`Verifiable discordant pairs: NEW better=${newBetter}, OLD better=${oldBetter}, same=${same}`);
console.log("");

// Check 84.4% bar
const bar = 0.844;
const accOld = accLnOffB / verLnOff.length;
const accNew = accLnOnB / verLnOn.length;
console.log(`=== RE-CERTIFICATION vs 84.4% bar ===`);
console.log(`OLD code (reverted/legacy): ${(accOld*100).toFixed(1)}% — ${accOld >= bar ? "PASS ≥ bar" : "FAIL < bar"}`);
console.log(`NEW code (length-neutral):  ${(accNew*100).toFixed(1)}% — ${accNew >= bar ? "PASS ≥ bar" : "FAIL < bar"}`);
console.log("");

// McNemar exact (simple version for verification)
function mcnemar(b, c) {
  const n = b + c;
  if (n === 0) return { b, c, n: 0, p: 1.0, direction: 0 };
  const k = Math.min(b, c);
  let pmf = Math.pow(0.5, n), cum = pmf;
  for (let i = 1; i <= k; i++) { pmf = pmf * (n - i + 1) / i; cum += pmf; }
  return { b, c, n, p: Math.min(1, 2 * cum), direction: Math.sign(b - c) };
}

// In analyzePaired: arm-a = ln-on (NEW), arm-b = ln-off (OLD)
// vB = ln-on correct + ln-off wrong (NEW helped)
// vC = ln-on wrong + ln-off correct (NEW hurt)
const mc = mcnemar(newBetter, oldBetter);
console.log(`McNemar: NEW helped=${newBetter} OLD helped=${oldBetter} n=${mc.n} p=${mc.p.toFixed(4)} direction=${mc.direction > 0 ? "NEW_WINS" : mc.direction < 0 ? "OLD_WINS(REVERT)" : "TIE"}`);
const verdict = mc.direction < 0 && mc.p < 0.05 ? "REGRESS→REVERT" :
                mc.direction > 0 && mc.p < 0.05 ? "IMPROVE→KEEP" : "NEUTRAL";
console.log(`Verifiable verdict: ${verdict}`);

// Write JSONL files
writeFileSync(path.join(scriptDir, "quality-eval-progress.ln-on.jsonl"), lnOnRows.map(r => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(path.join(scriptDir, "quality-eval-progress.ln-off.jsonl"), lnOffRows.map(r => JSON.stringify(r)).join("\n") + "\n");
console.log("\nWrote quality-eval-progress.ln-on.jsonl and quality-eval-progress.ln-off.jsonl");
