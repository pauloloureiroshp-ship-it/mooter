// `mooter init` — activation wizard v1 (Wave 2 Day 6).
//
// A 5-step, terminal-native onboarding that probes the machine, captures the
// providers the user has (Anthropic + Ollama in v1 — others ack-only), validates
// Anthropic access with a 1-token test call, recommends packs by fit, and asks
// for telemetry consent (default OFF). It writes three local schemas under
// ~/.mooter with 0600 perms: credentials.json, profile.json, consent.json.
//
// Design for testability (mirrors commands/pack.ts): all side effects are behind
// injectable seams — IO (prompts/print), the hardware probe, the Anthropic
// validator, the clock, and the filesystem root. The pure helpers (fit scoring,
// schema builders) are exported so the suite asserts on them without a TTY.
//
// Privacy-first invariants:
//   - telemetry default OFF (consent.json telemetry_enabled=false unless opted in)
//   - pack install default SKIP (never auto-install)
//   - API keys masked on input; never echoed; never written in plaintext beyond
//     the user's own ~/.mooter (0600) — uploads are Wave 3 D4.
//   - idempotent: re-running overwrites profile/consent and updates installed
//     packs without creating duplicates.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { homedir, cpus, totalmem, platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import yaml from "js-yaml";
import { defaultPacksDir } from "../../../router/src/classify_domain.ts";

const execFileP = promisify(execFile);

export interface CmdResult {
  exitCode: number;
  output: string;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface GpuInfo {
  model: string;
  vram_gb: number;
}
export interface OllamaInfo {
  url: string;
  models: string[];
  available: boolean;
}
export interface HardwareProfile {
  os: NodeJS.Platform;
  os_version: string;
  node_version: string;
  cpu_cores: number;
  ram_gb: number;
  gpu: GpuInfo | null;
  ollama: OllamaInfo;
}

export type AnthropicAccess = "pro" | "max" | "team" | "api_key";

export interface AnthropicValidation {
  valid: boolean;
  tier_detected: AnthropicAccess;
  budget_5h_limit: number;
  budget_7d_limit: number;
  error?: string;
}

/** Minimal interactive surface — scripted in tests, readline-backed in a TTY. */
export interface InitIO {
  print(line: string): void;
  ask(question: string): Promise<string>;
  askHidden(question: string): Promise<string>;
  /** Returns true/false; `defaultYes` decides what a bare Enter means. */
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
}

export interface InitOptions {
  io?: InitIO;
  mooterHome?: string;
  packsDir?: string;
  now?: () => Date;
  probe?: () => Promise<HardwareProfile>;
  validateAnthropic?: (key: string) => Promise<AnthropicValidation>;
  /** Pre-seed provider/access answers to keep the v1 flow short in tests. */
  fetchImpl?: typeof fetch;
}

const TIER_ORDER = ["T0", "T1", "T2", "T3"];
const tierIdx = (t: string): number => {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? 2 : i;
};

// ── Step 1: hardware probe ───────────────────────────────────────────────────

async function sh(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP(cmd, args, { timeout: 4000 });
  return stdout.trim();
}

export async function probeHardware(fetchImpl: typeof fetch = fetch): Promise<HardwareProfile> {
  const os = platform();
  const osVersion = await sh("uname", ["-r"]).catch(() => "unknown");
  const nodeVersion = process.version;
  const cpuCores = cpus().length;
  const ramGb = Math.round(totalmem() / 1024 / 1024 / 1024);

  let gpu: GpuInfo | null = null;
  try {
    if (os === "linux") {
      const out = await sh("nvidia-smi", [
        "--query-gpu=name,memory.total",
        "--format=csv,noheader",
      ]);
      const [model, vramMib] = out.split(",").map((s) => s.trim());
      gpu = { model: model ?? "GPU", vram_gb: Math.round(parseInt(vramMib ?? "0", 10) / 1024) };
    } else if (os === "darwin") {
      // Apple Silicon unified memory — heuristic share of system RAM.
      gpu = { model: "Apple Silicon (unified)", vram_gb: Math.round(ramGb * 0.6) };
    }
    // Windows native skipped in v1 (WSL2 reports as linux above).
  } catch {
    /* GPU detection failed → none */
  }

  // Probe the env override first, then the two common defaults: Docker/WSL
  // (host.docker.internal) and bare-metal Linux/macOS (localhost). First hit wins.
  const candidates = process.env.OLLAMA_HOST
    ? [process.env.OLLAMA_HOST]
    : ["http://host.docker.internal:11434", "http://localhost:11434"];
  let ollama: OllamaInfo = { url: candidates[0]!, models: [], available: false };
  for (const url of candidates) {
    try {
      const res = await fetchImpl(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        ollama = { url, models: (data.models ?? []).map((m) => m.name), available: true };
        break;
      }
    } catch {
      /* try next candidate */
    }
  }

  return { os, os_version: osVersion, node_version: nodeVersion, cpu_cores: cpuCores, ram_gb: ramGb, gpu, ollama };
}

function renderProbe(p: HardwareProfile, io: InitIO): void {
  io.print("Step 1/5 · Scanning your machine");
  io.print(`✓ ${p.os} ${p.os_version}`);
  io.print(`✓ Node ${p.node_version}`);
  if (p.ollama.available) {
    io.print(`✓ Ollama at ${p.ollama.url}`);
    io.print(`✓ ${p.ollama.models.length} models found${p.ollama.models.length ? ` (${p.ollama.models.slice(0, 4).join(", ")}${p.ollama.models.length > 4 ? ", …" : ""})` : ""}`);
  } else {
    io.print("✗ Ollama not detected · T0 local tier disabled");
    io.print("  (Install Ollama from https://ollama.com to enable local routing.)");
  }
  if (p.gpu) io.print(`✓ GPU: ${p.gpu.model} · ${p.gpu.vram_gb}GB VRAM`);
  else io.print("· GPU: none detected (cloud-only routing)");
}

// ── Step 4: pack recommendations (pure scoring) ───────────────────────────────

// Static trust per pack (Day 6 kickoff §3.5). Unlisted packs default to 70.
export const STATIC_TRUST: Record<string, number> = {
  "animation-web": 87,
  "code-audit": 95,
  "diagram-systems": 98,
  "voice-tts": 76,
  "knowledge-third-brain": 73,
  "prd-strategy": 79,
  "data-spreadsheet": 82,
};

export interface PackFit {
  pack_id: string;
  fit_score: number;
  trust: number;
  model_floor: string;
  model_ceiling: string;
}

/** 1.0 if a local model can serve the pack's floor, 0.5 partial, 0.0 none. */
export function hardwareFit(modelFloor: string, p: HardwareProfile): number {
  const localCapable = tierIdx(modelFloor) <= tierIdx("T1");
  if (!localCapable) return 0.5; // T2/T3 floor → cloud anyway, hw not the gate
  if (!p.ollama.available) return 0.0;
  const vram = p.gpu?.vram_gb ?? 0;
  return vram >= 8 ? 1.0 : 0.5;
}

/** 1.0 if pack ceiling ≤ detected tier, 0.5 if one step above, else 0.0. */
export function providerTierFit(modelCeiling: string, detectedTier: string): number {
  const gap = tierIdx(modelCeiling) - tierIdx(detectedTier);
  if (gap <= 0) return 1.0;
  if (gap === 1) return 0.5;
  return 0.0;
}

export function recommendPacks(
  packs: Array<{ pack_id: string; model_floor: string; model_ceiling: string }>,
  profile: HardwareProfile,
  detectedTier: string,
): PackFit[] {
  return packs
    .map((pk) => {
      const trust = STATIC_TRUST[pk.pack_id] ?? 70;
      const fit_score =
        0.4 * hardwareFit(pk.model_floor, profile) +
        0.3 * providerTierFit(pk.model_ceiling, detectedTier) +
        0.3 * (trust / 100);
      return {
        pack_id: pk.pack_id,
        fit_score: Math.round(fit_score * 1000) / 1000,
        trust,
        model_floor: pk.model_floor,
        model_ceiling: pk.model_ceiling,
      };
    })
    .sort((a, b) => b.fit_score - a.fit_score || b.trust - a.trust);
}

const NON_PACK_DIRS = new Set(["node_modules", "tests", "__mock__"]);

function discoverPacks(packsDir: string): Array<{ pack_id: string; model_floor: string; model_ceiling: string }> {
  if (!existsSync(packsDir)) return [];
  const out: Array<{ pack_id: string; model_floor: string; model_ceiling: string }> = [];
  for (const d of readdirSync(packsDir, { withFileTypes: true })) {
    if (!d.isDirectory() || NON_PACK_DIRS.has(d.name)) continue;
    const yamlPath = join(packsDir, d.name, "pack.yaml");
    if (!existsSync(yamlPath)) continue;
    try {
      const doc = (yaml.load(readFileSync(yamlPath, "utf8")) ?? {}) as Record<string, unknown>;
      out.push({
        pack_id: typeof doc.id === "string" ? doc.id : d.name,
        model_floor: typeof doc.model_floor === "string" ? doc.model_floor : "T1",
        model_ceiling: typeof doc.model_ceiling === "string" ? doc.model_ceiling : "T3",
      });
    } catch {
      /* skip unreadable pack */
    }
  }
  return out;
}

// ── Schema builders (pure) ────────────────────────────────────────────────────

export function buildProfile(p: HardwareProfile, now: Date): Record<string, unknown> {
  const next = new Date(now.getTime());
  next.setUTCDate(next.getUTCDate() + 30);
  return {
    schema_version: "1.0.0",
    os: `${p.os}-${p.os_version}`,
    node_version: p.node_version.replace(/^v/, ""),
    gpu: p.gpu,
    ram_gb: p.ram_gb,
    cpu_cores: p.cpu_cores,
    captured_utc: now.toISOString(),
    next_refresh_utc: next.toISOString(),
  };
}

export function buildCredentials(
  anthropic: { access: AnthropicAccess; validation: AnthropicValidation } | null,
  ollama: OllamaInfo,
  gpu: GpuInfo | null,
  now: Date,
): Record<string, unknown> {
  const providers: Record<string, unknown> = {};
  if (anthropic) {
    providers.anthropic = {
      type: anthropic.access === "api_key" ? "api_key" : `oauth_${anthropic.access}`,
      credential_ref: "keyring", // v1: never store the raw key in this file
      tier_detected: anthropic.validation.tier_detected,
      budget_5h_limit: anthropic.validation.budget_5h_limit,
      budget_7d_limit: anthropic.validation.budget_7d_limit,
      last_validated_utc: now.toISOString(),
    };
  }
  if (ollama.available) {
    providers.ollama = {
      type: "local",
      url: ollama.url,
      models: ollama.models,
      gpu,
    };
  }
  return { schema_version: "1.0.0", providers };
}

export function buildConsent(telemetryEnabled: boolean, now: Date): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    telemetry_enabled: telemetryEnabled,
    consent_timestamp_utc: now.toISOString(),
    consent_version: "1.0.0",
    can_revoke: true,
  };
}

// ── Filesystem write (0600) ───────────────────────────────────────────────────

function writeJson600(path: string, obj: unknown): void {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // enforce even if the file pre-existed with looser perms
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
}

/** Idempotent install: copy pack.yaml + scaffold into ~/.mooter/packs/<id>. */
function installPack(packId: string, srcPacksDir: string, mooterHome: string, installed: Set<string>): boolean {
  const srcYaml = join(srcPacksDir, packId, "pack.yaml");
  if (!existsSync(srcYaml)) return false;
  const destDir = join(mooterHome, "packs", packId);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(srcYaml, join(destDir, "pack.yaml"));
  const srcScaffold = join(srcPacksDir, packId, "scaffold.md");
  if (existsSync(srcScaffold)) copyFileSync(srcScaffold, join(destDir, "scaffold.md"));
  installed.add(packId); // Set → re-run never duplicates
  return true;
}

// ── readline-backed IO (real terminal) ────────────────────────────────────────

function defaultIO(): InitIO {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    print: (line) => process.stdout.write(line + "\n"),
    ask: (q) => new Promise((res) => rl.question(q, (a) => res(a.trim()))),
    askHidden: (q) =>
      new Promise((res) => {
        process.stdout.write(q);
        const inp = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
        const wasRaw = inp.isTTY ? inp.isRaw : false;
        if (inp.isTTY && inp.setRawMode) inp.setRawMode(true);
        let buf = "";
        const onData = (ch: Buffer) => {
          const s = ch.toString("utf8");
          const code = ch[0];
          // Enter (\n / \r) or EOT (0x04) → submit.
          if (s === "\n" || s === "\r" || code === 0x04) {
            if (inp.isTTY && inp.setRawMode) inp.setRawMode(wasRaw ?? false);
            inp.removeListener("data", onData);
            process.stdout.write("\n");
            res(buf.trim());
          } else if (code === 0x03) {
            // Ctrl-C → restore the terminal and abort the wizard.
            if (inp.isTTY && inp.setRawMode) inp.setRawMode(wasRaw ?? false);
            process.stdout.write("\n");
            process.exit(130);
          } else if (code === 0x7f || code === 0x08) {
            buf = buf.slice(0, -1); // backspace
          } else {
            buf += s;
            process.stdout.write("*");
          }
        };
        inp.on("data", onData);
      }),
    confirm: (q, defaultYes) =>
      new Promise((res) =>
        rl.question(`${q} [${defaultYes ? "Y/n" : "y/N"}]: `, (a) => {
          const t = a.trim().toLowerCase();
          if (t === "") return res(defaultYes);
          res(t === "y" || t === "yes");
        }),
      ),
  };
}

// ── Default Anthropic validator (1-token test call) ───────────────────────────

async function defaultValidateAnthropic(key: string): Promise<AnthropicValidation> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "a" }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        valid: false,
        tier_detected: "api_key",
        budget_5h_limit: 0,
        budget_7d_limit: 0,
        error: `auth failed (HTTP ${res.status})`,
      };
    }
    return {
      valid: res.ok,
      tier_detected: "api_key",
      budget_5h_limit: 0,
      budget_7d_limit: 0,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      valid: false,
      tier_detected: "api_key",
      budget_5h_limit: 0,
      budget_7d_limit: 0,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

const SUB_BUDGETS: Record<Exclude<AnthropicAccess, "api_key">, { b5h: number; b7d: number }> = {
  pro: { b5h: 40, b7d: 500 },
  max: { b5h: 80, b7d: 1000 },
  team: { b5h: 120, b7d: 2000 },
};

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runInit(opts: InitOptions = {}): Promise<CmdResult> {
  const io = opts.io ?? defaultIO();
  const now = (opts.now ?? (() => new Date()))();
  const mooterHome = opts.mooterHome ?? join(homedir(), ".mooter");
  const packsDir = opts.packsDir ?? defaultPacksDir();
  const probe = opts.probe ?? (() => probeHardware(opts.fetchImpl ?? fetch));
  const validateAnthropic = opts.validateAnthropic ?? defaultValidateAnthropic;

  mkdirSync(mooterHome, { recursive: true });

  // Step 1 — hardware
  const profile = await probe();
  renderProbe(profile, io);

  // Step 2 — providers
  io.print("\nStep 2/5 · AI providers");
  const wantAnthropic = await io.confirm("  Do you have Anthropic Claude access?", true);
  io.print(
    profile.ollama.available
      ? "  ✓ Ollama already detected — local tier enabled"
      : "  · Ollama not detected — skipping local tier",
  );
  io.print("  · OpenAI / Google / Grok — configure in Wave 3");

  // Step 3 — Anthropic credentials
  let anthropic: { access: AnthropicAccess; validation: AnthropicValidation } | null = null;
  if (wantAnthropic) {
    io.print("\nStep 3/5 · Anthropic access");
    io.print("  (1) Claude Pro   (2) Claude Max   (3) Claude Team   (4) API key only");
    const choice = (await io.ask("  Choice [1-4]: ")).trim();
    const access: AnthropicAccess =
      choice === "1" ? "pro" : choice === "3" ? "team" : choice === "4" ? "api_key" : "max";

    if (access === "api_key") {
      const key = await io.askHidden("  Paste your API key (input hidden): ");
      io.print("  Validating with test call (1 token)…");
      const validation = await validateAnthropic(key);
      if (!validation.valid) {
        io.print(`  ✗ Validation failed: ${validation.error ?? "invalid key"}`);
        return { exitCode: 1, output: "init aborted: Anthropic API key validation failed" };
      }
      io.print(`  ✓ Valid (tier: ${validation.tier_detected})`);
      anthropic = { access, validation };
    } else {
      // Browser sub: v1 records the declared tier without an OAuth round-trip.
      const b = SUB_BUDGETS[access];
      io.print(`  ✓ Recorded ${access} subscription (budget ${b.b5h}/5h, ${b.b7d}/7d)`);
      anthropic = {
        access,
        validation: {
          valid: true,
          tier_detected: access,
          budget_5h_limit: b.b5h,
          budget_7d_limit: b.b7d,
        },
      };
    }
  }

  // Step 4 — pack recommendations
  io.print("\nStep 4/5 · Recommended packs (based on your stack)");
  const detectedTier = anthropic
    ? anthropic.access === "api_key"
      ? "T3"
      : anthropic.access === "pro"
        ? "T2"
        : "T3"
    : profile.ollama.available
      ? "T1"
      : "T0";
  const fits = recommendPacks(discoverPacks(packsDir), profile, detectedTier);
  const top3 = fits.slice(0, 3);
  const installed = new Set<string>(loadInstalled(mooterHome));
  if (top3.length === 0) {
    io.print("  (no packs found in registry)");
  }
  for (const f of top3) {
    const want = await io.confirm(
      `  ${f.pack_id} (trust ${f.trust} · fit ${f.fit_score}) — install?`,
      false, // default SKIP — never auto-install
    );
    if (want) {
      const ok = installPack(f.pack_id, packsDir, mooterHome, installed);
      io.print(ok ? `    ✓ installed ${f.pack_id}` : `    ✗ ${f.pack_id} source missing`);
    }
  }
  io.print("  (Install more later with: mooter pack <id>)");
  writeJson600(join(mooterHome, "installed.json"), {
    schema_version: "1.0.0",
    packs: [...installed].sort(),
    updated_utc: now.toISOString(),
  });

  // Step 5 — telemetry consent
  io.print("\nStep 5/5 · Telemetry · privacy-first");
  io.print("  We collect (aggregated, k-anon ≥50): prompt SHA-256 hash, tier+cost,");
  io.print("  pack+confidence, latency. We NEVER collect your code, prompts, or responses.");
  const telemetry = await io.confirm("  Enable telemetry to help mooter improve?", false);

  // Write the three schemas (0600).
  writeJson600(join(mooterHome, "profile.json"), buildProfile(profile, now));
  writeJson600(
    join(mooterHome, "credentials.json"),
    buildCredentials(anthropic, profile.ollama, profile.gpu, now),
  );
  writeJson600(join(mooterHome, "consent.json"), buildConsent(telemetry, now));

  io.print("\n✓ mooter is configured. Run `mooter pack list` to see installed packs.");
  return {
    exitCode: 0,
    output: `init complete · telemetry ${telemetry ? "ON" : "OFF"} · ${installed.size} pack(s) installed`,
  };
}

function loadInstalled(mooterHome: string): string[] {
  const path = join(mooterHome, "installed.json");
  if (!existsSync(path)) return [];
  try {
    const doc = JSON.parse(readFileSync(path, "utf8")) as { packs?: string[] };
    return Array.isArray(doc.packs) ? doc.packs : [];
  } catch {
    return [];
  }
}
