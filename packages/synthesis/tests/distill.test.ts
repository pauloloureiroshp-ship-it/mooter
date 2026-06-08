import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseDecisions,
  extractPatterns,
  generateSkillMarkdown,
  emitSkill,
} from "../src/index.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-distill-"));
  process.env.MOOTER_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

const SAMPLE = [
  JSON.stringify({ event: "classified", tier: "T1", task_category: "simple_transform_or_explain", recommended_model: "claude-haiku-4-5", confidence: 0.85, lang_detected: "pt" }),
  JSON.stringify({ event: "classified", tier: "T1", task_category: "simple_transform_or_explain", recommended_model: "claude-haiku-4-5", confidence: 0.8, lang_detected: "pt" }),
  JSON.stringify({ event: "classified", tier: "T3", task_category: "cross_file_change", recommended_model: "claude-opus-4-6", confidence: 0.9, lang_detected: "pt" }),
  JSON.stringify({ event: "prompt_optimized", strategy: "s1" }), // ignored (not classified)
  JSON.stringify({ event: "classified", source: "mooter-tester", tier: "T0", task_category: "x" }), // ignored (tester)
  "not json at all",
].join("\n");

test("parseDecisions keeps classified events, drops tester + non-json", () => {
  const events = parseDecisions(SAMPLE);
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => e.event === "classified" && e.source !== "mooter-tester"));
});

test("parseDecisions tolerates bare 'null' and non-object JSON lines (real-log regression)", () => {
  const tricky = ["null", "42", '"a string"', "[]", SAMPLE.split("\n")[0]].join("\n");
  const events = parseDecisions(tricky); // must not throw on JSON.parse('null') → null
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "classified");
});

test("extractPatterns aggregates by (category, tier) with counts + avg confidence", () => {
  const p = extractPatterns(parseDecisions(SAMPLE));
  assert.equal(p.total, 3);
  const explain = p.patterns.find((x) => x.task_category === "simple_transform_or_explain");
  assert.ok(explain);
  assert.equal(explain?.tier, "T1");
  assert.equal(explain?.count, 2);
  assert.ok(Math.abs((explain?.avg_confidence ?? 0) - 0.825) < 1e-6);
});

test("extractPatterns computes tier/lang/category distributions", () => {
  const p = extractPatterns(parseDecisions(SAMPLE));
  assert.equal(p.tier_distribution.T1, 2);
  assert.equal(p.tier_distribution.T3, 1);
  assert.equal(p.lang_distribution.pt, 3);
  assert.equal(p.category_distribution.cross_file_change, 1);
});

test("patterns are sorted descending by count", () => {
  const p = extractPatterns(parseDecisions(SAMPLE));
  for (let i = 1; i < p.patterns.length; i++) {
    assert.ok(p.patterns[i - 1].count >= p.patterns[i].count);
  }
});

test("generateSkillMarkdown emits valid frontmatter (name + description)", () => {
  const p = extractPatterns(parseDecisions(SAMPLE));
  const md = generateSkillMarkdown(p, { name: "my-pastor-routing", date: "2026-06-07", min_count: 1 });
  assert.ok(md.startsWith("---\n"));
  assert.match(md, /\nname: my-pastor-routing\n/);
  assert.match(md, /\ndescription: .+\n/);
  assert.ok(md.includes("# Pastor — Distilled Routing Skill"));
});

test("markdown tables the high-support patterns and respects min_count", () => {
  const p = extractPatterns(parseDecisions(SAMPLE));
  const md = generateSkillMarkdown(p, { name: "x", date: "2026-06-07", min_count: 2 });
  assert.ok(md.includes("simple_transform_or_explain")); // count 2 ≥ min
  assert.ok(!md.includes("cross_file_change")); // count 1 < min
});

test("emitSkill writes a .skill.md file from injected decisions text", () => {
  const res = emitSkill({ decisionsText: SAMPLE, date: "2026-06-07" });
  assert.ok(res.ok);
  assert.ok(res.path && res.path.endsWith("pastor-2026-06-07.skill.md"));
  assert.ok(existsSync(res.path!));
  const written = readFileSync(res.path!, "utf8");
  assert.ok(written.startsWith("---\n"));
});

test("emitSkill fails gracefully when no decisions log exists", () => {
  const res = emitSkill({ decisionsPath: join(home, "nope.log") });
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /no decisions log/);
});

test("emitSkill fails gracefully on an empty (no classified) log", () => {
  const res = emitSkill({ decisionsText: "not json\n", date: "2026-06-07" });
  assert.equal(res.ok, false);
  assert.match(res.reason ?? "", /no classified events/);
});

test("default skill name is my-pastor-routing", () => {
  const res = emitSkill({ decisionsText: SAMPLE, date: "2026-06-07" });
  assert.match(res.markdown, /name: my-pastor-routing/);
});
