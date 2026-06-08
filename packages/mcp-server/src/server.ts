// Mooter MCP server — hand-rolled MCP stdio protocol (Wave 30 Phase K).
//
// MCP stdio transport = newline-delimited JSON-RPC 2.0 (one message per line,
// no embedded newlines). We implement the handshake + tools surface directly so
// the package stays dependency-free. `handleRequest` is pure and unit-tested;
// `serveStdio` is the thin runtime loop.

import type { McpTool, ToolContext } from "./tools.ts";

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "mooter", version: "0.1.0" } as const;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: { name?: string; arguments?: Record<string, unknown>; [k: string]: unknown };
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Handle one JSON-RPC message. Returns null for notifications (no reply). */
export async function handleRequest(
  msg: JsonRpcRequest,
  registry: McpTool[],
  ctx: ToolContext = {},
): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  switch (msg.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO },
      };
    case "notifications/initialized":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: registry.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        },
      };
    case "tools/call": {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      const tool = registry.find((t) => t.name === name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool: ${name}` } };
      try {
        const text = await tool.handler(args, ctx);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true },
        };
      }
    }
    default:
      // unknown notification (no id) → ignore; unknown request → method-not-found
      if (msg.id === undefined || msg.id === null) return null;
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${msg.method}` } };
  }
}

/** Run the server over stdio. Blocks until stdin closes AND all in-flight
 *  requests have flushed their responses. */
export function serveStdio(registry: McpTool[], ctx: ToolContext = {}): void {
  let buf = "";
  let pending = 0;
  let ended = false;
  const maybeExit = (): void => {
    if (ended && pending === 0) process.exit(0);
  };

  const dispatch = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      return;
    }
    pending++;
    void handleRequest(msg, registry, ctx)
      .then((resp) => {
        if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
      })
      .catch(() => {
        /* swallow — a single bad message must not kill the server */
      })
      .finally(() => {
        pending--;
        maybeExit();
      });
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      dispatch(line);
    }
  });
  process.stdin.on("end", () => {
    if (buf) {
      dispatch(buf);
      buf = "";
    }
    ended = true;
    maybeExit();
  });
}
