// Worker tool layer — Phase C.
//
// Read / Grep / Glob over the filesystem, reusing node:fs (the "existing
// reading"). All three are READ-ONLY and confined to a root directory (default
// cwd): a relative path that escapes the root throws. The runtime (Phase E)
// exposes these to sandboxed workers via TOOL_REGISTRY; here they are plain,
// directly-testable functions.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join, sep } from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "coverage"]);
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_FILES = 5000;
const DEFAULT_MAX_MATCHES = 1000;

export interface ToolContext {
  /** Confinement root. Defaults to process.cwd(). */
  root?: string;
}

function confine(root: string, p: string): string {
  const base = resolve(root);
  const abs = resolve(base, p);
  const rel = relative(base, abs);
  if (rel === ".." || rel.startsWith(".." + sep)) {
    throw new Error(`path escapes root: ${p}`);
  }
  return abs;
}

/** Read a file (UTF-8), truncated to maxBytes. Path confined to root. */
export function readTool(
  path: string,
  opts: ToolContext & { maxBytes?: number } = {},
): string {
  const abs = confine(opts.root ?? process.cwd(), path);
  const buf = readFileSync(abs);
  const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  return buf.length > max ? buf.subarray(0, max).toString("utf8") : buf.toString("utf8");
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // consume the slash after **
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function* walk(base: string, dir: string, maxFiles: number, count: { n: number }): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (count.n >= maxFiles) return;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue;
      yield* walk(base, abs, maxFiles, count);
    } else if (st.isFile()) {
      count.n += 1;
      yield relative(base, abs).split(sep).join("/");
    }
  }
}

/** List files matching a glob (posix-style), relative to root. */
export function globTool(
  pattern: string,
  opts: ToolContext & { max?: number } = {},
): string[] {
  const base = resolve(opts.root ?? process.cwd());
  const re = globToRegExp(pattern);
  const max = opts.max ?? DEFAULT_MAX_FILES;
  const out: string[] = [];
  for (const rel of walk(base, base, max, { n: 0 })) {
    if (re.test(rel)) out.push(rel);
  }
  return out.sort();
}

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

/** Search file contents line-by-line for a regex, optionally within a glob. */
export function grepTool(
  pattern: string,
  opts: ToolContext & { glob?: string; flags?: string; maxMatches?: number } = {},
): GrepMatch[] {
  const base = resolve(opts.root ?? process.cwd());
  const re = new RegExp(pattern, opts.flags ?? "");
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const files = opts.glob
    ? globTool(opts.glob, { root: base })
    : globTool("**", { root: base });
  const out: GrepMatch[] = [];
  for (const file of files) {
    if (out.length >= maxMatches) break;
    let content: string;
    try {
      content = readFileSync(join(base, file), "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push({ file, line: i + 1, text: lines[i] });
        if (out.length >= maxMatches) break;
      }
    }
  }
  return out;
}

/** Names the runtime will expose to sandboxed workers (Phase E). */
export const TOOL_REGISTRY = {
  Read: readTool,
  Grep: grepTool,
  Glob: globTool,
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;
