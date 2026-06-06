# Wave 26 — Day 0 Honest Recon (before any code)

> CC, 2026-06-06. Branch `wave26-real-sync-pastor` re-based onto real `origin/main @ 5408f9b` (it was sitting on the stale unmerged Wave 25 commit `281baab`, 35 commits behind — fixed, 0 unique commits lost). `classify.js` sha `7b01eb86…` intact. Recon leveraged Wave 25's hub/CLI map + 2 fresh Explore passes. **The brief has 4 false/outdated premises and 1 hard blocker — same discipline as Wave 25.**

## TL;DR — premise validation (read first)

| Sub-feature | Brief premise | Ground truth | Verdict |
|---|---|---|---|
| **26.A** runSyncReal → real POST | "Substituir **stub**" | `runSyncReal` is **NOT a stub** — real POST already coded (HMAC sign, consent, audit, tests). Gap = endpoint/payload/auth mismatch + no backend configured | ⚠️ **premise false** |
| **26.B** HMAC from `device_id`+`MOOTER_ADMIN_TOKEN` | New HMAC scheme | `MOOTER_ADMIN_TOKEN` is a **server** secret — can't live in a public CLI to compute HMAC client-side (= leak). CLI's existing HMAC uses a per-machine secret that **never leaves the machine** → not hub-verifiable | ⚠️ **security-flawed; needs T3 decision** |
| **26.C** deploy `wrangler.mooter.toml` | Routine deploy | Feasible, but needs **Paulo's wrangler/Cloudflare auth**; CC can't deploy prod blindly | �︎ **Paulo-gated** |
| **26.D** Pastor cron `*/15` | Add 15-min cron | **BLOCKED** — crons commented out in `wrangler.mooter.toml` (Free plan 3/5 used by frugal-hub). No `pastor_state` table or pipeline exists | ⛔ **blocked as specified** |
| **26.E** remove demo fallback | "demo is dishonest" | Demo IS the honest **"Demo data" badge** pattern Wave 25 verified as good. Removal only makes sense **after** real data flows (26.A–C). Applies to **community** aggregate, not user's own | ⚠️ **resequence** |
| **26.F** E2E test | Script | Feasible; depends on 26.A–C deployed | ✓ depends |
| **26.G** LoRA train 212 | "212 samples exported Wave 23" | **TRUE** — `audit/lora_train.jsonl` 560 lines, `audit/lora_meta.json` confirms 212 score≥8. Training script does **not** exist (ADR 020: Docker unsloth = planned). CC scope = write the script only | ✓ **confirmed** |
| **26.H** herd v167 nuclear | Re-validate v167 | v167 backward-compat **already validated** in Wave 23 Phase 0 (`WAVE23_PHASE0_V167_SCHEMA.md`, "NO regression"). 50-herd test doesn't exist; **live** 50-spawn is expensive (guardrail) — synthetic is the safe form | ⚠️ **already-validated; synthetic only** |

---

## The core blocker (26.A/B/C) — same architecture fork Paulo deferred from Wave 25

`mooter sync` end-to-end is blocked on **one unresolved decision**, not on missing code:

| Layer | CLI sends (already coded) | Hub has today |
|---|---|---|
| Endpoint | `POST {backendUrl}/v1/events` | only `POST /submit-events` (no `/v1/events`) |
| Auth | `Bearer {Supabase access_token}` | `Bearer {FRUGAL_SUBMIT_TOKEN}` (static) |
| Payload | 1 aggregate window obj (`tier_distribution`, `safety_boost_reasons`, `pack_usage`, `hardware_info`), HMAC self-signed with `~/.mooter/.telemetry_secret` | array of **per-decision** events (`frugal_events` schema) |
| Default | no backend configured → safe dry-run | — |

`frugal_events` already carries 5/5 of the brief's proposed columns (`decided_tier`=tier, `task_category`=classification, `per_decision_savings_usd`=savings, `outcome_score`, `algorithm_version`); only `exec_drift` is new. So a per-decision path needs ~1 column, not a new table. The aggregate path needs a new route + table.

The brief's 26.B HMAC scheme (`device_id` + `MOOTER_ADMIN_TOKEN`) is **not viable**: a server admin token in a public open-source CLI leaks the moment anyone reads the source. Auth must be either (α) trust-the-pseudonym + rate-limit, or (β) verify the Supabase JWT the CLI already sends.

---

## 26.D Pastor — hard infra blocker

- `hub/wrangler.mooter.toml` lines 21-24: crons **commented out** — "Free plan limit reached (frugal-hub uses 3/5). Re-enable after frugal-hub crons removed in Phase 4."
- A `*/15 * * * *` Pastor cron **cannot be added** until Phase 4 frees a slot.
- No `pastor_state` table, no per-device drift pipeline exists anywhere. The only "learning" is the community-wide `router-tuning-latest.json` from the daily `generate` job.
- **Viable without a cron:** compute the Pastor hint **on-ingest** (inside the events handler) or **on-read** (when the device next syncs / GET). v1 Pastor can be pull-based, no cron. Or fold into the existing daily `generate` cron (daily cadence, not 15-min).

---

## What is safe to build NOW (no open decision, no prod risk)

- **26.G** — write the LoRA training script (`scripts/train_lora.sh` or `.py`) over `audit/lora_train.jsonl` (212 high samples, 20% holdout, early stop). No GPU run by CC; Paulo runs overnight. **Self-contained.**
- **26.H** — **synthetic** 50-payload herd test feeding the SubagentStop hook (no live Claude spawns → cheap, safe, no >5-subagent guardrail hit). Extends existing `herd-integration.test.js`. v167 compat already proven; this is the stress/idempotency assurance.

Both are independent of the auth/cron forks.

---

## Decisions needed from Paulo (before 26.A–F)

1. **Auth + endpoint + payload model** (the carried-over fork): α trust-pseudonym + rate-limit · β verify Supabase JWT · γ brief's HMAC (rejected — token leak).
2. **Pastor (26.D) given cron block**: pull-based on-read (no cron) · fold into daily generate · defer to Phase 4.
3. **Deploy (26.C)**: CC prepares; Paulo runs `wrangler deploy` (or provides a scoped token). Confirm.

`classify.js` untouched. No tracker shapes touched. No prod promoted. Nothing built yet — Day 0 gate respected.

---

## Day 1 build status (post-decision: α · pull-Pastor · build G+H now)

| # | Built | Tests |
|---|---|---|
| 26.G | `scripts/train_lora.{py,sh}` — QLoRA over the 212 samples, 80/20 holdout, early stop → `mooter-pastor-v1.gguf` for `mooter forge install`. CC prepares; Paulo runs overnight. | data path verified (212 → 170/42); py compile + bash -n clean |
| 26.H | `tools/router/herd-50-nuclear.test.js` — synthetic 50-subagent stress on the native SubagentStop hook. | **4/4 pass** (peak=50, dispersal, double-fire idempotency, spawn-less capture, malformed reject) |
| 26.A | CLI `runSyncReal` reconciled to α — login now **optional** (anonymous pseudonym); attaches token only if present; surfaces the Pastor hint. | CLI sync suite **32/32** |
| 26.B | Hub `POST /v1/events` (`hub/routes/sync_events.js`) — α auth (no secret), per-client rate-limit, Zod `syncWindowSchema` (rejects privacy fields), `INSERT OR IGNORE` idempotent. Migration `011_sync_events.sql`. Wired in `worker.js`. | hub suite **21/21** (incl. 15 new) |
| 26.D | Pull-based Pastor — `pastor_state` table, recomputed on-ingest, hint returned in the `/v1/events` response (threshold ≥20). **No cron** (Free-plan slots exhausted). | `computePastor` + handler covered |
| 26.E | **Satisfied by data flow** — `/api/community/pulse` + `/api/dashboard/aggregates` already return `source:"live"` once `total_events>0`; `/aggregate-stats` now merges `sync_events`, so the dashboard goes live the moment a device syncs. The "Demo data" badge is retained as the honest empty-state (Wave 25 finding) — not ripped out. No dashboard code change. |
| 26.F | `scripts/e2e_sync.sh` — non-destructive (backup/seed/restore) E2E: seed 5 decisions → `mooter sync` → assert hub count rose + pulse live + GET `/v1/events`→405. | bash -n clean; runs against deployed hub |

### Deploy runbook (Paulo — 26.C, the only step CC can't do)

```bash
cd hub
npx wrangler d1 migrations apply mooter-hub --remote   # applies 011_sync_events.sql
npx wrangler deploy -c wrangler.mooter.toml            # ships /v1/events
# smoke:
curl -s -o /dev/null -w '%{http_code}\n' https://mooter-hub.frugal-hub.workers.dev/v1/events  # → 405
bash ../scripts/e2e_sync.sh                            # full loop (needs `mooter init` first)
```

No new secret required (α uses no server token). `MOOTER_ADMIN_TOKEN` unchanged.

### Still open / deferred to a follow-up
- Per-decision savings are not derivable from aggregate windows, so `pulse.saved_last_7d` stays from `frugal_events` (0 until a per-decision path exists) — **honestly null/0, never fabricated**.
- Device-side display of the Pastor hint beyond the one-line `mooter sync` echo (e.g. statusline chip) — small follow-up.
- `frugal-hub` cron cleanup ("Phase 4") to free a slot if a real-time Pastor cron is ever wanted (pull-based covers v1).
