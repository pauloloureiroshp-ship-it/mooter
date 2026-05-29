// lineage.ts — provenance block builder (§13.2 / §17).
//
// Generates a UUIDv7 run_id (sortable, ms-timestamp embedded), captures pinned
// versions (pastor tag, commit, pricing snapshot) and the live environment
// (ollama, anthropic SDK, node, env_hash) so every row is trace-able to the
// exact code + price + machine. Reproducibility to 12 months (§13.2).

import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCHEMA_VERSION, type LineageBlock } from "./types.ts";

const PASTOR_VERSION = "v0.1.0-pastor-wave1";
const COMMIT_SHA = "1d8a0da";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * RFC 9562 UUIDv7: 48-bit big-endian Unix ms timestamp, 4-bit version (7),
 * 2-bit variant (0b10), 74 random bits. Sortable by creation time.
 */
export function uuidv7(): string {
  const ts = Date.now();
  const bytes = randomBytes(16);
  // 48-bit timestamp into bytes[0..5]
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;
  // version 7 in the high nibble of byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // variant 0b10 in the high bits of byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

function anthropicSdkVersion(): string {
  // packages/router/scripts/wave1-benchmark/lib -> packages/router/node_modules
  const p = join(here, "..", "..", "..", "node_modules", "@anthropic-ai", "sdk", "package.json");
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function ollamaVersion(host: string): string {
  // Synchronous fetch via curl keeps lineage build simple (one-shot, at boot).
  const v = safeExec(`curl -s -m 5 ${host}/api/version`);
  try {
    return (JSON.parse(v) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function envHash(): string {
  const uname = safeExec("uname -srm") || `${process.platform}-${process.arch}`;
  const node = process.version;
  const npm = safeExec("npm --version");
  return createHash("sha256").update(`${uname}|${node}|${npm}`).digest("hex").slice(0, 16);
}

export interface LineageBase extends Omit<LineageBlock, "event_id"> {}

export function buildLineageBase(opts: { pricingVersion: string; ollamaHost: string }): LineageBase {
  const run_id = uuidv7();
  return {
    run_id,
    schema_version: SCHEMA_VERSION,
    pastor_version: PASTOR_VERSION,
    commit_sha: COMMIT_SHA,
    pricing_version: opts.pricingVersion,
    ollama_version: ollamaVersion(opts.ollamaHost),
    anthropic_sdk_version: anthropicSdkVersion(),
    node_version: process.version,
    env_hash: envHash(),
    user_id: null,
    session_id: uuidv7(),
  };
}

/** Attach the idempotent event_id for a (prompt, arm) pair. */
export function makeLineage(base: LineageBase, eventId: string): LineageBlock {
  return { ...base, event_id: eventId };
}

export function eventId(runId: string, promptId: string, arm: string): string {
  return `${runId}-${promptId}-${arm}`;
}
