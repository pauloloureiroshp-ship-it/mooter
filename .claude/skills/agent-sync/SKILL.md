---
name: agent-sync
description: Keep Claude Code, Codex, Roo/Gemini and local Ollama aligned through the Mooter agent sync ledger.
---

# Agent Sync

Use this skill whenever work crosses agents, providers, PRs, waves, or local
Moo workers.

## Read Before Acting

1. Read `_handoff/agent-sync/latest.md` if it exists.
2. Read `_handoff/agent-context/bundle.md` if it exists.
3. Run the read-only local bootstrap gate:

   ```sh
   node tools/router/agent-sync-ledger.js doctor --remote --strict
   ```

   It verifies canonical device identity, frozen classifier, installed runtime,
   Stop hook wiring, local vault, registry and auto-publish without changing them.
4. Read `$VAULT_PATH/00-core/agent-sync-protocol.md` and run
   `vault-status --remote --strict` when the private vault is mounted. Do not interpret
   a local event audit as fleet coverage.
5. Validate any risky claim against code, git and the active handoff.

## Record After Checkpoints

After a meaningful prompt, handoff, PR, wave or release checkpoint, append a
compact event:

```sh
node tools/router/agent-sync-ledger.js record \
  --agent claude-code \
  --provider anthropic --model claude-code --channel subscription \
  --kind sync \
  --cadence checkpoint \
  --status in_progress \
  --started-at "<measured ISO timestamp>" \
  --ended-at "<measured ISO timestamp>" \
  --evidence code,doc \
  --summary "what changed or what was learned" \
  --next "next concrete action"
```

Use `--cadence prompt` for lightweight prompt-level sync, `--cadence pr` for PR
boundaries and `--cadence wave` for wave boundaries.

At the session boundary, validate and publish:

```sh
node tools/router/agent-sync-ledger.js audit --window 1 --strict
node tools/router/agent-sync-ledger.js publish-vault --vault "$VAULT_PATH" --window 1 --strict
node tools/router/agent-sync-vault-git.js sync --vault "$VAULT_PATH"
node tools/router/agent-sync-ledger.js vault-status --vault "$VAULT_PATH" --remote --strict
```

The private vault stores one immutable receipt per event/device. Exact timing
may remain `n/d` when the host cannot measure it. Identity, provider, model,
channel and device may not be guessed. `VAULT_LOCAL=pass` is not proof of
remote Git sync; only the append-only Git publisher or connector evidence can
report `VAULT_REMOTE=pass`.
`READINESS=fail` blocks a claim that the fleet is synchronized.

Project identity is resolved in this order: explicit `--project`, repo
`.agent-sync.json`, `origin` basename, environment fallback, directory basename.
This prevents a global Mooter default from mislabelling work in another repo.
Enrollment is explicit through
`$VAULT_PATH/00-core/agent-sync-registries/<project>.json`; do not claim an
unenrolled repo or pending device is synchronized.

## Delegate With Briefs

When handing work to Codex, Roo/Gemini or a local Moo, create a typed brief:

```sh
node tools/router/agent-sync-ledger.js brief \
  --from claude-code \
  --to codex,gemini-roo,ollama \
  --task "scoped task" \
  --context "what the next agent must know" \
  --files "file-a.md,file-b.js" \
  --acceptance "proof required,blockers to report" \
  --guard "do not edit tools/router/classify.js"
```

This writes `_handoff/agent-sync/briefs/<event-id>-<agent>.md`. Pass those brief
files to local Moos instead of assuming they share Claude Code memory.

## Test The Flow

Run the offline simulation when changing sync rules or validating a handoff:

```sh
node tools/router/agent-sync-ledger.js simulate
```

This creates a local four-agent flow (`claude-code -> codex -> gemini-roo ->
ollama`) without calling external models or live connectors. It should also
verify targeted brief prompts.

## Rules

- Do not record prompt/code contents that are not already in the repo.
- Do not claim tests passed unless they actually ran.
- Do not touch `tools/router/classify.js`.
- Use `blocked` or `needs_human` honestly when Paulo or another agent must act.
- Keep the event short; the ledger is a pointer layer, not a transcript dump.
- The host/orchestrator records local Ollama work after it receives the result;
  never ask a stateless local model to write Git or the vault.
- Never edit an existing vault receipt; issue a new event with `--parent <id>`.
- A suspected secret blocks publication. Do not weaken or bypass that guard.
- The Git publisher may stage only new `30-learnings/agent-sync/**` files. Any
  human-managed vault change, edited receipt or non-mechanical divergence blocks it.
- Record `--channel local|subscription|api|cloud` when verified; otherwise omit it.
- Use common event kinds: `sync`, `intent`, `brief`, `turn`, `decision`,
  `artifact`, `gate`, `handoff`, `outcome`, `review`, `blocker`.
- Use concrete evidence tags: `code`, `test`, `git`, `doc`, `handoff`,
  `notion-export`, `obsidian-vault`, `runtime`, `connector`, `inference`.
