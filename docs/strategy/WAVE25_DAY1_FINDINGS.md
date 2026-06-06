# Wave 25 — Day 1 Findings (Recon + Block A)

> CC autonomous, 2026-06-06. Phase 0 recon + Block A executed. **Recon overturned 3 of the kickoff's premises** — Blocks B and C are not what the audit assumed. Stopping for a Paulo decision before any cross-stack / prod-deploy work (guardrail).

## TL;DR (read first)

| Fix | Kickoff said | Reality | Status |
|---|---|---|---|
| A1 | Compare claims dishonest | Correct | ✅ **DONE** |
| A2 | `/install` shows stale `v8.951` | **FALSE POSITIVE** — install page shows no version at all; `8.951` is an SVG path coord in the logo | ✅ nothing to fix |
| A3 | 3 pages share one title | Correct (they're `'use client'`, can't export metadata) | ✅ **DONE** (server `layout.tsx` per route) |
| A4 | Dashboard tabs need DataSourceBadge | **ALREADY SATISFIED** by Waves 10/14/24 | ✅ verified, no change |
| B1–B4 | 43 `frugal_*` make admin "look frugal" | **PREMISE WRONG** — zero user-visible "Frugal"; all 43 are wire-contract field names | ⚠️ **needs decision** |
| C1 | Build `/api/events` ingestion | **EXISTS** (`/submit-events`, `hub/routes/events.js`) | ✅ exists |
| C2 | `mooter sync` is a stub | **ALREADY IMPLEMENTED** — bare `mooter sync` calls `runSyncReal()`; `--dry-run` is opt-in | ✅ coded |
| C3 | Resolve endpoint via env var | **REAL GAP** — CLI↔hub endpoint/payload/auth mismatch + no backend configured by default | ⚠️ **needs decision + prod deploy** |
| C4/C5 | Pastor live / dashboard real | Blocked on C3 | ⛔ blocked |

`classify.js` sha256 = `7b01eb86…87762` — **intact**.

---

## Block A — DONE (the real, safe wins)

### A1 — `/compare` honest claims ✅
`landing/app/(marketing)/compare/page.tsx` (server component, `ROWS` array):
- `Adapter Forge (local LoRA)`: `✓ Wave 5` → `⚠️ Wave 26 (training)` (LoRA never trained; 212 samples prepared Wave 23).
- `Code/prompts leave machine`: `✗ T0 stays local` → `⚠️ T0 routes local; cloud Haiku if key set` (aligns with Wave 23 local-summarizer→Haiku divergence discovery).
- `⚠️` cells auto-render yellow via existing `cellColor()`.

### A2 — FALSE POSITIVE, no fix
`grep -rn "8.951"` → only matches the MooterMark **SVG path** (`d="M21.976 31h-7.951…8.951…"`) in `layout.tsx`, `onboarding/page.tsx`, `MooterMark.tsx`. The `/install` page (`(marketing)/install/page.tsx`) displays **no version string** — only the curl one-liner. There is nothing to make dynamic. (A `VersionBadge` component exists but is not used on install, by design.)

### A3 — SEO titles ✅
`methodology`, `packs`, `onboarding` pages are all `'use client'` → cannot export `metadata`. Fix = a sibling **server** `layout.tsx` per route exporting unique title + description (standard Next App Router pattern):
- `(marketing)/methodology/layout.tsx` — "Methodology — How mooter decides which model | mooter"
- `(marketing)/packs/layout.tsx` — "Packs — Domain-specific routing | mooter"
- `onboarding/layout.tsx` — "Onboarding — Set up mooter for your stack | mooter"

### A4 — ALREADY SATISFIED, no change
Dashboard already implements the honest data-source pattern across every tab (Waves 10 B.1a / 14 / 24 B):
- Overview: `DataSourceBadge` Live/Outdated/Demo (line 1208) + never-synced banner + stale-data banner.
- Devices / Decisions: explicit empty states ("No devices synced", "No sync history yet").
- Workflow: fetches `/api/dashboard/aggregates`; shows `WF_DEMO_DIST` **only behind an explicit "Demo data" badge** (line 2084).
- Metrics / community: `DataSourceBadge source={live ? 'live' : 'demo'}`.
Nothing fabricated is presented as live. A4 is done.

---

## Block B — premise does not hold (DECISION NEEDED)

The audit said 43 `frugal_*` mentions make `/admin` "look frugal." Recon:
- `grep -niE "frugal"` over `landing/app/(app)/`, excluding `frugal_*` identifiers and the `withFrugal` calculator var → **zero user-visible "Frugal" text**.
- Every `frugal_*` is an **internal field name** (`frugal_version`, `frugal_config`) bound 1:1 to the wire contract: landing API (`/api/me`, `/api/admin/stats`) → Supabase `profiles`/`devices` columns → hub `frugal_events.frugal_version`.
- Admin table headers show **"Version"**, not `frugal_version` (line 487 is `['Version','frugal_version']` = `[label, sortKey]`). Line 794 already says "latest **mooter** version". The only literal `frugal_config` in a visible string (line 946) is an intentional admin diagnostic.

**Implication:** renaming the 43 is cross-stack data-contract churn (TS field + API mapper + Supabase column + hub schema + Zod validator) with **zero user-visible benefit** and real breakage risk if any layer lags. This is the "improvement não pedido" + shared-config guardrail. **Not done autonomously — awaiting Paulo's call.**

---

## Block C — the one real gap (DECISION + PROD DEPLOY NEEDED)

`mooter sync` real POST is already coded (`runSyncReal`, `packages/cli/src/commands/sync.ts`), with HMAC signing, consent gate, audit log, and full tests. Paulo's empirical dry-run happened because **no backend is configured** (`MOOTER_CF_BACKEND_URL` / `~/.mooter/sync-config.json` absent → safe fallback to dry-run).

The real blocker is a **three-way mismatch** the kickoff didn't anticipate:

| Layer | CLI sends | Hub expects |
|---|---|---|
| Endpoint | `POST {backendUrl}/v1/events` | `POST /submit-events` (no `/v1/events` route) |
| Auth | `Bearer {Supabase access_token}` | `Bearer {FRUGAL_SUBMIT_TOKEN}` (static shared secret) |
| Payload | 1 aggregate window obj (`tier_distribution`, `safety_boost_reasons`, `pack_usage`, `hardware_info`), HMAC self-signed | array of per-decision events (`frugal_events` schema: `instance_id`, `decided_tier`, …) |

These are two different data models. Closing the gap requires an **architecture decision** (which auth model + which payload shape wins) **and a prod Cloudflare hub deploy + a secret** — squarely in the guardrail "ask before shared-config / deploy / secrets."

Options on the table → see the question posed to Paulo.

---

## Paulo's decisions (2026-06-06)

- **Block B → SKIP.** No visible "Frugal" leak; `frugal_*` are wire-contract identifiers. Real rename deferred to a dedicated DB/hub migration wave. No code churn.
- **Block C → DEFER to Wave 26.** Ship Block A only for the friends-launch. C done properly as its own focused wave (new `/v1/events` route + auth model + prod deploy + secret + true E2E).

## Net state — Wave 25 = Block A only

- Shipped, safe, real: **A1** (compare honesty) **+ A3** (SEO titles). Verified no-op: **A2** (false positive), **A4** (already satisfied).
- `landing typecheck` ✅ · `eslint` ✅ on all changed files.
- `classify.js` sha256 `7b01eb86…87762` untouched. No tracker shapes touched. No prod promoted.
- Scope correction: this is a **copy/SEO patch**, not a "complete honesty mega-wave" — suggest tagging `v1.14.1` (patch), not `v1.15.0`. Awaiting Paulo on tag/promote.

## Wave 26 backlog (added this session)

- Real CLI→hub sync: build hub `/v1/events` (aggregate payload), decide auth (pseudonymous client_id + rate-limit vs Supabase-JWT verify), deploy hub, configure CLI endpoint via env var, true E2E.
- Optional cross-stack `frugal_*`→`mooter_*` rename **only if** the Supabase columns + hub `frugal_events` schema migrate together (dual-write), else not worth the risk.
