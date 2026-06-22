import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNCIL_SCAFFOLD } from "../src/index.ts";

test("scaffold: package is buildable and test harness is green", () => {
  assert.equal(COUNCIL_SCAFFOLD, "council-scaffold-ready");
});
