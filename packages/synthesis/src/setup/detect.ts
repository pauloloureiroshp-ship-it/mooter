// L14 — Setup Intelligence: auto-detect (Wave 29 Phase 29.G, Paulo Vector A).
//
// Reuses the existing router probes (tools/router/*.js) rather than reimplementing
// hardware/subscription detection:
//   - gpu-probe.js          probeSync() / classifyHwTier()      (require-safe)
//   - vram_detect.js        getVram()                            (require-safe)
//   - detect-subscriptions.js detectAll()                        (require-safe)
//   - hardware-matcher.js   CLI-only → shelled out (never required; it self-runs)
//
// Split into a PURE assembler (buildProfile) and an IMPURE collector
// (collectRaw) so the profile shape is unit-testable without real hardware.
// Output: ~/.mooter/setup_profile.json (versioned, diff-able, 20+ datapoints).

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { mooterPath, readJsonSafe, writeJson } from "../config.ts";

export type OsClass = "darwin" | "linux" | "wsl2" | "windows" | "unknown";
export type SubscriptionTier = "claude-max" | "claude-pro" | "multi" | "none";

export interface RawDetect {
  platform: string;
  arch: string;
  os_release: string; // /proc/version contents (for WSL detection), "" if N/A
  node_version: string;
  python_version: string | null;
  docker_version: string | null;
  ollama_version: string | null;
  ollama_models: string[];
  gpu: { vendor: string; name: string; vramMB: number | null; platform: string } | null;
  hw_tier: string;
  vram: { used_mb: number; total_mb: number } | null;
  hardware_matcher: { tier?: string; label?: string; recommended_models?: string[] } | null;
  subscriptions: { anthropic: string; openai: string; codex_cli: string; gemini: string; ollama: string };
}

export interface SetupProfile {
  version: number;
  detected_at: string;
  hardware: {
    platform: string;
    os_class: OsClass;
    cpu_arch: string;
    gpu_vendor: string;
    gpu_name: string;
    vram_used_gb: number | null;
    vram_total_gb: number | null;
    hw_tier: string;
    has_npu: boolean;
    hardware_class: string;
  };
  software: {
    node_version: string;
    python_version: string | null;
    docker_version: string | null;
    ollama_version: string | null;
    ollama_models: string[];
    ollama_models_count: number;
  };
  subscriptions: {
    anthropic: string;
    openai: string;
    codex_cli: string;
    gemini: string;
    ollama: string;
    subscription_tier: SubscriptionTier;
  };
  derived: {
    can_run_local_llm: boolean;
    recommended_local_model: string | null;
    notes: string[];
  };
}

export function classifyOs(platform: string, osRelease: string): OsClass {
  if (platform === "darwin") return "darwin";
  if (platform === "win32") return "windows";
  if (platform === "linux") return /microsoft/i.test(osRelease) ? "wsl2" : "linux";
  return "unknown";
}

function detectNpu(raw: RawDetect): boolean {
  if (raw.platform === "darwin" && raw.arch === "arm64") return true; // Apple Neural Engine
  const name = (raw.gpu?.name ?? "").toLowerCase();
  return /snapdragon|hexagon|npu|ryzen ai/.test(name);
}

function deriveHardwareClass(raw: RawDetect): string {
  if (raw.platform === "darwin" && raw.arch === "arm64") return "apple-silicon";
  const name = (raw.gpu?.name ?? "").toLowerCase();
  if (raw.gpu?.vendor === "nvidia" && name) {
    const m = name.match(/(rtx|gtx)\s*([0-9]{3,4}\s*(ti|super)?)/);
    if (m) return `nvidia-${m[1]}-${m[2].replace(/\s+/g, "")}`.toLowerCase();
    return "nvidia-gpu";
  }
  if (raw.gpu?.vendor === "amd") return "amd-gpu";
  return raw.hw_tier || "cpu-only";
}

export function deriveSubscriptionTier(subs: RawDetect["subscriptions"]): SubscriptionTier {
  const a = (subs.anthropic || "none").toLowerCase();
  if (a === "max" || a === "team" || a === "enterprise") return "claude-max";
  if (a === "pro") return "claude-pro";
  const otherPaid = [subs.openai, subs.codex_cli, subs.gemini].some(
    (p) => p && !["none", "installed", ""].includes(p.toLowerCase()),
  );
  return otherPaid ? "multi" : "none";
}

function recommendLocalModel(raw: RawDetect): string | null {
  if (raw.hardware_matcher?.recommended_models?.length) return raw.hardware_matcher.recommended_models[0];
  const totalGb = raw.vram?.total_mb ? raw.vram.total_mb / 1024 : raw.gpu?.vramMB ? raw.gpu.vramMB / 1024 : 0;
  const apple = raw.platform === "darwin" && raw.arch === "arm64";
  if (totalGb >= 20 || apple) return "qwen3:30b";
  if (totalGb >= 8) return "gemma3:12b";
  if (totalGb >= 4) return "qwen2.5-coder:7b";
  if (apple || totalGb > 0) return "qwen2.5:3b";
  return null;
}

/** PURE: assemble a profile from raw detector output. Deterministic given `now`. */
export function buildProfile(raw: RawDetect, now = "1970-01-01T00:00:00.000Z"): SetupProfile {
  const os_class = classifyOs(raw.platform, raw.os_release);
  const has_npu = detectNpu(raw);
  const apple = raw.platform === "darwin" && raw.arch === "arm64";
  const totalGb = raw.vram?.total_mb ? Number((raw.vram.total_mb / 1024).toFixed(1)) : null;
  const usedGb = raw.vram && raw.vram.used_mb >= 0 ? Number((raw.vram.used_mb / 1024).toFixed(1)) : null;
  const can_run_local_llm = apple || raw.hw_tier !== "cpu-only" || (raw.gpu?.vramMB ?? 0) >= 4096;
  const notes: string[] = [];
  if (raw.ollama_models.length === 0 && raw.ollama_version) {
    notes.push("Ollama installed but no models pulled — run `ollama pull qwen2.5-coder:7b`.");
  }
  if (apple) notes.push("Apple Silicon: consider the MLX backend (~15% faster than Ollama on M-series).");

  return {
    version: 1,
    detected_at: now,
    hardware: {
      platform: raw.platform,
      os_class,
      cpu_arch: raw.arch,
      gpu_vendor: raw.gpu?.vendor ?? "cpu",
      gpu_name: raw.gpu?.name ?? "unknown",
      vram_used_gb: usedGb,
      vram_total_gb: totalGb,
      hw_tier: raw.hw_tier,
      has_npu,
      hardware_class: deriveHardwareClass(raw),
    },
    software: {
      node_version: raw.node_version,
      python_version: raw.python_version,
      docker_version: raw.docker_version,
      ollama_version: raw.ollama_version,
      ollama_models: raw.ollama_models,
      ollama_models_count: raw.ollama_models.length,
    },
    subscriptions: {
      anthropic: raw.subscriptions.anthropic,
      openai: raw.subscriptions.openai,
      codex_cli: raw.subscriptions.codex_cli,
      gemini: raw.subscriptions.gemini,
      ollama: raw.subscriptions.ollama,
      subscription_tier: deriveSubscriptionTier(raw.subscriptions),
    },
    derived: { can_run_local_llm, recommended_local_model: recommendLocalModel(raw), notes },
  };
}

// ── Impure collectors ───────────────────────────────────────────────────────

type Spawn = (cmd: string, args: string[], opts: SpawnSyncOptions) => { status: number | null; stdout?: Buffer | string };

function routerDir(): string {
  // packages/synthesis/src/setup/ → repo root → tools/router
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "tools", "router");
}

function tryRequire(name: string): unknown {
  try {
    const req = createRequire(import.meta.url);
    return req(join(routerDir(), name));
  } catch {
    return null;
  }
}

function probeVersion(spawn: Spawn, cmd: string, args: string[]): string | null {
  try {
    const r = spawn(cmd, args, { timeout: 4000, encoding: "utf8" } as SpawnSyncOptions);
    if (r.status !== 0 || !r.stdout) return null;
    const out = (typeof r.stdout === "string" ? r.stdout : r.stdout.toString()).trim();
    return out.split("\n")[0] || null;
  } catch {
    return null;
  }
}

function probeOllamaModels(spawn: Spawn): string[] {
  try {
    const r = spawn("ollama", ["list"], { timeout: 4000, encoding: "utf8" } as SpawnSyncOptions);
    if (r.status !== 0 || !r.stdout) return [];
    const out = typeof r.stdout === "string" ? r.stdout : r.stdout.toString();
    return out
      .split("\n")
      .slice(1) // drop header
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((n) => n && n !== "NAME");
  } catch {
    return [];
  }
}

function readOsRelease(): string {
  try {
    if (process.platform !== "linux") return "";
    return readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

function shellHardwareMatcher(spawn: Spawn): RawDetect["hardware_matcher"] {
  try {
    const r = spawn("node", [join(routerDir(), "hardware-matcher.js")], { timeout: 6000, encoding: "utf8" } as SpawnSyncOptions);
    if (r.status !== 0 || !r.stdout) return null;
    const parsed = JSON.parse(typeof r.stdout === "string" ? r.stdout : r.stdout.toString());
    return {
      tier: parsed?.hardware?.tier,
      label: parsed?.hardware?.label,
      recommended_models: parsed?.recommendation?.models,
    };
  } catch {
    return null;
  }
}

/** IMPURE: gather raw detection from the live machine via the router probes. */
export async function collectRaw(opts: { spawn?: Spawn } = {}): Promise<RawDetect> {
  const spawn = opts.spawn ?? (spawnSync as unknown as Spawn);

  const gpuMod = tryRequire("gpu-probe.js") as
    | { probeSync?: () => { vendor: string; name_short: string; vramMB: number | null; platform: string }; classifyHwTier?: (p: unknown) => string }
    | null;
  const vramMod = tryRequire("vram_detect.js") as { getVram?: (s?: unknown) => { used_mb: number; total_mb: number } | null } | null;
  const subsMod = tryRequire("detect-subscriptions.js") as
    | { detectAll?: () => Promise<Record<string, { plan: string }>>; flattenForBackcompat?: (d: unknown) => Record<string, string> }
    | null;

  let gpu: RawDetect["gpu"] = null;
  let hw_tier = "cpu-only";
  try {
    const probe = gpuMod?.probeSync?.();
    if (probe) {
      gpu = { vendor: probe.vendor, name: probe.name_short, vramMB: probe.vramMB, platform: probe.platform };
      hw_tier = gpuMod?.classifyHwTier?.(probe) ?? "cpu-only";
    }
  } catch {
    /* swallow */
  }

  let vram: RawDetect["vram"] = null;
  try {
    vram = vramMod?.getVram?.() ?? null;
  } catch {
    /* swallow */
  }

  let subscriptions: RawDetect["subscriptions"] = { anthropic: "none", openai: "none", codex_cli: "none", gemini: "none", ollama: "none" };
  try {
    if (subsMod?.detectAll && subsMod?.flattenForBackcompat) {
      const flat = subsMod.flattenForBackcompat(await subsMod.detectAll());
      subscriptions = {
        anthropic: flat.anthropic ?? "none",
        openai: flat.openai ?? "none",
        codex_cli: flat.openai_codex_cli ?? "none",
        gemini: flat.gemini ?? "none",
        ollama: flat.ollama ?? "none",
      };
    }
  } catch {
    /* swallow */
  }

  return {
    platform: process.platform,
    arch: process.arch,
    os_release: readOsRelease(),
    node_version: process.version,
    python_version: probeVersion(spawn, "python3", ["--version"]) ?? probeVersion(spawn, "python", ["--version"]),
    docker_version: probeVersion(spawn, "docker", ["--version"]),
    ollama_version: probeVersion(spawn, "ollama", ["--version"]),
    ollama_models: probeOllamaModels(spawn),
    gpu,
    hw_tier,
    vram,
    hardware_matcher: shellHardwareMatcher(spawn),
    subscriptions,
  };
}

export async function detectSetup(opts: { spawn?: Spawn; now?: string } = {}): Promise<SetupProfile> {
  const raw = await collectRaw(opts);
  return buildProfile(raw, opts.now ?? new Date().toISOString());
}

function profilePath(): string {
  return mooterPath("setup_profile.json");
}

export function saveProfile(profile: SetupProfile): void {
  writeJson(profilePath(), profile);
}

export function loadProfile(): SetupProfile | null {
  return readJsonSafe<SetupProfile | null>(profilePath(), null);
}
