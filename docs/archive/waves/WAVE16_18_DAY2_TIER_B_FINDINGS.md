# Wave 16–18 Day 2 — Tier B (Statusline Honesty) — Findings

> Branch `wave16-18-day2-tier-b-statusline` → dev. Tag `v1.9.5-statusline-honesty-dev`.
> Canonical edits in `frugal/tools/router/statusline-multi.js` (runtime `~/.claude/`
> copy is sync-managed by `/mooter-update`). **`classify.js` byte-identical** (guarded
> each edit). 81/81 router statusline tests pass. **No prod promote.**

## Outcome: careful verification shows the audit OVERSTATED 2 of 3 statusline findings

| Fix | Audit said | Reality (canonical code) | Action |
|---|---|---|---|
| **B3 saved "today"** | maybe all-time | **CONFIRMED all-time** (verified) | ✅ **relabeled today → all-time** |
| **B2 adapter chip** | never shows deployed adapter | only the **1-line** view was idle; 2-line already wired | ✅ **wired the 1-line view** |
| **B1 quota chip** | "Claude Max 100% · 5h reset" misleads | canonical renders **`42% 5h`** (no "Claude Max") | ⚠️ **left unchanged** — see below |

---

## B3 — savings headline "today" → "all-time" (FIXED) · the real one

**Trace (per Paulo's "no guess")**: `savedUsd` (headline) = `metrics.saved` from
`readSavingsSync()` → the tracker's `/metrics`. `savings-tracker.js:readDecisions()`
reads the **entire** `decisions.log`; `computeMetrics(lines)` sums over **all** lines
with **no date filter** (and no per-day scoping). So `m.saved` is **all-time
cumulative**, never today. The old `saved $X today` label was wrong.

**Fix applied** (your "relabel" decision): `today` → `all-time` at both savings
headlines (green `saved $X all-time (…)`, yellow `only N% saved all-time …`).
Tests updated (statusline-multi + two-line). Verified render:
`🐮 saved $0.27 all-time (89% vs all-Opus) · …`.

**⚠️ Decision/flag for Paulo**: relabeling to "all-time" is the *honest* fix, but it
changes the headline from a **daily glance** into a **lifetime** number — which may
not be what you want at a glance. The alternative (preserves the daily intent) is to
make the savings genuinely today-scoped: add a `saved_today` field to
`savings-tracker.js` (filter events by UTC date, like `prompts_today` already does)
and read that. That's a `savings-tracker.js` change (separate service) → **suggest
as a Wave 17 follow-up** if the daily glance matters more than the honest stopgap.

## B2 — 1-line adapter chip now reads real state (FIXED)

The **2-line** view already called `getActiveAdapter()` (reads
`~/.mooter/preferences.json` + verified manifest + `.gguf`). Only the **1-line /
compact** `getAdapterStatus()` was hardcoded `{status:'idle'}`. Wired it to
`getActiveAdapter()` → `loaded` (●) when a verified adapter is active, `idle` (◌)
otherwise. With no adapter installed (CI/default) it correctly reports idle. So a
deployed adapter now shows in **both** views.

## B1 — quota chip: audit premise was a runtime/paraphrase artifact (LEFT UNCHANGED)

The audit described "☁ Claude Max 100% · 5h reset". **That string is not in the
canonical code** — the canonical chip is **`${anthRem}% 5h`** (e.g. `42% 5h`), the
remaining % of a **local** 5h token window computed by `computeAnthropicRem()` from
`quota-state.json` (0 network calls — confirmed in Wave 17). It does **not** say
"Claude Max" or "100%".

Assessment: `42% 5h` is a **reasonably honest** local-window estimate — it shows a
%, references the real 5h rate-limit window structure, and makes no API-validation
claim. The honesty gap (it's a local estimate vs real plan quota) is mild.

**Why left unchanged**: the only honest tweak would be an "approximate" marker
(e.g. `~42% 5h`), but that chip (`proofParts`) feeds **every** headline's proof
slot and is asserted by multiple tests — high churn / regression surface for a
marginal gain on an already-reasonable chip.

**Decision for Paulo**: want an explicit local-estimate marker on the 5h chip
(`~N% 5h` or `N% 5h est`)? It's a one-liner + a handful of test updates — say the
word and it goes in Tier B's follow-up or Tier C. *(The misleading "Claude Max
100%" you/Cowork saw is the runtime render or audit paraphrase, not the source.)*

---

## Gates
- `classify.js` byte-identical (sha256 `7b01eb86…87762`) — guarded after every edit.
- **81/81** router statusline node:test pass; render manually verified.
- Canonical-only edits (`frugal/tools/router/`); runtime copy synced by `/mooter-update`.
- (`next build` / web harness N/A — terminal statusline, not a web page.)
- No hub/CLI/schema/landing/prod changes.
