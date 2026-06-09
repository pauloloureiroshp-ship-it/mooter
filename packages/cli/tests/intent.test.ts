// Wave 33.5 Block E — intent resolver.
import { test } from "node:test";
import assert from "node:assert";

import { resolveIntent, runIntent } from "../src/commands/intent.ts";

test("resolveIntent: do-work verbs → spawn (most specific wins)", () => {
  assert.deepStrictEqual(resolveIntent("fix bug in Hero.tsx").command, ["spawn", "fix bug in Hero.tsx"]);
  assert.strictEqual(resolveIntent("refactor the parser").rule, "spawn-task");
});

test("resolveIntent: nouns map to dashboards", () => {
  assert.deepStrictEqual(resolveIntent("show me my sessions").command, ["sessions", "watch"]);
  assert.deepStrictEqual(resolveIntent("how much quota is left").command, ["sessions", "quota"]);
  assert.deepStrictEqual(resolveIntent("run a security audit").command, ["security", "audit"]);
  assert.deepStrictEqual(resolveIntent("install the zellij plugin").command, ["init"]);
});

test("resolveIntent: friend-facing PT-PT phrases (Wave 41)", () => {
  // savings → dashboard (not sessions watch)
  assert.deepStrictEqual(resolveIntent("o que poupei hoje?").command, ["dashboard"]);
  assert.deepStrictEqual(resolveIntent("how much have I saved").command, ["dashboard"]);
  // packs: noun-only → list, install verb → install
  assert.deepStrictEqual(resolveIntent("que packs tenho?").command, ["pack", "list"]);
  assert.deepStrictEqual(resolveIntent("instalo este pack como?").command, ["pack", "install"]);
  // router debug → explain classify
  assert.deepStrictEqual(resolveIntent("como faço debug ao router?").command, ["explain", "classify"]);
  // doctor
  assert.deepStrictEqual(resolveIntent("o mooter não funciona").command, ["doctor"]);
});

test("resolveIntent: Wave 41 additions do not regress existing routes", () => {
  // quota still wins over savings for "how much ... left"
  assert.deepStrictEqual(resolveIntent("how much quota is left").command, ["sessions", "quota"]);
  // install plugin unaffected (no 'pack' keyword)
  assert.deepStrictEqual(resolveIntent("install the zellij plugin").command, ["init"]);
  // sessions unaffected
  assert.deepStrictEqual(resolveIntent("show me my sessions").command, ["sessions", "watch"]);
  // spawn-task wins over packs when a do-work verb is present (reviewer probe)
  assert.deepStrictEqual(resolveIntent("fix the pack loader bug").command, ["spawn", "fix the pack loader bug"]);
  assert.strictEqual(resolveIntent("rename the packs directory").rule, "spawn-task");
  // a bare "router" must NOT route to explain (reviewer probe)
  assert.deepStrictEqual(resolveIntent("install the router plugin").command, ["init"]);
  assert.deepStrictEqual(resolveIntent("show me the router status").command, ["status"]);
});

test("resolveIntent: empty → help, gibberish → fallback help", () => {
  assert.strictEqual(resolveIntent("").rule, "empty");
  assert.deepStrictEqual(resolveIntent("asdfqwer").command, ["help"]);
});

test("runIntent is dry-run by default and shows the resolved command", () => {
  const r = runIntent(["show", "me", "my", "sessions"]);
  assert.ok(r.output.includes("→ resolved to: mooter sessions watch"), r.output);
  assert.ok(r.output.includes("--run"));
});

test("runIntent --palette renders grouped commands", () => {
  const r = runIntent(["--palette"]);
  assert.ok(r.output.includes("command palette"));
  assert.ok(r.output.includes("Spawn"));
  assert.ok(r.output.includes("Conductor"));
});

test("runIntent with no phrase prompts for intent", () => {
  const r = runIntent([]);
  assert.ok(r.output.includes("what do you want to do"));
});

test("runIntent refine hook can override, with safe fallback", () => {
  const r = runIntent(["do", "something", "--run"], { refine: () => ["spawn", "custom"] });
  assert.ok(r.output.includes("RUN spawn custom"), r.output);
  // a throwing refiner falls back to keywords
  const r2 = runIntent(["show sessions"], { refine: () => { throw new Error("ollama down"); } });
  assert.ok(r2.output.includes("sessions watch"), r2.output);
});
