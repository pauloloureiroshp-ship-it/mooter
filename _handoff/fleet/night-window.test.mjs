// night-window.test.mjs — offline unit test for the fleet night-window model
// selector (injectable clock, no I/O). Run: node --test _handoff/fleet/night-window.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseHHMM, isNightWindow, minutesInTz, activeModel } from "./night-window.mjs";

const TZ = "America/Sao_Paulo"; // UTC-3, no DST since 2019

test("parseHHMM parses valid times and rejects garbage", () => {
  assert.equal(parseHHMM("00:00"), 0);
  assert.equal(parseHHMM("07:00"), 420);
  assert.equal(parseHHMM("23:59"), 23 * 60 + 59);
  assert.equal(parseHHMM("7:5"), null);   // minutes must be 2 digits
  assert.equal(parseHHMM("24:00"), null); // hour out of range
  assert.equal(parseHHMM("12:60"), null); // minute out of range
  assert.equal(parseHHMM(""), null);
  assert.equal(parseHHMM(null), null);
});

test("isNightWindow — non-wrapping window [0,420)", () => {
  assert.equal(isNightWindow(0, 0, 420), true);    // inclusive start
  assert.equal(isNightWindow(150, 0, 420), true);
  assert.equal(isNightWindow(419, 0, 420), true);
  assert.equal(isNightWindow(420, 0, 420), false);  // exclusive end
  assert.equal(isNightWindow(720, 0, 420), false);
});

test("isNightWindow — wrapping window [1320,360) (22:00-06:00)", () => {
  assert.equal(isNightWindow(1380, 1320, 360), true); // 23:00
  assert.equal(isNightWindow(1320, 1320, 360), true); // 22:00 start
  assert.equal(isNightWindow(300, 1320, 360), true);  // 05:00
  assert.equal(isNightWindow(360, 1320, 360), false); // 06:00 end exclusive
  assert.equal(isNightWindow(720, 1320, 360), false); // noon
});

test("isNightWindow — empty window is never night", () => {
  assert.equal(isNightWindow(0, 300, 300), false);
  assert.equal(isNightWindow(300, 300, 300), false);
});

test("minutesInTz resolves a fixed UTC instant to São Paulo local minutes", () => {
  // 2026-07-10 05:30Z → São Paulo (UTC-3) 02:30 → 150 minutes.
  assert.equal(minutesInTz(new Date("2026-07-10T05:30:00Z"), TZ), 150);
  // 2026-07-10 15:00Z → São Paulo 12:00 → 720 minutes.
  assert.equal(minutesInTz(new Date("2026-07-10T15:00:00Z"), TZ), 720);
});

test("activeModel picks night model inside the window, day model outside", () => {
  const base = { dayModel: "qwen2.5-coder:14b", nightModel: "qwen3:30b", startMin: 0, endMin: 420, tz: TZ };
  // 02:30 SP → night
  assert.equal(activeModel({ ...base, now: new Date("2026-07-10T05:30:00Z") }), "qwen3:30b");
  // 12:00 SP → day
  assert.equal(activeModel({ ...base, now: new Date("2026-07-10T15:00:00Z") }), "qwen2.5-coder:14b");
});

test("activeModel falls back to day model when no night model configured", () => {
  assert.equal(
    activeModel({ now: new Date("2026-07-10T05:30:00Z"), dayModel: "day", nightModel: null, startMin: 0, endMin: 420, tz: TZ }),
    "day",
  );
});
