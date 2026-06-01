// Wave 10 Phase B.1a — honest data-source badge (#4).
//
// Marks any KPI block as live hub data or an illustrative/demo placeholder, so a
// visitor never mistakes a placeholder for their real numbers. Reused by the
// homepage CommunityPulse and the dashboard Workflow tab.

export default function DataSourceBadge({
  source,
  detail,
}: {
  source: "live" | "demo";
  detail?: string;
}) {
  const live = source === "live";
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
        color: live ? "var(--color-green, #48c068)" : "var(--color-muted, #9a8f8a)",
        border: `1px solid ${live ? "var(--color-green, #48c068)" : "var(--color-border, #3a302e)"}`,
        background: "transparent",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: live ? "var(--color-green, #48c068)" : "var(--color-muted, #9a8f8a)",
        }}
      />
      {live ? `Live${detail ? ` · ${detail}` : ""}` : "Demo data — connect mooter to see real numbers"}
    </span>
  );
}
