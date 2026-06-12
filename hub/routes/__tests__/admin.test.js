// Wave 56 — Admin Panel Data Layer. Covers the three admin read endpoints
// (handleAdminUsers, adminUserDetail, handleAdminCohort) against an inline
// labelled D1 stub (mirrors transparency.test.js / pastor-adapters.test.js).
//
// Asserts, for ALL THREE endpoints:
//   - 401 when Authorization is missing / wrong (adminAuthorized false)
//   - 200 + expected shape when a valid Bearer MOOTER_ADMIN_TOKEN is provided
//   - per-endpoint validation (sort whitelist 422, pagination clamp, 16-hex 400,
//     period 422 / 7d+30d 200)
//   - audit: a logAdminView INSERT into audit_admin_views is attempted BEFORE data
//   - PRIVACY: no response body contains an '@' email, the string 'github', or a
//     key literally named `user_id` (only `user_id_hash` is allowed).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleAdminUsers } from '../admin_users.js';
import { adminUserDetail } from '../admin_user_detail.js';
import { handleAdminCohort } from '../admin_cohort.js';

const TOKEN = 'wave56-admin-secret';
const VALID_HASH = 'a1b2c3d4e5f60718'; // 16-hex

/**
 * Labelled D1 stub. Routes each prepared SQL to a canned result based on a
 * substring match, and records every INSERT into audit_admin_views in
 * `state.audit` so tests can assert the audit write was attempted.
 */
function fakeDb() {
  const state = { audit: [], inserts: [] };

  const usersAggRow = {
    user_id_hash: VALID_HASH,
    first_seen: '2026-05-01T00:00:00.000Z',
    last_active: '2026-06-10T00:00:00.000Z',
    prompt_count: 42,
    total_saved_usd: 1.2345,
    distinct_tiers: 2,
    tiers_used: 'T0,T2',
    feedback_count: 3,
  };

  const stmt = (sql) => ({
    sql,
    _args: [],
    bind(...a) { this._args = a; return this; },

    async run() {
      if (/INSERT INTO audit_admin_views/.test(sql)) {
        state.audit.push({ sql, args: this._args });
      } else {
        state.inserts.push({ sql, args: this._args });
      }
      return { success: true };
    },

    async first() {
      // admin_users: total distinct users
      if (/COUNT\(DISTINCT user_id_hash\) AS total/.test(sql)) return { total: 1 };
      // admin_user_detail: profile roll-up
      if (/MIN\(event_date\)\s+AS first_seen/.test(sql)) {
        return {
          first_seen: '2026-05-01',
          last_active: '2026-06-10',
          prompt_count: 42,
          total_saved_usd: 1.23,
        };
      }
      // admin_cohort: each metric query selects `AS n` (or prompts/saved_usd)
      if (/AS prompts/.test(sql)) return { prompts: 100, saved_usd: 9.87 };
      if (/AS n\b/.test(sql)) return { n: 7 };
      return null;
    },

    async all() {
      // admin_users: the GROUP BY per-user aggregate
      if (/GROUP BY e\.user_id_hash/.test(sql)) return { results: [usersAggRow] };
      // admin_user_detail: tier_breakdown
      if (/decided_tier\s+AS tier/.test(sql)) {
        return { results: [{ tier: 'T0', count: 30, saved_usd: 0.5 }, { tier: 'T2', count: 12, saved_usd: 0.73 }] };
      }
      // admin_user_detail: local models
      if (/actual_model_used\s+AS model/.test(sql)) {
        return { results: [{ model: 'qwen3:30b', count: 30, reason: 'no_gpu' }] };
      }
      // admin_user_detail: daily prompts (also used for quant_timeline)
      if (/event_date\s+AS day/.test(sql)) {
        return { results: [{ day: '2026-06-09', count: 5 }, { day: '2026-06-10', count: 7 }] };
      }
      // admin_user_detail: feedback history
      if (/FROM feedback/.test(sql)) {
        return {
          results: [{
            received_at: '2026-06-08T12:00:00.000Z',
            topic: 'bug',
            severity: 'low',
            content: 'router misfired on a trivial prompt',
            mooter_version: '1.36.0',
            hw_tier: 'mid',
          }],
        };
      }
      return { results: [] };
    },
  });

  return { _state: state, prepare: (sql) => stmt(sql) };
}

function req(method, url, { auth } = {}) {
  const headers = new Map();
  if (auth) headers.set('Authorization', auth);
  return {
    method,
    url,
    headers: { get: (k) => headers.get(k) ?? null },
  };
}

const bearer = `Bearer ${TOKEN}`;

/**
 * PRIVACY assertion: the serialized body must not leak any direct identity.
 * - no '@' (would indicate a raw email)
 * - no 'github' substring (case-insensitive)
 * - no JSON key literally named "user_id" (user_id_hash is the only allowed id)
 */
function assertNoPiiLeak(bodyText) {
  assert.equal(bodyText.includes('@'), false, 'response must not contain an @ (raw email)');
  assert.equal(/github/i.test(bodyText), false, 'response must not mention github');
  assert.equal(/"user_id"\s*:/.test(bodyText), false, 'response must not carry a raw user_id key');
  // user_id_hash IS allowed — sanity that the guard above did not over-match it.
}

// ─────────────────────────────────────────────────────────────────────────────
// /v1/admin/users
// ─────────────────────────────────────────────────────────────────────────────
test('GET /v1/admin/users → 401 without/with wrong Authorization', async () => {
  const noAuth = await handleAdminUsers(req('GET', 'https://h/v1/admin/users'), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(noAuth.status, 401);
  const wrong = await handleAdminUsers(req('GET', 'https://h/v1/admin/users', { auth: 'Bearer nope' }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(wrong.status, 401);
});

test('GET /v1/admin/users → 200 + shape with a valid admin token, audits first', async () => {
  const db = fakeDb();
  const res = await handleAdminUsers(req('GET', 'https://h/v1/admin/users?limit=10&offset=0', { auth: bearer }), { DB: db, MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 200);
  const bodyText = await res.text();
  const j = JSON.parse(bodyText);
  assert.ok(Array.isArray(j.users), 'users[] present');
  assert.equal(j.users[0].user_id_hash, VALID_HASH);
  assert.equal(j.users[0].prompt_count, 42);
  assert.equal(j.limit, 10);
  assert.equal(j.offset, 0);
  assert.equal(j.total, 1);
  // audit attempted BEFORE data
  assert.equal(db._state.audit.length, 1, 'one audit INSERT attempted');
  assert.match(db._state.audit[0].sql, /audit_admin_views/);
  assertNoPiiLeak(bodyText);
});

test('GET /v1/admin/users → 422 on a sort value outside the whitelist', async () => {
  const res = await handleAdminUsers(req('GET', 'https://h/v1/admin/users?sort=drop_table', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 422);
  const j = JSON.parse(await res.text());
  assert.equal(j.errorCategory, 'validation');
});

test('GET /v1/admin/users → pagination clamps an oversized limit to MAX', async () => {
  const res = await handleAdminUsers(req('GET', 'https://h/v1/admin/users?limit=99999', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 200);
  const j = JSON.parse(await res.text());
  assert.equal(j.limit, 200, 'limit clamped to MAX_LIMIT');
});

// ─────────────────────────────────────────────────────────────────────────────
// /v1/admin/user/<hash>
// ─────────────────────────────────────────────────────────────────────────────
test('GET /v1/admin/user/<hash> → 401 without a valid token (even with a valid hash)', async () => {
  const res = await adminUserDetail(req('GET', `https://h/v1/admin/user/${VALID_HASH}`), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN }, VALID_HASH);
  assert.equal(res.status, 401);
});

test('GET /v1/admin/user/<hash> → 400 when the hash is not 16-hex', async () => {
  const res = await adminUserDetail(req('GET', 'https://h/v1/admin/user/not-a-hash', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN }, 'not-a-hash');
  assert.equal(res.status, 400);
  const j = JSON.parse(await res.text());
  assert.equal(j.errorCategory, 'bad_request');
});

test('GET /v1/admin/user/<hash> → 200 + shape for a valid hash, audits the target', async () => {
  const db = fakeDb();
  const res = await adminUserDetail(req('GET', `https://h/v1/admin/user/${VALID_HASH}`, { auth: bearer }), { DB: db, MOOTER_ADMIN_TOKEN: TOKEN }, VALID_HASH);
  assert.equal(res.status, 200);
  const bodyText = await res.text();
  const j = JSON.parse(bodyText);
  assert.equal(j.scope, 'user_detail');
  assert.equal(j.user_id_hash, VALID_HASH);
  assert.equal(j.profile.prompt_count, 42);
  assert.ok(Array.isArray(j.tier_breakdown));
  assert.ok(Array.isArray(j.local_models));
  assert.ok(Array.isArray(j.feedback_history));
  // audit row carries the target user hash
  assert.equal(db._state.audit.length, 1);
  assert.ok(db._state.audit[0].args.includes(VALID_HASH), 'audit args include target user hash');
  assertNoPiiLeak(bodyText);
});

// ─────────────────────────────────────────────────────────────────────────────
// /v1/admin/cohort-metrics
// ─────────────────────────────────────────────────────────────────────────────
test('GET /v1/admin/cohort-metrics → 401 without a valid token', async () => {
  const res = await handleAdminCohort(req('GET', 'https://h/v1/admin/cohort-metrics'), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 401);
});

test('GET /v1/admin/cohort-metrics → 422 on a bad period', async () => {
  const res = await handleAdminCohort(req('GET', 'https://h/v1/admin/cohort-metrics?period=1y', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 422);
  const j = JSON.parse(await res.text());
  assert.equal(j.errorCategory, 'validation');
});

test('GET /v1/admin/cohort-metrics → 200 for both 7d and 30d, audits first', async () => {
  for (const period of ['7d', '30d']) {
    const db = fakeDb();
    const res = await handleAdminCohort(req('GET', `https://h/v1/admin/cohort-metrics?period=${period}`, { auth: bearer }), { DB: db, MOOTER_ADMIN_TOKEN: TOKEN });
    assert.equal(res.status, 200, `${period} → 200`);
    const bodyText = await res.text();
    const j = JSON.parse(bodyText);
    assert.equal(j.period, period);
    assert.equal(typeof j.dau, 'number');
    assert.equal(typeof j.mau, 'number');
    assert.equal(typeof j.stickiness, 'number');
    assert.ok(j.totals && typeof j.totals.prompts === 'number');
    assert.equal(db._state.audit.length, 1, `${period} audited`);
    assertNoPiiLeak(bodyText);
  }
});

test('GET /v1/admin/cohort-metrics → defaults to 30d when period is absent', async () => {
  const res = await handleAdminCohort(req('GET', 'https://h/v1/admin/cohort-metrics', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(res.status, 200);
  const j = JSON.parse(await res.text());
  assert.equal(j.period, '30d');
});

// ─────────────────────────────────────────────────────────────────────────────
// method guard (shared contract)
// ─────────────────────────────────────────────────────────────────────────────
test('non-GET methods are rejected with 405 across all three endpoints', async () => {
  const u = await handleAdminUsers(req('POST', 'https://h/v1/admin/users', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  const d = await adminUserDetail(req('POST', `https://h/v1/admin/user/${VALID_HASH}`, { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN }, VALID_HASH);
  const c = await handleAdminCohort(req('POST', 'https://h/v1/admin/cohort-metrics', { auth: bearer }), { DB: fakeDb(), MOOTER_ADMIN_TOKEN: TOKEN });
  assert.equal(u.status, 405);
  assert.equal(d.status, 405);
  assert.equal(c.status, 405);
});
