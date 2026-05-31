// Wave 2.7 E2E simulation harness — drives the REAL shipped Mooter units
// (runInit, buildDashboard, buildTrail/runTrail, classify.js, stop_hook Moo card)
// per persona, hermetically at $0 (mocked hardware/anthropic, metrics offline, no
// network). Emits one persona-P<N>.data.json of raw observations. NO production
// code is modified — this file lives under audit/ and is throwaway audit tooling.
//
// Run:  npx tsx audit/wave2-7-e2e-simulation/sim.ts --persona P1
//
// Honesty notes baked in:
//  · prompt latency is classify.js spawn wall-time (incl. node cold-start ~50-100ms),
//    NOT the in-process hook latency — labelled as such in the data.
//  · every recorded gap is derived from an actual observation in this run.

import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  runInit,
  type HardwareProfile,
  type InitIO,
  type AnthropicValidation,
} from "../../packages/cli/src/commands/init.ts";
import { buildDashboard } from "../../packages/cli/src/commands/dashboard.ts";
import { buildTrail, runTrail } from "../../packages/cli/src/commands/trail.ts";

const require = createRequire(import.meta.url);
const HERE = resolve(fileURLToPath(new URL(".", import.meta.url)));
const REPO = resolve(HERE, "../..");
const CLASSIFY = join(REPO, "tools/router/classify.js");
const stopHook = require(join(REPO, "tools/router/stop_hook.js")) as {
  readPrefs: (p: string) => any;
  mooCardEnabled: (prefs: any) => boolean;
  aggregateLastTurn: (sessionId: string, logPath: string) => any;
  buildMooCard: (stats: any, turnCost: any) => string;
  shortModel: (m: string) => string;
};

const FIXED_NOW = new Date("2026-06-03T12:00:00.000Z");

// ── Persona definitions ───────────────────────────────────────────────────────

interface Persona {
  id: string;
  name: string;
  background: string;
  probe: HardwareProfile;
  anthropicValid: AnthropicValidation | null; // null → no Anthropic (P5)
  io: { confirm: boolean[]; ask: string[]; hidden: string[] };
  prompts: { text: string; expectedTier: string }[];
}

const RTX4090: HardwareProfile["gpu"] = { model: "RTX 4090", vram_gb: 24 };

function probe(
  os: HardwareProfile["os"],
  cores: number,
  ram: number,
  gpu: HardwareProfile["gpu"],
  ollamaModels: string[],
  ollamaUp: boolean,
): HardwareProfile {
  return {
    os,
    os_version: os === "darwin" ? "23.5.0" : "6.6.87-wsl2",
    node_version: "v20.11.0",
    cpu_cores: cores,
    ram_gb: ram,
    gpu,
    ollama: {
      url: ollamaUp ? "http://host.docker.internal:11434" : "http://localhost:11434",
      models: ollamaModels,
      available: ollamaUp,
    },
  };
}

const maxValidation: AnthropicValidation = { valid: true, tier_detected: "max", budget_5h_limit: 80, budget_7d_limit: 1000 };
const teamValidation: AnthropicValidation = { valid: true, tier_detected: "team", budget_5h_limit: 120, budget_7d_limit: 2000 };

const PERSONAS: Record<string, Persona> = {
  P1: {
    id: "P1",
    name: "Solo Founder Paula",
    background: "Post-exit founder, 1 product, own $$, Next.js + Supabase",
    probe: probe("linux", 16, 64, RTX4090, ["qwen3:7b", "qwen3:30b"], true),
    anthropicValid: maxValidation,
    io: { confirm: [true, true, false, false, false], ask: ["2"], hidden: [] }, // anthropic·max·install top1·skip·telemetry off
    prompts: [
      { text: "muda a cor do botão login para azul", expectedTier: "T0" },
      { text: "resume o ficheiro README.md", expectedTier: "T0" },
      { text: "gera commit message para estas 3 mudanças", expectedTier: "T1" },
      { text: "explica este erro: TypeError: x is not a function", expectedTier: "T1" },
      { text: "porque é que o websocket reconnect falha às vezes?", expectedTier: "T2" },
      { text: "compara estes 2 patterns: useReducer vs useState", expectedTier: "T2" },
      { text: "redesenha o vault para multi-user architectural refactor", expectedTier: "T3" },
      { text: "audit dos hooks deste codebase para race conditions", expectedTier: "T3" },
      { text: "lista ficheiros .ts maiores que 500 linhas", expectedTier: "T0" },
      { text: "vou fazer push, faz review pré-merge", expectedTier: "T3" },
    ],
  },
  P2: {
    id: "P2",
    name: "Senior IC Marco",
    background: "FAANG eng, company pays, multi-terminal, Python + Postgres, M3 Pro",
    probe: probe("darwin", 12, 32, { model: "Apple Silicon (unified)", vram_gb: 19 }, ["qwen3:7b"], true),
    anthropicValid: maxValidation,
    io: { confirm: [true, true, false, false, false], ask: ["2"], hidden: [] },
    prompts: [
      { text: "optimize this Postgres query that does a seq scan", expectedTier: "T2" },
      { text: "write a docstring for this function", expectedTier: "T1" },
      { text: "rename variable userId to accountId in this file", expectedTier: "T0" },
      { text: "why does this async test flake intermittently?", expectedTier: "T2" },
      { text: "generate a pytest fixture for the db connection", expectedTier: "T1" },
      { text: "summarize the diff in this PR", expectedTier: "T0" },
      { text: "design a sharding strategy for the events table", expectedTier: "T3" },
      { text: "explain this stack trace: KeyError 'session'", expectedTier: "T1" },
      { text: "refactor the auth middleware across 5 files", expectedTier: "T3" },
      { text: "format this JSON blob", expectedTier: "T0" },
    ],
  },
  P3: {
    id: "P3",
    name: "OSS Maintainer Yuki",
    background: "Big repos, refactor heavy, Dynamic Workflows fan, Rust + native, Threadripper",
    probe: probe("linux", 64, 128, { model: "RTX 4090", vram_gb: 24 }, ["qwen3:30b", "llama3:70b"], true),
    anthropicValid: teamValidation,
    io: { confirm: [true, true, true, false, false], ask: ["3"], hidden: [] }, // team·install top2
    prompts: [
      { text: "fix this typo in the README", expectedTier: "T0" },
      { text: "summarize the open issues for triage", expectedTier: "T0" },
      { text: "write a regex to match semver tags", expectedTier: "T1" },
      { text: "why does this Rust borrow checker error happen?", expectedTier: "T2" },
      { text: "compare crossbeam vs std::sync::mpsc for this case", expectedTier: "T2" },
      { text: "generate a changelog entry for this commit", expectedTier: "T1" },
      { text: "redesign the plugin trait system for backwards compat", expectedTier: "T3" },
      { text: "audit unsafe blocks in this crate for soundness", expectedTier: "T3" },
      { text: "list functions over 100 lines in src/", expectedTier: "T0" },
      { text: "I'm about to release v2.0, review the breaking changes", expectedTier: "T3" },
    ],
  },
  P4: {
    id: "P4",
    name: "No-Ollama Edge Linus",
    background: "Wants Mooter but no GPU/Ollama local, M1 16GB, TS + Vercel",
    probe: probe("darwin", 8, 16, null, [], false), // ollama unavailable
    anthropicValid: maxValidation,
    io: { confirm: [true, true, false, false, false], ask: ["2"], hidden: [] },
    prompts: [
      { text: "change the primary color in tailwind config", expectedTier: "T0" },
      { text: "explain this Next.js hydration error", expectedTier: "T1" },
      { text: "write a commit message for the deploy fix", expectedTier: "T1" },
      { text: "why is my Vercel edge function timing out?", expectedTier: "T2" },
      { text: "compare SSR vs ISR for this page", expectedTier: "T2" },
      { text: "rename the api route folder", expectedTier: "T0" },
      { text: "redesign the data fetching layer for streaming", expectedTier: "T3" },
      { text: "audit the middleware for auth bypass risks", expectedTier: "T3" },
      { text: "summarize this config file", expectedTier: "T0" },
      { text: "I'm deploying to prod, do a pre-deploy review", expectedTier: "T3" },
    ],
  },
  P5: {
    id: "P5",
    name: "No-Anthropic Edge Sara",
    background: "Open-source purist, local-only, no API key, RTX 3090, Go + Docker",
    probe: probe("linux", 16, 32, { model: "RTX 3090", vram_gb: 24 }, ["qwen3:7b"], true),
    anthropicValid: null, // declines Anthropic entirely
    io: { confirm: [false, true, false, false, false], ask: [], hidden: [] }, // no anthropic·install top1·telemetry off
    prompts: [
      { text: "fix the indentation in this Go file", expectedTier: "T0" },
      { text: "explain this Docker build error", expectedTier: "T1" },
      { text: "write a Go doc comment for this struct", expectedTier: "T1" },
      { text: "summarize the docker-compose file", expectedTier: "T0" },
      { text: "why does this goroutine leak?", expectedTier: "T2" },
      { text: "compare channels vs sync.Mutex here", expectedTier: "T2" },
      { text: "generate a commit message", expectedTier: "T1" },
      { text: "rename this package", expectedTier: "T0" },
      { text: "redesign the worker pool for graceful shutdown", expectedTier: "T3" },
      { text: "audit this Dockerfile for security issues", expectedTier: "T3" },
    ],
  },
};

// ── Scripted IO that records every printed line ───────────────────────────────

function scriptedIO(p: Persona, sink: string[]): InitIO {
  const confirm = [...p.io.confirm];
  const ask = [...p.io.ask];
  const hidden = [...p.io.hidden];
  return {
    print: (line: string) => sink.push(line),
    ask: async () => ask.shift() ?? "",
    askHidden: async () => hidden.shift() ?? "",
    confirm: async (_q, def) => (confirm.length ? (confirm.shift() as boolean) : def),
  };
}

// ── classify.js real spawn (pure heuristic, $0, deterministic) ────────────────

function classifyReal(prompt: string): { tier: string; model: string; confidence: number; spawnMs: number } {
  const start = Date.now();
  let out = "";
  try {
    out = execFileSync("node", [CLASSIFY, prompt], { encoding: "utf8", timeout: 10000 });
  } catch (e: any) {
    out = e.stdout?.toString?.() ?? "";
  }
  const spawnMs = Date.now() - start;
  let parsed: any = {};
  try {
    parsed = JSON.parse(out);
  } catch {
    /* leave empty → recorded as failure */
  }
  return {
    tier: parsed.tier ?? "?",
    model: parsed.recommended_model ?? "?",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : -1,
    spawnMs,
  };
}

// ── decisions.log line in inject_context.js's classified shape ────────────────

function classifiedLine(sessionId: string, tier: string, model: string, conf: number, i: number): string {
  const iso = new Date(FIXED_NOW.getTime() + i * 1000).toISOString();
  return JSON.stringify({
    event: "classified",
    session_id: sessionId,
    ts: iso,
    ts_ms: FIXED_NOW.getTime() + i * 1000,
    tier,
    recommended_model: model,
    confidence: conf,
    source: "classify.js",
  });
}

// ── Transparency scans ────────────────────────────────────────────────────────

const HYPERBOLE = ["revolutionary", "magic", "magical", "ai-powered", "game-changer", "blazing", "10x", "supercharge"];
function scanHyperbole(text: string): string[] {
  const lc = text.toLowerCase();
  return HYPERBOLE.filter((w) => lc.includes(w));
}
function scanPastor(text: string): number {
  // "pastor" as a noun-entity is deprecated; the verb "to pastor" stays valid.
  // Count bare "Pastor" capitalised entity uses.
  const m = text.match(/\bPastor\b/g);
  return m ? m.length : 0;
}

// ── Per-persona run ───────────────────────────────────────────────────────────

async function runPersona(p: Persona) {
  const audit: any = {
    persona: p.id,
    name: p.name,
    background: p.background,
    generatedAt: FIXED_NOW.toISOString(),
    stages: {},
    gaps: [] as any[],
  };

  const addGap = (severity: string, description: string, evidence: string) =>
    audit.gaps.push({ severity, description, evidence });

  // 0. isolated HOME
  const home = mkdtempSync(join(tmpdir(), `mooter-e2e-${p.id}-`));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  const mooterHome = join(home, ".mooter");
  const routerDir = join(home, ".claude", "tools", "router");
  mkdirSync(routerDir, { recursive: true });
  for (const f of ["inject_context.js", "statusline-multi.js", "glyphs.js", "stop_hook.js", "classify.js", "savings-tracker.js"]) {
    try {
      symlinkSync(join(REPO, "tools/router", f), join(routerDir, f));
    } catch {
      /* best effort */
    }
  }
  audit.tempHome = home;

  const wizardPrints: string[] = [];

  // 1. wizard
  try {
    const t0 = Date.now();
    const res = await runInit({
      io: scriptedIO(p, wizardPrints),
      mooterHome,
      now: () => FIXED_NOW,
      probe: async () => p.probe,
      validateAnthropic: async () => p.anthropicValid ?? { valid: false, tier_detected: "api_key", budget_5h_limit: 0, budget_7d_limit: 0, error: "no key" },
    });
    const dur = Date.now() - t0;
    audit.stages.wizard = {
      exitCode: res.exitCode,
      durationMs: dur,
      ok: res.exitCode === 0 && dur < 300_000,
      output: res.output,
      profileOk: existsSync(join(mooterHome, "profile.json")),
      credentialsOk: existsSync(join(mooterHome, "credentials.json")),
      consentOk: existsSync(join(mooterHome, "consent.json")),
      installedOk: existsSync(join(mooterHome, "installed.json")),
      packsDirOk: existsSync(join(mooterHome, "packs")),
    };
    if (res.exitCode !== 0) addGap("blocker", `Wizard exited non-zero for ${p.id}`, `exitCode=${res.exitCode} output=${res.output}`);
    for (const f of ["profile.json", "credentials.json", "consent.json"] as const) {
      if (!existsSync(join(mooterHome, f))) addGap("blocker", `${f} not written for ${p.id}`, `expected at ${join(mooterHome, f)}`);
    }

    // Edge schema assertions
    const creds = audit.stages.wizard.credentialsOk ? JSON.parse(readFileSync(join(mooterHome, "credentials.json"), "utf8")) : {};
    const providers = creds.providers ?? {};
    audit.stages.wizard.providersPresent = Object.keys(providers);
    audit.stages.wizard.hasAnthropic = !!providers.anthropic;
    audit.stages.wizard.hasOllama = !!providers.ollama;
    if (p.id === "P5" && providers.anthropic) addGap("major", "P5 (no-Anthropic) wrote an anthropic provider", JSON.stringify(providers.anthropic));
    if (p.id === "P4" && providers.ollama && providers.ollama.available) addGap("major", "P4 (no-Ollama) wrote an available ollama provider", JSON.stringify(providers.ollama));
    const installed = audit.stages.wizard.installedOk ? JSON.parse(readFileSync(join(mooterHome, "installed.json"), "utf8")) : { packs: [] };
    audit.stages.wizard.installedPacks = installed.packs ?? [];
  } catch (e: any) {
    audit.stages.wizard = { failed: true, error: String(e?.stack ?? e) };
    addGap("blocker", `Wizard threw for ${p.id}`, String(e?.message ?? e));
  }

  // 2. 10 prompts through real classify.js
  const sessionId = `e2e-${p.id}-session`;
  const lines: string[] = [];
  const prompts: any[] = [];
  for (let i = 0; i < p.prompts.length; i++) {
    const pr = p.prompts[i];
    const r = classifyReal(pr.text);
    const correct = r.tier === pr.expectedTier;
    prompts.push({
      text: pr.text.slice(0, 50),
      expectedTier: pr.expectedTier,
      actualTier: r.tier,
      actualModel: r.model,
      confidence: r.confidence,
      spawnMs: r.spawnMs,
      correctlyClassified: correct,
    });
    lines.push(classifiedLine(sessionId, r.tier, r.model, r.confidence, i));
  }
  const correctCount = prompts.filter((x) => x.correctlyClassified).length;
  audit.stages.prompts = {
    list: prompts,
    classificationAccuracy: correctCount / prompts.length,
    correctCount,
    avgSpawnMs: Math.round(prompts.reduce((a, b) => a + b.spawnMs, 0) / prompts.length),
    note: "spawnMs is classify.js process wall-time incl. node cold-start (~50-100ms) — NOT the in-process hook latency.",
  };
  if (correctCount / prompts.length < 0.9) {
    const misses = prompts.filter((x) => !x.correctlyClassified).map((x) => `"${x.text}" exp=${x.expectedTier} got=${x.actualTier}`);
    addGap("major", `Classification accuracy ${(100 * correctCount / prompts.length).toFixed(0)}% < 90% for ${p.id}`, misses.join(" | "));
  }

  // write decisions.log so stop_hook (file-based) can aggregate
  const logPath = join(routerDir, "decisions.log");
  writeFileSync(logPath, lines.join("\n") + "\n");

  // 3. dashboard frame (pure, metrics offline)
  try {
    const frame = buildDashboard({ sessionId, lines, metrics: null });
    // Canonical shipped sections (Wave 2.6 dashboard = 5). PACK/domain is tracked
    // separately: the showcase spec assumed a 6th section that the product does
    // not (yet) ship — recorded as an honest spec↔impl divergence, not a defect.
    const sections = ["MOOS ACTIVE", "SAVINGS", "CONTEXT", "QUOTA", "ADAPTER"];
    const present = sections.filter((s) => frame.toUpperCase().includes(s));
    const packSectionPresent = /\bPACK\b|\bDOMAIN\b/.test(frame.toUpperCase());
    audit.stages.dashboard = {
      sectionsPresent: present,
      allSections: present.length === sections.length,
      packSectionPresent,
      loraHonesty: /LoRA|adapter/i.test(frame) && /wave 5|none yet|◌/i.test(frame),
      hyperbole: scanHyperbole(frame),
      pastorEntity: scanPastor(frame),
      frameSample: frame.split("\n").slice(0, 6).join("\n"),
    };
    for (const s of sections) if (!present.includes(s)) addGap("major", `Dashboard missing canonical section "${s}" for ${p.id}`, `sections seen: ${present.join(",")}`);
    if (!packSectionPresent) addGap("minor", `Dashboard has no PACK/domain section — installed packs are invisible in the live dashboard for ${p.id} (showcase spec expected one)`, `5 sections shipped: ${present.join(", ")}; installed=${JSON.stringify(audit.stages.wizard?.installedPacks ?? [])}`);
    if (scanHyperbole(frame).length) addGap("minor", `Hyperbole in dashboard for ${p.id}`, scanHyperbole(frame).join(","));
    if (scanPastor(frame) > 0) addGap("minor", `Deprecated "Pastor" entity in dashboard for ${p.id}`, `count=${scanPastor(frame)}`);
  } catch (e: any) {
    audit.stages.dashboard = { failed: true, error: String(e?.message ?? e) };
    addGap("major", `Dashboard build threw for ${p.id}`, String(e?.message ?? e));
  }

  // 4. trail json + evolution
  try {
    const trailObj = await buildTrail({ sessionId, lines, metrics: null });
    const trailRes = await runTrail({ sessionId, lines, metrics: null, json: true });
    const evolRes = await runTrail({ sessionId, lines, metrics: null, evolution: true });
    audit.stages.trail = {
      fieldCount: Object.keys(trailObj).length,
      eventCount: trailObj.event_count,
      hasFormulasAndSources: !!(trailObj as any).last_decision && !!((trailObj as any).last_decision.formula),
      lastDecision: (trailObj as any).last_decision?.value ?? null,
      jsonParses: (() => { try { JSON.parse(trailRes.output ?? ""); return true; } catch { return false; } })(),
      evolutionHonest: /none yet|wave 5|◌/i.test(evolRes.output ?? ""),
      evolutionSample: (evolRes.output ?? "").split("\n").slice(0, 8).join("\n"),
    };
    if (!audit.stages.trail.evolutionHonest) addGap("minor", `trail --evolution lacks LoRA honesty disclosure for ${p.id}`, (evolRes.output ?? "").slice(0, 120));
  } catch (e: any) {
    audit.stages.trail = { failed: true, error: String(e?.message ?? e) };
    addGap("major", `Trail build threw for ${p.id}`, String(e?.message ?? e));
  }

  // 5. Moo card (opt-in) via stop_hook exported helpers
  try {
    const prefsPath = join(mooterHome, "preferences.json");
    writeFileSync(prefsPath, JSON.stringify({ moo_card_enabled: true }));
    const prefs = stopHook.readPrefs(prefsPath);
    const enabled = stopHook.mooCardEnabled(prefs);
    const stats = stopHook.aggregateLastTurn(sessionId, logPath);
    const card = stopHook.buildMooCard(stats, null);
    const fieldHits = ["moo", "confidence", "cost", "T0", "T1", "T2", "T3"].filter((k) => card.includes(k));
    audit.stages.mooCard = {
      optInRespected: enabled === true,
      cardEmitted: /Moo card|🐮|🐮|moo/i.test(card),
      fieldCount: fieldHits.length,
      loraDisclosed: /none yet|wave 5|◌|LoRA/i.test(card),
      hyperbole: scanHyperbole(card),
      sample: card.split("\n").slice(0, 8).join("\n"),
    };
    if (!audit.stages.mooCard.loraDisclosed) addGap("minor", `Moo card omits LoRA/adapter disclosure for ${p.id}`, card.slice(0, 120));
  } catch (e: any) {
    audit.stages.mooCard = { failed: true, error: String(e?.message ?? e) };
    addGap("major", `Moo card build threw for ${p.id}`, String(e?.message ?? e));
  }

  // 6. per-session isolation — a different session must see zero events
  try {
    const otherTrail = await buildTrail({ sessionId: `e2e-${p.id}-OTHER`, lines, metrics: null });
    audit.stages.isolation = { otherSessionEvents: otherTrail.event_count, ok: otherTrail.event_count === 0 };
    if (otherTrail.event_count !== 0) addGap("blocker", `Session isolation leak for ${p.id}`, `other session saw ${otherTrail.event_count} events`);
  } catch (e: any) {
    audit.stages.isolation = { failed: true, error: String(e?.message ?? e) };
  }

  // 7. wizard-output transparency scan
  const wizardText = wizardPrints.join("\n");
  audit.stages.wizardTransparency = {
    hyperbole: scanHyperbole(wizardText),
    pastorEntity: scanPastor(wizardText),
    lineCount: wizardPrints.length,
  };
  if (scanHyperbole(wizardText).length) addGap("minor", `Hyperbole in wizard output for ${p.id}`, scanHyperbole(wizardText).join(","));
  if (scanPastor(wizardText) > 0) addGap("minor", `Deprecated "Pastor" entity in wizard for ${p.id}`, `count=${scanPastor(wizardText)} (see line: ${wizardPrints.find((l) => /Pastor/.test(l))})`);

  // restore HOME
  if (prevHome) process.env.HOME = prevHome;

  audit.summary = {
    blockers: audit.gaps.filter((g: any) => g.severity === "blocker").length,
    major: audit.gaps.filter((g: any) => g.severity === "major").length,
    minor: audit.gaps.filter((g: any) => g.severity === "minor").length,
    classificationAccuracy: audit.stages.prompts?.classificationAccuracy ?? null,
    verdict: audit.gaps.filter((g: any) => g.severity === "blocker").length === 0 ? "READY" : "BLOCKED",
  };

  const outPath = join(HERE, `persona-${p.id}.data.json`);
  writeFileSync(outPath, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ persona: p.id, ...audit.summary, dataPath: outPath }));
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const pIdx = argv.indexOf("--persona");
  const which = pIdx >= 0 ? argv[pIdx + 1] : "ALL";
  const targets = which === "ALL" ? Object.keys(PERSONAS) : [which];

  for (const t of targets) {
    const p = PERSONAS[t];
    if (!p) {
      console.error(`unknown persona ${t}`);
      process.exit(2);
    }
    await runPersona(p);
  }
}

void main();
