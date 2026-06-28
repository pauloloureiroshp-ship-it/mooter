// Frente F — cross-machine live-session sync tests.
import { test } from "node:test";
import assert from "node:assert";

import {
  osType,
  sessionInfoToRow,
  buildLiveSessionState,
  pushLiveSessionState,
  remoteSessions,
  markOffline,
  parseRemoteDevices,
  resolveHubUrl,
  DEFAULT_HUB_URL,
  DEFAULT_STALE_MIN,
  type FetchLike,
  type LiveSessionState,
  type RemoteDevice,
} from "../src/remote.ts";
import type { SessionInfo } from "../src/types.ts";

const NOW = 1_780_000_000_000;
const OWNER = "a1b2c3d4e5f6a1b2";
const DEV_A = "deadbeefdeadbeef";
const DEV_B = "cafebabecafebabe";

function fakeSession(over: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: "sess-1",
    project: "-home-paulo-frugal",
    transcriptPath: "/x.jsonl",
    birthMs: NOW - 100000,
    mtimeMs: NOW - 1000,
    ageMs: 1000,
    prompts: 3,
    tiers: { T0: 2, T1: 0, T2: 1, T3: 0 },
    estSavedUsd: 0.1,
    live: true,
    terminalName: "front-F",
    worktreePath: "/wt/F",
    branch: "feat/sync-handoff-bridge",
    workflow: null,
    ...over,
  };
}

/**
 * A faithful-enough in-memory hub that mirrors hub/routes/live_sessions.js:
 * POST upserts by device_id (latest wins); GET returns the owner's OTHER devices
 * with the server-side honest offline calc. Exercises the WIRE CONTRACT, not a
 * mock of our own client.
 */
function fakeHub(clock: { now: number }, staleMin = DEFAULT_STALE_MIN) {
  const rows = new Map<string, any>(); // device_id -> { owner_hash, os_type, device_label, payload, updated_at }
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    if ((init?.method ?? "GET") === "POST") {
      const s = JSON.parse(init!.body as string);
      rows.set(s.device_id, {
        owner_hash: s.owner_hash, os_type: s.os_type, device_label: s.device_label ?? null,
        payload: JSON.stringify({ sessions: s.sessions, handoff: s.handoff ?? null, totals: s.totals ?? null }),
        updated_at: new Date(clock.now).toISOString(),
      });
      return { ok: true, status: 202, json: async () => ({ ok: true }) };
    }
    // GET — owner scope, exclude self, server-side offline calc
    const owner = u.searchParams.get("owner");
    const self = u.searchParams.get("self") ?? "";
    const devices = [...rows.entries()]
      .filter(([id, r]) => r.owner_hash === owner && id !== self)
      .map(([id, r]) => {
        const updatedMs = Date.parse(r.updated_at);
        const ageMs = Math.max(0, clock.now - updatedMs);
        const payload = JSON.parse(r.payload);
        return {
          device_id: id, os_type: r.os_type, device_label: r.device_label,
          online: ageMs < staleMin * 60000, offlineForMin: Math.floor(ageMs / 60000),
          updatedAt: r.updated_at, sessions: payload.sessions, handoff: payload.handoff,
        };
      });
    return { ok: true, status: 200, json: async () => ({ devices, stale_min: staleMin }) };
  };
  return { fetchImpl, rows };
}

// ── osType (pure) ──────────────────────────────────────────────────────

test("osType: maps node platforms to stable os_type", () => {
  assert.equal(osType("win32"), "windows");
  assert.equal(osType("darwin"), "macos");
  assert.equal(osType("linux"), "linux");
  assert.equal(osType("aix"), "unknown");
});

// ── resolveHubUrl ──────────────────────────────────────────────────────

test("resolveHubUrl: explicit > env > default, trailing slash stripped", () => {
  assert.equal(resolveHubUrl("https://h.example/"), "https://h.example");
  delete process.env.MOOTER_CF_BACKEND_URL;
  assert.equal(resolveHubUrl(), DEFAULT_HUB_URL);
});

// ── sessionInfoToRow (pure, metadata only) ─────────────────────────────

test("sessionInfoToRow: projects to metadata only (no model fabrication), modal tier, status", () => {
  const row = sessionInfoToRow(fakeSession());
  assert.equal(row.sid, "sess-1");
  assert.equal(row.name, "front-F");
  assert.equal(row.model, null, "model is honestly null — SessionInfo has none");
  assert.equal(row.tier, "T0", "modal of {T0:2,T2:1}");
  assert.equal(row.branch, "feat/sync-handoff-bridge");
  assert.equal(row.status, "working");
  // never leaks transcript path or prompt content
  assert.equal((row as any).transcriptPath, undefined);
});

test("sessionInfoToRow: idle session → status idle; no tiers → tier null", () => {
  const row = sessionInfoToRow(fakeSession({ live: false, tiers: { T0: 0, T1: 0, T2: 0, T3: 0 }, terminalName: null }));
  assert.equal(row.status, "idle");
  assert.equal(row.tier, null);
  assert.equal(row.name, "-home-paulo-frugal", "falls back to project label");
});

// ── buildLiveSessionState (pure) ───────────────────────────────────────

test("buildLiveSessionState: stamps at, defaults os_type, caps to 64 sessions", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ sid: `s${i}` }));
  const state = buildLiveSessionState({
    deviceId: DEV_A, ownerHash: OWNER, osType: "windows", deviceLabel: "PC", sessions: many, now: NOW,
  });
  assert.equal(state.device_id, DEV_A);
  assert.equal(state.owner_hash, OWNER);
  assert.equal(state.os_type, "windows");
  assert.equal(state.sessions.length, 64, "hub schema max 64");
  assert.equal(state.at, new Date(NOW).toISOString());
});

// ── pushLiveSessionState (fail-soft) ───────────────────────────────────

test("pushLiveSessionState: success → ok true", async () => {
  const hub = fakeHub({ now: NOW });
  const state = buildLiveSessionState({ deviceId: DEV_A, ownerHash: OWNER, sessions: [{ sid: "s" }], now: NOW });
  const r = await pushLiveSessionState(state, { fetchImpl: hub.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.status, 202);
  assert.equal(hub.rows.size, 1);
});

test("pushLiveSessionState: a throwing fetch is fail-soft (ok false, never throws)", async () => {
  const boom: FetchLike = async () => { throw new Error("offline"); };
  const state = buildLiveSessionState({ deviceId: DEV_A, ownerHash: OWNER, sessions: [], now: NOW });
  const r = await pushLiveSessionState(state, { fetchImpl: boom });
  assert.deepEqual(r, { ok: false, status: 0 });
});

// ── markOffline + parseRemoteDevices (pure honesty) ────────────────────

test("markOffline: fresh online, stale offline, unparseable → offline null", () => {
  const base: RemoteDevice = {
    deviceId: DEV_B, osType: "macos", deviceLabel: null, online: true, offlineForMin: 0,
    updatedAt: new Date(NOW - 30_000).toISOString(), sessions: [], handoff: null,
  };
  const fresh = markOffline([base], NOW, 5)[0];
  assert.equal(fresh.online, true);
  assert.equal(fresh.offlineForMin, 0);

  const stale = markOffline([{ ...base, updatedAt: new Date(NOW - 12 * 60000).toISOString() }], NOW, 5)[0];
  assert.equal(stale.online, false);
  assert.equal(stale.offlineForMin, 12);

  const bad = markOffline([{ ...base, updatedAt: "nope" }], NOW, 5)[0];
  assert.equal(bad.online, false);
  assert.equal(bad.offlineForMin, null);
});

test("parseRemoteDevices: tolerant of garbage, drops device-id-less rows", () => {
  assert.deepEqual(parseRemoteDevices(null), []);
  assert.deepEqual(parseRemoteDevices({ devices: "nope" }), []);
  const ds = parseRemoteDevices({ devices: [{ device_id: "", os_type: "x" }, { device_id: DEV_B, os_type: "darwin", online: true }] });
  assert.equal(ds.length, 1);
  assert.equal(ds[0].osType, "macos");
});

// ── remoteSessions (poll, fail-soft, owner-scoped) ─────────────────────

test("remoteSessions: round-trip — pushes from two devices, each sees only the OTHER", async () => {
  const clock = { now: NOW };
  const hub = fakeHub(clock);
  await pushLiveSessionState(
    buildLiveSessionState({ deviceId: DEV_A, ownerHash: OWNER, osType: "windows", sessions: [sessionInfoToRow(fakeSession())], handoff: "HA", now: clock.now }),
    { fetchImpl: hub.fetchImpl });
  await pushLiveSessionState(
    buildLiveSessionState({ deviceId: DEV_B, ownerHash: OWNER, osType: "macos", sessions: [{ sid: "b1", name: "mac work" }], handoff: "HB", now: clock.now }),
    { fetchImpl: hub.fetchImpl });

  const fromA = await remoteSessions({ deviceId: DEV_A, ownerHash: OWNER, fetchImpl: hub.fetchImpl, now: clock.now });
  assert.equal(fromA.length, 1, "A sees only B");
  assert.equal(fromA[0].deviceId, DEV_B);
  assert.equal(fromA[0].osType, "macos");
  assert.equal(fromA[0].online, true);
  assert.equal(fromA[0].handoff, "HB");
  assert.equal(fromA[0].sessions[0].name, "mac work");
});

test("remoteSessions: a device gone silent shows offline honestly after time passes", async () => {
  const clock = { now: NOW };
  const hub = fakeHub(clock);
  await pushLiveSessionState(
    buildLiveSessionState({ deviceId: DEV_B, ownerHash: OWNER, osType: "macos", sessions: [], now: clock.now }),
    { fetchImpl: hub.fetchImpl });
  // 9 minutes later, B never reported again.
  clock.now = NOW + 9 * 60000;
  const fromA = await remoteSessions({ deviceId: DEV_A, ownerHash: OWNER, fetchImpl: hub.fetchImpl, now: clock.now });
  assert.equal(fromA.length, 1);
  assert.equal(fromA[0].online, false);
  assert.equal(fromA[0].offlineForMin, 9, "honest 'offline há 9m', not invented");
});

test("remoteSessions: owner scope — a foreign owner sees nobody", async () => {
  const hub = fakeHub({ now: NOW });
  await pushLiveSessionState(
    buildLiveSessionState({ deviceId: DEV_A, ownerHash: OWNER, sessions: [], now: NOW }),
    { fetchImpl: hub.fetchImpl });
  const foreign = await remoteSessions({ deviceId: "zzz", ownerHash: "ffffffffffffffff", fetchImpl: hub.fetchImpl, now: NOW });
  assert.equal(foreign.length, 0);
});

test("remoteSessions: fail-soft — !ok and throwing fetch both yield [] (lane shows n/d)", async () => {
  const notOk: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.deepEqual(await remoteSessions({ deviceId: DEV_A, ownerHash: OWNER, fetchImpl: notOk, now: NOW }), []);
  const boom: FetchLike = async () => { throw new Error("dns"); };
  assert.deepEqual(await remoteSessions({ deviceId: DEV_A, ownerHash: OWNER, fetchImpl: boom, now: NOW }), []);
});

test("remoteSessions: no ownerHash → [] (never queries an unscoped fleet)", async () => {
  const hub = fakeHub({ now: NOW });
  assert.deepEqual(await remoteSessions({ deviceId: DEV_A, ownerHash: "", fetchImpl: hub.fetchImpl, now: NOW }), []);
});
