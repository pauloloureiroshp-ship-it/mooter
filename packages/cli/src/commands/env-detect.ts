// `mooter env-detect` (Wave 24 24.F) — print this machine's hardware tier and
// sync identity so cross-machine setups can be verified at a glance.
//
// Why this exists: the hub once recorded "apple-silicon" for a Windows RTX 4090
// user, and there was no first-class way to confirm what a given machine
// reports. This command shows the OS, GPU, derived `hw_tier`, and — crucially —
// both identifiers used by sync:
//   • instance_id   = SHA-256(hostname|user)[:8]  → per-MACHINE
//   • user_id_hash  = stable Supabase user hash    → SAME across machines
// Aggregations keyed on user_id_hash dedup the same person across machines;
// this command lets the user check that the hash matches on each box.
//
// Detection mirrors tools/router/gpu-probe.js classifyHwTier() but is
// self-contained (the published CLI can't import from tools/router).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname, userInfo, platform, release } from "node:os";
import { createHash } from "node:crypto";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export type HwTier = "gpu-high" | "gpu-mid" | "gpu-low" | "apple-silicon" | "cpu-only";

export interface EnvProbe {
  os: string;          // linux | darwin | win32
  os_label: string;    // human label, incl. WSL note
  is_wsl: boolean;
  gpu_vendor: "nvidia" | "apple" | "amd" | "cpu";
  gpu_name: string;
  vram_mb: number | null;
  hw_tier: HwTier;
  instance_id: string;
  user_id_hash: string | null;
}

const USER_HASH_RE = /^[a-f0-9]{16}$/;

/** Map a GPU probe to the same tiers gpu-probe.js classifyHwTier() produces. */
export function classifyHwTier(vendor: EnvProbe["gpu_vendor"], vramMb: number | null): HwTier {
  if (vendor === "apple") return "apple-silicon";
  if (vendor === "cpu") return "cpu-only";
  const vram = vramMb || 0;
  if (vram >= 20480) return "gpu-high";
  if (vram >= 8192) return "gpu-mid";
  if (vram >= 4096) return "gpu-low";
  return "cpu-only";
}

function sh(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 3000, windowsHide: true });
    if (r.status !== 0 || !r.stdout) return null;
    return r.stdout.trim();
  } catch {
    return null;
  }
}

function detectWsl(): boolean {
  if (platform() !== "linux") return false;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function probeGpu(plat: string): { vendor: EnvProbe["gpu_vendor"]; name: string; vramMb: number | null } {
  // 1. NVIDIA (Linux + Windows native + WSL with GPU passthrough).
  if (plat === "linux" || plat === "win32") {
    const out = sh("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
    if (out) {
      const first = out.split(/\r?\n/).find(Boolean);
      if (first) {
        const [nameRaw, vramStr] = first.split(",").map((s) => s.trim());
        const name = (nameRaw || "NVIDIA GPU")
          .replace(/^NVIDIA\s+GeForce\s+/i, "")
          .replace(/^NVIDIA\s+/i, "")
          .trim();
        const vram = parseInt(vramStr || "", 10);
        return { vendor: "nvidia", name: name || "NVIDIA GPU", vramMb: Number.isFinite(vram) ? vram : null };
      }
    }
  }
  // 2. macOS Apple Silicon.
  if (plat === "darwin") {
    const out = sh("system_profiler", ["SPDisplaysDataType", "-json"]);
    if (out) {
      try {
        const data = JSON.parse(out);
        const entry = data?.SPDisplaysDataType?.[0];
        const name = entry?.sppci_model || entry?._name || "Apple GPU";
        return { vendor: "apple", name: String(name), vramMb: null };
      } catch {
        return { vendor: "apple", name: "Apple GPU", vramMb: null };
      }
    }
  }
  // 3. Linux AMD via sysfs (presence only).
  if (plat === "linux") {
    try {
      readFileSync("/sys/class/drm/card0/device/gpu_busy_percent", "utf8");
      return { vendor: "amd", name: "AMD GPU", vramMb: null };
    } catch {
      /* none */
    }
  }
  return { vendor: "cpu", name: "CPU-only", vramMb: null };
}

function readUserIdHash(): string | null {
  // Two login flows persist the stable hash to two places:
  //   • `mooter login` (this CLI)        → ~/.mooter/auth.json {user_id_hash}
  //   • router frugal-login.js (the hook) → ~/.frugal/user.hash (16-hex)
  // Prefer auth.json since the command's own hint tells users to run
  // `mooter login`; fall back to the router file.
  try {
    const raw = readFileSync(join(homedir(), ".mooter", "auth.json"), "utf8");
    const v = String(JSON.parse(raw).user_id_hash || "").trim();
    if (/^[a-f0-9]{8,64}$/i.test(v)) return v;
  } catch {
    /* not logged in via CLI — try the router file */
  }
  try {
    const v = readFileSync(join(homedir(), ".frugal", "user.hash"), "utf8").trim();
    return USER_HASH_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function instanceId(): string {
  try {
    const mid = hostname() + "|" + (userInfo().username || "");
    return createHash("sha256").update(mid).digest("hex").slice(0, 8);
  } catch {
    return "unknown0";
  }
}

export function probeEnv(): EnvProbe {
  const plat = platform();
  const isWsl = detectWsl();
  const gpu = probeGpu(plat);
  const hwTier = classifyHwTier(gpu.vendor, gpu.vramMb);
  const osLabel =
    plat === "win32" ? "Windows" :
    plat === "darwin" ? "macOS" :
    isWsl ? "Linux (WSL2)" : "Linux";
  return {
    os: plat,
    os_label: `${osLabel} ${release()}`,
    is_wsl: isWsl,
    gpu_vendor: gpu.vendor,
    gpu_name: gpu.name,
    vram_mb: gpu.vramMb,
    hw_tier: hwTier,
    instance_id: instanceId(),
    user_id_hash: readUserIdHash(),
  };
}

export function runEnvDetect(opts: { json?: boolean } = {}): CmdResult {
  const env = probeEnv();
  if (opts.json) {
    return { exitCode: 0, output: JSON.stringify(env, null, 2) };
  }
  const lines: string[] = [];
  lines.push("🐮 mooter env-detect — this machine");
  lines.push("");
  lines.push(`  OS          ${env.os_label}`);
  lines.push(`  GPU         ${env.gpu_name}${env.vram_mb ? ` · ${env.vram_mb} MB VRAM` : ""}`);
  lines.push(`  hw_tier     ${env.hw_tier}`);
  lines.push("");
  lines.push(`  instance_id ${env.instance_id}   (per-machine)`);
  lines.push(
    env.user_id_hash
      ? `  user_id_hash ${env.user_id_hash.slice(0, 16)}  (stable — same on all your machines)`
      : `  user_id_hash —         (not signed in · run \`mooter login\` to enable cross-machine dedup)`,
  );
  lines.push("");
  lines.push("  Cross-machine: stats are deduped by user_id_hash, so the same");
  lines.push("  account on two machines is counted once. instance_id differs per box.");
  return { exitCode: 0, output: lines.join("\n") };
}
