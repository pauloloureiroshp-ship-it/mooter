#!/usr/bin/env -S npx tsx
// validate-wave1.ts — Wave 1 live validation harness (Pastor Day 7, §10.7 Bloco A).
//
// Runs classify_domain() over a fixed set of 20 realistic vibe-coder prompts,
// measures per-prompt latency and p50/p99, and computes recall against the
// expected pack. Recall = #(chosen == expected) / 20. Gate: >= 17/20 (85%).
//
// Not a unit test (those live in tests/). This is the one-shot report generator
// that feeds docs/wave1-validation.md. Packs are loaded once (boot cost excluded
// from per-prompt latency, mirroring the real hook which compiles regexes at boot).

import { classifyDomain, loadPacks } from "../src/classify_domain.ts";

interface Case {
  prompt: string;
  expected: string; // pack_id | "AMBIGUOUS" | "GENERAL"
  bucket: string;
}

// 20 prompts: 6 animation-web · 5 code-audit · 4 diagram-systems · 3 ambiguous · 2 general.
// Phrased as a real vibe coder would type them, mixing PT-PT and EN.
const CASES: Case[] = [
  // --- animation-web (6) ---
  { bucket: "animation-web", expected: "animation-web", prompt: "add a fade-in animation to my landing hero with framer-motion" },
  { bucket: "animation-web", expected: "animation-web", prompt: "make the parallax scroll smoother with easing on the homepage" },
  { bucket: "animation-web", expected: "animation-web", prompt: "I want a smooth route transition using motion" },
  { bucket: "animation-web", expected: "animation-web", prompt: "add a lottie animation when onboarding completes" },
  { bucket: "animation-web", expected: "animation-web", prompt: "create a micro-interaction on hover with a keyframe" },
  { bucket: "animation-web", expected: "animation-web", prompt: "animate the hero section intro with easing in App.tsx" },

  // --- code-audit (5) ---
  { bucket: "code-audit", expected: "code-audit", prompt: "audit this auth module for security vulnerabilities before I ship" },
  { bucket: "code-audit", expected: "code-audit", prompt: "run a dependency check and secret scan on the repo" },
  { bucket: "code-audit", expected: "code-audit", prompt: "review completo do código antes de fazer push" },
  { bucket: "code-audit", expected: "code-audit", prompt: "check this code for security issues and run lint" },
  { bucket: "code-audit", expected: "code-audit", prompt: "audita este PR e verifica segurança dos endpoints" },

  // --- diagram-systems (4) ---
  { bucket: "diagram-systems", expected: "diagram-systems", prompt: "draw a sequence diagram for the login flow in mermaid" },
  { bucket: "diagram-systems", expected: "diagram-systems", prompt: "visualize the architecture of my microservices with a c4 diagram" },
  { bucket: "diagram-systems", expected: "diagram-systems", prompt: "desenha o fluxograma do processo de checkout" },
  { bucket: "diagram-systems", expected: "diagram-systems", prompt: "create an entity-relationship diagram for the database" },

  // --- ambiguous (3): two packs tie -> AMBIGUOUS ---
  { bucket: "ambiguous", expected: "AMBIGUOUS", prompt: "review the architecture diagram for security gaps" },
  { bucket: "ambiguous", expected: "AMBIGUOUS", prompt: "audit and review the animation easing" },
  { bucket: "ambiguous", expected: "AMBIGUOUS", prompt: "animate the motion in the architecture diagram" },

  // --- general (2): no domain signal -> GENERAL ---
  { bucket: "general", expected: "GENERAL", prompt: "help me write a python function to parse a csv file" },
  { bucket: "general", expected: "GENERAL", prompt: "rename this variable across the codebase and fix a typo" },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function main(): void {
  const packs = loadPacks();
  const rows: Array<{
    n: number;
    bucket: string;
    prompt: string;
    expected: string;
    chosen: string;
    confidence: number;
    reason: string;
    latencyMs: number;
    hit: boolean;
  }> = [];

  CASES.forEach((c, i) => {
    // Median of a few runs to dampen GC/JIT noise; report the median latency.
    const samples: number[] = [];
    let result = classifyDomain(c.prompt, packs);
    for (let k = 0; k < 5; k++) {
      const t0 = process.hrtime.bigint();
      result = classifyDomain(c.prompt, packs);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
    }
    samples.sort((a, b) => a - b);
    const latencyMs = samples[Math.floor(samples.length / 2)];
    rows.push({
      n: i + 1,
      bucket: c.bucket,
      prompt: c.prompt,
      expected: c.expected,
      chosen: result.pack_id,
      confidence: result.confidence,
      reason: result.reason,
      latencyMs,
      hit: result.pack_id === c.expected,
    });
  });

  const hits = rows.filter((r) => r.hit).length;
  const recall = hits / rows.length;
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = percentile(lat, 50);
  const p99 = percentile(lat, 99);
  const specificPack = rows.filter(
    (r) => r.chosen !== "GENERAL" && r.chosen !== "AMBIGUOUS",
  ).length;
  const general = rows.filter((r) => r.chosen === "GENERAL").length;

  // Emit machine-readable JSON to stderr (for scripting) + human table to stdout.
  const summary = {
    total: rows.length,
    hits,
    recall,
    recallStr: `${hits}/${rows.length}`,
    p50_ms: Number(p50.toFixed(3)),
    p99_ms: Number(p99.toFixed(3)),
    specificPack,
    general,
    gate_recall_pass: hits >= 17,
    gate_p99_pass: p99 <= 60,
    rows,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

main();
