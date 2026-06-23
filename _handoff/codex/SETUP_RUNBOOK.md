# SETUP_RUNBOOK — OpenAI account + Codex CLI (the human-side steps)

> Do these once. Everything here is verified against developers.openai.com/codex and npm `@openai/codex` (2026-06-21).
>
> ⚠️ **State of play (from `tools/router/providers/CODEX_CLI_NOTES.md`):** Codex CLI **0.118.0 is already
> installed** on your box and **already logged in via ChatGPT OAuth**. The router fallback `codex-cli.js`
> uses that OAuth on purpose (bills against your ChatGPT subscription). **Keep it.** This runbook only
> **adds an API key** so the *parallel worker plane* runs metered — without touching the OAuth session.
> Auth model: **OAuth stays the default; `CODEX_API_KEY` is injected per `codex exec` run** for metered workers.

## 1. OpenAI account + billing
1. Sign in at `platform.openai.com`. Make sure billing is enabled (API key auth = usage-based pay-per-token; this is separate from any ChatGPT subscription).
2. Create a key: `platform.openai.com/api-keys` → **Create new secret key**. Name it `mooter-codex`. Copy it (shown once).
3. ⚠️ Treat the key like a password. Do not paste it into the repo, a prompt, or any committed file.

## 2. Put the key in your environment (Windows, your primary box)
```powershell
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY','sk-REPLACE_ME','User')
# open a NEW terminal so the var is loaded
$env:OPENAI_API_KEY.Substring(0,7)   # sanity check -> "sk-..."
```
(macOS/Linux: add `export OPENAI_API_KEY=sk-...` to your shell rc.)

## 3. Codex CLI — already installed; just verify
```powershell
codex --version            # expect codex-cli 0.118.0 (or newer)
codex login status         # expect: Logged in using ChatGPT  -> LEAVE IT
# Only if missing: npm install -g @openai/codex
#   or Windows: powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
#   or mac/linux: curl -fsSL https://chatgpt.com/codex/install.sh | sh   (brew install --cask codex)
# To update later: npm update -g @openai/codex
```

## 4. Do NOT switch the login — keep OAuth, meter per-run
```powershell
# ❌ Do NOT run `codex login --with-api-key` — it would overwrite the OAuth session
#    that the cheap router fallback (codex-cli.js) relies on.
# ✅ Metered parallel runs override auth for that run only, via CODEX_API_KEY:
$env:CODEX_API_KEY = $env:OPENAI_API_KEY        # the Mooter runner sets this per child process
codex exec --json -m gpt-5.3-codex "ping"       # this single run bills the API key, OAuth stays default
```
Result: OAuth (subscription) for cheap single-turn fallback **and** API key (metered) for parallel workers — coexisting.

## 5. Drop the Mooter config
- Copy `scaffold/config.toml` → `~/.codex/config.toml` (i.e. `C:\Users\Paulo Loureiro\.codex\config.toml`). Edit the `[mcp_servers.mooter]` command if `mooter mcp` isn't the right entry (check `mooter --help`).
- Copy `scaffold/agents/mooter-explorer.toml` and `scaffold/agents/mooter-worker.toml` → `~/.codex/agents/`.

## 6. Prove the lossless handoff (the important test)
From `~/frugal`:
```powershell
codex exec --sandbox read-only "Summarize the hard invariants in AGENTS.md and CLAUDE.md, and state the frozen classify.js sha256."
```
✅ Codex must echo the **real** invariants and the sha `427d8c0b…`. That confirms Codex reads the same
brain as Claude Code — the precondition for a perfect handoff. If it does, hand the master prompt
(`MOOTER_CODEX_MASTERPROMPT.md`) to Claude Code and run Wave 62.1 onward.

## Cost & safety notes
- API-key usage is billed per token; the Mooter ledger will show real Codex spend after Wave 62.2.
- Never set `OPENAI_API_KEY`/`CODEX_API_KEY` as a job-level env var in workflows that run untrusted/repo-controlled code (OpenAI's own warning).
- `codex exec` defaults to a **read-only** sandbox; the Mooter runner opts up to `workspace-write` only inside the isolated worktree.
- Do NOT flip any `gpt-*` price to `pricing_status:"active"` until verified against `developers.openai.com/api/docs/pricing` — the auto-route gate depends on it.
