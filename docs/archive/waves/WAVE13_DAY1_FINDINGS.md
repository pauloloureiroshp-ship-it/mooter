# Wave 13 "Show the Herd" — Day 1 Findings (Phase 1+2) + Paulo Gate

> CC, 2026-06-03. Phases 1 (subagent_tracker.js + unit tests) and 2 (statusline
> `🐄×N` chip + snapshot tests) complete and green. **STOP here for Paulo Gate** —
> decide the trade-offs in §4 before Phase 3 (post_tool_badge) proceeds.
> Design source of truth: `WAVE13_MOOS_VISIBILITY_MICROBRIEF.md`.

---

## 1. What shipped (Phase 1+2)

| File | Status | Role |
|---|---|---|
| `tools/router/subagent_tracker.js` | **NEW** | runtime state machine — `trackSpawn` / `trackComplete` / `trackError` / `snapshot` / `reset`, idempotent by `spawn_id` |
| `tools/router/subagent_tracker.test.js` | **NEW** | 11 unit tests (spawn/complete/error/idempotency/race/peak/persistence/reset) |
| `tools/router/statusline-multi.js` | edited | `herdChip()` + `appendHerd()`; `ctx.herd` populated in `buildContext`; chip on Line 1 (`renderTwoLine`) and compact line (`renderFromContext`) |
| `tools/router/herd-chip.test.js` | **NEW** | 7 snapshot tests (N=0 dim, N≥1, garbage→0, regression: no-herd ctx unchanged) |
| `tools/router/package.json` | edited | registered the two new test files in `test` script |

**Tests:** `subagent_tracker` 11/11 · `herd-chip` 7/7 · `statusline-multi` + `two-line` + `landing-parity` all green. **Full router suite: 458 pass.**

## 2. Non-negotiables — verified

| Invariant | Status | Proof |
|---|---|---|
| `classify.js` byte-identical (P11) | ✅ | sha256 `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` — identical before/after Phase 1+2 (not touched) |
| Zero `mooter_event` schema changes | ✅ | tracker writes only a tmp JSON file; no event fields, no `event-builder.js` touch |
| Zero new hub telemetry | ✅ | `hub/` untouched; state is in-process only |
| Zero prompt text in any output | ✅ | tracker stores only `{agent_name, tier, model, duration_ms}` |
| savings $ / tier / sparkline / local % UNCHANGED | ✅ | no edits to `pricing.js`, `savings-tracker`, `sparkline.js`, `tier-mix.js`; regression test asserts no-herd ctx renders byte-for-byte as before |

## 3. Architecture findings (decisions already taken, flagged for review)

**F-1 — Hooks are separate processes → state must be file-backed (not a module Map).**
The brief's pseudo-code shows `active = Map<...>` as "module state". But `PreToolUse`,
`PostToolUse`, and `Stop` each fire as a **distinct node invocation**, so an in-memory Map
cannot survive between them. I backed the tracker with a **per-session JSON file in
`os.tmpdir()`** (`mooter-herd-<session>.json`) — the exact pattern the statusline already
uses for `mooter-statusline-tick-<session>`. It is still "pure runtime state, not persisted"
in the telemetry/schema sense: ephemeral, session-scoped, deleted by `reset()` on Stop. This
is the only viable mechanism; no alternative was in scope.

**F-2 — Canonical vs wired (`.claude/rules/router-logic.md`).** Edits land in the canonical
`frugal/tools/router/`. The statusline is wired via `~/.claude/settings.json → statusLine →
tools/router/gsd-statusline.js` (canonical path — good). **But there is no `PreToolUse` hook
on the `Agent`/`Task` tool yet** — only `PostToolUse Bash|Agent|Task → ~/.claude/hooks/PostToolUse.js`.
So Phases 3–6 must (a) add a `PreToolUse Agent|Task` wiring that calls `trackSpawn`, and
(b) extend the existing `PostToolUse.js` to call `trackComplete`. Per the drift protocol, the
`~/.claude/hooks/` copies must be synced alongside the frugal mirror until `/mooter-update`
automates it. **This is harness wiring, not repo code — flagging so Paulo knows Phase 3+
touches `~/.claude/hooks/` (personal harness), within doctrine.**

**F-3 — `digest.ts` does not exist.** The brief names `digest.ts`; the real Stop-hook digest
logic lives in the `stop-hook` path (`stop-hook.test.js` present). Phase 4 will locate and
extend the actual file. No blocker.

**F-4 — Pre-existing test failures on `dev` (NOT Wave 13).** The full suite shows 5 failures
that are **identical with my changes stashed** — they are environmental/baseline:
`getActiveAdapter` ×2 (reads real `~/.mooter/adapter-state.json`) and `gsd-statusline` ×3
(cold-spawn latency + a savings-line fixture that depends on real local data). Wave 13 adds
**zero** new failures. Recommend tracking these separately; they should not block the wave.

**F-5 — Local `dev` is 5 commits behind `origin/dev`.** `git stash pop` reported the local
branch can be fast-forwarded. Before Phase 8 PR, I'll rebase/FF onto `origin/dev` so the PR is
clean. Flagging now.

## 4. Paulo Gate — decisions before Phase 3+

The 5 trade-offs from brief §3, plus one interpretation question (T-7) that surfaced during
implementation. My implementation already encodes the **recommended** option for each; confirm
or override.

| # | Decision | Implemented default | Alternatives |
|---|---|---|---|
| T-1 | Statusline indicator | **A.1 `🐄×N` chip** (done) | A.2 state word · A.3 animated |
| T-2 | Default verbosity | **`standard`** (Phase 3) | `quiet` |
| T-3 | Cloud agents in digest | **list with `☁`** (Phase 4) | drop |
| T-4 | "Peak concurrent" stat | **show always** (Phase 4) | only when >1 |
| T-5 | Animation A.3 | **Wave 14** (not in scope) | Wave 13 |
| T-6 | Mention 🐄 in showcase rubric C5 | **yes** (Phase 7) | no |
| **T-7** | **What does the chip's N count?** | **total active herd** (local + cloud) | **local Moos only** |

**T-7 detail (new — needs your call).** The brief is ambiguous: §1 calls `🐄×3` "3 Moos
working" (🐄 = local), but §0 frames the chip as the answer to "16 concurrent subagents are
invisible" (→ total). I implemented **N = total active subagents** because the differentiation
vs Dynamic Workflows is *parallelism visibility* — showing `🐄×0` while 3 cloud agents run
would undersell exactly the gap we fill. The **Stop digest still breaks down local 🐄 vs cloud
☁** (T-3), so the honest detail is preserved. If you prefer the strict metaphor (🐄 = local
only), it's a one-line flip in `appendHerd` (`ctx.herd.local` instead of `ctx.herd.active`) —
the tracker already exposes both counts.

> Honesty note on T-7: "total active" is not inflation — every counted spawn is a real
> subagent. The glyph reads as "herd in flight"; the digest names which are local.

## 5. Next (after gate)

Phase 3 `post_tool_badge` per-agent one-liner (standard verbosity) → Phase 4 Stop digest
"Moos that worked the session" + peak concurrent → Phase 5 `MOOTER_HERD_VISIBILITY` env +
`mooter quiet --verbose|--quiet|--herd-off` → Phase 6 integration + Docker E2E (spawn 3 Moos,
verify live counter + cumulative digest + idempotency under race) → Phase 7 `/under-the-hood`
cross-walk table + `/compare` row + `/privacy` herd disclosure → Phase 8 final-reviewer T3 +
PR squash→dev → Cowork merge → tag `v1.8.0-show-the-herd`.

**Single PR. classify.js sha256 re-verified in the PR body. Anthropic showcase angle (§0
bridge) goes in the PR description with the Dynamic Workflows citations.**
