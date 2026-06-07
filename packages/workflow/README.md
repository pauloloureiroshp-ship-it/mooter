# @mooter/workflow

Local-first **dynamic workflow engine** for Mooter — the materialization of
`ARCHITECTURE_V4.md` skill-graph decomposition (Layer 9/10). One natural-language
prompt becomes N subtasks, each routed to the right worker, executed as a DAG.

**Differentiator vs Anthropic Dynamic Workflows:** workers are **Ollama local**
(`qwen2.5-coder:7b`, …) instead of cloud Sonnet/Opus, so a run costs ~$0.45
(only the Opus script-writer + synthesis) instead of $30–$300, the code never
leaves the machine, and runs **resume across sessions** via a SQLite checkpoint
store.

## Status — Wave 28

**Phase A + B complete (skeleton).** Every module under `src/` is a
signature-only stub that throws `NotImplementedError(feature, phase)` and carries
zero load-time dependency on the heavy/native packages declared in
`package.json` (`isolated-vm`, `better-sqlite3`, `ink`, …). Those are wired up in
later phases:

| Module | Phase | Purpose |
|---|---|---|
| `src/agent.ts` | C | `agent()` API — Ollama / Claude-API backends |
| `src/pool.ts` | C | concurrency manager (`p-limit` + `vram_detect.js`) |
| `src/primitives.ts` | D | `parallel` · `vote` · `converge` · `checkpoint` · `log` |
| `src/runtime.ts` | E 🔒 | sandboxed VM (`isolated-vm`, **not** vm2) |
| `src/state.ts` | F | SQLite checkpoint store (cross-session resume) |
| `src/writer.ts` | G | NL → workflow script (Opus, 1 call) |
| `src/presenter.ts` | G | plan presentation + approval |
| `src/tui.ts` | H | `ink` progress UI (`mooter workflow watch`) |
| `src/index.ts` | — | public entry / re-exports / phase status |

## Canonical references

- Brief: [`docs/strategy/WAVE28_WORKFLOW_ENGINE_KICKOFF.md`](../../docs/strategy/WAVE28_WORKFLOW_ENGINE_KICKOFF.md)
- Design doc: [`docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md`](../../docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md)
- Day 0 recon: [`docs/strategy/WAVE28_DAY0_FINDINGS.md`](../../docs/strategy/WAVE28_DAY0_FINDINGS.md)
- V4 reference: `docs/strategy/ARCHITECTURE_V4.md` §2.4 / §3.3 (Layer 9 — skill graph)

## Test

```bash
cd packages/workflow && npm test          # after Phase C `npm install`
# this session (no node_modules yet): ../cli/node_modules/.bin/tsx --test tests/*.test.ts
```
