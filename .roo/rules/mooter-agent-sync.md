# Mooter Agent Sync

Roo/Gemini is part of the Mooter multi-agent team. Before acting:

1. Read `_handoff/agent-sync/latest.md` if it exists.
2. Read `_handoff/agent-context/bundle.md` if it exists.
3. Validate docs and handoffs against code before proposing changes.

After a meaningful prompt, handoff, PR, wave or review checkpoint, record one
compact event:

```sh
node tools/router/agent-sync-ledger.js record \
  --agent gemini-roo \
  --provider google --model gemini --channel cloud \
  --kind review \
  --cadence checkpoint \
  --status in_progress \
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

Hard rules:

- Never edit `tools/router/classify.js`.
- Never fabricate metrics, test results or benchmark numbers.
- Keep generated sync state under `_handoff/agent-sync/`.
- Treat local Ollama models as stateless unless context is explicitly supplied.
- Record `--channel local|subscription|api|cloud` only when the execution path is known.
- If docs, code and handoffs conflict, name the contradiction.
- Use shared event kinds: `sync`, `intent`, `brief`, `turn`, `decision`,
  `artifact`, `gate`, `handoff`, `outcome`, `review`, `blocker`.
- Use evidence tags only when true: `code`, `test`, `git`, `doc`, `handoff`,
  `notion-export`, `obsidian-vault`, `runtime`, `connector`, `inference`.
