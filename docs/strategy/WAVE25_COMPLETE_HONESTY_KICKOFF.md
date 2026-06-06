# Wave 25 — Complete Honesty (Mega-Wave: Visible Polish + Branding + Real Sync)

> **Goal**: Final pre-friends-launch wave. 3 blocks: (A) UX/copy alignment com Wave 23 honest discovery, (B) branding cleanup completo 43+ `frugal_*` refs across signed-in pages, (C) real CLI→hub sync (Wave 24 24.E deferred). After this, friends see produto 100% honest end-to-end.
>
> **Trigger**: Wave 24 v1.14.0-pre-launch-fixes EM PROD + Cowork audit 2026-06-06 revelou:
> - 4 visible copy issues (Adapter Forge premature, T0 stays local sem caveat, /install v8.951 stale, SEO titles)
> - 43 `frugal_*` mentions em landing/(app)/ signed-in pages
> - mooter sync STUB (Wave 4 Phase D nunca shipped real CF Workers backend)
>
> **Scope**: 1 mega-PR consolidado · 16 fixes (3 blocks) · ~13-15h CC autonomous + ~1h Paulo validation. Tag dev `v1.15.0-complete-honesty-dev` → prod `v1.15.0-complete-honesty`.
>
> **Non-negotiables**:
> - classify.js byte-identical (P11 sha256 `7b01eb86…87762`)
> - Wave 21/22/23/24 tracker shapes intact
> - Hub D1 migration zero-downtime (dual-name compat during transition)
> - Honesty alignment com Wave 23 audit findings (zero "no data sent" lies)
> - UserPromptSubmit hook intact
> - Tests router + 16 new (1 per fix)

---

## 0. Pre-flight — Wave 24 audit findings consolidated

### Block A — UX/Copy alignment (4 visible blockers)

| # | Issue | Page | Severity |
|---|---|---|---|
| A1 | **"Adapter Forge ✓ Wave 5"** premature claim — Wave 5 LoRA never shipped (212 samples prepared Wave 23 but never trained) | /compare | 🔴 CRITICAL |
| A2 | **"Code/prompts leave machine: ✗ T0 stays local"** sem Haiku divergence caveat (contradiz Wave 23 discovery) | /compare | 🔴 CRITICAL |
| A3 | **CLI version "v8.951"** displayed (prod is v1.14.0) — stale data attribute | /install | 🟠 IMPORTANT |
| A4 | Page titles all "mooter — Route smarter. Ship faster." (SEO impact) | /methodology, /packs, /onboarding | 🟡 POLISH |

### Block B — Branding cleanup (43 `frugal_*` mentions cross-stack)

| File | Mentions |
|---|---|
| `landing/app/(app)/admin/page.tsx` | 19 |
| `landing/app/(app)/dashboard/page.tsx` | 16 |
| `landing/app/(app)/layout.tsx` | 4 |
| `landing/app/(app)/settings/page.tsx` | 3 |
| `landing/app/(app)/dashboard/_state.ts` | 1 |
| **Total** | **43** |

Vars include: `frugal_version`, `frugal_config`, `frugal_events` references, type sortKeys, etc.

**Hub D1 schema** also has `frugal_events` table, `frugal_version` columns — cross-stack migration needed.

Paulo flagou /admin "look frugal" — variable name + type references in code show through admin UI.

### Block C — Real sync (Wave 24 24.E deferred)

Paulo's empirical bash test 2026-06-06 revealed:
```
🐮 Mooter sync — DRY RUN (no network)
Endpoint (target): https://sync.mooter.ai/v1/events (NOT contacted in dry-run)
ℹ Real sync ships in Wave 4 Phase D (CF Workers backend).
```

**Root cause**: `mooter sync` is stub. Wave 4 Phase D **never shipped real CF Workers ingestion**.

Hub `mooter-hub.frugal-hub.workers.dev` exists with `/aggregate-stats` + `/api/stats` endpoints but CLI never pushed real data. Hub aggregates all zero. Pastor never learns. Landing `/api/community/pulse` returns `{"source":"demo"}`.

---

## 1. Sub-features (16 fixes)

### Block A — UX/Copy alignment (~4h)

#### A1 — `/compare` honest claims (~30 min)

**Fix path**:

```tsx
// Before
| Adapter Forge (local LoRA) | ✓ Wave 5 | ✗ | ✗ | ✗ | ✗ |

// After
| Adapter Forge (local LoRA) | 🟡 Wave 26 training | ✗ | ✗ | ✗ | ✗ |

// Before  
| Code/prompts leave machine | ✗ T0 stays local | ✓ all to Anthropic | ... |

// After
| Code/prompts leave machine | ⚠ T0 routes local, executes cloud Haiku when API key present (divergence chip shows live) | ✓ all to Anthropic | ... |
```

Honest about T0 reality + future Wave 5 (LoRA) is Wave 26 now.

#### A2 — `/install` version dynamic (~30 min)

Find where "v8.951" comes from (probably hardcoded data attribute OR cached from old CHANGELOG):
- `grep "v8.951" landing/`
- Replace with dynamic fetch from latest GitHub tag OR build-time substitution from `package.json`

#### A3 — SEO unique page titles (~30 min)

Update Next.js metadata for each page:
```tsx
// /methodology/page.tsx
export const metadata = { title: 'Methodology — How mooter decides which model | mooter' };
// /packs/page.tsx
export const metadata = { title: 'Packs — Domain-specific routing | mooter' };
// /onboarding/page.tsx
export const metadata = { title: 'Onboarding — Set up mooter for your stack | mooter' };
```

#### A4 — Dashboard tabs cross-check (~2h)

For each tab (Setup, Decisions, Metrics, Workflow, Devices):
- Identify which numbers are hardcoded mockups vs computed from real data
- Add "Demo data" badge OR "Connect mooter sync to see real numbers" empty states
- Match Wave 23 honest design pattern (DataSourceBadge from Wave 10 Phase B.1a)

**Estimate Block A**: ~3.5h CC.

---

### Block B — Branding cleanup (43 `frugal_*` mentions) (~3-4h)

#### B1 — Rename landing signed-in files (~1.5h)

Strategy: rename `frugal_*` → `mooter_*` with **TypeScript backward compat type aliases** during transition.

```tsx
// Before
type DeviceRow = {
  frugal_version: string;
  // ...
};

// After (with compat alias)
type DeviceRow = {
  mooter_version: string;
  /** @deprecated Use mooter_version */
  frugal_version?: string; // hub still sends this until migration complete
  // ...
};
```

5 files to rename:
- `landing/app/(app)/admin/page.tsx` (19 mentions)
- `landing/app/(app)/dashboard/page.tsx` (16 mentions)
- `landing/app/(app)/layout.tsx` (4 mentions)
- `landing/app/(app)/settings/page.tsx` (3 mentions)
- `landing/app/(app)/dashboard/_state.ts` (1 mention)

API readers should accept BOTH `frugal_version` and `mooter_version` fields (compat) but display only `mooter_*`.

#### B2 — Hub D1 schema migration (zero-downtime) (~1.5h)

Migration:

```sql
-- migrations/0NN_rename_frugal_to_mooter.sql

-- Add new columns alongside old
ALTER TABLE frugal_events ADD COLUMN mooter_version TEXT;
UPDATE frugal_events SET mooter_version = frugal_version;

-- Rename table (CREATE new + COPY + DROP)
-- Wave 25 uses dual-table strategy:
CREATE TABLE mooter_events AS SELECT * FROM frugal_events;
-- Keep frugal_events table alive for backward compat writes
-- Wave 26 will drop frugal_events after CLI fully migrated
```

Plus update API routes:
- Reads from `mooter_events` (or COALESCE both during transition)
- Writes to BOTH tables (dual-write) during transition

#### B3 — /admin brand parity (~30 min)

Update tab labels, headers, column names from "Frugal version" → "Mooter version", etc. Hub D1 dual-name strategy keeps it working.

#### B4 — Final-reviewer gate (~30 min)

Run `grep -rn frugal landing/` after rename — should be <5 occurrences (only legacy compat type fields with `@deprecated` JSDoc).

**Estimate Block B**: ~3.5h CC.

---

### Block C — Real CLI→hub sync (~5-6h)

#### C1 — CF Workers `/api/events` ingestion verify/build (~1.5h)

Verify route exists in `hub/src/routes/events.ts`:
```bash
grep -rn "api/events" hub/src/
```

If exists: verify ingestion logic (auth, validation, D1 write to mooter_events). If missing: build it.

Schema:
```
POST /api/events
Headers: X-Mooter-Client-Id, X-Mooter-Schema-Version, Signature: HMAC-SHA256
Body: { tier_distribution, safety_boost_reasons, pack_usage, hardware_info, ... }
Response: 202 Accepted
```

#### C2 — CLI `mooter sync` real POST (~2h)

Replace stub `mooter sync` with real implementation:
- Read consent + window data (already works dry-run)
- Build event payload (already works dry-run)
- Sign HMAC-SHA256 (already works dry-run)
- **POST to actual endpoint** (NEW)
- Handle response (202 success, retry on 429/5xx)
- Update audit log

Replace dry-run flag with `--dry-run` opt-in (default = real).

#### C3 — Endpoint resolution (~1h)

Option α: Configure DNS subdomain `sync.mooter.ai` → `mooter-hub.frugal-hub.workers.dev`
Option β: Update CLI to use existing `mooter-hub.frugal-hub.workers.dev/api/events` directly
Option γ: Use config variable, default to existing URL

Recommended: γ (env var with sensible default).

#### C4 — Pastor learning loop live (~1.5h)

After real events arrive, verify Pastor pipeline:
- `/api/events` writes to `mooter_events` D1 table
- Aggregation cron updates `community_aggregates` table
- `mooter trail` or similar reads aggregated insights
- Tuning state (`tuning-state.json`) updates from real community data

Add monitoring endpoint `/api/pastor/health` returning last-update timestamp + event count.

#### C5 — Dashboard real data (~30 min)

Update landing `/api/community/pulse` + `/api/dashboard/aggregates` to fetch from hub real data instead of returning `{"source":"demo"}`. Fallback to demo if hub empty (current behavior).

#### C6 — E2E test (~30 min)

Paulo runs:
1. `mooter sync` (no --dry-run flag)
2. Wait 30 sec
3. Check `https://mooter-hub.frugal-hub.workers.dev/api/stats` → non-zero `avg_tier_distribution`
4. Check `https://mooter.ai/api/community/pulse` → real data (not demo)
5. Refresh `/dashboard` → numbers update

**Estimate Block C**: ~6h CC.

---

## 2. Sequência (~13-15h CC autonomous)

### Day 1 — Phase 0 Recon (45 min)

- Read all 5 frugal_* files + understand cross-references
- Find /install v8.951 source (data attribute search)
- Verify CF Workers `/api/events` route exists
- Document approach for each block

### Day 1 — Block A (~3.5h)

A1 → A2 → A3 → A4 (UX/copy fixes in order)

### Day 1 — Block B (~3.5h)

B1 (rename signed-in files with compat) → B2 (D1 migration dual-write) → B3 (admin parity) → B4 (grep final-reviewer gate)

### Day 1 — Block C (~6h)

C1 → C2 → C3 → C4 → C5 → C6 (E2E test deferred to Paulo)

### Day 1 — Closure (~1h)

- Tests +16 new (1 per fix)
- classify.js sha256 check
- PR squash → `wave25-complete-honesty`
- final-reviewer Opus

**Total**: ~15h CC autonomous (overnight OK).

---

## 3. Non-negotiables

| # | Item | Como verificar |
|---|---|---|
| 1 | classify.js byte-identical | sha256 = `7b01eb86…87762` |
| 2 | Wave 21/22/23/24 tracker shapes intact | snapshot() unchanged |
| 3 | Hub D1 migration zero-downtime | dual-write during transition |
| 4 | Honesty alignment | grep "T0 stays local" without caveat = 0 |
| 5 | UserPromptSubmit hook intact | smoke test |
| 6 | Backward compat | `frugal_version` field still accepted by API readers |
| 7 | Tests router + 16 new | npm test pass |

---

## 4. Definition of Done (Wave 25)

1. ✅ A1 — `/compare` Adapter Forge → "Wave 26 training" + T0 row has Haiku caveat
2. ✅ A2 — `/install` version reflects latest prod tag (or static "Always latest")
3. ✅ A3 — `/methodology`, `/packs`, `/onboarding` have unique SEO titles
4. ✅ A4 — Dashboard tabs show DataSourceBadge OR empty state for demo data
5. ✅ B1 — `grep -rn "frugal_" landing/app/(app)/` < 5 (only compat type aliases)
6. ✅ B2 — Hub `mooter_events` table created + dual-write active
7. ✅ B3 — /admin labels say "Mooter" not "Frugal"
8. ✅ B4 — Final-reviewer Opus gate
9. ✅ C1 — `/api/events` ingestion route works (200 OK)
10. ✅ C2 — `mooter sync` actually POSTs to hub
11. ✅ C3 — Endpoint resolved (config or DNS)
12. ✅ C4 — Pastor learning loop populated
13. ✅ C5 — Landing /api/community/pulse returns real data after sync
14. ✅ C6 — Paulo E2E test PASS
15. ✅ classify.js sha intacto
16. ✅ Tag prod `v1.15.0-complete-honesty` em main
17. ✅ Notion sub-page + SYNC.md update
18. ✅ **Friends-launch GO** após Paulo verify

---

## 5. Master prompt CC

```
Inicia Wave 25 Complete Honesty mega-wave conforme docs/strategy/WAVE25_COMPLETE_HONESTY_KICKOFF.md.

Pré-flight: Wave 24 v1.14.0-pre-launch-fixes EM PROD. Cowork audit 2026-06-06 revelou 16 issues em 3 blocks: (A) UX/copy alignment 4 visible, (B) 43 frugal_* mentions cross-stack, (C) mooter sync STUB (Wave 4 Phase D nunca shipped real).

Scope: 1 PR consolidado mega-wave com 16 fixes em 3 blocks:
- Block A (~3.5h): A1 /compare Adapter Forge premature + T0 stays local caveat, A2 /install version dynamic, A3 SEO unique titles, A4 dashboard tabs DataSourceBadge
- Block B (~3.5h): B1 rename 43 frugal_* em 5 signed-in files (com TypeScript compat), B2 hub D1 mooter_events dual-write migration zero-downtime, B3 /admin labels parity, B4 final-reviewer gate
- Block C (~6h): C1 verify/build CF Workers /api/events ingestion, C2 mooter sync real POST (not stub), C3 endpoint resolution (env var config), C4 Pastor learning loop live, C5 landing /api/community/pulse real data, C6 E2E test ready for Paulo

Lê PRIMEIRO:
  - docs/strategy/WAVE25_COMPLETE_HONESTY_KICKOFF.md inteiro
  - landing/app/(app)/admin/page.tsx (19 frugal_ mentions)
  - landing/app/(app)/dashboard/page.tsx (16 mentions)
  - landing/app/(app)/layout.tsx, settings/page.tsx, dashboard/_state.ts
  - landing/app/(marketing)/compare/page.tsx (A1+A2)
  - landing/app/(marketing)/install/page.tsx (A3 search v8.951 source)
  - hub/src/routes/ (events.ts if exists)
  - hub/migrations/ (D1 schema understanding)
  - tools/router/hub-push.js (CLI sync stub source)
  - tools/router/classify.js (P11 sha256 7b01eb86…87762 — NUNCA tocar)

Non-negotiables:
  - classify.js byte-identical (GUARD em cada commit)
  - Wave 21/22/23/24 tracker shapes intact
  - Hub D1 zero-downtime (dual-write strategy: writes to both frugal_events and mooter_events during transition)
  - Honesty alignment com Wave 23 (zero "T0 stays local" sem caveat)
  - UserPromptSubmit hook intact
  - Backward compat: hub still accepts frugal_version field, just emits mooter_version
  - Tests router + 16 new (1 per fix)

Sequência (~15h autonomous):
  Phase 0 Recon (45 min): read 5 frugal files + grep v8.951 source + verify CF Workers events route
  Block A UX/Copy (~3.5h): A1 /compare + A2 /install + A3 SEO + A4 dashboard tabs
  Block B Branding (~3.5h): B1 rename signed-in com compat + B2 D1 dual-write migration + B3 /admin parity + B4 grep gate
  Block C Real sync (~6h): C1 /api/events ingestion + C2 CLI real POST + C3 endpoint + C4 Pastor live + C5 dashboard real + C6 E2E prep
  Closure (~1h): tests + classify guard + PR squash → wave25-complete-honesty + final-reviewer Opus

Tag dev v1.15.0-complete-honesty-dev.

E2E gate (Paulo):
  - Browser /compare → "Wave 26 training" + Haiku caveat visible
  - Browser /install → version não "v8.951" anymore
  - Browser /admin → labels "Mooter" not "Frugal"
  - bash: mooter sync (sem --dry-run) → POST to hub success
  - Verify https://mooter-hub.frugal-hub.workers.dev/api/stats → non-zero avg_tier_distribution
  - Verify https://mooter.ai/api/community/pulse → real data (not demo)

NÃO promover prod até PASS.

Reporta findings em docs/strategy/WAVE25_DAY_X_FINDINGS.md por block.

Após Wave 25 prod ship, friends-launch GO. Honest pitch v5:
"Mooter v1.15 SHIPPED. Real CLI→hub sync live (Pastor learns from your events). Plus all branding aligned + UX honest end-to-end. We audited Mooter using Mooter ($2.04, 82.7% saved) — found 'local-summarizer' actually routes cloud Haiku when API key. Don't hide it, divergence chip shows live. Open source: github.com/pauloloureiroshp-ship-it/mooter. mooter.ai"
```

---

## 6. Wave 26 backlog (deferred)

- LoRA train 212 strict samples (from Wave 23 corpus)
- Auto-sync background daemon (replaces nudge approach)
- 22.A herd file v167 nuclear (Wave 22 caveat carry)
- AUDIT_REPORT.md path correction to docs/
- Drop `frugal_events` D1 table after CLI fully migrated
- /packs visual content verify

Estimate Wave 26: ~6h CC + LoRA overnight.

---

**Composed by Cowork, 2026-06-06 pós-Wave 24 prod + comprehensive audit. 16 fixes
em 3 blocks. ~15h CC autonomous. Tag v1.15.0-complete-honesty. Friends-launch GO
após PASS.**
