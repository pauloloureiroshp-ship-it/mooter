# Mooter Agent Sync

Roo/Gemini is part of the Mooter multi-agent team. Before acting:

1. Read `_handoff/agent-sync/latest.md` if it exists.
2. Read `_handoff/agent-context/bundle.md` if it exists.
3. Run `node tools/router/agent-sync-ledger.js doctor --remote --strict`. This gate is
   read-only and fails when device identity, runtime/hook wiring, vault,
   registry or auto-publish is missing.
4. Read `$VAULT_PATH/00-core/agent-sync-protocol.md` and run
   `vault-status --remote --strict` when the private vault is mounted.
5. Validate docs and handoffs against code before proposing changes.

After a meaningful prompt, handoff, PR, wave or review checkpoint, record one
compact event:

```sh
node tools/router/agent-sync-ledger.js record \
  --agent gemini-roo \
  --provider google --model gemini --channel cloud \
  --kind review \
  --cadence checkpoint \
  --status in_progress \
  --started-at "<measured ISO timestamp>" \
  --ended-at "<measured ISO timestamp>" \
  --evidence doc,code \
  --summary "what changed or what was learned" \
  --next "next concrete action"
```

If Roo/Gemini is delegating to Codex, Claude Code or a local Moo, create a typed
brief instead of relying on prose memory:

```sh
node tools/router/agent-sync-ledger.js brief \
  --from gemini-roo \
  --to codex,ollama \
  --task "scoped review or extraction task" \
  --context "shared facts from latest.md and files inspected" \
  --files "file-a.md,file-b.js" \
  --acceptance "evidence required,uncertainty named" \
  --guard "do not edit tools/router/classify.js"
```

When validating the cross-agent protocol, run the offline smoke test:

```sh
node tools/router/agent-sync-ledger.js simulate
```

It should report `SIMULATION=pass` and generate a temporary flow for
`claude-code`, `codex`, `gemini-roo` and `ollama` without calling external
models or live connectors. It also checks targeted brief prompts.

At the end of a meaningful session:

```sh
node tools/router/agent-sync-ledger.js audit --window 1 --strict
node tools/router/agent-sync-ledger.js publish-vault --vault "$VAULT_PATH" --window 1 --strict
node tools/router/agent-sync-vault-git.js sync --vault "$VAULT_PATH"
node tools/router/agent-sync-ledger.js vault-status --vault "$VAULT_PATH" --remote --strict
```

Hard rules:

- Never edit `tools/router/classify.js`.
- Never fabricate metrics, test results or benchmark numbers.
- Keep generated sync state under `_handoff/agent-sync/`.
- Treat local Ollama models as stateless unless context is explicitly supplied.
- The invoking host records the local model/provider/channel and outcome; the
  stateless model never writes Git or the vault directly.
- Vault receipts are immutable and per-event/device. Never overwrite one.
- `EVENT_AUDIT` validates observed events only; only `READINESS=pass` proves
  registered device/surface coverage.
- Local vault projection never proves remote Git sync.
- Project identity comes from explicit config/remote before any global fallback;
  an enrolled repo has a project registry in the vault.
- The vault Git publisher stages only new `30-learnings/agent-sync/**` receipts
  and fails closed on every human-managed or mutable change.
- Never bypass a secret-detection or identity-validation failure.
- Record `--channel local|subscription|api|cloud` only when the execution path is known.
- If docs, code and handoffs conflict, name the contradiction.
- Use shared event kinds: `sync`, `intent`, `brief`, `turn`, `decision`,
  `artifact`, `gate`, `handoff`, `outcome`, `review`, `blocker`.
- Use evidence tags only when true: `code`, `test`, `git`, `doc`, `handoff`,
  `notion-export`, `obsidian-vault`, `runtime`, `connector`, `inference`.
