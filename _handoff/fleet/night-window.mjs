// night-window.mjs — pure model selector for the fleet's nightly heavy pass.
//
// By DAY the fleet runs a light coder model that fits alongside the router
// (FLEET_MODEL, e.g. qwen2.5-coder:14b). Inside the night window it swaps to
// FLEET_NIGHT_MODEL (e.g. qwen3:30b) for an exclusive heavy pass — router load is
// lowest overnight, so the 30B fits. This module is pure and clock-injectable so
// the window logic is unit-tested without waiting for midnight; the wiring
// (per-cycle env swap) lives in fleet-forever.mjs.
"use strict";

// "HH:MM" → minutes since local midnight, or null if malformed.
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Minutes since local midnight for `now` (a Date) in an IANA time zone.
export function minutesInTz(now, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  let h = 0, mi = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value);
    else if (p.type === "minute") mi = Number(p.value);
  }
  if (h === 24) h = 0; // some ICU builds emit 24 at local midnight
  return h * 60 + mi;
}

// True when `mins` is inside [startMin, endMin). Supports windows that wrap past
// midnight (startMin > endMin). An empty window (start === end) is never night.
export function isNightWindow(mins, startMin, endMin) {
  if (startMin === endMin) return false;
  return startMin < endMin
    ? mins >= startMin && mins < endMin
    : mins >= startMin || mins < endMin;
}

// Chooses the model for a cycle from the clock. Pure: `now` is injected. Falls
// back to the day model when no night model is configured or outside the window.
export function activeModel({ now, dayModel, nightModel, startMin, endMin, tz }) {
  if (!nightModel) return dayModel;
  return isNightWindow(minutesInTz(now, tz), startMin, endMin) ? nightModel : dayModel;
}
