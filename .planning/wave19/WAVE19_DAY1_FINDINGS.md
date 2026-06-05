# Wave 19 Day 1 — 19.A Token Counter per Tier + 🪙 chip — Findings

> Branch `wave19-day1-token-tracker` → dev. Tag `v1.9.7-token-tracker-dev`.
> Canonical edits in `frugal/tools/router/`. **`classify.js` byte-identical**
> (sha256 `7b01eb86…87762`, guarded). **0 new test failures** (9 pre-existing,
> identical list before/after — stash-compared). **No prod promote** (Wave 19
> closure is Day 4). Hub untouched; zero PII in token logs.

## TL;DR (3 lines)
1. **The brief's capture assumption was wrong-but-better**: Mooter is a *hook, not a proxy*, so it never sees the Anthropic API "response headers". The REAL per-tier cloud tokens already exist — recorded by Claude Code in the **session transcript** (`~/.claude/projects/<proj>/<session>.jsonl`, `message.model` + `message.usage`). No extra API call, no proxy, no hub. This is *more* honest than the brief hoped.
2. **T0/local is not in the transcript** → it arrives via `trackCall()` from the executor path (`providers/ollama-api.js` already has real `prompt_eval_count`/`eval_count`). The two sources merge in `snapshot()`.
3. Shipped: `token_tracker.js` (+4 tests), 🪙 chip on statusline line 2, PostToolUse keeps the cache fresh. Render verified: `🪙 T0:13.3k · T2:24.2k`.

## What shipped
| Piece | File | Note |
|---|---|---|
| Token tracker | `tools/router/token_tracker.js` | session-scoped, file-backed `os.tmpdir()/mooter-tokens-<session>.json`; `trackCall` (T0 push) + `aggregateTranscript` (cloud) + `snapshot` (merge) |
| 🪙 chip | `tools/router/statusline-multi.js` | line 2, non-zero tiers only, compact units (`fmtTokens`); `hidden_chips:["tokens"]` drops it; **cache-only snapshot** on the render path (never parses the transcript) |
| Cache refresh | `tools/router/post_tool_badge.js` | PostToolUse calls `syncFromTranscript(sessionId)` (mtime-guarded), reading stdin's session id once |
| Tests | `tools/router/token_tracker.test.js` | T0-only push; mixed all-4-tiers transcript+push merge; `modelToTier` mapping; chip format/units |

## Decisions taken (no Paulo gate needed — all reversible, additive)
- **Headline = input + output tokens.** Cache tokens (`cache_read`/`cache_creation`) are parsed-able but **excluded from the chip headline** to keep "tokens consumed" meaning one thing. If Paulo wants a cache-aware view later, the data is already in the transcript — it's a display choice, not a re-capture.
- **Chip shows only non-zero tiers** (brief's stated intent "minimize visual noise"); all-zero → chip dropped entirely. The brief's literal example `T1:0 · T3:0` was illustrative of format, not a requirement to print zeros.
- **No double-count guard**: cloud tiers come only from the transcript (`_transcript` bucket), T0 only from pushes (`_pushed` bucket); a transcript re-sync never touches `_pushed`. Mapping ignores `gpt`/`gemini` (not a Mooter tier).

## Honesty / privacy posture
- **Zero PII**: only metadata persisted (tier, token counts, transcript mtime). Never prompt/response text. Verified in `token_tracker.js` cache shape.
- **No invented tokens**: cloud numbers are Claude Code's own recorded `usage`; local numbers are Ollama's own counts. Nothing estimated (unlike `savings-tracker.js`).
- **No extra API calls / no Ollama polls / no hub touch**: the transcript is read-only off disk; T0 piggybacks the existing executor return value.

## Note for a later Tier (not fixed here — out of Wave 19.A scope)
The B1 "est" marker (Tier C) only reached the **1-line** quota chip. The **2-line** view still renders `☁ Claude Max ${anthRem}% · 5h reset` (statusline-multi.js, line2 array) without the `est` qualifier — same local-estimate caveat applies there. Flagging for a future statusline-honesty pass; deliberately not touched here to keep 19.A's diff scoped to the token chip.
