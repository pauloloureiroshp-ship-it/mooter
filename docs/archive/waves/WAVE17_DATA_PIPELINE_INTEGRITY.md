# Wave 17 — Data Pipeline Integrity Audit

> **Run**: 2026-06-05, autonomous read-only self-audit. Orchestrator: Claude Code (Opus).
> Workers: 5 concurrent `local-summarizer` (Ollama qwen3:30b) subagents — one per stage.
> **Read-only**: no code changed. **The three security-critical claims (PII
> redaction, per-user isolation, Pastor-loop reality) were re-verified by the
> orchestrator against the repo source** — I do not ship unverified local-model
> verdicts about whether user data is safe.

## TL;DR — privacy story is SOUND for a friends launch ✅

| Stage | Verdict | Severity |
|---|---|---|
| 1. CLI event capture / PII | **CLEAN** (verified) | low |
| 3. Per-user isolation | **ISOLATED — no cross-user leak** (verified) | low |
| 4. Community pulse | **HONEST** (null → Demo, never fabricated) | low |
| 2. Hub D1 schema | SOUND data model, **operational concerns** (FK/RLS/idempotency) | med |
| 5. Pastor learning loop | **OVERSTATED — pipeline exists but is dormant in prod** | med |

**Bottom line**: no privacy leak, no cross-user data mixing, no fabricated community
numbers. Two *honesty/operational* items (the "self-learning" claim and schema
hardening) — not launch blockers, but worth knowing before marketing the
learning loop.

---

## 1. CLI event capture / PII — **CLEAN** (verified, low)

Two streams feed the hub: legacy `frugal_event` (per-prompt, `decisions.log` →
`event-builder.js`) and the Wave-3 `MooterSyncEvent` (24h-windowed aggregate via
`mooter sync`). Privacy contract (verified in `tools/router/event-builder.js`):

- **Allowlist, not blocklist**: `ALLOWED_FIELDS` Set (line 48); any unknown field → event rejected (`return null`, line 167).
- **`BANNED_PATTERNS` scan** (line 71, applied line 192): rejects events containing path separators, file extensions, stack-trace error names, URLs, second-precision timestamps.
- **HIGH_RISK dual-reject** (line 266): `hasHighRisk(prompt_preview)` → reject (push/deploy/secret/migration prompts never leave).
- **No raw prompt text** — only `prompt_len_bucket`. Emails/user IDs → `user_id_hash` (sha256[:16]). Device IDs hashed. Consent gate: events only built when `telemetry_enabled === true` (`sync.ts`).
- Self-tested (event-builder has privacy-attack test cases).

**Verdict**: CLEAN. The redaction is reject-not-truncate and dual-enforced. **Residual risk** (low): adding a field to `ALLOWED_FIELDS` without re-checking `BANNED_PATTERNS` could open a leak — keep that allowlist guarded.

## 3. Per-user isolation — **ISOLATED, no cross-user leak** (verified, low)

This is the launch-critical one. Verified by the orchestrator:

- **Zero `SELECT *` returned to any public hub route** (grep across `hub/routes/` + `hub/lib/` = empty).
- Public stats (`hub/routes/stats.js`, `/aggregate-stats`) are **pure aggregates**: `COUNT(*)`, `COUNT(DISTINCT device_id)`, `GROUP BY hw_tier/sub_profile/decided_tier`. No raw rows, no per-user identifiers in any response.
- Every row is keyed by its own `user_id_hash` / `profile_hash` / `device_id`; rate-limit queries filter by a single identifier — **no JOINs that mix users**.
- The only row-returning endpoint (feedback list) is **admin-gated**: `adminAuthorized()` does `constantTimeEqual(provided, MOOTER_ADMIN_TOKEN)` and returns only non-PII columns (no raw email/user_id).

**Verdict**: ISOLATED. A friend's data is never attributed to another user, and no public endpoint exposes individual rows.

## 4. Community pulse — **HONEST** (low)

`/api/community/pulse` returns **real** hub aggregates (`prompts_routed`, `active_devs`, `saved_last_7d`) or `{ source: "demo" }` when the hub is empty/unreachable — `fetchHubAggregates()` returns `null` (never fabricates), and `CommunityPulse.tsx` renders a "Demo data" badge + disclaimer. `avg_savings_pct` is **intentionally omitted** ("fabricating one would be dishonest"). Consistent with the Wave-14 honesty posture. No action.

---

## 2. Hub D1 schema — SOUND model, **operational concerns** (med)

Tables (`hub/migrations/*.sql`): `deltas`, `model_signals`, `aggregated_stats`,
`anomalies`, `frugal_events`, `device_heartbeats`, `shadow_pairs`,
`algorithm_versions`, `user_profiles`, `feedback`. Data minimization is strong —
identifiable columns are only `user_id_hash` (sha256[:16], nullable/opt-in); IPs
are salted-hashed for rate-limit only; previews truncated to 200 chars.

**Concerns (operational, not exposure):**
- **No FK constraints** — `frugal_events.instance_id → user_profiles`, `shadow_pairs.decision_id → frugal_events` are implied, not enforced → orphan rows possible.
- **ALTER TABLE non-idempotency** (006/008/009) — `ADD COLUMN` without `IF NOT EXISTS`; re-run fails. Migration 008 "must run once".
- **RLS not auditable from DDL** — no `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` in the migrations (if Supabase-backed, RLS must be enabled separately). *Note: D1 (Cloudflare) has no RLS concept; confirm the actual backend before acting.*

**Fix path (NOT applied)**: add FK constraints; make migrations idempotent; confirm where RLS/auth is enforced for the real backend.

## 5. Pastor learning loop — **OVERSTATED (dormant in prod)** (med)

The loop *exists*: `backtest.js` reads `decisions.log` → writes `router-tuning.json`;
`update-router.js` → writes `tuning-state.json`; `classify.js` loads
`tuning-state.json` at module load (falls back to the committed
`tuning-state.defaults.json`). **But verified**: `tuning-state.json` and
`router-tuning.json` **do not exist**, and `backtest`/`update-router` are **not
scheduled** in prod (they appear in `test.yml` only as CI smoke/checksum context).

**So**: the classifier runs on the committed `defaults` and does **not** self-update
from real decisions today. Architecturally complete, operationally never wired.

**Verdict**: OVERSTATED. The classifier is effectively **static** in production.
**Fix path (NOT applied)**: either wire the backtest→update-router job (scheduled,
with the P11 checksum-refresh handshake already in CI) and then the "learns from
your usage" claim becomes true, or soften any copy/marketing that implies live
self-learning until it's wired.

---

## Methodology / herd run
- 5 `local-summarizer` (Ollama) workers, concurrent, local-first.
- Orchestrator (Opus) **re-verified the 3 security/honesty-critical claims** against the repo source (PII allowlist+banned-patterns; no `SELECT *` + aggregate-only public routes + constant-time admin gate; absence of `tuning-state.json` + no scheduled backtest).
- **No code changed. No fix executed. Findings only.**
