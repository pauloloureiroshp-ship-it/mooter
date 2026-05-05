# providers/

Multi-vendor wrappers for the Mooter router. Each file is a thin, dependency-free adapter that the classifier and execution path can call to talk to a specific provider.

## What lives here

| File | Role |
|---|---|
| `_load-env.js` | Tiny dotenv-style loader. Tries `~/.claude/tools/router/.env` first, then falls back to the canonical `frugal/tools/router/.env`. Never overwrites a pre-set process.env var. |
| `codex-cli.js` | Wraps `codex exec` (OpenAI Codex CLI). Authenticates via the user's ChatGPT subscription — never via `OPENAI_API_KEY`. |
| `openai-api.js` | Direct OpenAI Chat Completions wrapper using `fetch`. Uses `OPENAI_API_KEY` from `.env`. |
| `CODEX_CLI_NOTES.md` | Field notes from the integration: install paths, auth states, quota detection strategy. |
| `providers.test.js` | Unit tests. No network, no real CLI calls. |

## Contract every wrapper must follow

1. **Export at least `isAvailable()` and one call function.**
   - `isAvailable()` returns `{ available: boolean, reason?: string }` or just a boolean.
   - The call function returns `{ ok: true, text, … }` on success or `null` on any failure (auth, quota, timeout, network).
2. **Return `null` — never throw — on a soft failure.** The router walks the `suggested_providers` list until one returns non-null. A throw breaks the chain.
3. **Side-effect: update `quota-tracker`.** After a successful or quota-exhausting call, append usage via `tracker.recordUsage(provider, payload)`. Best-effort — wrap in try/catch and ignore failures so a stale state file never breaks classification.
4. **No npm dependencies.** Use Node built-ins (`child_process`, `fs`, `fetch`). The router stays install-free.
5. **English in code, PT-PT in comments where context helps.**

## How the router consumes this

```text
classify.js → result.suggested_providers = ['codex_cli', 'sonnet']
inject_context.js → emits the list in the <router-hint> block
main session → walks the list, calling each provider's wrapper
```

`suggested_providers` is **advisory**. The consumer can override (e.g. user pinned a model). T3 always stays on Opus regardless of quota.

## Adding a new provider

1. Drop `providers/<name>.js` exporting `callX(prompt, opts)` and `isAvailable()`.
2. Add a new key to `quota-tracker.js` (`PROVIDERS`, `defaultState`, `recordUsage` switch).
3. Add the key to the `getSuggestedProviders` switch in `classify.js`.
4. Add a unit test in `providers.test.js`.
5. Update this README.

No other file in the router needs to know.
