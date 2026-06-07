// tools suite (Phase C) — Read / Grep / Glob over a temp tree, read-only and
// root-confined.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTool, grepTool, globTool, TOOL_REGISTRY } from "../src/tools.ts";

let root: string;

before(() => {
  root = mkdtempSync(join(tmpdir(), "wf-tools-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n// TODO: refactor\n");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;\n");
  writeFileSync(join(root, "README.md"), "# hello\nTODO: write docs\n");
  writeFileSync(join(root, "node_modules", "dep.ts"), "// TODO: should be ignored\n");
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("readTool reads a confined file", () => {
  const txt = readTool("src/a.ts", { root });
  assert.match(txt, /export const a = 1/);
});

test("readTool truncates to maxBytes", () => {
  const txt = readTool("src/a.ts", { root, maxBytes: 5 });
  assert.equal(txt.length, 5);
});

test("readTool refuses to escape root", () => {
  assert.throws(() => readTool("../../../etc/passwd", { root }), /escapes root/);
});

test("globTool matches **/*.ts, ignores node_modules", () => {
  const files = globTool("**/*.ts", { root });
  assert.deepEqual(files, ["src/a.ts", "src/b.ts"]);
});

test("globTool root-level glob", () => {
  const files = globTool("*.md", { root });
  assert.deepEqual(files, ["README.md"]);
});

test("grepTool finds matches across files, skips node_modules", () => {
  const hits = grepTool("TODO", { root });
  const files = hits.map((h) => h.file).sort();
  assert.deepEqual(files, ["README.md", "src/a.ts"]);
  const a = hits.find((h) => h.file === "src/a.ts");
  assert.equal(a?.line, 2);
});

test("grepTool honours a glob filter", () => {
  const hits = grepTool("TODO", { root, glob: "**/*.ts" });
  assert.deepEqual(hits.map((h) => h.file), ["src/a.ts"]);
});

test("TOOL_REGISTRY exposes Read/Grep/Glob", () => {
  assert.deepEqual(Object.keys(TOOL_REGISTRY).sort(), ["Glob", "Grep", "Read"]);
  assert.equal(TOOL_REGISTRY.Read, readTool);
});
