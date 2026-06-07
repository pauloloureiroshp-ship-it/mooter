#!/usr/bin/env -S npx tsx
// Mooter MCP server executable (Wave 30 Phase K). Starts the stdio server.
//
//   mooter-mcp            # serve over stdio (Claude Code spawns this)
//
// NOTION_TOKEN (env) enables mooter_notion_write to actually create pages.

import { buildRegistry } from "./tools.ts";
import { serveStdio } from "./server.ts";

serveStdio(buildRegistry(), {
  notionToken: process.env.NOTION_TOKEN,
  notionHqId: process.env.MOOTER_NOTION_HQ ?? "33d6f6e4-2bc4-816b-977a-fe84bbe912c9",
});
