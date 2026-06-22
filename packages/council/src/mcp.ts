// MCP tool: council_convene. Follows the McpTool pattern (Day-0 recon §6). Registered
// in packages/mcp-server/src/tools.ts buildRegistry. The handler reuses runCouncilCli,
// so a host agent can convene a council (advisory, explain, or act/escalate) over MCP.
//
// council imports the McpTool TYPE only (erased at runtime) — the runtime dependency
// edge is mcp-server → council, with no cycle.

import type { McpTool } from "../../mcp-server/src/tools.ts";
import { runCouncilCli } from "./cli.ts";

export const councilConveneTool: McpTool = {
  name: "council_convene",
  description:
    "Convene a heterogeneous local-first Mooter council to deliberate on a prompt and " +
    "return an honest 4-section verdict (consensus / dissent / unique findings / " +
    "recommendation) with a minority report. Set explain=true for a dry run (CAS reasons " +
    "+ composition + cost vs all-Opus, no model calls). Set decide=true for a calibrated " +
    "ACT/ESCALATE decision on high-risk actions. local_only keeps it 100% offline.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The question or change to deliberate." },
      category: { type: "string", description: "Task category (e.g. coding.security). Default reasoning.general." },
      budget: { type: "number", description: "Max admissible USD for cloud seats. 0 → all-local." },
      local_only: { type: "boolean", description: "Force a 100% local (offline/NDA) council." },
      decide: { type: "boolean", description: "Also return a calibrated ACT vs ESCALATE decision." },
      explain: { type: "boolean", description: "Dry run: show why it would convene, no model calls." },
    },
    required: ["prompt"],
  },
  async handler(args: Record<string, unknown>): Promise<string> {
    const a: string[] = [];
    if (args.explain) a.push("explain");
    if (typeof args.category === "string") a.push("--category", args.category);
    if (typeof args.budget === "number") a.push("--budget", String(args.budget));
    if (args.local_only) a.push("--local-only");
    if (args.decide) a.push("--decide");
    a.push(String(args.prompt ?? ""));
    const res = await runCouncilCli(a);
    return res.output;
  },
};
