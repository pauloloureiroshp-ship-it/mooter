// Wave 58 batch 4 (A.13) — /api/admin/matrix route handler tests.
// Auth boundary (getUser) and the best-effort audit write are mocked (allowed by
// test-conventions: external API + auth boundary). The route reads the REAL repo
// seed + pricing snapshot from data/ — no DB mock, no fabricated cells.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mock the auth + audit boundary --------------------------------------------
const getUser = vi.fn();
const writeAudit = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  getUser: (...args: unknown[]) => getUser(...args),
}));
vi.mock('../../../(app)/admin/_lib/audit.server', () => ({
  getAdminAllowList: () => '', // empty → privacy falls back to ADMIN_EMAIL_FALLBACK
  ADMIN_EMAIL_FALLBACK: 'admin@example.com',
  writeAudit: (...args: unknown[]) => writeAudit(...args),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { GET } from './route';

// Minimal NextRequest stand-in: only `.cookies.get(name)` is used by the handler.
function req(token?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === 'sb-access-token' && token ? { value: token } : undefined,
    },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  getUser.mockReset();
  writeAudit.mockReset();
});

describe('auth gating', () => {
  it('no cookie → 401', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('valid token but non-admin email → 403', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'someone@else.com' });
    const res = await GET(req('tok'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('invalid token (getUser null) → 403', async () => {
    getUser.mockResolvedValue(null);
    const res = await GET(req('tok'));
    expect(res.status).toBe(403);
  });
});

describe('admin happy path (reads real seed + snapshot)', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ id: 'u1', email: 'admin@example.com' });
  });

  it('returns 200 with the full 14×24 dense matrix', async () => {
    const res = await GET(req('tok'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toHaveLength(14);
    expect(body.categories).toHaveLength(24);
    expect(body.cells).toHaveLength(14 * 24);
  });

  it('sets a private, no-store cache header (reads session state)', async () => {
    const res = await GET(req('tok'));
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('best-effort audit is fired with the matrix view tag', async () => {
    await GET(req('tok'));
    expect(writeAudit).toHaveBeenCalledTimes(1);
    const entry = writeAudit.mock.calls[0][2];
    expect(entry.action).toBe('view_stats');
    expect(entry.metadata).toEqual({ view: 'matrix' });
    // No PII target on this view.
    expect(entry.target_user_id_hash).toBeNull();
  });

  it('coverage is honest: 14 measured of 336, and reports pending-TES count', async () => {
    const body = await (await GET(req('tok'))).json();
    expect(body.coverage.total_cells).toBe(336);
    expect(body.coverage.measured_cells).toBe(14); // matches the seed's 14 cited cells
    expect(body.coverage.empty_cells).toBe(322);
    // tes_pending_cells counts EVERY cell with a null TES (incl. all empties).
    expect(body.coverage.tes_pending_cells).toBeGreaterThanOrEqual(14);
    expect(body.coverage.tes_pending_cells).toBeLessThanOrEqual(336);
  });

  it('NEVER fabricates a TES: every cell tes is null or a finite number, and a pending cell has tes:null', async () => {
    const body = await (await GET(req('tok'))).json();
    for (const c of body.cells) {
      if (c.tes_status === 'pending') {
        expect(c.tes).toBeNull();
      } else {
        expect(Number.isFinite(c.tes)).toBe(true);
      }
    }
  });

  it('measured cells carry a real source; empty cells are source:"unknown" & measured:false', async () => {
    const body = await (await GET(req('tok'))).json();
    const measured = body.cells.filter((c: { measured: boolean }) => c.measured);
    expect(measured).toHaveLength(14);
    for (const c of measured) {
      expect(c.source).not.toBe('unknown');
    }
    const empty = body.cells.find((c: { measured: boolean }) => !c.measured);
    expect(empty.source).toBe('unknown');
    expect(empty.tes).toBeNull();
  });

  it('honest TES coverage: ONLY the 4 priced cells get a real TES; the other 10 measured cells stay pending', async () => {
    const body = await (await GET(req('tok'))).json();
    // Of the 14 measured cells, only the models the snapshot actually prices can
    // be scored. Until 2026-08-25 that was claude-opus-4-7 alone (3 cells:
    // backend/refactor/debug) and this test asserted 3/11. PR #398 gave
    // claude-fable-5 its real SSOT price ($10/$50 per MTok) — the withheld price
    // had been the ONLY thing keeping T5 out of the auto-router, and that guard
    // now lives in decide-agent.ts (OPT_IN_ONLY_MODELS). So a 4th cell became
    // honestly scorable. 4/10 is not a relaxed number: it is the same rule
    // ("score only what you can price") applied to one more priced model.
    const measuredOk = body.cells.filter(
      (c: { measured: boolean; tes_status: string }) => c.measured && c.tes_status === 'ok',
    );
    expect(measuredOk).toHaveLength(4);
    // TES = (score*100)/(input_per_ktok + 0.3*output_per_ktok).
    const expectedTes: Record<string, number> = {
      // (0.876*100)/(0.005 + 0.3*0.025) = 87.6 / 0.0125 = 7008.
      'claude-opus-4-7': 7008,
      // (0.946*100)/(0.010 + 0.3*0.050) = 94.6 / 0.025  = 3784.
      'claude-fable-5': 3784,
    };
    expect(new Set(measuredOk.map((c: { model: string }) => c.model))).toEqual(
      new Set(['claude-opus-4-7', 'claude-fable-5']),
    );
    for (const c of measuredOk) {
      expect(expectedTes[c.model]).toBeDefined();
      expect(c.tes).toBeCloseTo(expectedTes[c.model], 1);
    }
    // Opus 4-7 still owns 3 of the 4 — Fable contributes exactly its one
    // measured cell (GPQA Diamond), not a whole category.
    expect(
      measuredOk.filter((c: { model: string }) => c.model === 'claude-opus-4-7'),
    ).toHaveLength(3);
    const measuredPending = body.cells.filter(
      (c: { measured: boolean; tes_status: string }) => c.measured && c.tes_status === 'pending',
    );
    expect(measuredPending).toHaveLength(10);
    for (const c of measuredPending) {
      expect(c.tes).toBeNull(); // never a fabricated number
    }
  });
});
