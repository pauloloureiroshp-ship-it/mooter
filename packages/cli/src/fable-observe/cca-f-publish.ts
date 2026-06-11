// packages/cli/src/fable-observe/cca-f-publish.ts — Wave 54 Phase E.
//
// Prepares publish artefacts for the morning report: a Notion-ready markdown body
// + a dashboard chip JSON. The overnight cron run is non-interactive and the
// Notion MCP needs an authenticated session, so publishing here is FILE-BASED:
// we write notion-page.md (Paulo pastes it, or an interactive session pushes it
// via MCP) and chip.json (the dashboard reads it). Nothing is faked.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AuditReport } from "./cca-f-audit.ts";

// Mooter HQ Notion page id (parent for the audit sub-page).
export const NOTION_HQ_PAGE_ID = "33d6f6e4-2bc4-816b-977a-fe84bbe912c9";

export interface DashboardChip {
  label: string; // "Last CCA-F audit"
  date: string; // 2026-06-11
  pass_rate: string; // "78%"
  routing_accuracy: string; // "92%"
  classify_intact: boolean | null; // MEASURED sha256 vs frozen (null if not measured)
  session_id: string;
  report_relpath: string; // report.md within the audit dir
}

export interface PublishPayload {
  notion_title: string;
  notion_parent: string;
  notion_tags: string[];
  notion_body_md: string; // = report.md content (passed in)
  chip: DashboardChip;
}

export function buildPublishPayload(report: AuditReport, reportMarkdown: string): PublishPayload {
  const date = report.started_at.slice(0, 10);
  return {
    notion_title: `📜 Wave 54 CCA-F Audit Report — ${date}`,
    notion_parent: NOTION_HQ_PAGE_ID,
    notion_tags: ["wave-54", "cca-f-audit", "bullet-proof-proof"],
    notion_body_md: reportMarkdown,
    chip: {
      label: "Last CCA-F audit",
      date,
      pass_rate: `${Math.round(report.summary.pass_rate * 100)}%`,
      routing_accuracy: `${Math.round(report.summary.routing_accuracy * 100)}%`,
      classify_intact: report.classify_intact, // measured, not asserted
      session_id: report.session_id,
      report_relpath: "report.md",
    },
  };
}

/** Write the publish artefacts into the audit dir. Returns the file paths. */
export function writePublishArtefacts(
  dir: string,
  report: AuditReport,
  reportMarkdown: string,
): { notionPath: string; chipPath: string; payload: PublishPayload } {
  const payload = buildPublishPayload(report, reportMarkdown);
  const notionPath = join(dir, "notion-page.md");
  const chipPath = join(dir, "chip.json");
  writeFileSync(
    notionPath,
    `<!-- Paste under Notion HQ ${payload.notion_parent} · tags: ${payload.notion_tags.join(", ")} -->\n# ${payload.notion_title}\n\n${reportMarkdown}`,
    "utf8",
  );
  writeFileSync(chipPath, JSON.stringify(payload.chip, null, 2) + "\n", "utf8");
  return { notionPath, chipPath, payload };
}
