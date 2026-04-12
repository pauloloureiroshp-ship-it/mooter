# Frugal Pre-Flight Audit Report
**Gerado em:** 2026-04-12T20:26:19.932Z
**Máquina:** DESKTOP-J26409Q (win32 x64)
**Frugal version:** 0.9.4

## Sumário
| Bloco | Total | ✅ Pass | ⚠️ Warn | ❌ Fail |
|---|---|---|---|---|
| B1 — Ficheiros e CLI | 25 | 24 | 0 | 1 |
| B2 — Segurança e Auth | 7 | 6 | 1 | 0 |
| B3 — Integridade de Dados | 4 | 0 | 4 | 0 |
| B4 — Feedback Loop | 8 | 7 | 1 | 0 |
| B5 — UX/UI Conectividade | 13 | 7 | 6 | 0 |
| **TOTAL** | **57** | **44** | **12** | **1** |

**Veredicto:** ❌ BLOCKERS FOUND

---

## B1 — Ficheiros e CLI
- ✅ **tools/router/classify.js**: exports classify()
- ✅ **tools/router/inject_context.js**: exists
- ✅ **tools/router/PostToolUse.js**: exists
- ✅ **tools/router/savings-tracker.js**: exists
- ✅ **tools/router/frugal-doctor.js**: has --sync flag
- ✅ **tools/router/frugal-login.js**: exists
- ✅ **tools/router/patterns.js**: exists
- ✅ **tools/router/pricing.js**: exists
- ✅ **tools/router/gold-labels.json**: 62 entries
- ✅ **tools/router/version.json**: version=0.9.4
- ✅ **landing/app/(app)/layout.tsx**: exists
- ✅ **landing/app/(app)/dashboard/page.tsx**: exists
- ✅ **landing/app/(app)/settings/page.tsx**: exists
- ✅ **landing/app/(app)/admin/page.tsx**: exists
- ✅ **landing/app/api/me/route.ts**: exists
- ✅ **landing/app/api/profile/route.ts**: exists
- ✅ **landing/app/api/install-complete/route.ts**: exists
- ✅ **landing/app/api/admin/stats/route.ts**: exists
- ✅ **landing/app/auth/callback/route.ts**: exists
- ✅ **landing/middleware.ts**: exists
- ✅ **landing/migrations/002_devices_table.sql**: exists
- ✅ **landing/migrations/003_decisions_log.sql**: exists
- ❌ **~/.frugal/auth.token**: EXPIRED
- ✅ **~/.frugal/device.id**: 5ff5e137-226b-4949-bca1-601b0e7d377d
- ✅ **~/.claude/settings.json**: 5 hook(s) configured

## B2 — Segurança e Auth
- ✅ **GET /api/me (no token)**: 401 as expected
- ✅ **GET /api/profile?userId=xxx (no token)**: 401 as expected
- ✅ **POST /api/install-complete (no token)**: 405 as expected
- ✅ **GET /api/admin/stats (no token)**: 401 as expected
- ⚠️ **GET /api/admin/stats (non-admin token)**: SKIP — no secondary test token available
- ✅ **GET /api/me content-type**: application/json
- ✅ **POST /api/install-complete accepts Bearer**: status=405

## B3 — Integridade de Dados
- ⚠️ **Profile Integrity**: SKIP — auth token expired
- ⚠️ **Device Integrity**: SKIP — auth token expired
- ⚠️ **Admin Stats**: SKIP — auth token expired
- ⚠️ **Data Consistency**: SKIP — auth token expired

## B4 — Feedback Loop
- ✅ **gold-labels.json**: 62 entries
- ✅ **classify("trivial edit")**: tier=T0, conf=0.8
- ✅ **classify("architecture")**: tier=T3, conf=0.75
- ✅ **classify("bug investigation")**: tier=T2, conf=0.7
- ✅ **TUNED-BLOCK**: present, sample_size=230
- ✅ **decisions.log lines**: 644
- ⚠️ **decisions.log format**: 0/3 recent lines are valid JSON with tier+timestamp
- ✅ **Backtest capability**: backtest.js + gold-labels.json present

## B5 — UX/UI Conectividade
- ✅ **Landing page**: status=200
- ✅ **Dashboard**: status=307
- ✅ **/api/me (no token)**: status=401
- ✅ **Hub /health**: status=200
- ✅ **savings-tracker :7821**: running
- ✅ **auth/callback bridge HTML**: present
- ✅ **frugal-login.js**: opens browser=true, listens :7822=true
- ⏳ **[MacBook] Node.js instalado no MacBook**: PENDING
- ⏳ **[MacBook] Git clone do repo no MacBook**: PENDING
- ⏳ **[MacBook] npm install corrido**: PENDING
- ⏳ **[MacBook] .claude/settings.json configurado com os hooks**: PENDING
- ⏳ **[MacBook] frugal-login.js executado → token em ~/.frugal/auth.token**: PENDING
- ⏳ **[MacBook] frugal-doctor --sync → "✓ profile updated" com novo device_id**: PENDING

---

## Bloqueadores (❌)
- **~/.frugal/auth.token**: EXPIRED

## Avisos (⚠️)
- **GET /api/admin/stats (non-admin token)**: SKIP — no secondary test token available
- **Profile Integrity**: SKIP — auth token expired
- **Device Integrity**: SKIP — auth token expired
- **Admin Stats**: SKIP — auth token expired
- **Data Consistency**: SKIP — auth token expired
- **decisions.log format**: 0/3 recent lines are valid JSON with tier+timestamp

## Pendentes Manuais (⏳)
- [ ] Node.js instalado no MacBook
- [ ] Git clone do repo no MacBook
- [ ] npm install corrido
- [ ] .claude/settings.json configurado com os hooks
- [ ] frugal-login.js executado → token em ~/.frugal/auth.token
- [ ] frugal-doctor --sync → "✓ profile updated" com novo device_id

