/**
 * MOOTER v1.0 — ANTHROPIC SHOWCASE DECK GENERATOR
 * ================================================
 * 9-slide deck companion to ANTHROPIC_SHOWCASE_PLAN.md + DEMO_SCRIPT.md.
 * Self-contained (own palette + helpers) — does not depend on
 * generate_strategy_pptx.js.
 *
 * Run:
 *   cd ~/mooter/docs/strategy
 *   npm install pptxgenjs
 *   node generate_showcase_pptx.js
 *
 * Output: MOOTER_SHOWCASE_v1.pptx (same dir). Honest by design — every number
 * here is real or labelled as an estimate; "none yet" stays "none yet".
 */

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3" × 7.5"
pres.title = "Mooter v1.0 — The router that lives inside Claude Code";
pres.author = "Paulo Loureiro";
pres.subject = "Mooter v1.0 — Anthropic showcase";

// ── Palette · Midnight Executive (shared with the strategy deck) ──
const C = {
  navy: "1E2761", navyDeep: "141A47", ice: "CADCFC", icePale: "E8F0FE",
  coral: "F96167", green: "10B981", gold: "F59E0B",
  slate: "475569", slatePale: "F1F5F9", text: "0F172A", textMuted: "64748B",
  border: "E2E8F0", white: "FFFFFF", mono: "0B1020",
};
const FONT = "Arial";
const MONO = "Consolas";
const N = 9;

function footer(s, n, label, dark = false) {
  s.addText(label.toUpperCase(), {
    x: 0.7, y: 7.05, w: 8, h: 0.3, fontFace: FONT, fontSize: 8,
    color: dark ? C.ice : C.textMuted, charSpacing: 2,
  });
  s.addText(`${String(n).padStart(2, "0")} / ${N}`, {
    x: 11.6, y: 7.05, w: 1, h: 0.3, align: "right", fontFace: MONO, fontSize: 8,
    color: dark ? C.ice : C.textMuted,
  });
}
function label(s, txt, dark = false) {
  s.addText(txt.toUpperCase(), {
    x: 0.7, y: 0.5, w: 12, h: 0.35, fontFace: FONT, fontSize: 11, bold: true,
    color: dark ? C.ice : C.coral, charSpacing: 3,
  });
}
function title(s, txt, color = C.text) {
  s.addText(txt, { x: 0.7, y: 0.9, w: 12, h: 0.9, fontFace: FONT, fontSize: 30, bold: true, color });
}
function lead(s, txt, color = C.slate) {
  s.addText(txt, { x: 0.7, y: 1.85, w: 11.8, h: 0.7, fontFace: FONT, fontSize: 15, color });
}
function card(s, x, y, w, h, fill = C.white, border = C.border) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, fill: { color: fill }, line: { color: border, width: 1 }, rectRadius: 0.08,
  });
}
function bullets(s, items, x, y, w, color = C.text, size = 14) {
  s.addText(items.map((t) => ({ text: t, options: { bullet: { code: "2022" }, color, fontSize: size, breakLine: true, paraSpaceAfter: 8 } })),
    { x, y, w, h: 4, fontFace: FONT, valign: "top" });
}

// ───────────────────────── Slide 1 · Title ─────────────────────────
let s = pres.addSlide();
s.background = { color: C.navyDeep };
s.addText("ANTHROPIC SHOWCASE · v1.0 · 2026", { x: 0.7, y: 0.9, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: C.ice, charSpacing: 3 });
s.addText("mooter", { x: 0.7, y: 2.2, w: 12, h: 1.2, fontFace: FONT, fontSize: 60, bold: true, color: C.white });
s.addText("The AI router that picks tools, not just models — and lives inside Claude Code.", { x: 0.7, y: 3.5, w: 11.5, h: 0.8, fontFace: FONT, fontSize: 20, color: C.ice });
s.addShape(pres.shapes.RECTANGLE, { x: 0.72, y: 4.5, w: 2.2, h: 0.06, fill: { color: C.coral } });
s.addText([
  { text: "Zero-proxy · local-first · MIT · honest by design", options: { fontSize: 14, color: C.white, breakLine: true } },
  { text: "~90% cost savings validated on 1,437 real prompts (router engine)", options: { fontSize: 13, color: C.ice, breakLine: true } },
], { x: 0.7, y: 4.8, w: 11, h: 1 });
s.addText("Paulo Loureiro · v1.0.0 convergence release · 2026-05-31", { x: 0.7, y: 6.6, w: 11, h: 0.4, fontFace: MONO, fontSize: 11, color: C.slateLight || C.ice });

// ───────────────────────── Slide 2 · Problem ─────────────────────────
s = pres.addSlide();
label(s, "The problem");
title(s, "Claude Code gives you the smartest model — for every task.");
lead(s, "Smartest ≠ cheapest. You're burning Opus on work a sed one-liner could do.");
const probs = [
  ["$0.12", "Renaming a variable"],
  ["$0.08", "A commit message"],
  ["$0.15", "Fixing a typo"],
];
probs.forEach((p, i) => {
  const x = 0.7 + i * 4.05;
  card(s, x, 2.9, 3.8, 2);
  s.addText(p[0], { x, y: 3.2, w: 3.8, h: 0.8, align: "center", fontFace: MONO, fontSize: 34, bold: true, color: C.coral });
  s.addText(p[1], { x, y: 4.1, w: 3.8, h: 0.5, align: "center", fontFace: FONT, fontSize: 14, color: C.slate });
});
s.addText("Existing routers fix this with a PROXY — extra latency, single point of failure, lock-in, opaque decisions. Mooter doesn't intercept anything.", { x: 0.7, y: 5.4, w: 11.8, h: 0.8, fontFace: FONT, fontSize: 14, italic: true, color: C.textMuted });
footer(s, 2, "the problem");

// ───────────────────────── Slide 3 · Approach ─────────────────────────
s = pres.addSlide();
label(s, "The approach — doctrine, not proxy");
title(s, "It teaches Claude Code when to reach for which model.");
const mech = [
  ["1 · Classifier hook", "inject_context.js + classify.js run on every prompt. Pure regex, <50 ms, zero LLM cost. Emits a <router-hint> with tier (T0–T3) + confidence."],
  ["2 · Mediator doctrine", "A ruleset Claude Code reads at session start: how to read the hint, when to escalate, when to refuse, which subagent to spawn."],
  ["3 · Native subagents", "local-summarizer (Ollama) · cheap-triage (Haiku) · model-reasoner (Sonnet) · model-architect (Opus) · final-reviewer. No ports, no external process."],
];
mech.forEach((m, i) => {
  const y = 2.6 + i * 1.35;
  card(s, 0.7, y, 11.9, 1.2);
  s.addText(m[0], { x: 0.95, y: y + 0.12, w: 3.3, h: 1, fontFace: FONT, fontSize: 15, bold: true, color: C.navy });
  s.addText(m[1], { x: 4.3, y: y + 0.12, w: 8.0, h: 1, fontFace: FONT, fontSize: 12.5, color: C.slate, valign: "middle" });
});
s.addText("If Mooter dies, Claude Code still works. Zero blast radius.", { x: 0.7, y: 6.7, w: 11, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: C.green });
footer(s, 3, "doctrine not proxy");

// ───────────────────────── Slide 4 · Two-axis ─────────────────────────
s = pres.addSlide();
label(s, "Two-axis routing");
title(s, "Complexity × domain — model AND tools.");
lead(s, "Axis 1: which MODEL (T0–T3). Axis 2: which TOOLS (Moo Packs — skills, MCPs, scaffold, model floor).");
card(s, 0.7, 2.8, 5.8, 3.2, C.icePale);
s.addText("Axis 1 · complexity → tier", { x: 0.95, y: 3.0, w: 5.3, h: 0.4, bold: true, fontSize: 14, color: C.navy });
bullets(s, ["T0 · local Ollama — $0", "T1 · Haiku", "T2 · Sonnet", "T3 · Opus (arch / safety)"], 1.0, 3.5, 5.2, C.text, 13);
card(s, 6.8, 2.8, 5.8, 3.2, C.slatePale);
s.addText("Axis 2 · domain → Moo Pack", { x: 7.05, y: 3.0, w: 5.3, h: 0.4, bold: true, fontSize: 14, color: C.navy });
bullets(s, ["animation-web — floor T2", "code-audit — floor T3", "diagram-systems — floor T1", "+ 4 more (7 packs total)"], 7.1, 3.5, 5.2, C.text, 13);
s.addText("Both hints advisory + explainable (confidence + reason). Wave 1 validation: recall 20/20, combined hook p99 3.74 ms.", { x: 0.7, y: 6.4, w: 11.8, h: 0.5, fontFace: FONT, fontSize: 12.5, italic: true, color: C.textMuted });
footer(s, 4, "complexity × domain");

// ───────────────────────── Slide 5 · Transparency ─────────────────────────
s = pres.addSlide();
s.background = { color: C.mono };
label(s, "Radical transparency", true);
title(s, "Every decision, on screen.", C.white);
card(s, 0.7, 2.0, 11.9, 2.0, "121A33", "2A3A66");
s.addText([
  { text: "🟢 mooter saved $0.75 (37%)        │ T2 · 🎵 sonnet 0.65 · 42% 5h\n", options: { color: C.green, fontSize: 13 } },
  { text: "🐂 · 🏠 local ×4 · last10 T0:0 T1:0 T2:5 T3:5 · 🎮 RTX 4090 (8.4/24GB) · quant Q4_K_M (-72% size · ~99% quality) · adapter ◌ baseline", options: { color: C.ice, fontSize: 12 } },
], { x: 0.95, y: 2.2, w: 11.4, h: 1.6, fontFace: MONO, valign: "top" });
bullets(s, [
  "Statusline: savings vs all-Opus, current tier + confidence, local Moo count, live GPU VRAM, verifiable quant.",
  "Moo card (per turn): model · tier · confidence · est. savings vs T3-default.",
  "mooter dashboard / trail --evolution: value over time. mooter explain: built-in teaching.",
], 0.7, 4.3, 11.8, C.white, 13.5);
footer(s, 5, "transparency", true);

// ───────────────────────── Slide 6 · Honesty ─────────────────────────
s = pres.addSlide();
label(s, "Honesty by design");
title(s, "The hard-to-fake differentiator.");
const honesty = [
  ["Verifiable quant", "Q4_K_M shows -72% size · ~99% quality vs FP16 — a real, checkable number, not marketing."],
  ["“none yet” until real", "Adapter slot says ◌ baseline until you install a validated .gguf. No fake LoRA claims."],
  ["Safety boosts shown", "When a prompt escalates tier, the badge names the reason (boosted from T1 · security)."],
  ["Privacy by default", "Admin emails masked (incl. CSV), every view audit-logged, prompt content never shown. Feedback is pseudonymous."],
];
honesty.forEach((h, i) => {
  const x = 0.7 + (i % 2) * 6.05; const y = 2.7 + Math.floor(i / 2) * 1.9;
  card(s, x, y, 5.8, 1.65);
  s.addText(h[0], { x: x + 0.25, y: y + 0.15, w: 5.3, h: 0.4, bold: true, fontSize: 14, color: C.coral });
  s.addText(h[1], { x: x + 0.25, y: y + 0.6, w: 5.3, h: 1, fontSize: 12, color: C.slate });
});
footer(s, 6, "honesty by design");

// ───────────────────────── Slide 7 · What shipped / v1.0 ─────────────────────────
s = pres.addSlide();
label(s, "What shipped — v1.0.0 convergence");
title(s, "Two timelines, one version.");
lead(s, "v1.0.0 unifies the router engine and the Mooter product waves. Legacy tags preserved for provenance.");
card(s, 0.7, 2.8, 5.8, 3.0, C.slatePale);
s.addText("Timeline 1 · router engine", { x: 0.95, y: 3.0, w: 5.3, h: 0.4, bold: true, fontSize: 14, color: C.navy });
bullets(s, ["frugal v0.7–v0.9.4 (Apr 8–10)", "rebrand → mooter 2026-04-14", "arbiter v0.8 → v0.11.0", "1,437-prompt validation, ~90%"], 1.0, 3.5, 5.2, C.text, 12.5);
card(s, 6.8, 2.8, 5.8, 3.0, C.icePale);
s.addText("Timeline 2 · Mooter waves", { x: 7.05, y: 3.0, w: 5.3, h: 0.4, bold: true, fontSize: 14, color: C.navy });
bullets(s, ["v0.1.0-pastor → v0.6.6 (May)", "reveal · safety · auth · dashboard", "Adapter Forge · statusline V2", "onboarding · install URL · admin"], 7.1, 3.5, 5.2, C.text, 12.5);
s.addText("→ v1.0.0 · router + CLI + landing unified · 6 disciplined recons caught real drift", { x: 0.7, y: 6.1, w: 11.8, h: 0.5, fontFace: FONT, fontSize: 13, bold: true, color: C.green });
footer(s, 7, "v1.0 convergence");

// ───────────────────────── Slide 8 · Why Anthropic ─────────────────────────
s = pres.addSlide();
s.background = { color: C.navy };
label(s, "Why Anthropic should care", true);
title(s, "It amplifies the Max plan.", C.white);
bullets(s, [
  "Amplifies Max — happy users spend Max consciously; local absorbs the trivial. Less bill-anxiety churn.",
  "Open-source MIT, zero proxy — no cloud-side competition; it makes Claude Code stickier.",
  "Honest by design — verifiable numbers, “none yet” until real, safety boosts with reasons.",
  "Roadmap — multi-agent local (Wave 7+): Dynamic Workflows backed by local LoRAs ≈ $0/workflow vs Opus.",
], 0.7, 2.6, 11.8, C.white, 15);
s.addText("Realistic TAM: 5–15% of Claude Code Max users. Not a unicorn — a sticky, honest tool for the power slice.", { x: 0.7, y: 6.4, w: 11.8, h: 0.5, fontFace: FONT, fontSize: 13, italic: true, color: C.ice });
footer(s, 8, "why anthropic", true);

// ───────────────────────── Slide 9 · Validation + ask ─────────────────────────
s = pres.addSlide();
label(s, "Validation & the ask");
title(s, "5 vibe coders, one week, real numbers.");
bullets(s, [
  "5 testers across 3 sub-personas (Solo Founder ×2 · Senior IC ×2 · OSS Maintainer ×1), all Max/Team + local hardware.",
  "Install via mooter.ai/onboarding → 1 week normal use → mooter feedback → 30-min call.",
  "Collect: cumulative savings $, tier mix, misroutes, bugs, NPS, retention intent.",
  "Gate: NPS ≥ 8 from ≥ 3 testers → green-light the real Anthropic showcase. Honest aggregate either way.",
], 0.7, 2.6, 11.8, C.text, 14.5);
card(s, 0.7, 6.0, 11.9, 0.9, C.slatePale);
s.addText("The ask: 30 min of your time + intros to power users. In return: a transparent view of how Mooter makes Max stickier.", { x: 0.95, y: 6.15, w: 11.4, h: 0.6, fontFace: FONT, fontSize: 13, bold: true, color: C.navy, valign: "middle" });
footer(s, 9, "validation & ask");

pres.writeFile({ fileName: "MOOTER_SHOWCASE_v1.pptx" }).then((f) => console.log("✓ wrote", f));
