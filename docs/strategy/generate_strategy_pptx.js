/**
 * MOOTER STRATEGY PPTX GENERATOR
 * ================================
 * Gera apresentação .pptx equivalente ao MOOTER_STRATEGY_PRESENTATION.html
 *
 * Como correr:
 *   cd ~/frugal/docs/strategy
 *   npm install pptxgenjs
 *   node generate_strategy_pptx.js
 *
 * Output: MOOTER_STRATEGY_2026.pptx (mesmo dir)
 */

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3" × 7.5"
pres.title = "mooter.ai — The Skill-Pack Router · Strategic Deck 2026";
pres.author = "Paulo Loureiro";
pres.subject = "Mooter v2 Pastor + Adapter Forge — strategic overview";

// ============== Color palette · Midnight Executive ==============
const C = {
  navy: "1E2761",
  navyDeep: "141A47",
  ice: "CADCFC",
  icePale: "E8F0FE",
  coral: "F96167",
  coralSoft: "FCE7E8",
  green: "10B981",
  greenPale: "D1FAE5",
  gold: "F59E0B",
  goldPale: "FEF3C7",
  slate: "475569",
  slateLight: "94A3B8",
  slatePale: "F1F5F9",
  text: "0F172A",
  textMuted: "64748B",
  border: "E2E8F0",
  white: "FFFFFF",
};

// ============== Helpers ==============
function addFooter(slide, n, label, dark = false) {
  slide.addText(label, {
    x: 0.5, y: 7.0, w: 8, h: 0.3,
    fontSize: 10, fontFace: "Calibri",
    color: dark ? C.slateLight : C.textMuted,
  });
  slide.addText(`${String(n).padStart(2, "0")} / 20`, {
    x: 11.8, y: 7.0, w: 1, h: 0.3,
    fontSize: 10, fontFace: "Calibri", bold: true,
    color: dark ? C.ice : C.textMuted,
    align: "right",
  });
  slide.addShape(pres.shapes.LINE, {
    x: 0.5, y: 6.95, w: 12.3, h: 0,
    line: { color: dark ? "FFFFFF22" : C.border, width: 0.5 },
  });
}

function addLabel(slide, txt, x = 0.7, y = 0.5, dark = false) {
  slide.addText(txt.toUpperCase(), {
    x, y, w: 12, h: 0.3,
    fontSize: 11, fontFace: "Calibri", bold: true,
    color: dark ? C.coral : C.coral,
    charSpacing: 4,
  });
}

function addTitle(slide, txt, x = 0.7, y = 0.9, w = 12, color = C.text) {
  slide.addText(txt, {
    x, y, w, h: 0.9,
    fontSize: 32, fontFace: "Calibri", bold: true,
    color, valign: "top", margin: 0,
  });
}

function addLead(slide, txt, x = 0.7, y = 1.9, w = 11.5, color = C.text) {
  slide.addText(txt, {
    x, y, w, h: 1.0,
    fontSize: 16, fontFace: "Calibri",
    color, valign: "top",
  });
}

function addCard(slide, x, y, w, h, fillColor = C.white, borderColor = C.border) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: fillColor },
    line: { color: borderColor, width: 1 },
    rectRadius: 0.08,
  });
}

// ============== SLIDE 1 · COVER ==============
let s = pres.addSlide();
s.background = { color: C.navy };

s.addText("STRATEGIC DECK · MAY 2026", {
  x: 0.7, y: 1.8, w: 12, h: 0.4,
  fontSize: 14, fontFace: "Calibri", bold: true,
  color: C.coral, charSpacing: 6,
});
s.addText("mooter.ai", {
  x: 0.7, y: 2.3, w: 12, h: 1.8,
  fontSize: 88, fontFace: "Calibri", bold: true,
  color: C.white, valign: "top", margin: 0,
});
s.addText("The Skill-Pack Router · Pastor Alemão", {
  x: 0.7, y: 4.0, w: 12, h: 0.6,
  fontSize: 28, fontFace: "Calibri",
  color: C.ice,
});

// Tagline box
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 5.0, w: 12, h: 1.4,
  fill: { color: "FFFFFF", transparency: 92 },
  line: { color: "FFFFFF00" },
});
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 5.0, w: 0.08, h: 1.4,
  fill: { color: C.coral }, line: { color: C.coral },
});
s.addText([
  { text: "The only AI router that picks not just ", options: { color: C.white, fontSize: 19 } },
  { text: "the model", options: { color: C.white, fontSize: 19, italic: true } },
  { text: " — but the ", options: { color: C.white, fontSize: 19 } },
  { text: "tools, the weights, and the entire stack", options: { color: C.white, fontSize: 19, bold: true } },
  { text: ".\n", options: { color: C.white, fontSize: 19 } },
  { text: "Before the first token.", options: { color: C.coral, fontSize: 22, bold: true } },
], {
  x: 1.0, y: 5.15, w: 11.6, h: 1.2,
  fontFace: "Calibri", valign: "middle",
});

s.addText("Paulo Loureiro · 2026-05-27 · Wave 1 in progress", {
  x: 0.7, y: 6.7, w: 12, h: 0.4,
  fontSize: 13, fontFace: "Calibri",
  color: C.ice,
});

// ============== SLIDE 2 · THE PROBLEM ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "The problem · stack AI 2026");
addTitle(s, "Três forças tornam o stack AI hoje ingovernável");
addLead(s, "O vibe coder paga 5 subscriptions, instala 50 MCPs, escolhe entre 6 frameworks de agentes — e ainda assim não sabe qual usar para cada tarefa específica.");

const problemCards = [
  { num: "1", title: "Modelos proliferam", note: "Opus 4.7, GPT-5, Gemini 3.1, Llama 4, Qwen 3.5, DeepSeek-R1...", body: "Cada modelo tem sweet-spot, custo, latência, contexto diferentes. Escolher errado custa 10-50× mais por turn." },
  { num: "2", title: "MCP Registry explode", note: "~10 000+ servers em PulseMCP / Smithery / Composio.", body: "Anthropic registry oficial cobre ~20%. Sem ranking unificado, qual usar para X?" },
  { num: "3", title: "Skills sem registry oficial", note: "Anthropic Skills: 17 oficiais · comunidade: ~66 000+", body: "Discovery e qualidade são caóticas. Nenhum 'ranker' emergiu ainda." },
];
problemCards.forEach((card, i) => {
  const x = 0.7 + i * 4.2;
  addCard(s, x, 3.2, 3.9, 2.6);
  s.addShape(pres.shapes.OVAL, {
    x: x + 0.3, y: 3.5, w: 0.6, h: 0.6,
    fill: { color: C.coral }, line: { color: C.coral },
  });
  s.addText(card.num, {
    x: x + 0.3, y: 3.5, w: 0.6, h: 0.6,
    fontSize: 18, fontFace: "Calibri", bold: true,
    color: C.white, align: "center", valign: "middle", margin: 0,
  });
  s.addText(card.title, {
    x: x + 0.3, y: 4.25, w: 3.5, h: 0.4,
    fontSize: 18, fontFace: "Calibri", bold: true, color: C.text,
  });
  s.addText(card.note, {
    x: x + 0.3, y: 4.7, w: 3.5, h: 0.4,
    fontSize: 12, fontFace: "Calibri", italic: true, color: C.textMuted,
  });
  s.addText(card.body, {
    x: x + 0.3, y: 5.1, w: 3.5, h: 0.7,
    fontSize: 12, fontFace: "Calibri", color: C.text,
  });
});

// Tagline
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 6.1, w: 12.0, h: 0.7,
  fill: { color: C.icePale }, line: { color: C.icePale },
});
s.addShape(pres.shapes.RECTANGLE, {
  x: 0.7, y: 6.1, w: 0.08, h: 0.7,
  fill: { color: C.coral }, line: { color: C.coral },
});
s.addText([
  { text: "Resultado: ", options: { fontSize: 15, color: C.text } },
  { text: "tempo perdido a escolher", options: { fontSize: 15, color: C.text, bold: true } },
  { text: ", ", options: { fontSize: 15, color: C.text } },
  { text: "dinheiro queimado", options: { fontSize: 15, color: C.text, bold: true } },
  { text: " em modelo errado, e ferramentas certas que ficam por descobrir.", options: { fontSize: 15, color: C.text } },
], {
  x: 1.0, y: 6.15, w: 11.5, h: 0.6,
  fontFace: "Calibri", valign: "middle",
});

addFooter(s, 2, "mooter.ai · The Skill-Pack Router");

// ============== SLIDE 3 · THE THESIS ==============
s = pres.addSlide();
s.background = { color: C.navy };
addLabel(s, "A tese · em uma frase", 0.7, 0.5, true);

s.addText([
  { text: "O Mooter não escolhe o modelo.\n", options: { fontSize: 44, color: C.white, bold: true } },
  { text: "Escolhe o ", options: { fontSize: 44, color: C.white, bold: true } },
  { text: "rebanho", options: { fontSize: 44, color: C.coral, bold: true } },
  { text: ":", options: { fontSize: 44, color: C.white, bold: true } },
], {
  x: 0.7, y: 1.8, w: 12, h: 2.5,
  fontFace: "Calibri", valign: "top", margin: 0,
});

s.addText([
  { text: "modelo ", options: { fontSize: 28, color: C.ice } },
  { text: "+", options: { fontSize: 28, color: C.white, bold: true } },
  { text: " ferramentas ", options: { fontSize: 28, color: C.ice } },
  { text: "+", options: { fontSize: 28, color: C.white, bold: true } },
  { text: " exemplos ", options: { fontSize: 28, color: C.ice } },
  { text: "+", options: { fontSize: 28, color: C.white, bold: true } },
  { text: " pesos.", options: { fontSize: 28, color: C.ice } },
], {
  x: 0.7, y: 4.2, w: 12, h: 0.8,
  fontFace: "Calibri",
});

s.addText("Antes do primeiro token.", {
  x: 0.7, y: 5.2, w: 12, h: 0.8,
  fontSize: 32, fontFace: "Calibri", bold: true, color: C.coral,
});

addFooter(s, 3, "mooter.ai · core thesis", true);

// ============== SLIDE 4 · EIXO 1 ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Eixo 1 · Complexity routing · já existe");
addTitle(s, "Tier T0–T3 — rota cada prompt para o modelo mínimo viável");
addLead(s, "O classify.js v3 em produção desde Abril 2026 classifica cada prompt em < 50 ms e direciona-o para o tier certo.");

const tiers = [
  { tier: "T0", model: "Ollama local", cost: "$0", desc: "qwen3:30b · 83.9%", color: C.green },
  { tier: "T1", model: "Haiku 4.5", cost: "~$0.001", desc: "Commit msg · ~6%", color: C.ice },
  { tier: "T2", model: "Sonnet 4.6", cost: "~$0.010", desc: "Bug hunt · ~6%", color: C.gold },
  { tier: "T3", model: "Opus 4.7", cost: "~$0.050", desc: "Architecture · ~4%", color: C.coral },
];
tiers.forEach((t, i) => {
  const x = 0.7 + i * 3.1;
  addCard(s, x, 3.0, 2.9, 2.5);
  s.addShape(pres.shapes.RECTANGLE, {
    x, y: 3.0, w: 2.9, h: 0.1,
    fill: { color: t.color }, line: { color: t.color },
  });
  s.addText(t.tier, {
    x: x + 0.3, y: 3.2, w: 2.5, h: 0.5,
    fontSize: 24, fontFace: "Calibri", bold: true, color: t.color === C.ice ? C.navy : t.color,
  });
  s.addText(t.model, {
    x: x + 0.3, y: 3.7, w: 2.5, h: 0.3,
    fontSize: 12, fontFace: "Calibri", color: C.textMuted,
  });
  s.addText(t.cost, {
    x: x + 0.3, y: 4.05, w: 2.5, h: 0.6,
    fontSize: 28, fontFace: "Calibri", bold: true, color: C.coral,
  });
  s.addText(t.desc, {
    x: x + 0.3, y: 4.8, w: 2.5, h: 0.4,
    fontSize: 11, fontFace: "Calibri", color: C.text,
  });
});

// Stats banner
addCard(s, 0.7, 5.8, 12.0, 1.0, C.icePale, C.icePale);
const stats = [
  { val: "90.2%", lbl: "Savings validados" },
  { val: "1 437", lbl: "Prompts medidos" },
  { val: "< 50 ms", lbl: "Latência p50" },
];
stats.forEach((st, i) => {
  s.addText(st.val, {
    x: 0.95 + i * 3.6, y: 5.9, w: 3, h: 0.5,
    fontSize: 26, fontFace: "Calibri", bold: true, color: C.coral,
  });
  s.addText(st.lbl, {
    x: 0.95 + i * 3.6, y: 6.4, w: 3, h: 0.3,
    fontSize: 11, fontFace: "Calibri", color: C.textMuted,
    charSpacing: 1,
  });
});
s.addText("Em produção · base sobre a qual se constrói o Pastor", {
  x: 10.6, y: 6.1, w: 2.2, h: 0.6,
  fontSize: 11, fontFace: "Calibri", italic: true, color: C.textMuted, valign: "middle",
});

addFooter(s, 4, "Eixo 1 · classify.js v3 · 2026-04-15 GA");

// ============== SLIDE 5 · EIXO 2 (PASTOR) ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Eixo 2 · Domain routing · Pastor v2 (Wave 1-4)");
addTitle(s, "Domínio da tarefa → Moo Pack");
addLead(s, "O classifier ganha um segundo eixo ortogonal: além da complexidade, identifica o domínio e selecciona um Pack (bundle de skills + MCPs + sub-agentes + repos + scaffold).");

// Flow diagram using shapes
// Box 1: User prompt
addCard(s, 0.7, 3.2, 2.2, 0.9, C.icePale, C.navy);
s.addText("UserPromptSubmit", { x: 0.8, y: 3.3, w: 2.0, h: 0.4, fontSize: 12, fontFace: "Calibri", bold: true, color: C.navy });
s.addText("'animar este hero'", { x: 0.8, y: 3.7, w: 2.0, h: 0.3, fontSize: 10, fontFace: "Calibri", italic: true, color: C.slate });

// Arrows + Eixo 1 (top)
s.addShape(pres.shapes.LINE, { x: 2.9, y: 3.5, w: 0.7, h: -0.5, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
addCard(s, 3.6, 2.6, 3.8, 0.9, C.ice, C.navy);
s.addText("EIXO 1 · classify_complexity()", { x: 3.7, y: 2.7, w: 3.6, h: 0.4, fontSize: 12, fontFace: "Calibri", bold: true, color: C.navy });
s.addText("→ T2 (Sonnet 4.6)", { x: 3.7, y: 3.05, w: 3.6, h: 0.35, fontSize: 13, fontFace: "Calibri", bold: true, color: C.coral });

// Arrow + Eixo 2 (bottom)
s.addShape(pres.shapes.LINE, { x: 2.9, y: 3.7, w: 0.7, h: 0.5, line: { color: C.coral, width: 1.5, endArrowType: "triangle" } });
addCard(s, 3.6, 4.0, 3.8, 0.9, C.coralSoft, C.coral);
s.addText("EIXO 2 · classify_domain()", { x: 3.7, y: 4.1, w: 3.6, h: 0.4, fontSize: 12, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("→ Pack: animation-web", { x: 3.7, y: 4.45, w: 3.6, h: 0.35, fontSize: 13, fontFace: "Calibri", bold: true, color: C.navy });

// Arrows → output
s.addShape(pres.shapes.LINE, { x: 7.4, y: 3.0, w: 0.6, h: 0.6, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
s.addShape(pres.shapes.LINE, { x: 7.4, y: 4.4, w: 0.6, h: -0.6, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });

// Output box
addCard(s, 8.0, 3.2, 4.8, 0.9, C.navy, C.navy);
s.addText("<router-hint> + <pack-hint>", { x: 8.1, y: 3.25, w: 4.6, h: 0.35, fontSize: 12, fontFace: "Calibri", bold: true, color: C.white });
s.addText("tier=T2 · pack=animation-web · skills · MCPs · scaffold", { x: 8.1, y: 3.65, w: 4.6, h: 0.35, fontSize: 11, fontFace: "Calibri", color: C.ice });

// 2 cards bottom
addCard(s, 0.7, 5.2, 6.0, 1.4);
s.addText("O classifier de domínio escolhe entre Moo Packs", { x: 0.95, y: 5.35, w: 5.6, h: 0.4, fontSize: 14, fontFace: "Calibri", bold: true, color: C.text });
s.addText("Camada regex (5 ms) → embedding (50 ms opcional) → Haiku semantic fallback (800 ms) se confidence < 0.6.", { x: 0.95, y: 5.75, w: 5.6, h: 0.7, fontSize: 12, fontFace: "Calibri", color: C.textMuted });

addCard(s, 6.9, 5.2, 5.8, 1.4);
s.addText("O pastor cerca o rebanho certo", { x: 7.15, y: 5.35, w: 5.4, h: 0.4, fontSize: 14, fontFace: "Calibri", bold: true, color: C.text });
s.addText("Pack diz exactamente quais skills invocar, MCPs ligar, sub-agentes delegar. Stack montada antes do primeiro token.", { x: 7.15, y: 5.75, w: 5.4, h: 0.7, fontSize: 12, fontFace: "Calibri", color: C.textMuted });

addFooter(s, 5, "Eixo 2 · Pastor v2 · Wave 1-4 (5 semanas)");

// ============== SLIDE 6 · EIXO 3 ADAPTER FORGE ==============
s = pres.addSlide();
s.background = { color: C.navy };
addLabel(s, "Eixo 3 · Specialization · Adapter Forge (Wave 5)", 0.7, 0.5, true);
addTitle(s, "Cada projecto treina o teu Mooter um pouco mais", 0.7, 0.9, 12, C.white);
addLead(s, "O classifier ganha um terceiro eixo. Adapter LoRA/DoRA local (por projecto e/ou por pack) eleva qualidade de T1/T2 local para próximo do tier cloud — sem mover-se do hardware.", 0.7, 1.9, 12, C.ice);

// 3 eixos stacked
addCard(s, 0.7, 3.4, 5.5, 0.7, "1E276166", C.ice);
s.addText("Eixo 1 · classify_complexity()  →  Tier T0-T3 (modelo)", { x: 0.9, y: 3.45, w: 5.2, h: 0.6, fontSize: 13, fontFace: "Calibri", color: C.ice, valign: "middle" });

addCard(s, 0.7, 4.25, 5.5, 0.7, "1E276166", C.ice);
s.addText("Eixo 2 · classify_domain()  →  Moo Pack ID", { x: 0.9, y: 4.3, w: 5.2, h: 0.6, fontSize: 13, fontFace: "Calibri", color: C.ice, valign: "middle" });

addCard(s, 0.7, 5.1, 5.5, 0.7, C.coral, C.coral);
s.addText("Eixo 3 · classify_specialization()  →  Project / Pack LoRA", { x: 0.9, y: 5.15, w: 5.2, h: 0.6, fontSize: 13, fontFace: "Calibri", bold: true, color: C.white, valign: "middle" });

// Arrow down + stack
s.addShape(pres.shapes.LINE, { x: 3.45, y: 5.85, w: 0, h: 0.35, line: { color: C.ice, width: 2, endArrowType: "triangle" } });
addCard(s, 0.7, 6.2, 5.5, 0.55, C.navyDeep, C.white);
s.addText("modelo + pack + adapter (opcional)", { x: 0.9, y: 6.22, w: 5.2, h: 0.5, fontSize: 13, fontFace: "Calibri", bold: true, color: C.white, valign: "middle" });

// Right column: dois sabores
s.addText("Dois sabores de adapter", { x: 6.7, y: 3.4, w: 6, h: 0.4, fontSize: 18, fontFace: "Calibri", bold: true, color: C.coral });

s.addTable([
  [
    { text: "Adapter", options: { bold: true, color: C.ice, fill: { color: "FFFFFF11" }, fontSize: 11 } },
    { text: "Onde mora", options: { bold: true, color: C.ice, fill: { color: "FFFFFF11" }, fontSize: 11 } },
    { text: "Activa quando", options: { bold: true, color: C.ice, fill: { color: "FFFFFF11" }, fontSize: 11 } },
  ],
  [
    { text: "Project LoRA", options: { color: C.white, bold: true, fontSize: 11 } },
    { text: "<repo>/.mooter/project.lora", options: { color: C.white, fontSize: 10, fontFace: "Consolas" } },
    { text: "repo_fingerprint × pack match", options: { color: C.white, fontSize: 11 } },
  ],
  [
    { text: "Pack LoRA", options: { color: C.white, bold: true, fontSize: 11 } },
    { text: "Pack Registry (hub)", options: { color: C.white, fontSize: 11 } },
    { text: "pack_id match + opt-in", options: { color: C.white, fontSize: 11 } },
  ],
], {
  x: 6.7, y: 3.85, w: 6.0, colW: [1.4, 2.4, 2.2],
  border: { type: "solid", pt: 0.5, color: "FFFFFF22" },
  fill: { color: "FFFFFF00" },
});

addCard(s, 6.7, 5.6, 6.0, 1.15, "F9616722", C.coral);
s.addText("Switching cost biológico", { x: 6.9, y: 5.7, w: 5.6, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("Depois de 60-90 dias o teu LoRA vale tempo real para ti — migrar para outro router perde-o.", { x: 6.9, y: 6.0, w: 5.6, h: 0.7, fontSize: 12, fontFace: "Calibri", color: C.ice });

addFooter(s, 6, "Eixo 3 · Adapter Forge · Wave 5 (8 dias, post-launch)", true);

// ============== SLIDE 7 · MOO PACK ANATOMY ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Anatomia · Moo Pack manifest");
addTitle(s, "Um Pack é um manifesto declarativo · zero código");
addLead(s, "Ficheiro YAML em packs/<name>/pack.yaml. Descreve quando activar, o que invocar, e como compor o scaffold de sistema.");

// Code box (left)
addCard(s, 0.7, 3.0, 7.5, 3.8, C.navyDeep, C.navyDeep);
const yamlContent = `# packs/animation-web/pack.yaml
name: animation-web
version: 0.1.0
domain_signals:
  keywords: [animation, motion, scroll-trigger]
  intent_phrases: ["fazer animar", "transição suave"]
  file_extensions: [.tsx, .jsx, .css, .svg]
model_floor: T2
skills:
  required: [anthropic-skills:web-artifacts-builder]
mcps:
  recommended: [vercel, motion-canvas]
subagents:
  primary: model-reasoner
repos_canonical:
  - name: motion
    url: https://motion.dev
    license: MIT
prompt_scaffold: |
  Default Motion (motion.dev) para React.
  60fps non-negotiable. Respeita prefers-reduced-motion.
adapter:  # opcional (Wave 5)
  name: animation-web-lora-v1
  base_model: qwen3:14b
  format: dora
  rank: 32`;
s.addText(yamlContent, {
  x: 0.9, y: 3.1, w: 7.1, h: 3.6,
  fontSize: 10, fontFace: "Consolas",
  color: "E5E7EB", valign: "top",
});

// 3 cards right
const rcards = [
  { title: "Composição declarativa", body: "O Pack diz o quê, não como. O runtime resolve skills disponíveis, MCPs ligados, sugere instalação do que falta.", bg: C.icePale, titleColor: C.navy },
  { title: "Trust score sindicado", body: "Cada pack tem trust_score 0–1 calculado pelo hub (uso, validações, feedback). Discovery objectiva.", bg: C.coralSoft, titleColor: C.coral },
  { title: "Adapter opcional", body: "Wave 5: pack pode ter LoRA treinado em corpus público + traces sintéticas legais para o domínio.", bg: C.slatePale, titleColor: C.text },
];
rcards.forEach((c, i) => {
  const y = 3.0 + i * 1.3;
  addCard(s, 8.4, y, 4.3, 1.15, c.bg, c.bg);
  s.addText(c.title, { x: 8.6, y: y + 0.1, w: 4.0, h: 0.35, fontSize: 14, fontFace: "Calibri", bold: true, color: c.titleColor });
  s.addText(c.body, { x: 8.6, y: y + 0.45, w: 4.0, h: 0.7, fontSize: 11, fontFace: "Calibri", color: C.text });
});

addFooter(s, 7, "Schema completo · PASTOR.md §4");

// ============== SLIDE 8 · PASTOR EM RUNTIME ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Pastor em runtime · pipeline completo");
addTitle(s, "Do prompt à stack montada · < 60 ms p99");

// User prompt
addCard(s, 0.5, 2.7, 1.7, 0.7, C.icePale, C.navy);
s.addText("Prompt user", { x: 0.55, y: 2.78, w: 1.6, h: 0.3, fontSize: 11, fontFace: "Calibri", bold: true, color: C.navy, align: "center" });
s.addText("'animar...'", { x: 0.55, y: 3.05, w: 1.6, h: 0.3, fontSize: 9, fontFace: "Calibri", italic: true, color: C.slate, align: "center" });
s.addShape(pres.shapes.LINE, { x: 2.2, y: 3.05, w: 0.4, h: 0, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });

// Hook
addCard(s, 2.6, 2.7, 1.8, 0.7, C.navy, C.navy);
s.addText("Hook", { x: 2.65, y: 2.78, w: 1.7, h: 0.3, fontSize: 12, fontFace: "Calibri", bold: true, color: C.white, align: "center" });
s.addText("inject_context.js", { x: 2.65, y: 3.05, w: 1.7, h: 0.3, fontSize: 9, fontFace: "Calibri", color: C.ice, align: "center" });
s.addShape(pres.shapes.LINE, { x: 4.4, y: 3.05, w: 0.3, h: 0, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });

// 3 classifiers
const cls = [
  { y: 2.4, fill: C.ice, brd: C.navy, txt: C.navy, name: "classify_complexity()", out: "→ T2 · eixo 1 · 5ms" },
  { y: 3.3, fill: C.coralSoft, brd: C.coral, txt: C.coral, name: "classify_domain()", out: "→ animation-web · eixo 2 · 5ms" },
  { y: 4.2, fill: C.goldPale, brd: C.gold, txt: "92400E", name: "classify_specialization()", out: "→ project.lora · eixo 3 · 5ms" },
];
cls.forEach((c) => {
  addCard(s, 4.7, c.y, 3.3, 0.7, c.fill, c.brd);
  s.addText(c.name, { x: 4.8, y: c.y + 0.07, w: 3.1, h: 0.3, fontSize: 11, fontFace: "Calibri", bold: true, color: c.txt });
  s.addText(c.out, { x: 4.8, y: c.y + 0.4, w: 3.1, h: 0.25, fontSize: 9, fontFace: "Calibri", color: C.slate });
});

// Lines converge
s.addShape(pres.shapes.LINE, { x: 8.0, y: 2.7, w: 0.4, h: 1.3, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
s.addShape(pres.shapes.LINE, { x: 8.0, y: 3.6, w: 0.4, h: 0.4, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
s.addShape(pres.shapes.LINE, { x: 8.0, y: 4.5, w: 0.4, h: -0.5, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });

// pack_resolve
addCard(s, 8.4, 3.65, 1.9, 0.7, C.navy, C.navy);
s.addText("pack_resolve()", { x: 8.45, y: 3.72, w: 1.8, h: 0.3, fontSize: 11, fontFace: "Calibri", bold: true, color: C.white, align: "center" });
s.addText("gap analysis · 20 ms", { x: 8.45, y: 4.0, w: 1.8, h: 0.3, fontSize: 9, fontFace: "Calibri", color: C.ice, align: "center" });

// → emit
s.addShape(pres.shapes.LINE, { x: 10.3, y: 4.0, w: 0.3, h: 0, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
addCard(s, 10.6, 3.65, 2.1, 0.7, C.coral, C.coral);
s.addText("emit hints", { x: 10.65, y: 3.72, w: 2.0, h: 0.3, fontSize: 11, fontFace: "Calibri", bold: true, color: C.white, align: "center" });
s.addText("<router-hint> + <pack-hint>", { x: 10.65, y: 4.0, w: 2.0, h: 0.3, fontSize: 9, fontFace: "Calibri", color: "FCE7E8", align: "center" });

// → Claude acts
s.addShape(pres.shapes.LINE, { x: 11.6, y: 4.4, w: 0, h: 0.6, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
addCard(s, 9.6, 5.0, 3.1, 0.8, C.green, C.green);
s.addText("Claude age", { x: 9.7, y: 5.1, w: 3.0, h: 0.3, fontSize: 12, fontFace: "Calibri", bold: true, color: C.white, align: "center" });
s.addText("invoca skills + MCPs + scaffold", { x: 9.7, y: 5.4, w: 3.0, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.greenPale, align: "center" });

// Feedback loop (dashed)
s.addShape(pres.shapes.LINE, { x: 9.6, y: 5.4, w: -6.5, h: 0, line: { color: C.slate, width: 1, dashType: "dash", endArrowType: "triangle" } });
s.addText("feedback signal → decisions.log → cron retrain (eixo 3)", {
  x: 3.0, y: 5.5, w: 7, h: 0.4,
  fontSize: 10, fontFace: "Calibri", italic: true, color: C.slate,
});

// Summary box
addCard(s, 0.7, 6.0, 12.0, 0.6, C.icePale, C.icePale);
s.addText("Total budget: < 60 ms p99 (sem Haiku fallback) · backward-compat com classify.js v3 (eixo 1 inalterado)", {
  x: 0.9, y: 6.05, w: 11.7, h: 0.5,
  fontSize: 12, fontFace: "Calibri", color: C.navy, valign: "middle",
});

addFooter(s, 8, "Pipeline runtime · backward-compat com classify.js v3");

// ============== SLIDE 9 · 7 PACKS SEMENTINHA ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Cobertura · 7 packs sementinha cobrem ~80% dos pedidos");
addTitle(s, "O rebanho inicial");

const packs = [
  { name: "animation-web", desc: "Motion graphics · scroll · transitions", badges: ["T2", "motion.dev"], color: C.coral },
  { name: "diagram-systems", desc: "Mermaid · D2 · architecture · C4", badges: ["T1-T3", "Mermaid"], color: C.gold },
  { name: "data-spreadsheet", desc: "XLSX · Pivot · cross-reference · Polars", badges: ["T2-T3", "openpyxl"], color: C.green },
  { name: "code-audit", desc: "Semgrep + Snyk + GitGuardian", badges: ["T3", "Opus gate"], color: C.coral },
  { name: "prd-strategy", desc: "PRD · OKR · roadmap · RICE", badges: ["T2", "feature-spec"], color: C.ice },
  { name: "voice-tts", desc: "Cartesia · ElevenLabs · Hume", badges: ["T1", "low-latency"], color: C.gold },
  { name: "knowledge-third-brain", desc: "Notion · Obsidian · MegaMem", badges: ["T1", "third brain"], color: C.green },
  { name: "+ N (community)", desc: "Wave 4 abre publishing community", badges: ["future"], color: C.slateLight },
];
packs.forEach((p, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const x = 0.7 + col * 3.1;
  const y = 2.7 + row * 1.8;
  addCard(s, x, y, 2.9, 1.6);
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.9, h: 0.08, fill: { color: p.color }, line: { color: p.color } });
  s.addText(p.name, {
    x: x + 0.2, y: y + 0.2, w: 2.6, h: 0.4,
    fontSize: 15, fontFace: "Calibri", bold: true, color: i === 7 ? C.slate : C.text,
  });
  s.addText(p.desc, {
    x: x + 0.2, y: y + 0.65, w: 2.6, h: 0.5,
    fontSize: 10, fontFace: "Calibri", color: C.textMuted,
  });
  p.badges.forEach((b, bi) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.2 + bi * 1.2, y: y + 1.2, w: 1.1, h: 0.3,
      fill: { color: C.icePale }, line: { color: C.icePale }, rectRadius: 0.05,
    });
    s.addText(b, {
      x: x + 0.2 + bi * 1.2, y: y + 1.2, w: 1.1, h: 0.3,
      fontSize: 10, fontFace: "Calibri", bold: true, color: C.navy, align: "center", valign: "middle",
    });
  });
});

// Bottom highlight
addCard(s, 0.7, 6.2, 12.0, 0.55, C.icePale, C.icePale);
s.addText("Cada pack é um rebanho convocado para uma classe específica de tarefa · cita repos canónicos da research 2026 · zero fontes inventadas", {
  x: 0.9, y: 6.25, w: 11.6, h: 0.5,
  fontSize: 12, fontFace: "Calibri", color: C.navy, valign: "middle",
});

addFooter(s, 9, "Specs completos · PASTOR.md §5");

// ============== SLIDE 10 · HARDWARE QUANTIZATION ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Hardware-aware quantization · Eixo 0 do balanço");
addTitle(s, "O modelo certo para o teu hardware — sem escolher");
addLead(s, "Onboarding detecta GPU / VRAM / subscriptions e auto-decide quantização + modelo base que cabe. Routing T0 nunca pede o que não corre.");

s.addTable([
  [
    { text: "Hardware", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "VRAM", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Modelo T0", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Quant", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Footprint", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Performance", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
  ],
  ["RTX 4090", "24 GB", "qwen3:30b (MoE)", "Q4_K_M", "~18 GB", "40-60 tok/s · best T0"],
  ["RTX 4080 / 4070 Ti", "16 GB", "qwen3:14b", "Q5_K_M", "~10 GB", "30-50 tok/s · solid T0"],
  ["RTX 4070 / 3070", "12 GB", "qwen2.5-coder:14b", "Q4_K_M", "~9 GB", "25-40 tok/s · code"],
  ["MacBook M2/M3", "16 GB unif.", "qwen3:8b", "Q5_K_M", "~6 GB", "25-40 tok/s · Metal"],
  ["Sem GPU", "—", "—", "—", "—", "Bypass T0 → cloud T1+"],
], {
  x: 0.7, y: 3.0, w: 12.0, colW: [2.0, 1.3, 2.4, 1.4, 1.5, 3.4],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontSize: 11, fontFace: "Calibri", color: C.text,
});

const qcards = [
  { title: "Detection automática", body: "gpu-probe.js identifica NVIDIA / Apple Silicon / AMD / CPU em < 1s no first-run.", bg: C.icePale, color: C.navy },
  { title: "Quantização não é loss", body: "Q4_K_M perde < 2% accuracy vs FP16 em coding · 4× menor · 3× faster.", bg: C.coralSoft, color: C.coral },
  { title: "Recommendation engine", body: "Se VRAM permite upgrade, recomenda modelo maior com 1-click pull.", bg: C.greenPale, color: "065F46" },
];
qcards.forEach((c, i) => {
  const x = 0.7 + i * 4.2;
  addCard(s, x, 5.7, 3.9, 1.05, c.bg, c.bg);
  s.addText(c.title, { x: x + 0.2, y: 5.78, w: 3.6, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: c.color });
  s.addText(c.body, { x: x + 0.2, y: 6.1, w: 3.6, h: 0.65, fontSize: 11, fontFace: "Calibri", color: C.text });
});

addFooter(s, 10, "onboarding.js · hw-capability.json · budget-engine.js");

// ============== SLIDE 11 · SUBSCRIPTION ORCHESTRATION ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Subscription orchestration · usa o que já pagas");
addTitle(s, "O Mooter não te força mais 1 subscription");
addLead(s, "Mapeia subscriptions activas → tier de routing óptimo. Maximiza utilização das mais caras antes de gastar PAYG.");

s.addTable([
  [
    { text: "Subscription", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Custo", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Capacidade", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Tier alocado", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Estratégia Mooter", options: { bold: true, color: C.text, fill: { color: C.slatePale }, fontSize: 11 } },
  ],
  ["Claude Max", "$200/m", "~40h Opus / ~480h Sonnet por janela 5h", "T3 + T2", "Reserva Opus para arquitectura"],
  ["Claude Pro", "$20/m", "Sonnet limit · Haiku abundante", "T2 + T1", "Cap Sonnet · default Haiku"],
  ["OpenAI Plus", "$20/m", "GPT-5 com limits", "T2 fallback", "Provider arbitrage (Layer 10)"],
  ["Anthropic API PAYG", "per token", "Sem cap", "T1 + T3 over-cap", "Failover quando Max esgota"],
  ["Ollama local", "$0", "RTX 4090 · 30B MoE", "T0 (83.9%)", "Default sempre"],
], {
  x: 0.7, y: 3.0, w: 12.0, colW: [2.2, 1.2, 3.5, 1.7, 3.4],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontSize: 10.5, fontFace: "Calibri", color: C.text,
});

// Bottom two boxes
addCard(s, 0.7, 5.4, 6.0, 1.3, C.greenPale, C.green);
s.addText("Ganho real medido (90 dias)", { x: 0.95, y: 5.5, w: 5.6, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: "065F46" });
s.addText([
  { text: "PAYG sem Mooter: ", options: { fontSize: 12 } },
  { text: "$320/mês\n", options: { fontSize: 12, bold: true } },
  { text: "PAYG com Mooter: ", options: { fontSize: 12 } },
  { text: "$28/mês\n", options: { fontSize: 12, bold: true } },
  { text: "Savings: ", options: { fontSize: 12 } },
  { text: "91.3% · $3504/ano", options: { fontSize: 13, bold: true, color: "065F46" } },
], { x: 0.95, y: 5.85, w: 5.6, h: 0.8, fontFace: "Calibri", color: C.text });

addCard(s, 6.9, 5.4, 5.8, 1.3, C.coralSoft, C.coral);
s.addText("Provider arbitrage (Layer 10)", { x: 7.15, y: 5.5, w: 5.4, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("Side-car poll 60s sobre status APIs. Se Anthropic degrada → failover GPT-5. RDTR emit reason 'anthropic=degraded, failover→openai'.", {
  x: 7.15, y: 5.85, w: 5.4, h: 0.8, fontSize: 11, fontFace: "Calibri", color: C.text,
});

addFooter(s, 11, "Budget engine + Subscription profile + Provider arbitrage");

// ============== SLIDE 12 · ADAPTER FORGE PIPELINE ==============
s = pres.addSlide();
s.background = { color: C.navy };
addLabel(s, "Adapter Forge · pipeline 8 dias", 0.7, 0.5, true);
addTitle(s, "Como o teu Mooter aprende o teu projecto", 0.7, 0.9, 12, C.white);

const phases = [
  { num: "01", title: "Collect", body: "Telemetry collector extende decisions.log. Cada prompt + output + feedback + latência + tokens. Opt-in explícito.", day: "Dia 1" },
  { num: "02", title: "Curate", body: "Filtros: comprimento, syntax válida, feedback ≥ neutro, MinHash dedup. Pelo menos 5k records por projecto.", day: "Dia 2-3" },
  { num: "03", title: "Train", body: "Unsloth + QLoRA/DoRA r=32. Base: Qwen3-14B. 3 epochs, ~3-6h em RTX 4090. Output: .mooter/project.lora", day: "Dia 4-5" },
  { num: "04", title: "Eval + Deploy", body: "200 hold-out prompts × {local+LoRA, base local, Sonnet 4.6}. Activação só se win-rate vs Sonnet ≥ 60%.", day: "Dia 6-8" },
];
phases.forEach((p, i) => {
  const x = 0.7 + i * 3.1;
  addCard(s, x, 2.5, 2.9, 2.4, "F9616722", C.coral);
  s.addText(p.num, { x: x + 0.2, y: 2.6, w: 2.6, h: 0.6, fontSize: 32, fontFace: "Calibri", bold: true, color: C.coral });
  s.addText(p.title, { x: x + 0.2, y: 3.25, w: 2.6, h: 0.35, fontSize: 15, fontFace: "Calibri", bold: true, color: C.white });
  s.addText(p.body, { x: x + 0.2, y: 3.65, w: 2.6, h: 0.9, fontSize: 10, fontFace: "Calibri", color: C.ice });
  s.addText(p.day, { x: x + 0.2, y: 4.55, w: 2.6, h: 0.25, fontSize: 10, fontFace: "Calibri", color: C.coral, bold: true });
});

// Sweet-spot table
s.addText("Sweet-spot do que vai funcionar", { x: 0.7, y: 5.2, w: 8, h: 0.3, fontSize: 14, fontFace: "Calibri", bold: true, color: C.white });
s.addTable([
  [
    { text: "Vai funcionar (T1-T2)", options: { bold: true, color: C.ice, fill: { color: "FFFFFF11" }, fontSize: 10 } },
    { text: "NÃO vai funcionar (T3)", options: { bold: true, color: C.ice, fill: { color: "FFFFFF11" }, fontSize: 10 } },
  ],
  [
    { text: "✓ Code completion no estilo do projecto", options: { color: C.white, fontSize: 10 } },
    { text: "✗ Reasoning aberto / arquitectura nova", options: { color: C.white, fontSize: 10 } },
  ],
  [
    { text: "✓ Templating boilerplate específico", options: { color: C.white, fontSize: 10 } },
    { text: "✗ Debugging não-trivial fora dos padrões", options: { color: C.white, fontSize: 10 } },
  ],
  [
    { text: "✓ Decisões deterministas (naming, paths)", options: { color: C.white, fontSize: 10 } },
    { text: "✗ Audit de segurança (T3, Opus sempre)", options: { color: C.white, fontSize: 10 } },
  ],
], {
  x: 0.7, y: 5.55, w: 8.0, colW: [4.0, 4.0],
  border: { type: "solid", pt: 0.5, color: "FFFFFF22" },
});

addCard(s, 8.9, 5.55, 3.8, 1.2, "FFFFFF11", C.coral);
s.addText("Gate de saída Wave 5", { x: 9.1, y: 5.65, w: 3.5, h: 0.3, fontSize: 12, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("≥ 1 Project LoRA validado · activado por default · poupa ≥ 30% calls T2 cloud para T1 local, medido em 14 dias.", {
  x: 9.1, y: 5.95, w: 3.5, h: 0.75, fontSize: 10, fontFace: "Calibri", color: C.ice,
});

addFooter(s, 12, "Wave 5 · Eixo 3 · gate de entrada: ≥ 50 utilizadores opt-in", true);

// ============== SLIDE 13 · QUANT vs LORA vs DISTILL ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "As 3 técnicas · não confundir");
addTitle(s, "Quantização ≠ LoRA/DoRA ≠ Distillation");
addLead(s, "A força do Mooter está em combinar as três de forma consciente — cada uma com função distinta.");

s.addTable([
  [
    { text: "", options: { fill: { color: C.slatePale } } },
    { text: "Quantização", options: { bold: true, color: C.coral, fill: { color: C.slatePale }, fontSize: 12, align: "center" } },
    { text: "LoRA / DoRA", options: { bold: true, color: C.gold, fill: { color: C.slatePale }, fontSize: 12, align: "center" } },
    { text: "Distillation", options: { bold: true, color: C.navy, fill: { color: C.slatePale }, fontSize: 12, align: "center" } },
  ],
  [
    { text: "O que faz", options: { bold: true, fontSize: 11 } },
    { text: "Reduz tamanho (peso em RAM/VRAM)", options: { fontSize: 11 } },
    { text: "Adiciona comportamento: estilo, padrões, naming", options: { fontSize: 11 } },
    { text: "Transfere raciocínio prof → aluno", options: { fontSize: 11 } },
  ],
  [
    { text: "O que NÃO faz", options: { bold: true, fontSize: 11 } },
    { text: "Não muda o que sabe", options: { fontSize: 11 } },
    { text: "Não cria inteligência geral nova", options: { fontSize: 11 } },
    { text: "Não fecha gap em capacidades emergentes", options: { fontSize: 11 } },
  ],
  [
    { text: "Custo treino", options: { bold: true, fontSize: 11 } },
    { text: "0 (post-processing)", options: { fontSize: 11 } },
    { text: "3-6h RTX 4090 · ~5k examples", options: { fontSize: 11 } },
    { text: "Variável · depende do dataset", options: { fontSize: 11 } },
  ],
  [
    { text: "Footprint", options: { bold: true, fontSize: 11 } },
    { text: "4× menor (Q4 vs FP16)", options: { fontSize: 11 } },
    { text: "+ 10-200 MB de adapter", options: { fontSize: 11 } },
    { text: "Modelo aluno completo", options: { fontSize: 11 } },
  ],
  [
    { text: "Quando usar", options: { bold: true, fontSize: 11 } },
    { text: "Sempre (modelo local cabe)", options: { fontSize: 11 } },
    { text: "Quando há padrão repetitivo", options: { fontSize: 11 } },
    { text: "Quando aluno tem capacity sem direcção", options: { fontSize: 11 } },
  ],
  [
    { text: "Risco legal", options: { bold: true, fontSize: 11 } },
    { text: "Zero", options: { fontSize: 11, color: "065F46" } },
    { text: "Zero (dados do user)", options: { fontSize: 11, color: "065F46" } },
    { text: "Variável (ToS do modelo prof)", options: { fontSize: 11, color: C.coral } },
  ],
], {
  x: 0.7, y: 2.9, w: 12.0, colW: [2.0, 3.3, 3.3, 3.4],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontFace: "Calibri", color: C.text,
});

// Tagline at bottom
addCard(s, 0.7, 6.0, 12.0, 0.85, C.icePale, C.icePale);
s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 6.0, w: 0.08, h: 0.85, fill: { color: C.coral }, line: { color: C.coral } });
s.addText([
  { text: "Combinadas: ", options: { fontSize: 13, color: C.text } },
  { text: "modelo local pequeno + LoRA do projecto + processo de Sonnet", options: { fontSize: 13, color: C.text, bold: true } },
  { text: " = competitivo com Sonnet em T1-T2 a ", options: { fontSize: 13, color: C.text } },
  { text: "custo $0 ", options: { fontSize: 13, color: C.coral, bold: true } },
  { text: "por chamada.", options: { fontSize: 13, color: C.text } },
], { x: 1.0, y: 6.1, w: 11.5, h: 0.7, fontFace: "Calibri", valign: "middle" });

addFooter(s, 13, "DoRA r=32 default · Unsloth · research 2026-05-27");

// ============== SLIDE 14 · SELF-DISTILL SAFE ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Self-distillation segura · 4 caminhos");
addTitle(s, "Caminho A é o único na Wave 5 · resto requer legal review");
addLead(s, "Anthropic objecta publicamente a distillation directa de outputs Claude. O Mooter respeita os ToS — implementa só o caminho legalmente limpo.");

s.addTable([
  [
    { text: "Caminho", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Dataset source", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Risco ToS", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Recomendação", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Wave", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
  ],
  [
    { text: "A — Self-distillation", options: { bold: true, fontSize: 11, fill: { color: C.greenPale } } },
    { text: "Próprio repo do user (code, commits, docs)", options: { fontSize: 11, fill: { color: C.greenPale } } },
    { text: "✓ Zero — dados do user", options: { fontSize: 11, color: "065F46", fill: { color: C.greenPale } } },
    { text: "MVP. Wave 5 só implementa isto.", options: { fontSize: 11, bold: true, fill: { color: C.greenPale } } },
    { text: "Wave 5", options: { fontSize: 11, bold: true, fill: { color: C.greenPale } } },
  ],
  [
    { text: "B — Adapter comunitário", options: { bold: true, fontSize: 11 } },
    { text: "HF (Qwen3.5-Claude-distilled, 4k+ downloads)", options: { fontSize: 11 } },
    { text: "⚠ Cinza — risco do uploader", options: { fontSize: 11, color: C.gold } },
    { text: "Permitido com aviso + opt-in", options: { fontSize: 11 } },
    { text: "Wave 6", options: { fontSize: 11 } },
  ],
  [
    { text: "C — Open-license models", options: { bold: true, fontSize: 11 } },
    { text: "DeepSeek-R1, Llama 3.x, Qwen3-Coder traces", options: { fontSize: 11 } },
    { text: "✓ Permitido pela licença", options: { fontSize: 11, color: "065F46" } },
    { text: "Wave 6+, opcional", options: { fontSize: 11 } },
    { text: "Wave 7+", options: { fontSize: 11 } },
  ],
  [
    { text: "D — User-owned Opus outputs", options: { bold: true, fontSize: 11 } },
    { text: "Outputs Claude do user em sessões pessoais", options: { fontSize: 11 } },
    { text: "✗ Zona cinza — 'compete with Claude'", options: { fontSize: 11, color: C.coral } },
    { text: "Não Wave 5. Pós-Series-A com legal review", options: { fontSize: 11 } },
    { text: "?", options: { fontSize: 11 } },
  ],
], {
  x: 0.7, y: 3.0, w: 12.0, colW: [2.3, 3.3, 2.6, 2.8, 1.0],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontFace: "Calibri", color: C.text,
});

addCard(s, 0.7, 5.4, 6.0, 1.4, C.coralSoft, C.coral);
s.addText("⚠ Anthropic ToS — texto", { x: 0.95, y: 5.5, w: 5.6, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("'Customer Restrictions: ... train or develop AI models that compete with Claude.'", {
  x: 0.95, y: 5.85, w: 5.6, h: 0.45, fontSize: 11, fontFace: "Calibri", italic: true, color: C.text,
});
s.addText("Anthropic Acceptable Use Policy + Customer Agreement, secção restrita.", {
  x: 0.95, y: 6.35, w: 5.6, h: 0.35, fontSize: 10, fontFace: "Calibri", color: C.textMuted,
});

addCard(s, 6.9, 5.4, 5.8, 1.4, C.greenPale, C.green);
s.addText("✓ Caminho A — porquê funciona", { x: 7.15, y: 5.5, w: 5.4, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: "065F46" });
s.addText("Não usa outputs Claude para criar dataset. Apenas ficheiros do repo do user (code próprio, commits, docs). Treina LoRA para 'ser bom neste projecto', não para 'imitar Opus'.", {
  x: 7.15, y: 5.85, w: 5.4, h: 0.85, fontSize: 11, fontFace: "Calibri", color: C.text,
});

addFooter(s, 14, "Privacy by code · não por promessa · ADR 014");

// ============== SLIDE 15 · LEARNING PIPELINE ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Pipeline de aprendizagem · feedback loop");
addTitle(s, "Cada decisão torna o teu Mooter mais inteligente");

// Drift detection banner
addCard(s, 0.7, 2.8, 12.0, 0.55, C.navy, C.navy);
s.addText("Drift detection · se win-rate cai > 10pp em 7d → trigger retrain antes do schedule", {
  x: 0.9, y: 2.85, w: 11.6, h: 0.5,
  fontSize: 12, fontFace: "Calibri", bold: true, color: C.white, valign: "middle",
});

// Pipeline 4 boxes horizontal
const pipeline = [
  { title: "decisions.log", note: "cada turn registado", color: C.coralSoft, brd: C.coral, txt: C.coral },
  { title: "cron · semanal", note: "curate · filter · dedupe · ≥ 5k records", color: C.goldPale, brd: C.gold, txt: "92400E" },
  { title: "retrain LoRA", note: "Unsloth + DoRA r=32 · 3-6h RTX 4090", color: C.ice, brd: C.navy, txt: C.navy },
  { title: "eval harness", note: "200 prompts × Sonnet judge · winrate ≥ 60%", color: C.greenPale, brd: C.green, txt: "065F46" },
];
pipeline.forEach((p, i) => {
  const x = 0.7 + i * 3.1;
  addCard(s, x, 3.7, 2.9, 1.5, p.color, p.brd);
  s.addText(p.title, { x: x + 0.2, y: 3.85, w: 2.6, h: 0.4, fontSize: 14, fontFace: "Calibri", bold: true, color: p.txt });
  s.addText(p.note, { x: x + 0.2, y: 4.3, w: 2.6, h: 0.85, fontSize: 10, fontFace: "Calibri", color: C.text });
  if (i < 3) {
    s.addShape(pres.shapes.LINE, {
      x: x + 2.9, y: 4.45, w: 0.2, h: 0,
      line: { color: C.coral, width: 2, endArrowType: "triangle" },
    });
  }
});

// Feedback arrow
s.addShape(pres.shapes.LINE, {
  x: 12.4, y: 5.2, w: -11.5, h: 0.5,
  line: { color: C.coral, width: 1.5, dashType: "dash", endArrowType: "triangle" },
});
s.addText("deploy → próximas decisões → ciclo", {
  x: 4.5, y: 5.7, w: 4.5, h: 0.3,
  fontSize: 11, fontFace: "Calibri", bold: true, italic: true, color: C.coral, align: "center",
});

// 3 cards bottom
const lc = [
  { title: "Telemetry opt-in", body: "decisions.log local. Sync com hub só com consentimento. Aggregator open-source." },
  { title: "Curate determinista", body: "Testes passam? lint clean? syntax válida? MinHash dedup. Logs reproduzíveis." },
  { title: "Eval triple-layer", body: "1. Deterministic checks. 2. Sonnet judge. 3. Opus sample mensal (calibração)." },
];
lc.forEach((c, i) => {
  const x = 0.7 + i * 4.2;
  addCard(s, x, 6.1, 3.9, 0.75);
  s.addText(c.title, { x: x + 0.2, y: 6.15, w: 3.5, h: 0.3, fontSize: 12, fontFace: "Calibri", bold: true, color: C.text });
  s.addText(c.body, { x: x + 0.2, y: 6.45, w: 3.5, h: 0.4, fontSize: 10, fontFace: "Calibri", color: C.textMuted });
});

addFooter(s, 15, "decisions.log → cron → curate → train → eval → deploy → loop");

// ============== SLIDE 16 · DIFERENCIAL VS COMPETITORS ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Mercado · diferencial competitivo");
addTitle(s, "Onde se encaixa o Mooter no ecossistema actual");
addLead(s, "O Mooter NÃO compete com frameworks de agents nem com catálogos MCP. Ocupa o espaço vazio entre eles: o ranker que escolhe qual usar para cada tarefa.");

s.addTable([
  [
    { text: "Categoria", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Players 2026", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "O que fazem", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "O que Mooter faz a mais", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
  ],
  [
    { text: "Agent orchestration", options: { bold: true, fontSize: 11 } },
    { text: "LangGraph · CrewAI · OpenAI Agents SDK · AG2 · Bee", options: { fontSize: 10 } },
    { text: "Constroem grafos de agentes", options: { fontSize: 10 } },
    { text: "Escolhe qual grafo usar — é router para eles", options: { fontSize: 10, bold: true } },
  ],
  [
    { text: "MCP catalogs", options: { bold: true, fontSize: 11 } },
    { text: "PulseMCP · Smithery · Composio · Anthropic Registry", options: { fontSize: 10 } },
    { text: "Listam servers disponíveis", options: { fontSize: 10 } },
    { text: "Decide qual ligar para a tarefa actual + sugere install", options: { fontSize: 10, bold: true } },
  ],
  [
    { text: "Skills marketplaces", options: { bold: true, fontSize: 11 } },
    { text: "Anthropic Skills · SkillsMP (66k+) · claudeskills.info", options: { fontSize: 10 } },
    { text: "Expoõem skills isoladas", options: { fontSize: 10 } },
    { text: "Compõe skills em packs coerentes", options: { fontSize: 10, bold: true } },
  ],
  [
    { text: "Model routers", options: { bold: true, fontSize: 11 } },
    { text: "OpenRouter · NotDiamond · Martian", options: { fontSize: 10 } },
    { text: "Rotam só o modelo", options: { fontSize: 10 } },
    { text: "Rota tudo — modelo + tools + scaffold + pesos", options: { fontSize: 10, bold: true } },
  ],
  [
    { text: "Code assistants", options: { bold: true, fontSize: 11 } },
    { text: "Cursor · Claude Code · Windsurf · Cline · Aider", options: { fontSize: 10 } },
    { text: "UX de coding", options: { fontSize: 10 } },
    { text: "Ortogonal — corre dentro de qualquer um via hook", options: { fontSize: 10, bold: true } },
  ],
  [
    { text: "Static rules", options: { bold: true, fontSize: 11 } },
    { text: "Cursor Rules · Cline rules · .cursorrules", options: { fontSize: 10 } },
    { text: "Regras estáticas por projecto", options: { fontSize: 10 } },
    { text: "Regras dinâmicas por intent, não por projecto", options: { fontSize: 10, bold: true } },
  ],
], {
  x: 0.7, y: 2.95, w: 12.0, colW: [2.0, 3.2, 2.8, 4.0],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontFace: "Calibri", color: C.text,
});

addCard(s, 0.7, 6.0, 12.0, 0.85, C.navy, C.navy);
s.addText("⚠ Janela competitiva < 12 meses", { x: 0.95, y: 6.05, w: 11.6, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("Smithery + Composio + PulseMCP evoluem de catálogos para semi-routers (one-click + hosted runtime). Se algum adicionar classificação por intent → competidor directo.", {
  x: 0.95, y: 6.35, w: 11.6, h: 0.5, fontSize: 11, fontFace: "Calibri", color: C.ice,
});

addFooter(s, 16, "Research 2026-05-27 · fontes citadas no documento");

// ============== SLIDE 17 · SWITCHING COST ==============
s = pres.addSlide();
s.background = { color: C.navy };
addLabel(s, "Moat · switching cost biológico", 0.7, 0.5, true);
addTitle(s, "Cada user que usa 90 dias tem um Mooter diferente", 0.7, 0.9, 12, C.white);

s.addText("Aderência cresce com uso · não com features", {
  x: 0.7, y: 2.0, w: 6.0, h: 0.4,
  fontSize: 18, fontFace: "Calibri", bold: true, color: C.coral,
});
s.addText("Cada repo treina o Mooter um pouco mais. Adapter LoRA acumula no .mooter/ do projecto. Cada turn de feedback positivo é um data-point que afina os pesos.\n\nMigrar para outro router = começar de zero. Não é 'habituação ao UI' — é perda real de capability acumulada.", {
  x: 0.7, y: 2.5, w: 6.0, h: 2.2,
  fontSize: 14, fontFace: "Calibri", color: C.ice,
});

// Stat callouts
s.addText("60-90d", { x: 0.7, y: 4.7, w: 3, h: 0.8, fontSize: 48, fontFace: "Calibri", bold: true, color: C.coral });
s.addText("para LoRA convergir", { x: 0.7, y: 5.5, w: 3, h: 0.3, fontSize: 11, fontFace: "Calibri", color: C.ice, charSpacing: 1 });

s.addText("∞", { x: 4.0, y: 4.7, w: 2, h: 0.8, fontSize: 48, fontFace: "Calibri", bold: true, color: C.white });
s.addText("valor acumulado · não transferível", { x: 4.0, y: 5.5, w: 2.5, h: 0.3, fontSize: 11, fontFace: "Calibri", color: C.ice, charSpacing: 1 });

// Right column · acumulação por camada
s.addText("Acumulação por camada", {
  x: 7.0, y: 2.0, w: 6.0, h: 0.4,
  fontSize: 18, fontFace: "Calibri", bold: true, color: C.coral,
});

addCard(s, 7.0, 2.5, 5.7, 1.1, "FFFFFF11", "FFFFFF22");
s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 2.5, w: 0.1, h: 1.1, fill: { color: C.coral }, line: { color: C.coral } });
s.addText("Camada 1 · user_priors.bin (2 KB)", { x: 7.25, y: 2.6, w: 5.4, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.white });
s.addText("LinUCB bandit. Velocity vs quality, lang preference, cost sensitivity. Maturity após ~2000 decisões.", {
  x: 7.25, y: 2.9, w: 5.4, h: 0.7, fontSize: 11, fontFace: "Calibri", color: C.ice,
});

addCard(s, 7.0, 3.75, 5.7, 1.1, "FFFFFF11", "FFFFFF22");
s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 3.75, w: 0.1, h: 1.1, fill: { color: C.ice }, line: { color: C.ice } });
s.addText("Camada 2 · repo_fingerprint.bin (1.4 KB)", { x: 7.25, y: 3.85, w: 5.4, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.white });
s.addText("Vector 64-dim do estilo do repo. AST patterns, naming, async style, dominant frameworks.", {
  x: 7.25, y: 4.15, w: 5.4, h: 0.7, fontSize: 11, fontFace: "Calibri", color: C.ice,
});

addCard(s, 7.0, 5.0, 5.7, 1.1, "F9616722", C.coral);
s.addShape(pres.shapes.RECTANGLE, { x: 7.0, y: 5.0, w: 0.1, h: 1.1, fill: { color: C.coral }, line: { color: C.coral } });
s.addText("Camada 3 · project.lora (10-200 MB) · Wave 5", { x: 7.25, y: 5.1, w: 5.4, h: 0.3, fontSize: 13, fontFace: "Calibri", bold: true, color: C.white });
s.addText("Adapter treinado nos teus dados. Eleva qualidade local para próximo do cloud em T1-T2.", {
  x: 7.25, y: 5.4, w: 5.4, h: 0.7, fontSize: 11, fontFace: "Calibri", color: C.ice,
});

addCard(s, 0.7, 6.3, 12.0, 0.5, "F9616722", C.coral);
s.addText("O moat não é a tecnologia. É o que a tecnologia acumula no teu dispositivo ao longo do tempo.", {
  x: 0.9, y: 6.35, w: 11.6, h: 0.4,
  fontSize: 14, fontFace: "Calibri", italic: true, color: C.white, valign: "middle",
});

addFooter(s, 17, "Layer 7 (priors) + Layer 8 (fingerprint) + Layer 9 (adapter)", true);

// ============== SLIDE 18 · ROADMAP ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Roadmap · 5 waves · ~5 semanas");
addTitle(s, "De vault privado a launch público + Adapter Forge");

const waves = [
  { num: 1, name: "Foundations", dates: "2026-05-28 → 2026-06-03", days: "7d · in progress", desc: "Schema + ADR · 3 packs sementinha · classify_domain() regex · <pack-hint> · CLI básico · validação live · repo público 🟢", color: C.coral, status: "active" },
  { num: 2, name: "Registry + embeddings", dates: "2026-06-04 → 2026-06-10", days: "7d", desc: "Embedding layer (nomic-embed-text + faiss) · 4 packs adicionais · Hub endpoints · Haiku semantic fallback · demo público", color: C.navy, status: "next" },
  { num: 3, name: "Onboarding + Notion KB", dates: "2026-06-11 → 2026-06-17", days: "7d", desc: "Budget-first onboarding · auto-install packs · Notion KB per pack · feedback loop · TTL re-validation", color: C.navy, status: "next" },
  { num: 4, name: "Launch público + cookbook", dates: "2026-06-18 → 2026-06-24", days: "7d", desc: "Pack template repo · Cookbook PR Anthropic · Show HN · Anthropic Startup Program · 10 community packs (soft)", color: C.navy, status: "next" },
  { num: 5, name: "Adapter Forge", dates: "2026-06-25 → 2026-07-02", days: "8d · conditional", desc: "Telemetry · curation · self-distill · Unsloth+DoRA · eval harness · vLLM/Ollama deploy · cron retrain. Gate: ≥ 50 users opt-in.", color: C.gold, status: "conditional" },
];
waves.forEach((w, i) => {
  const y = 2.5 + i * 0.85;
  // Circle
  s.addShape(pres.shapes.OVAL, {
    x: 0.7, y: y + 0.05, w: 0.5, h: 0.5,
    fill: { color: w.color }, line: { color: w.color },
  });
  s.addText(String(w.num), { x: 0.7, y: y + 0.05, w: 0.5, h: 0.5, fontSize: 14, fontFace: "Calibri", bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  // Line connecting circles
  if (i < waves.length - 1) {
    s.addShape(pres.shapes.LINE, { x: 0.95, y: y + 0.55, w: 0, h: 0.35, line: { color: C.ice, width: 3 } });
  }
  // Title row
  s.addText(`Wave ${w.num} · ${w.name}`, {
    x: 1.4, y: y, w: 4.5, h: 0.35,
    fontSize: 14, fontFace: "Calibri", bold: true, color: w.color,
  });
  s.addText(w.dates, {
    x: 6.0, y: y, w: 3.0, h: 0.35,
    fontSize: 12, fontFace: "Calibri", color: C.text,
  });
  // Badge
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 9.2, y: y + 0.05, w: 2.0, h: 0.3,
    fill: { color: w.status === "active" ? C.coralSoft : w.status === "conditional" ? C.goldPale : C.icePale },
    line: { color: w.status === "active" ? C.coralSoft : w.status === "conditional" ? C.goldPale : C.icePale },
    rectRadius: 0.05,
  });
  s.addText(w.days, {
    x: 9.2, y: y + 0.05, w: 2.0, h: 0.3,
    fontSize: 10, fontFace: "Calibri", bold: true,
    color: w.status === "active" ? C.coral : w.status === "conditional" ? "92400E" : C.navy,
    align: "center", valign: "middle",
  });
  // Description
  s.addText(w.desc, {
    x: 1.4, y: y + 0.35, w: 10.5, h: 0.4,
    fontSize: 10, fontFace: "Calibri", color: C.textMuted,
  });
});

// Stats banner
addCard(s, 0.7, 6.85, 12.0, 0.0, C.icePale, C.icePale);

addFooter(s, 18, "Roadmap completo · PASTOR.md §8");

// ============== SLIDE 19 · RISKS ==============
s = pres.addSlide();
s.background = { color: C.white };
addLabel(s, "Riscos honestos · não escondidos");
addTitle(s, "O que pode dar errado · e como mitigamos");

s.addTable([
  [
    { text: "Risco", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Severidade", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
    { text: "Mitigação", options: { bold: true, fill: { color: C.slatePale }, fontSize: 11 } },
  ],
  [
    { text: "Construir 3 meses em privado outra vez", options: { bold: true, fontSize: 11 } },
    { text: "Crítico", options: { fontSize: 11, color: C.coral, bold: true } },
    { text: "Gate Wave 1 Day 7: repo público + Notion HQ + 3 packs validados OU pivot", options: { fontSize: 10 } },
  ],
  [
    { text: "Pastor vira 'more bloat' — users ignoram hints", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "Statusline pequeno · sticky hint só se confidence ≥ 0.6 · mooter pack run dry-run", options: { fontSize: 10 } },
  ],
  [
    { text: "Sobre-engenharia — 50 packs vazios", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "Pack só entra no registry após validação em ≥ 10 prompts reais · trust_score visível", options: { fontSize: 10 } },
  ],
  [
    { text: "Domain classifier vira 'regex hell'", options: { fontSize: 11 } },
    { text: "Baixo", options: { fontSize: 11 } },
    { text: "Escada: regex → embedding → Haiku · cada camada testada", options: { fontSize: 10 } },
  ],
  [
    { text: "Packs desactualizados (skills/MCPs mudam mensalmente)", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "TTL_days · cron semanal verifica liveness · mooter pack digest", options: { fontSize: 10 } },
  ],
  [
    { text: "Smithery/Composio lança intent classification primeiro", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "Velocidade: Wave 1 = 7d · cookbook PR + HN = 4 semanas · OSS moat", options: { fontSize: 10 } },
  ],
  [
    { text: "Anthropic ToS Adapter Forge", options: { bold: true, fontSize: 11 } },
    { text: "Crítico", options: { fontSize: 11, color: C.coral, bold: true } },
    { text: "Wave 5 SÓ caminho A (self-distill no codebase user) · B/C/D só com legal review", options: { fontSize: 10 } },
  ],
  [
    { text: "Eval brittleness — Opus-as-judge inconsistente", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "Sonnet judge default · Opus só amostra mensal de calibração", options: { fontSize: 10 } },
  ],
  [
    { text: "Hardware: RTX 4090 marginal para Qwen3-30B-A3B fine-tune", options: { fontSize: 11 } },
    { text: "Médio", options: { fontSize: 11, color: C.gold } },
    { text: "Default Qwen3-14B · upgrade path para H100/A100 cloud", options: { fontSize: 10 } },
  ],
  [
    { text: "Switching cost ↑↑ assusta enterprise", options: { fontSize: 11 } },
    { text: "Baixo", options: { fontSize: 11 } },
    { text: "Adapter sempre exportável: mooter adapter export <name>", options: { fontSize: 10 } },
  ],
], {
  x: 0.7, y: 2.9, w: 12.0, colW: [4.5, 1.3, 6.2],
  border: { type: "solid", pt: 0.5, color: C.border },
  fontFace: "Calibri", color: C.text,
});

addFooter(s, 19, "Anti-patterns documentados · PASTOR.md §11 + §12.7");

// ============== SLIDE 20 · NEXT STEPS ==============
s = pres.addSlide();
s.background = { color: C.navy };
addLabel(s, "Next steps · começa hoje", 0.7, 0.5, true);

s.addText([
  { text: "Wave 1 Day 1 em curso.\n", options: { fontSize: 44, color: C.white, bold: true } },
  { text: "Repo público em ", options: { fontSize: 44, color: C.white, bold: true } },
  { text: "7 dias", options: { fontSize: 44, color: C.coral, bold: true } },
  { text: ".", options: { fontSize: 44, color: C.white, bold: true } },
], { x: 0.7, y: 1.0, w: 12, h: 1.8, fontFace: "Calibri", valign: "top", margin: 0 });

const milestones = [
  { time: "Now", title: "Wave 1 Day 1", body: "2026-05-28 · Schema + ADR + spec pack-hint. Claude Code corre no WSL. Em execução agora.", highlight: true },
  { time: "+7d", title: "Wave 1 closure", body: "2026-06-03 · repo mooter-ai/mooter público · 3 packs sementinha validados · validation report" },
  { time: "+27d", title: "Wave 4 launch", body: "2026-06-24 · Show HN + Anthropic cookbook PR + Startup Program submission" },
];
milestones.forEach((m, i) => {
  const x = 0.7 + i * 4.2;
  addCard(s, x, 3.4, 3.9, 1.8, m.highlight ? "F9616722" : "FFFFFF11", m.highlight ? C.coral : "FFFFFF22");
  s.addText(m.time, {
    x: x + 0.2, y: 3.5, w: 3.5, h: 0.6,
    fontSize: 30, fontFace: "Calibri", bold: true, color: m.highlight ? C.coral : C.ice,
  });
  s.addText(m.title, {
    x: x + 0.2, y: 4.15, w: 3.5, h: 0.35,
    fontSize: 15, fontFace: "Calibri", bold: true, color: C.white,
  });
  s.addText(m.body, {
    x: x + 0.2, y: 4.5, w: 3.5, h: 0.65,
    fontSize: 11, fontFace: "Calibri", color: C.ice,
  });
});

// Tagline box
addCard(s, 0.7, 5.5, 12.0, 1.0, "FFFFFF11", "F96167");
s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 5.5, w: 0.08, h: 1.0, fill: { color: C.coral }, line: { color: C.coral } });
s.addText([
  { text: "O Pastor não é uma feature.\n", options: { fontSize: 18, color: C.white } },
  { text: "É um ", options: { fontSize: 18, color: C.white } },
  { text: "novo arquetipo", options: { fontSize: 18, color: C.coral, bold: true } },
  { text: ": o router que escolhe não apenas o modelo, mas todo o rebanho de capacidades — antes do primeiro token.", options: { fontSize: 18, color: C.white } },
], { x: 1.0, y: 5.6, w: 11.5, h: 0.9, fontFace: "Calibri", valign: "middle" });

// Footer
s.addText("docs/strategy/PASTOR.md · PASTOR_OPERATIONS.md · research_best_in_class_2026.md", {
  x: 0.7, y: 6.7, w: 8, h: 0.3,
  fontSize: 11, fontFace: "Calibri", color: C.ice, italic: true,
});
s.addText("mooter.ai · 🐑 cercar o rebanho certo", {
  x: 0.7, y: 6.7, w: 12, h: 0.3,
  fontSize: 11, fontFace: "Calibri", bold: true, color: C.coral, align: "right",
});

// ============== WRITE ==============
pres.writeFile({ fileName: "MOOTER_STRATEGY_2026.pptx" })
  .then((fileName) => {
    console.log(`✓ Generated: ${fileName}`);
  })
  .catch((err) => {
    console.error("✗ Error:", err);
    process.exit(1);
  });
