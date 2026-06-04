// Wave 10 Phase B.1a — honest data-source badge (#4).
//
// Marks any KPI block as live hub data or an illustrative/demo placeholder, so a
// visitor never mistakes a placeholder for their real numbers. Reused by the
// homepage CommunityPulse and the dashboard Workflow tab.

// Wave 14 Day 2 (F-4) — added the "outdated" state so a hero of real-but-stale
// numbers reads as such (amber) instead of claiming to be "Live" (green) or
// fabricated ("Demo"). Existing "live"/"demo" callers are unchanged.
export default function DataSourceBadge({
  source,
  detail,
}: {
  source: "live" | "outdated" | "demo";
  detail?: string;
}) {
  const GREEN = "var(--color-green, #48c068)";
  const AMBER = "var(--color-amber, #d4c090)";
  const MUTED = "var(--color-muted, #9a8f8a)";
  const accent = source === "live" ? GREEN : source === "outdated" ? AMBER : MUTED;

  const label =
    source === "live"
      ? `Live${detail ? ` · ${detail}` : ""}`
      : source === "outdated"
      ? `Outdated${detail ? ` · ${detail}` : ""}`
      : detail
      ? `Demo · ${detail}`
      : "Demo data — connect mooter to see real numbers";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.2,
        padding: "3px 9px",
        borderRadius: 999,
        color: accent,
        border: `1px solid ${source === "demo" ? "var(--color-border, #3a302e)" : accent}`,
        background: "transparent",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: accent,
        }}
      />
      {label}
    </span>
  );
}
