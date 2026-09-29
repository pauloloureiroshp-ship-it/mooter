// vram-preflight.test.mjs — offline unit tests (no Ollama, no GPU).
// Run: node --test _handoff/fleet/vram-preflight.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { assessContention } from "./vram-preflight.mjs";

const M = { model: "qwen3:30b", vramMb: 19 * 1024, headroom: 1024 };

test("fleet model already resident → generate regardless of free VRAM", () => {
  const r = assessContention({ psModels: [{ name: "qwen3:30b" }, { name: "qwen2.5:3b" }], freeMb: 200, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, true);
  assert.deepEqual(r.foreignModels, ["qwen2.5:3b"]);
});

test("foreign model resident + insufficient free VRAM → BLOCK with a named reason", () => {
  const r = assessContention({ psModels: [{ name: "qwen2.5:3b" }], freeMb: 2000, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, false);
  assert.match(r.reason, /vram-contention/);
  assert.match(r.reason, /qwen2\.5:3b/);
  assert.deepEqual(r.foreignModels, ["qwen2.5:3b"]);
});

test("foreign model resident but ample free VRAM → generate", () => {
  const r = assessContention({ psModels: [{ name: "qwen2.5:3b" }], freeMb: 22000, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, true);
});

test("VRAM probe failed (freeMb null) → NEVER block on a probe error", () => {
  const r = assessContention({ psModels: [{ name: "qwen2.5:3b" }], freeMb: null, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, true);
});

test("nothing resident → generate (no proof of contention)", () => {
  const r = assessContention({ psModels: [], freeMb: 500, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, true);
  assert.deepEqual(r.foreignModels, []);
});

test("same family with a different tag is NOT foreign", () => {
  const r = assessContention({ psModels: [{ name: "qwen3:30b-instruct" }], freeMb: 100, fleetModel: M.model, modelVramMb: M.vramMb, headroomMb: M.headroom });
  assert.equal(r.ok, true);           // treated as the fleet model → resident
  assert.deepEqual(r.foreignModels, []);
});
