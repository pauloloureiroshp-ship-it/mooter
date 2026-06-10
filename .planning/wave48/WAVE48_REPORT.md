# Wave 48 — Statusline Honest · Report (2026-06-10)

Branch `feat/wave48-statusline-honest` (off clean `main` @ 9678ab4 v1.24.0) · 3 commits · **NOT merged** → expected tag `v1.25.0-statusline-honest`.
final-reviewer (Opus): **SHIP-WITH-NITS · 0-HIGH / 0-MED** (1 LOW comment-typo, fixed). classify.js sha **INTACT** `7b01eb86…`.

## Scope decision (why not the whole brief)

Day 0 recon refuted the brief's core premises; Paulo confirmed 4 decisions:
1. Discard 5 legacy `tools/router/` deletions (done via branch-off-clean-main).
2. **No classify.js change** → Tier 5 Fable **deferred to Wave 49** (needs sourced Fable claims + verified pricing + informed decision). 25-wave sha-intact streak preserved.
3. **No local Fable mirror** → deferred to Wave 49 (Qwen2-VL/DeepSeek not installed; 18GB free won't fit DeepSeek 33B alongside qwen3:30b).
4. Phase 1 + Phase 3 on clean branch.

So this wave = **Phase 1 (statusline UX) + Phase 3 (data coherence)**. Phase 2 deferred.

## Paulo's 11 items × status

| # | Item | Status |
|---|---|---|
| 1 | Context window not visible | ✅ `📚 ctx ▰▱ %` glyph (chip existed; now recognizable) |
| 2 | Terminal name doesn't update | ⏸️ **Deferred** — chip already re-reads env each render; likely `MOOTER_TERMINAL_NAME` shadowing `mooter terminal label`. Needs Paulo repro before flipping documented precedence. |
| 3 | `nomic-embed-text 768d` cryptic | ✅ `🧭 embed nomic 768d` |
| 4 | `MLWR` no description | ✅ `📊 local routes %` (+ `explain local-routes`) |
| 5 | `limits OK` vague | ✅ `🔒 cost-cap OK` (+$spend/$cap) — clarified it is Mooter's cost cap, **not** Anthropic quota (brief conflated them) |
| 6 | `this prompt vs session` confusing | ✅ `📝 $X this turn · $Y all-time` — **fixed real mislabel**: `alltimeCost` was rendered "session $" in 3 paths |
| 7 | `0/0/peak0` indecipherable | ✅ `🐄 agents N active · M spawned · peak K` (honest labels, no invented "queued") |
| 8 | T0–T3 limited vs 6 models | ⏸️ Deferred (Tier 5 = classify.js change → Wave 49) |
| 9 | T2 never used? | ✅ **Refuted partial** — T2 ~7.5% (rare, not never). `TIER_USAGE_REAL.md` + `explain tiers`. |
| 10 | T0 coherence / savings source | ✅ Savings-by-lever breakdown; `explain saved` corrected 78%→47% (658 real calls) |
| 11 | No Claude Max usage bar | ✅ `☁ Claude Max [▓▓▓▓░░░░░░] N% left · 5h reset` |

**7 of 8 actionable chip items shipped** (1.2 deferred-with-repro-note; 8 is Wave 49 scope).

## Files changed (12 + 2 docs)

- Host-side render: `statusline-multi.js` (ctx 📚, Claude Max bar + pctBar helper, herd labels, 📝 cost group, 3-path mislabel fix), `mlwr-status.js`, `limits-status.js`, `vector-status.js`.
- `packages/cli/src/commands/explain.ts` (+test): rename mlwr→local-routes; new `embed`/`agents`/`cost-cap`/`tiers`; **authoritative pricing** (T3 Opus $5/$25 — not the brief's wrong $15/$20; Fable 5 $10/$50); saved 78%→47%.
- `docs/strategy/TIER_USAGE_REAL.md`, `.planning/wave48/WAVE48_DAY0_RECON.md`.

## Gates

- classify.js sha `7b01eb8623a0b8fc…` **INTACT** (26-wave streak).
- Engine packages 28–34.5 untouched (only `explain.ts` in packages/cli).
- Statusline suite **165/165**, CLI **351/351** (clean HOME; pre-existing env-coupled render/modes failures from real `~/.mooter/preferences.json statusline_mode:"full"` are not introduced by this diff — confirmed by stash isolation + classify.js sha intact).
- final-reviewer SHIP-WITH-NITS 0-HIGH/0-MED.

## Brief corrections (Day 0 caught)

- Pricing: brief's Opus 4.6=$15, 4.8=$20 → **wrong**; authoritative $5/$25. Not shipped.
- Two Fable 5 claims ("fallback to Opus 4.8 ~5%", "FREE on Claude Max until 2026-06-22") **unsourced** — not hardcoded.
- File locations: chips live in `tools/router/statusline-multi.js` + helpers, **not** `packages/cli/src/statusline/` (which doesn't exist).

## Pending Paulo (morning)

- Review PR → merge → tag `v1.25.0-statusline-honest`.
- Decide item 1.2 precedence (env vs `terminal label`) for a follow-up.
- `/mooter-update` to sync the statusline modules host-side (`~/.claude/tools/router/`) after merge.
- Wave 49 candidates: Tier 5 Fable routing (sourced + sha-approved) · local Fable mirror (feasibility) · Pastor re-train on tier patterns.
