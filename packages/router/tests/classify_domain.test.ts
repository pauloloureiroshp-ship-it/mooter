// classify_domain test suite (Pastor Wave 1, Day 3).
// Run: cd packages/router && npm test
//
// 50 labelled prompts: 30 positive (10 per seed pack), 10 negative (→ GENERAL),
// 10 ambiguous (two packs tie → AMBIGUOUS with the right top-3 candidates).
//
// DoD asserted here:
//   - recall >= 0.85 overall and per pack (on the 30 positives)
//   - 0 false positives on the 10 negatives (all GENERAL)
//   - every ambiguous prompt flagged AMBIGUOUS with the correct candidate pair
//   - p99 latency <= 5ms over 1000 warm classifications
// Metrics (recall/precision/F1, p50/p99) are printed before the assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDomain, loadPacks, type CompiledPack } from "../src/classify_domain.ts";

const PACKS: CompiledPack[] = loadPacks();

const ANIM = "animation-web";
const AUDIT = "code-audit";
const DIAG = "diagram-systems";

// --- 30 positives (10 per pack) ---
const POSITIVES: { prompt: string; pack: string }[] = [
  // animation-web
  { prompt: "Add a scroll-trigger animation to the hero section", pack: ANIM },
  { prompt: "Como faço para animar este componente React com motion?", pack: ANIM },
  { prompt: "Preciso de uma transição suave entre páginas", pack: ANIM },
  { prompt: "Implement a parallax effect on the landing page", pack: ANIM },
  { prompt: "Quero um hero animation com easing custom", pack: ANIM },
  { prompt: "Use lottie for the loading spinner animation", pack: ANIM },
  { prompt: "Add a keyframe animation to the .css button", pack: ANIM },
  { prompt: "Faz uma micro-interaction no botão", pack: ANIM },
  { prompt: "scroll driven animation com animation-timeline", pack: ANIM },
  { prompt: "Animate the .svg logo on hover", pack: ANIM },
  // code-audit
  { prompt: "Audita este repositório antes do deploy", pack: AUDIT },
  { prompt: "Run a security review of the auth module", pack: AUDIT },
  { prompt: "Check for vulnerability in the dependencies", pack: AUDIT },
  { prompt: "Faz um dependency check ao package.json", pack: AUDIT },
  { prompt: "Verifica segurança do endpoint de login", pack: AUDIT },
  { prompt: "Do a secret scan before commit", pack: AUDIT },
  { prompt: "review completo do código antes de fazer push", pack: AUDIT },
  { prompt: "Lint and audit the codebase for OWASP issues", pack: AUDIT },
  { prompt: "auditoria de segurança ao backend", pack: AUDIT },
  { prompt: "Faz um dependency check e verifica segurança antes de release", pack: AUDIT },
  // diagram-systems
  { prompt: "Desenha o diagrama de sequência do login", pack: DIAG },
  { prompt: "Create a mermaid flowchart for the pipeline", pack: DIAG },
  { prompt: "Visualiza a arquitectura do sistema em C4", pack: DIAG },
  { prompt: "Draw an ER diagram for the database", pack: DIAG },
  { prompt: "Mostra o fluxo de dados num fluxograma", pack: DIAG },
  { prompt: "Generate a sequence diagram in mermaid", pack: DIAG },
  { prompt: "Preciso de um mindmap das features", pack: DIAG },
  { prompt: "Use d2 to draw the architecture", pack: DIAG },
  { prompt: "diagrama de arquitectura dos microserviços", pack: DIAG },
  { prompt: "Create a C4 container diagram", pack: DIAG },
];

// --- 10 negatives (generic, no domain signal → GENERAL) ---
const NEGATIVES: string[] = [
  "What's the weather today?",
  "Explica-me o que é a recursão",
  "Write a function to reverse a string",
  "Qual é a capital de Portugal?",
  "Help me refactor this loop to be faster",
  "Traduz este texto para inglês",
  "Set up a new git repository",
  "What time is it in Tokyo?",
  "Resume este artigo em três frases",
  "How do I install Node.js?",
];

// --- 10 ambiguous (two packs tie → AMBIGUOUS, top-2 candidates = the pair) ---
const AMBIGUOUS: { prompt: string; pair: [string, string] }[] = [
  { prompt: "Review the scroll-trigger animation for security", pair: [ANIM, AUDIT] },
  { prompt: "Audit the lottie animation, check for vulnerability", pair: [ANIM, AUDIT] },
  { prompt: "Add easing to the transition and run a security lint", pair: [ANIM, AUDIT] },
  { prompt: "Security audit of the architecture diagram", pair: [AUDIT, DIAG] },
  { prompt: "Review the security of the C4 flowchart", pair: [AUDIT, DIAG] },
  { prompt: "Lint the mermaid diagram and check vulnerability", pair: [AUDIT, DIAG] },
  { prompt: "Animate the sequence flowchart transition", pair: [ANIM, DIAG] },
  { prompt: "Add a parallax motion to the architecture diagram", pair: [ANIM, DIAG] },
  { prompt: "Mermaid flowchart of the easing animation", pair: [ANIM, DIAG] },
  { prompt: "Lottie motion in a sequence diagram", pair: [ANIM, DIAG] },
];

// --------------------------------------------------------------------------
// Metrics
// --------------------------------------------------------------------------

function computeMetrics() {
  const packIds = [ANIM, AUDIT, DIAG];
  const perPack: Record<string, { tp: number; total: number }> = {};
  for (const p of packIds) perPack[p] = { tp: 0, total: 0 };

  let tp = 0; // positive correctly classified to its pack
  let fp = 0; // anything assigned to a pack it shouldn't be

  for (const { prompt, pack } of POSITIVES) {
    perPack[pack].total++;
    const { pack_id } = classifyDomain(prompt, PACKS);
    if (pack_id === pack) {
      tp++;
      perPack[pack].tp++;
    } else if (pack_id !== "GENERAL" && pack_id !== "AMBIGUOUS") {
      fp++; // assigned to the wrong pack
    }
  }
  for (const prompt of NEGATIVES) {
    const { pack_id } = classifyDomain(prompt, PACKS);
    if (pack_id !== "GENERAL" && pack_id !== "AMBIGUOUS") fp++;
  }
  for (const { prompt } of AMBIGUOUS) {
    const { pack_id } = classifyDomain(prompt, PACKS);
    if (pack_id !== "GENERAL" && pack_id !== "AMBIGUOUS") fp++;
  }

  const recall = tp / POSITIVES.length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const recallPerPack = Object.fromEntries(
    packIds.map((p) => [p, perPack[p].tp / perPack[p].total]),
  );
  return { recall, precision, f1, recallPerPack };
}

function benchmark(iterations = 1000) {
  const prompts = [...POSITIVES.map((p) => p.prompt), ...NEGATIVES, ...AMBIGUOUS.map((a) => a.prompt)];
  // warm-up
  for (let i = 0; i < 200; i++) classifyDomain(prompts[i % prompts.length], PACKS);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    classifyDomain(prompts[i % prompts.length], PACKS);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6); // ms
  }
  samples.sort((a, b) => a - b);
  const pct = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return { p50: pct(0.5), p99: pct(0.99) };
}

const M = computeMetrics();
const L = benchmark();
console.log("\n=== classify_domain metrics ===");
console.log(`recall (30 pos): ${M.recall.toFixed(3)}`);
console.log(`  per pack: ${JSON.stringify(M.recallPerPack)}`);
console.log(`precision: ${M.precision.toFixed(3)}   F1: ${M.f1.toFixed(3)}`);
console.log(`latency: p50 ${L.p50.toFixed(4)}ms   p99 ${L.p99.toFixed(4)}ms`);
console.log("===============================\n");

// --------------------------------------------------------------------------
// Assertions (DoD)
// --------------------------------------------------------------------------

test("loads all 7 registry packs (3 seed + Wave 2 Day 5 additions)", () => {
  const ids = PACKS.map((p) => p.pack_id).sort();
  assert.deepEqual(
    ids,
    [
      ANIM,
      AUDIT,
      DIAG,
      "data-spreadsheet",
      "knowledge-third-brain",
      "prd-strategy",
      "voice-tts",
    ].sort(),
  );
});

test("recall >= 0.85 overall on the 30 positives", () => {
  assert.ok(M.recall >= 0.85, `recall ${M.recall.toFixed(3)} < 0.85`);
});

test("recall >= 0.85 per pack", () => {
  for (const [pack, r] of Object.entries(M.recallPerPack)) {
    assert.ok(r >= 0.85, `${pack} recall ${r.toFixed(3)} < 0.85`);
  }
});

test("0 false positives — every negative resolves to GENERAL", () => {
  for (const prompt of NEGATIVES) {
    const { pack_id, confidence } = classifyDomain(prompt, PACKS);
    assert.equal(pack_id, "GENERAL", `"${prompt}" → ${pack_id} (conf ${confidence})`);
  }
});

test("ambiguous prompts flagged AMBIGUOUS with the correct candidate pair", () => {
  for (const { prompt, pair } of AMBIGUOUS) {
    const { pack_id, candidates } = classifyDomain(prompt, PACKS);
    assert.equal(pack_id, "AMBIGUOUS", `"${prompt}" → ${pack_id}`);
    const top2 = new Set(candidates.slice(0, 2).map((c) => c.pack_id));
    assert.deepEqual(top2, new Set(pair), `"${prompt}" candidates ${JSON.stringify(candidates)}`);
  }
});

test("p99 latency <= 5ms over 1000 warm classifications", () => {
  assert.ok(L.p99 <= 5, `p99 ${L.p99.toFixed(4)}ms > 5ms`);
});
