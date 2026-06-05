# Wave 19 Day 4.1 — Token-tracker honesty hot-fix (pre-launch) — Findings

> Branch `wave19-day41-token-tracker-honest` → dev. Tag `v1.10.0-day41-token-honest-dev`.
> **`classify.js` byte-identical** (`7b01eb86…87762`, guarded). 9 pre-existing
> failures, 0 new (+3 tests). **Blocks the promote PR #106** until merged — without
> it Wave 19 ships the *opposite* of its transparency promise.

## TL;DR (3 lines)
1. **BUG A (display)** — `buildTokenChip` hid zero tiers, so a real session read as `🪙 T3:2.4M` → "Mooter only uses Opus". Now shows **all four tiers always**: `🪙 T0:0 · T1:0 · T2:0 · T3:2.4M`. The zeros are the proof that cheaper tiers were available.
2. **BUG B (wiring)** — `token_tracker.trackCall` shipped in Day 1 but was **never called by any executor**, so T0 always read 0. Wired into **both** local executor paths.
3. Verified end-to-end: a `trackCall('T0',…,100,300)` lands in the snapshot; a mocked Ollama call records `T0:100→300`; the chip renders `T0:4.6k · … · T3:2.1M`.

## Fixes
| Fix | File | Change |
|---|---|---|
| A — display | `tools/router/statusline-multi.js` | `buildTokenChip` iterates all 4 tiers unconditionally (`snap[t] || {}`), drops the `if (tot>0)` skip. Returns the chip whenever `snap` is non-null; `null` only when there's no tracker data at all (≠ all-zero). ANSI tier colors (Day 2) preserved. |
| B-1 — wiring | `tools/router/providers/ollama-api.js` | After the existing `tracker.recordUsage`, call `token_tracker.trackCall('T0', model, tokensIn, tokensOut, {sessionId: opts.sessionId})`. This is the `router-execute → callOllama` path. Best-effort. |
| B-2 — wiring | `tools/router/ollama_call.sh` | **The path `local-summarizer`/`local-transformer` actually use** is this bash+curl script, NOT `providers/ollama-api.js` (verified: only `router-execute.js` requires ollama-api). Added a fire-and-forget `trackCall` in a `node -e` block AFTER the response is emitted, resolving `token_tracker.js` via `SCRIPT_DIR`. Any failure is swallowed (`2>/dev/null || true`) — never changes the call's output/exit. |

## Tests (+3; brief asked for 2 new)
- **Updated** `token_tracker.test.js` chip test → asserts the full 4-tier render (`🪙 T0:13.3k · T1:0 · T2:24.2k · T3:0`).
- **New** all-zero/T3-only chip test → proves a fresh session shows `🪙 T0:0 · T1:0 · T2:0 · T3:0` (full chip, not null) and the T3-only case shows the zeros.
- **New** `ollama-api-trackcall.test.js` → stubs `fetch` with `prompt_eval_count:100, eval_count:300`, calls `callOllama`, asserts `snapshot().T0 = {calls:1, in:100, out:300}` and cloud tiers stay 0.
- The `ollama_call.sh` node block verified by direct simulation (T0 → 100→300 in cache); bash `-n` syntax check passes (the script is bash, not unit-testable in `node --test`).

## Decisions / honesty notes
- **Separator kept as ` · `** (not the brief's space-separated `T0:0 T1:0 …`). The ` · ` form matches the *original* Day 1 kickoff example (`🪙 T0:13.3k · T1:0 · T2:24.2k · T3:0`) and the shipped Day 1-2 statusline aesthetic; the brief's spaces were illustrative. The substantive fix — all tiers always — is done either way.
- **Wired the bash path too (B-2), beyond the brief's "ollama-api.js".** Paulo's grep correctly found the gap in `ollama-api.js`/`router-execute.js`, but the *headline scenario* (`local-summarizer × N → T0:0`) flows through `ollama_call.sh`, which curls `/api/generate` directly and never touches `ollama-api.js`. Fixing only `ollama-api.js` would have left the exact reported symptom alive. Both paths now record.
- **`null` vs all-zero**: `buildTokenChip(null)` still returns `null` (no tracker data → no chip), but `snapshot()` always returns a zero-filled object, so a live session always shows the full chip. "No data yet" and "zero spend" are different and rendered differently.
- **Subagent passthrough (brief step 4) skipped** — `subagent_tracker` API is a non-negotiable "unchanged", and it's redundant: local subagent tokens are now captured at the executor (`ollama_call.sh`), and cloud subagent tokens already come from the transcript (Day 1 `syncFromTranscript`). Adding a second write path would risk double-counting.

## Caveats (flagged, not faked)
- **Runtime sync required.** Edits are canonical (`tools/router/`). The live effect (Paulo's running statusline/Stop report) needs `/mooter-update` to sync `statusline-multi.js`, `providers/ollama-api.js`, and `ollama_call.sh` into `~/.claude/tools/router/`.
- **`sessionId` propagation.** `ollama_call.sh`'s `trackCall` uses `CLAUDE_SESSION_ID` from the subagent's env. If Claude Code doesn't propagate that var into a subagent's bash, the T0 write lands under `unknown` and the main session's chip won't merge it. The executor path (B-1) passes `opts.sessionId` explicitly and is unaffected. Worth a live re-test after sync.

## Gates
- `classify.js` byte-identical (`7b01eb86…87762`), absent from diff.
- Day 1-4 features intact: statusline enhanced chips, `decisions_v2`, Stop report format unchanged; Wave 13 `subagent_tracker` API untouched. Zero PII (token counts only). Zero hub touch.
- Router suite 621 tests, 9 pre-existing failures, **0 new** (+3). Bash `-n` clean.

## Post-PR
Cowork merge → dev → Paulo gate → **re-open/rebase the promote PR #106** (dev→main) so it carries Day 4.1. Final prod tag name unchanged: `v1.10.0-token-transparency`.
