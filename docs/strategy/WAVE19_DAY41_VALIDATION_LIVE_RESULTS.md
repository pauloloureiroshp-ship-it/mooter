# Wave 19 Day 4.1 — Token-Tracker Honesty Fix — LIVE VALIDATION RESULTS

**Date:** 2026-06-05
**Session:** CC v2.1.165, Opus 4.8, WSL2 Ubuntu 22.04.5 LTS
**CC session id:** `76447f84-e9c5-456e-87f8-476cba5d6902`
**Mode:** READ-ONLY validation (zero code changes)
**Branch:** `wave19-day41-token-tracker-honest` @ `c13a18b` (canonical Day-4.1 files identical to `origin/dev` @ `8fd3da2`)

---

## TL;DR — HONEST VERDICT: 2/8 PASS · 4/8 FAIL · 2/8 UNVERIFIED

**The Day 4.1 honesty fix is NOT working in this session.** T0 tokens stay **0** in the
statusline 🪙 chip and the Stop digest after 3 `local-summarizer` spawns, despite Ollama
being live and producing real token counts. Two independent defects, each sufficient to
keep T0 at 0:

- **Bug A (root cause, reproducible):** the executor (`ollama_call.sh:92`, `token_tracker.js:111`)
  reads `process.env.CLAUDE_SESSION_ID`, which is **empty** in this runtime. The real env var
  is **`CLAUDE_CODE_SESSION_ID`**. So real T0 tokens are written to `/tmp/mooter-tokens-unknown.json`
  instead of `/tmp/mooter-tokens-<session>.json` that the statusline/Stop hook actually read.
- **Bug B (herd path):** the 3 `local-summarizer` spawns produced **zero** `trackCall` writes to
  ANY bucket (session or `unknown`). The `unknown` bucket only incremented from a *manual* direct
  `ollama_call.sh` test (+1). The herd is not exercising the Ollama executor's trackCall path.

---

## STEP 1 — dev branch

`git checkout dev` **aborted** (uncommitted `SYNC.md` + deleted runtime files in working tree).
To stay READ-ONLY, did not stash/commit. Verified instead that the canonical Day-4.1 files are
identical between local HEAD `c13a18b` and `origin/dev` `8fd3da2`:

```
git diff --stat HEAD origin/dev -- tools/router/{statusline-multi.js,providers/ollama-api.js,ollama_call.sh}
  → (empty: IDENTICAL)
HEAD       = c13a18b50  Wave 19 Day 4.1: token-tracker honesty hot-fix (pre-launch)
origin/dev = 8fd3da2f5  (PR #107 merge)
```

**Day 4.1 canonical content present & correct.** (HEAD diverges from origin/dev at commit level
but the three relevant files match byte-for-byte.)

## STEP 2 — canonical → runtime sync

`/mooter-update` skill is **not available** in this session's skill list. Used the underlying
`tools/router/sync-to-runtime.sh` instead. Dry-run:

```
Result: 0 synced, 31 identical, 0 diverged   (runtime already in sync)
```

Grep counts on runtime `~/.claude/tools/router/`:

| file | pattern | count |
|---|---|---|
| `providers/ollama-api.js` | `trackCall` | **1** ✓ |
| `ollama_call.sh` | `trackCall\|token_tracker` | **2** ✓ |
| `statusline-multi.js` | `T0\|T1\|T2\|T3` | **35** ✓ |

`token_tracker.js` present (6216 B). Day-4.1 trackCall site confirmed at `ollama-api.js:127-133`
and `ollama_call.sh:83-99`.

> ⚠️ **Sync-coverage gap (separate finding):** `providers/ollama-api.js` is **NOT** in
> `sync-to-runtime.sh`'s `SYNC_FILES` list (it lists `openai-api.js`, `codex-cli.js`,
> `_load-env.js` but not `ollama-api.js`). Runtime copy happens to be identical today (same
> mtime), but future canonical edits to `ollama-api.js` will **not** propagate via the sync
> script. Add it to `SYNC_FILES`.

## STEP 3 — sessionId propagation

```
CLAUDE_SESSION_ID       = <EMPTY>
CLAUDE_CODE_SESSION_ID  = 76447f84-e9c5-456e-87f8-476cba5d6902
```

**This is the smoking gun.** Every router file reads `CLAUDE_SESSION_ID` (empty); none reads
`CLAUDE_CODE_SESSION_ID` (populated):

```
ollama_call.sh:92        { sessionId: process.env.CLAUDE_SESSION_ID }
token_tracker.js:111     opts.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown'
statusline-multi.js:912  (stdinJson.session_id) || process.env.CLAUDE_SESSION_ID || null
stop_hook.js:432         sessionId || process.env.CLAUDE_SESSION_ID
```

Readers (statusline, stop_hook) survive because CC passes `session_id` via **stdin JSON**.
The executor (`ollama_call.sh`) has **no stdin** — only env — so it falls through to `'unknown'`.

## STEP 4 — pre-test snapshot

```
/tmp/mooter-tokens-76447f84-...json   (296 B)  ← current session (statusline reads THIS)
/tmp/mooter-tokens-882f7b51-...json   (302 B)  ← prior session
```
Current-session file pre-test: `_transcript.T0 = {calls:0, tokens_in:0, tokens_out:0}` (T3 only).

## STEP 5 — 3× local-summarizer spawns

All 3 returned valid PT-PT output (os-release, lsb-release, hostname/hosts). After all 3:

```
session file _transcript.T0 = {calls:0, tokens_in:0, tokens_out:0}   ← STILL ZERO
/tmp/mooter-tokens-unknown.json  = {_pushed.T0:{calls:1,tokens_in:35,tokens_out:4}}
```

The `unknown` bucket's `calls:1` came **only** from a *manual* direct `ollama_call.sh` test
(`--text "Diz apenas: teste OK"`, exit 0, prompt_eval=35 eval=4). It did **not** increment
across the 3 herd spawns → the herd produced 0 trackCall writes (Bug B). T3 in the session file
grew (27→46 calls) purely from `_transcript` aggregation of the **Opus main-loop** (my own calls).

## STEP 6 — mooter trail

```
🐮 mooter — provenance trail · 481 events
saved        = $17.07   (42%)
last decision= T3 claude-opus-4-6 0.75
tier mix     = last10: T0:0 T1:3 T2:0 T3:7     ← T0:0
```
The 3 spawns were classified **T1** (haiku), not T0, and contributed **no T0** events.

## STEP 7 — Stop digest

Cannot `/quit` programmatically (would end the session; no captured output). Used
`token_tracker.snapshot('76447f84-...')` as the exact data source the Stop digest renders:

```json
{ "T0": {"calls":0,"tokens_in":0,"tokens_out":0,"real":true},
  "T1": {"calls":0,"tokens_in":0,"tokens_out":0,"real":true},
  "T2": {"calls":0,"tokens_in":0,"tokens_out":0,"real":true},
  "T3": {"calls":46,"tokens_in":28133,"tokens_out":41371,"real":true} }
```
**TOKENS BY TIER → T0 = 0.**

---

## STEP 8 — GATES

| Gate | Result | Evidence |
|---|---|---|
| **G1** — Statusline 🪙 T0 > 0 after spawn | ❌ **FAIL** | session file `_transcript.T0.calls=0` across all 3 spawns |
| **G2** — `/tmp/mooter-tokens-*.json` has T0 entries | ❌ **FAIL** | session bucket T0=0; real T0 lands in `unknown` bucket which statusline never reads |
| **G3** — `mooter trail --calls` shows T0 | ❌ **FAIL** | tier mix `T0:0`; spawns classified T1 |
| **G4** — Stop digest TOKENS BY TIER T0 > 0 | ❌ **FAIL** | `snapshot()` T0 calls=0 |
| **G5** — CHOICE REASONS incl. T0 classify_score | ⚠️ **UNVERIFIED** | full Stop digest not renderable (no `/quit`); `last decision = T3`, no T0 classify present |
| **G6** — HARDWARE STATE Q4_K_M + adapter | ⚠️ **UNVERIFIED** | adapter chip exists (`statusline-multi.js:520-523`, placeholder always idle ◌); no `Q4_K_M` quant string rendered anywhere |
| **G7** — HERD local-summarizer × 3 | ✅ **PASS** (with caveat) | 3 spawns ran & returned; BUT 0 of them recorded T0 (Bug B) |
| **G8** — SAVINGS non-zero saved $ | ✅ **PASS** | `saved = $17.07 (42%)` |

### HONEST VERDICT: **2/8 PASS · 4/8 FAIL · 2/8 UNVERIFIED**

The core objective — real Ollama T0 tokens surfacing in the 🪙 chip and Stop digest — **FAILS**.

---

## Day 4.2 — recommended follow-up scope

1. **Fix env-var name (Bug A, root cause).** In `ollama_call.sh:92` and `token_tracker.js:111`
   (and any executor-side reader), resolve session as:
   `process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || 'unknown'`.
   Verify CC v2.1.165 actually exports `CLAUDE_CODE_SESSION_ID` to subagent Bash (confirmed: it does).
2. **Investigate Bug B (herd → executor).** Determine why `local-summarizer` spawns produced 0
   trackCall writes. Likely the Haiku subagent answered tiny summaries directly instead of shelling
   to `ollama_call.sh`, OR the trackCall node block silently failed in the subagent context. Add a
   debug breadcrumb (e.g. append to `/tmp/mooter-trackcall-debug.log`) to confirm the executor is
   reached per spawn.
3. **Add `providers/ollama-api.js` to `sync-to-runtime.sh` `SYNC_FILES`** (currently missing).
4. **G5/G6 rendering:** wire T0 `classify_score` into CHOICE REASONS and render Ollama
   `Q4_K_M` quant in the HARDWARE STATE section (currently only an idle adapter placeholder).
5. **Re-run this validation** after the fix; gate on T0>0 in the session bucket specifically.

---

## Day 4.2 — env-var fix APPLIED + RE-RUN (2026-06-05)

**Change (2 lines, canonical = runtime via symlink `~/.claude/tools/router → /…/frugal/tools/router`):**

```diff
# token_tracker.js:111
- const sessionId = opts.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
+ const sessionId = opts.sessionId || process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || 'unknown';

# ollama_call.sh:92
- { sessionId: process.env.CLAUDE_SESSION_ID }
+ { sessionId: process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID }
```

**Topology note:** `~/.claude/tools/router`, `~/frugal/tools/router`, `~/mooter/tools/router` all
resolve to the same physical dir — editing canonical updates runtime atomically (no copy needed).

**Re-run evidence:**

| Check | Before fix | After fix |
|---|---|---|
| Direct `ollama_call.sh` → bucket | `mooter-tokens-unknown.json` | **session** `mooter-tokens-76447f84` ✓ |
| `unknown` bucket leak | present | **absent** ✓ |
| session `_pushed.T0` | absent (T0=0) | **`{calls:3, tokens_in:361, tokens_out:94, real:true}`** ✓ |
| `snapshot()` T0 (Stop digest source) | `calls:0` | **`calls:3`** ✓ |
| herd `local-summarizer` spawn records T0 | no | **yes** (calls 1→3 after spawn) ✓ |

**Gate re-evaluation:** G1 ❌→✅, G2 ❌→✅, G4 ❌→✅ (real T0 now surfaces in session bucket /
statusline / Stop digest). G8 ✅ unchanged. **Core objective met: T0 > 0 honesty fix is LIVE.**

**Still open (separate from env fix — Day 4.2 follow-ups):**
- **Herd→executor (was "Bug B"):** `local-summarizer` answers some trivial prompts via Haiku
  directly instead of shelling to `ollama_call.sh`; only records T0 when the executor is actually
  reached. Make the agent always shell out (or detect & flag) so T0 tracking is automatic.
- **G3** `mooter trail` tier-mix is decision-classification (decisions.log), independent of token
  recording — spawns classified T1; not flipped by this fix.
- **Sync coverage:** add `providers/ollama-api.js` + `token_tracker.js` to `sync-to-runtime.sh`
  `SYNC_FILES` (both currently missing; only harmless today because the dir is symlinked).
- **G5/G6** rendering (CHOICE REASONS classify_score, HARDWARE Q4_K_M) still unaddressed.

---
*Generated by autonomous validation run, 2026-06-05. READ-ONLY for STEP 1-8; Day 4.2 applied a 2-line env-var fix to token_tracker.js + ollama_call.sh.*
