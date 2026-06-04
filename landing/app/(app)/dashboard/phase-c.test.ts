// Wave 4 Phase C — pure helpers for the new dashboard cards.
// landing vitest is node-env (no React testing library), so we test the pure
// logic (connection derivation, time formatting, honest disclaimers) — not JSX.

import { describe, it, expect } from "vitest";
import { cliConnection, timeAgoShort, PHASE_C } from "./_phase_c";

describe("cliConnection (real device data, no heuristics)", () => {
  it("no devices → not connected", () => {
    const c = cliConnection({ devices: [] });
    expect(c.connected).toBe(false);
    expect(c.deviceCount).toBe(0);
    expect(c.lastSeenIso).toBe(null);
  });

  it("undefined profile → not connected (no throw)", () => {
    expect(cliConnection(undefined).connected).toBe(false);
    expect(cliConnection(null).deviceCount).toBe(0);
  });

  it("devices present → connected, newest last_sync wins", () => {
    const c = cliConnection({
      devices: [
        { last_sync_at: "2026-05-30T10:00:00Z", hw_tier: "gpu-mid", has_ollama: false },
        { last_sync_at: "2026-05-31T18:00:00Z", hw_tier: "gpu-high", has_ollama: true },
      ],
    });
    expect(c.connected).toBe(true);
    expect(c.deviceCount).toBe(2);
    expect(c.lastSeenIso).toBe("2026-05-31T18:00:00Z");
    expect(c.hwClass).toBe("gpu-high"); // class, never a raw GPU model
    expect(c.hasOllama).toBe(true);
  });
});

describe("timeAgoShort", () => {
  const now = Date.parse("2026-05-31T18:00:00Z");
  it("formats minutes/hours/days; null → —", () => {
    expect(timeAgoShort(null, now)).toBe("—");
    expect(timeAgoShort("2026-05-31T17:30:00Z", now)).toBe("30m ago");
    expect(timeAgoShort("2026-05-31T13:00:00Z", now)).toBe("5h ago");
    expect(timeAgoShort("2026-05-29T18:00:00Z", now)).toBe("2d ago");
    expect(timeAgoShort("2026-05-31T17:59:50Z", now)).toBe("just now");
  });
});

describe("PHASE_C disclaimers — honest, actionable, no stale Wave promises", () => {
  it("points to actionable CLI commands instead of unshipped 'Wave 4 Phase D'", () => {
    expect(PHASE_C.realTimeSync).not.toMatch(/Wave 4 Phase D/);
    expect(PHASE_C.realTimeSync).toMatch(/mooter sync/);
    expect(PHASE_C.perTier).not.toMatch(/Wave 4 Phase D/);
    expect(PHASE_C.perTier).toMatch(/mooter trail/);
    expect(PHASE_C.settingsInCli).not.toMatch(/Wave 4 Phase D/);
    expect(PHASE_C.settingsInCli).toMatch(/mooter quiet/);
  });
  it("adapter disclosure is actionable (forge install), not a stale 'ships Wave 5' promise", () => {
    expect(PHASE_C.adapter).toMatch(/baseline/);
    expect(PHASE_C.adapter).toMatch(/forge install/);
    expect(PHASE_C.adapter).not.toMatch(/ships Wave 5/);
  });
});
