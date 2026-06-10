// Wave 33.5 Block B.3 — platform + sandbox-tool detection.
//
// Determines which backend enforces the 4 layers. There is NO unsandboxed mode
// (security wins, brief §7): if no sandbox tool is available the orchestrator
// refuses to spawn and tells the user how to install one.

import { execFileSync } from "node:child_process";
import { platform } from "node:os";

export type SandboxBackend = "bubblewrap" | "seatbelt" | "none";

export interface SandboxAvailability {
  platform: NodeJS.Platform;
  backend: SandboxBackend;
  available: boolean;
  /** Install/remediation hint when unavailable. */
  hint: string;
}

export type WhichRunner = (bin: string) => boolean;

const defaultWhich: WhichRunner = (bin) => {
  try {
    execFileSync("which", [bin], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
};

export function detectSandbox(which: WhichRunner = defaultWhich, plat: NodeJS.Platform = platform()): SandboxAvailability {
  if (plat === "linux") {
    const ok = which("bwrap");
    return {
      platform: plat,
      backend: "bubblewrap",
      available: ok,
      hint: ok
        ? "bubblewrap ready"
        : "install bubblewrap: `sudo apt install bubblewrap` (Ubuntu ≥24.04 also needs an AppArmor profile at /etc/apparmor.d/bwrap for unprivileged user namespaces)",
    };
  }
  if (plat === "darwin") {
    const ok = which("sandbox-exec");
    return {
      platform: plat,
      backend: "seatbelt",
      available: ok,
      hint: ok ? "Seatbelt (sandbox-exec) present" : "sandbox-exec missing — macOS spawn support lands in a later wave",
    };
  }
  return {
    platform: plat,
    backend: "none",
    available: false,
    hint: `no sandbox backend for platform '${plat}'; Windows Job Objects support is researched for a later wave`,
  };
}
