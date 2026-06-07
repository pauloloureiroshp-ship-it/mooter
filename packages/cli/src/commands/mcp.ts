// `mooter mcp` — Mooter MCP server controls (Wave 30 Phase K).
//
//   mooter mcp serve              start the MCP stdio server (Claude Code spawns this)
//   mooter mcp list               list the exposed tools
//   mooter mcp install            print the Claude Code install snippet
//
// `serve` runs the server in-process; it blocks on stdin until the client
// disconnects.

import type { CmdResult } from "./trail.ts";
import { buildRegistry, serveStdio, TOOL_NAMES } from "../../../mcp-server/src/index.ts";

export const MCP_USAGE = `mooter mcp — Mooter MCP server

  mooter mcp serve     start the stdio MCP server
  mooter mcp list      list exposed tools
  mooter mcp install   print the Claude Code install snippet`;

export async function runMcp(args: string[]): Promise<CmdResult> {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: MCP_USAGE };
  }

  if (sub === "serve") {
    // serveStdio installs stdin listeners and calls process.exit(0) itself once
    // stdin closes and all in-flight requests have flushed. We must NOT return
    // here, or the CLI's `main().then(process.exit)` would kill the server
    // before it handles a single message — so block forever.
    serveStdio(buildRegistry(), {
      notionToken: process.env.NOTION_TOKEN,
      notionHqId: process.env.MOOTER_NOTION_HQ ?? "33d6f6e4-2bc4-816b-977a-fe84bbe912c9",
    });
    await new Promise<never>(() => {
      /* never resolves; serveStdio owns process exit */
    });
    return { exitCode: 0, output: "" }; // unreachable
  }

  if (sub === "list") {
    if (args.includes("--json")) return { exitCode: 0, output: JSON.stringify(TOOL_NAMES, null, 2) };
    return { exitCode: 0, output: ["Mooter MCP tools:", ...TOOL_NAMES.map((n) => `  • ${n}`)].join("\n") };
  }

  if (sub === "install") {
    const lines = [
      "Add Mooter to Claude Code:",
      "",
      "  claude mcp add mooter -- mooter mcp serve",
      "",
      "or add to ~/.claude.json manually:",
      JSON.stringify({ mcpServers: { mooter: { command: "mooter", args: ["mcp", "serve"] } } }, null, 2),
      "",
      "Set NOTION_TOKEN in the environment to enable mooter_notion_write.",
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter mcp: unknown subcommand '${sub}'\n\n${MCP_USAGE}` };
}
