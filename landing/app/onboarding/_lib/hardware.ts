// Wave 6 D1 — pure hardware-classification helpers, extracted from the inline
// onboarding page logic so they unit-test in landing's node-env vitest. The
// page does the browser probing (WebGL renderer string, navigator.*); these
// functions turn what it found into the wizard's hw-chip suggestion. Best-effort
// by design — the CLI wizard (`mooter init`) does the precise detection.

export type OsClass = "mac" | "windows" | "linux" | "other";

/** HW_OPTIONS values the onboarding page offers (kept in sync with page.tsx). */
export type HwValue =
  | "mac_m_series"
  | "windows_nvidia"
  | "windows_amd"
  | "linux_nvidia"
  | "linux_amd"
  | "cloud"
  | "other";

/** Map a userAgent string to an OS class. Lower-cased internally. */
export function osFromUserAgent(ua: string): OsClass {
  const s = (ua || "").toLowerCase();
  if (s.includes("mac")) return "mac";
  if (s.includes("win")) return "windows";
  if (s.includes("linux")) return "linux";
  return "other";
}

/** Coarse GPU vendor from a WebGL UNMASKED_RENDERER string. Best-effort. */
export function gpuVendor(gpuName: string | null): "nvidia" | "amd" | "apple" | "intel" | "unknown" {
  const g = (gpuName || "").toLowerCase();
  if (!g) return "unknown";
  if (g.includes("nvidia") || /\bgeforce\b|\brtx\b|\bgtx\b/.test(g)) return "nvidia";
  if (g.includes("amd") || g.includes("radeon")) return "amd";
  if (g.includes("apple") || /\bm[1-9]\b/.test(g)) return "apple";
  if (g.includes("intel")) return "intel";
  return "unknown";
}

/**
 * Suggest an HW_OPTIONS value from the probed OS + GPU string. Returns null when
 * there is not enough signal (so the wizard asks the user to pick manually).
 * Mirrors the page's previous inline mapping exactly, plus AMD-on-Linux/Windows.
 */
export function suggestHardware(os: OsClass, gpuName: string | null): HwValue | null {
  const vendor = gpuVendor(gpuName);
  if (os === "mac") return "mac_m_series";
  if (os === "windows") {
    if (vendor === "amd") return "windows_amd";
    return "windows_nvidia"; // best guess for windows (nvidia or unknown)
  }
  if (os === "linux") {
    if (vendor === "amd") return "linux_amd";
    return "linux_nvidia"; // best guess for linux (nvidia or unknown)
  }
  return null;
}

/** Coarse RAM class from navigator.deviceMemory (GB). null when unavailable. */
export function ramClass(gb: number | null | undefined): "low" | "mid" | "high" | null {
  if (typeof gb !== "number" || !Number.isFinite(gb) || gb <= 0) return null;
  return gb < 8 ? "low" : gb < 32 ? "mid" : "high";
}
