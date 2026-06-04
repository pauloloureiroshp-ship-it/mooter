# Wave 13.x Brand Cleanup — Day 1 Findings + decisions for Paulo

> CC, 2026-06-04. All 4 phases implemented in one branch (`wave13x-brand-cleanup`),
> verified, pre-final-reviewer. Backwards-compat total, zero downtime. Design SoT:
> `WAVE13_X_BRAND_CLEANUP_MICROBRIEF.md`.

## DoD cross-check (§7)

| # | Criterion | Status |
|---|---|---|
| 1 | `hub/wrangler.toml` → `hub/wrangler.frugal-legacy.toml` + deprecation header | ✅ (`git mv`, history preserved) |
| 2 | `deploy-hub.yml` uses `-c wrangler.mooter.toml` | ✅ (`command: deploy --config wrangler.mooter.toml`) |
| 3 | `feedback.js` accepts both tokens, constant-time | ✅ |
| 4 | CLI `feedback.ts` reads MOOTER_ADMIN_TOKEN → MOOTER_HUB_TOKEN → FRUGAL_ADMIN_TOKEN | ✅ |
| 5 | Docs sweep | ✅ (worker.js comment, hub/README) |

## Verification (all green)

- `classify.js` sha256 `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` — byte-identical (P11), not in diff.
- New `hub/routes/__tests__/feedback-auth.test.js` — **6/6** (canonical, fallback, both-set, missing, malformed header, length-safe).
- CLI `feedback.test.ts` — **11/11** incl. the new MOOTER_ADMIN_TOKEN → MOOTER_HUB_TOKEN → FRUGAL_ADMIN_TOKEN fallback test (Linux tsx).
- `wrangler deploy --dry-run -c wrangler.mooter.toml` — parses, bundles (568 KiB), binds **mooter-hub** D1 + **mooter-hub-storage** R2 (verified native Windows; Docker blocked by a pre-existing `workerd` Windows-binary-in-node_modules mismatch — environmental).

## Decisions taken (flagging for Paulo — none block)

**D1 — `hub/package.json` scripts repointed to canonical.** The rename removed the default
`wrangler.toml`, which would break `wrangler deploy`/`wrangler dev` (default-config resolution)
and `hub/README` instructions. So `dev` and `deploy` now pass `-c wrangler.mooter.toml`; added
`deploy:legacy` (→ `wrangler.frugal-legacy.toml`) and a `test` script (hub had none). This is a
necessary consequence of Phase 1, not extra scope.

**D2 — `feedback.js` admin auth was timing-UNSAFE.** The old check used `auth.slice(7) !== env.FRUGAL_ADMIN_TOKEN`
(`!==`, early-exit → leaks match length). Replaced with `constantTimeEqual` + an exported
`adminAuthorized(header, env)` that checks **both** tokens in constant time (both evaluated, no
short-circuit on the secret). This is the "constant-time compare em ambos" the brief required —
and a real security fix to the existing code.

**D3 — `mooter.js` NOT rebuilt/committed.** It is an **untracked build artifact** (gitignored);
the CLI `bin` runs `./src/index.ts` directly. So the `feedback.ts` source change is what ships —
no bundle regeneration needed. (Local Windows can't rebuild it anyway: pre-existing esbuild
`linux-x64` mismatch.)

**D4 — `hub/README` migration examples corrected `frugal-hub-db` → `mooter-hub`.** Lines 57/59
used a stale legacy DB name inconsistent with the canonical config (README line 39/47 + 
`wrangler.mooter.toml` both say `mooter-hub`). This is a **doc consistency fix, not an infra/D1
schema change** — no D1 was renamed.

**D5 — Phase 2 operational consequence (per brief §2).** CI now deploys the **mooter-hub**
canonical Worker. `frugal-hub` becomes orphaned (no new CI deploys) — recommended: full
deprecation, frozen on last deploy, not deleted (legacy clients may still hit its URL). Confirm
when you run the secret op below.

## NOT touched (honest scope guard)

- `env.FRUGAL_ADMIN_TOKEN` code symbol (kept as live fallback) · `frugal_events` table ·
  `002_frugal_events.sql` migration (D1 schema/symbols) · public URL `mooter-hub.frugal-hub.workers.dev`
  · `~/frugal/` workspace path · the `frugal-hub` Worker on Cloudflare (frozen, not deleted) ·
  the microbrief design doc itself.

## Paulo ops after merge (§3 — ~5 min, zero downtime, code already accepts both)

```powershell
cd "C:\Users\Paulo Loureiro\frugal\hub"
# Same value as the current FRUGAL_ADMIN_TOKEN, on BOTH Workers:
npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.mooter.toml
npx wrangler secret put MOOTER_ADMIN_TOKEN -c wrangler.frugal-legacy.toml
```
Then smoke: `mooter feedback "wave 13.x brand cleanup smoke"` → 201, and
`MOOTER_ADMIN_TOKEN=<v> mooter feedback --list` → 200. `FRUGAL_ADMIN_TOKEN` stays valid until a
later wave deletes it (no rush — dual-write).
