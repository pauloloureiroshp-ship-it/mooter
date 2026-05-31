// Wave 4 Phase C — dashboard cloud cards (EXTEND the existing /dashboard).
//
// Honest adaptation (Paulo-approved): the dashboard already shows real synced data
// via the Decisions tab (/api/decisions-log) and a /settings page already exists.
// So this module adds only what's genuinely new — a CLI connection card and a
// settings link — both from REAL device data (profile.devices), plus honest
// notes where the cloud has no data yet (per-tier breakdown, real-time sync, and
// CLI-local settings all ship Wave 4 Phase D). No fabricated/"mock" numbers.
//
// Pure helpers are exported + unit-tested (landing vitest is node-env, no RTL);
// the JSX is a thin shell over them using the page's inline-style + CSS-var idiom.

import React from "react";

export interface PhaseCDevice {
  device_name?: string;
  hw_tier?: string;
  has_ollama?: boolean;
  last_sync_at?: string;
  decisions_count?: number;
  savings_usd?: number;
}
export interface PhaseCProfile {
  email?: string;
  devices?: PhaseCDevice[];
}

export interface CliConnection {
  connected: boolean;
  deviceCount: number;
  lastSeenIso: string | null;
  hwClass: string | null;
  hasOllama: boolean;
}

/**
 * Derive CLI/device connection state from REAL profile.devices — no heuristics,
 * no localStorage. "connected" simply means at least one device has reported a
 * sync. The newest last_sync_at wins for "last seen". Pure.
 */
export function cliConnection(profile: PhaseCProfile | null | undefined): CliConnection {
  const devices = (profile?.devices ?? []).filter(Boolean);
  if (devices.length === 0) {
    return { connected: false, deviceCount: 0, lastSeenIso: null, hwClass: null, hasOllama: false };
  }
  const newest = devices.reduce((a, b) => (new Date(b.last_sync_at ?? 0) > new Date(a.last_sync_at ?? 0) ? b : a));
  return {
    connected: true,
    deviceCount: devices.length,
    lastSeenIso: newest.last_sync_at ?? null,
    hwClass: newest.hw_tier ?? null, // already a class (e.g. "gpu-high"), never a raw model
    hasOllama: newest.has_ollama === true,
  };
}

export function timeAgoShort(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const diff = nowMs - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Honest disclaimers reused across the cards (single source so they stay consistent).
export const PHASE_C = {
  realTimeSync: "Real-time CLI↔cloud sync ships Wave 4 Phase D (CF Workers backend).",
  perTier: "Per-tier breakdown (T0–T3) ships Wave 4 Phase D.",
  settingsInCli: "Telemetry, sync cadence & adapter are managed in your CLI (`mooter quiet --help`); cloud edit ships Wave 4 Phase D.",
  adapter: "Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge).",
} as const;

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  padding: "20px 24px",
  marginBottom: 20,
};
const muted: React.CSSProperties = { color: "var(--muted)", fontSize: "0.8rem" };
const codeStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: "var(--mono)",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  padding: "4px 10px",
  marginTop: 6,
};

/** Sub-feature 1 — CLI Connection Status (real device data). */
export function CliStatusCard({ profile, nowMs }: { profile: PhaseCProfile; nowMs?: number }) {
  const c = cliConnection(profile);
  if (!c.connected) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>⚪ CLI not connected</h3>
        <p style={{ ...muted, margin: "0 0 4px" }}>Connect your terminal to see your Mooter data here.</p>
        <code style={codeStyle}>mooter login</code>
      </div>
    );
  }
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>🐮 CLI connected</h3>
      <p style={{ ...muted, margin: "0 0 4px" }}>
        {c.deviceCount} device{c.deviceCount === 1 ? "" : "s"} · last sync {timeAgoShort(c.lastSeenIso, nowMs)}
        {c.hwClass ? ` · ${c.hwClass} class` : ""}{c.hasOllama ? " · ollama" : ""}
      </p>
      <code style={codeStyle}>mooter sync --dry-run</code>
      <p style={{ ...muted, marginTop: 10 }}>ⓘ {PHASE_C.realTimeSync}</p>
    </div>
  );
}

/** Sub-feature 2 — Activity note (honest; per-tier has no cloud data yet). */
export function ActivityNote() {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>Activity</h3>
      <p style={{ ...muted, margin: "0 0 4px" }}>
        Your synced decisions &amp; savings are in the <strong>Decisions</strong> tab.
      </p>
      <p style={muted}>ⓘ {PHASE_C.perTier}</p>
    </div>
  );
}

/** Sub-feature 4 — Settings link (does NOT duplicate the existing /settings). */
export function CliSettingsLink() {
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>Settings</h3>
      <p style={{ margin: "0 0 8px" }}>
        Manage your profile, subscriptions &amp; devices in{" "}
        <a href="/settings" style={{ color: "var(--accent)" }}>Settings →</a>
      </p>
      <p style={{ ...muted, margin: "0 0 4px" }}>ⓘ {PHASE_C.settingsInCli}</p>
      <p style={muted}>{PHASE_C.adapter}</p>
    </div>
  );
}

/** Sub-feature 5 — global honest footer note. */
export function DashboardFooterNote() {
  return (
    <p style={{ ...muted, marginTop: 28, textAlign: "center" }}>
      🐮 Mooter dashboard — synced session data. {PHASE_C.realTimeSync}
    </p>
  );
}
