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
