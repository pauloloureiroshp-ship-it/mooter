# Codex CLI — Integration Notes

> Findings from Task #1 of CODEX_INTEGRATION_MASTER.md
> Captured on the Mooter dev box (Windows 11, npm-installed Codex CLI).

## Installation

- Binary: `codex` (and `codex.cmd` on Windows)
- Location: `%APPDATA%\npm\codex` (resolves via PATH)
- Version: **0.118.0** (`codex-cli 0.118.0`)
- Install method: `npm install -g @openai/codex`

## Authentication

- Status command: `codex login status`
- Current state: **`Logged in using ChatGPT`** (OAuth via ChatGPT subscription, not API key)
- Re-auth: `codex login` (interactive); logout via `codex logout`
- Optional API-key mode: `printenv OPENAI_API_KEY | codex login --with-api-key`
  - We deliberately stay on the ChatGPT OAuth path so usage bills against the
    Plus/Pro subscription instead of metered API tokens. The router only falls
    back to direct OpenAI API (Task #3 `openai-api.js`) when Codex CLI quota
    is exhausted.

## Non-interactive invocation (the form the router will use)

```bash
codex exec "<prompt>"                  # stdout = response text
echo "<prompt>" | codex exec -         # via stdin (use "-" as PROMPT)
codex exec -m gpt-4o "<prompt>"        # pin a specific model
codex exec -s read-only "<prompt>"     # restrict sandbox (no shell exec)
codex exec --skip-git-repo-check ...   # bypass git-repo guard if needed
```

Notes for the wrapper:
- `codex exec` (alias `codex e`) is the non-interactive entry point.
- Defaults to the model configured in `~/.codex/config.toml` if `-m` is omitted.
- Sandbox flag `-s read-only` is the safest default for "give me an answer"
  prompts where we don't want Codex executing shell commands.
- Exit code is non-zero on quota exhaustion / auth failure → wrapper checks
  `code !== 0` and returns `null` so the router can fall through to the next
  provider in `suggested_providers`.

## Quota / status discovery

The CLI does **not** expose a first-class `codex quota` command in 0.118.0.
Signals we can use to estimate remaining quota:

1. **Login status** — `codex login status` confirms session is alive but does
   not return numeric quota.
2. **Error parsing on exhaustion** — when the ChatGPT 5-hour window runs out,
   `codex exec` exits non-zero with a message containing strings like
   `rate limit`, `quota`, `5 hour`, or `weekly limit`. The wrapper greps stderr
   for these tokens and marks the provider exhausted in `quota-state.json`
   until the documented reset window elapses.
3. **Heuristic counter** — `quota-tracker.js` tracks `messages_used` in the
   rolling 5h window and assumes a conservative limit (default 150 for Plus,
   overridable per-user). This is advisory; the authoritative signal is the
   error path in (2).

When OpenAI ships a richer status endpoint we can swap the heuristic for a
real API call without touching the router contract.

## Plan-by-plan limits (per OpenAI public docs, captured 2026-05)

| Plan | Approx. messages per 5h | Weekly cap |
|---|---|---|
| ChatGPT Plus ($20/mo)   | 300–1,500 | yes (varies) |
| ChatGPT Pro ($200/mo)   | ~5,000+   | very high |
| Free                    | ~10–20 (GPT-3.5 only) | n/a |

We default `quota-state.json` to Plus assumptions; the user can override via
`MOOTER_CODEX_5H_LIMIT` env var (read by `quota-tracker.js`).

## Decisions for the router

- **Use `codex exec`** (not interactive TUI) for all router-driven calls.
- **Default sandbox**: `read-only` for analysis prompts; `workspace-write`
  only when the wrapper is explicitly told to allow edits (future feature,
  not in this integration sprint).
- **Default model**: leave unset and let `~/.codex/config.toml` decide unless
  classification needs `o3` for reasoning-heavy code tasks.
- **Failure mode**: wrapper returns `null` (with reason in stderr capture) →
  classifier already has the next provider in `suggested_providers`, so the
  router-hint consumer just walks down the list.

## Verified locally on 2026-05-05

```text
$ codex --version
codex-cli 0.118.0

$ codex login status
Logged in using ChatGPT

$ where codex
C:\Users\Paulo Loureiro\AppData\Roaming\npm\codex
C:\Users\Paulo Loureiro\AppData\Roaming\npm\codex.cmd
```
