# `mooter audit fan-out` — runbook (Wave 34)

Parallel, local-first codebase audit. Each **facet** probes a slice of the repo
(read-only) and sends the evidence to a **FREE local Ollama worker**; all facets
run in parallel. With `--max-cost > 0`, a single cloud call synthesizes the
findings. A markdown report lands in `audit/fan_out_<ts>.md`.

## Quick start

```bash
# default: all 6 facets, local-only (free), writes audit/fan_out_<ts>.md
mooter audit fan-out

# one facet, custom output path
mooter audit fan-out --facets packages --out /tmp/pkg-audit.md

# enable a single cloud synthesis (Sonnet) — needs ANTHROPIC_API_KEY
mooter audit fan-out --max-cost 0.50

# machine-readable
mooter audit fan-out --json
```

## Facets

| Facet | Probes (read-only) | Asks the worker |
|---|---|---|
| `install` | `install.sh`, `install.ps1` | idempotency · no blind sudo · dry-run · graceful degradation |
| `classify` | `tools/router/classify.js` + `.sha256` (**read-only**, never written) | tier doctrine T0–T3 · sha-gate integrity |
| `statusline` | `tools/router/statusline-multi.js`, `statusline-modes.js` | mode coherence · chip honesty · latency |
| `mlwr` | `tools/router/mlwr-status.js`, `packages/validation/src/benchmark/mlwr.ts` | win-rate vs objective floor · freshness · honesty |
| `routing` | `tools/router/patterns.js`, `_model-resolver.js` | tier-escalation soundness · HIGH_RISK false positives · single-source-of-truth |
| `packages` | every `packages/*/package.json` | package boundaries · native deps · CLI load-safety |

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--facets <csv>` | all 6 | subset to run (unknown names → exit 1 + valid list) |
| `--max-cost <usd>` | `0` | `> 0` enables ONE cloud synthesis call; `0` = local-only, free |
| `--concurrency <n>` | `4` | parallel local workers |
| `--model <m>` | `qwen2.5-coder:7b` | local Ollama worker model |
| `--out <path>` | `audit/fan_out_<ts>.md` | report destination |
| `--no-write` | off | skip writing the report (stdout summary only) |
| `--json` | off | emit the full report object as JSON |
| `--strict` | off | exit 1 if any facet failed (e.g. Ollama down) |

## Cost & privacy

- **Local-only by default.** Workers hit Ollama at `$OLLAMA_HOST` (default
  `127.0.0.1:11434`); local runs cost **$0** and your code never leaves the box.
- The single cloud synthesis runs **only** with `--max-cost > 0` **and** an
  `ANTHROPIC_API_KEY`. Without the key it is skipped (the report says so).
- If Ollama is unreachable, each facet records a graceful `ollama unreachable`
  note and the report still writes with the gathered evidence.

## Design notes

- The command is **self-contained** in the CLI bundle — it does NOT import
  `@mooter/workflow` (whose native deps + `createRequire` paths break once
  bundled into the zero-runtime-deps CLI; see CI #128). The ~30-line Ollama/
  Anthropic callers live in `packages/cli/src/audit/orchestrator.ts`.
- `classify.js` is **only ever read** by the `classify` facet — the facet IO has
  no write capability by construction (enforced by a test).
- Everything is injectable (`root`, `worker`, `io`, `nowMs`) so the suite runs
  with zero network and writes only into a temp dir.

## Files

- `packages/cli/src/commands/audit.ts` — CLI surface
- `packages/cli/src/audit/facets.ts` — the 6 read-only probes
- `packages/cli/src/audit/orchestrator.ts` — fan-out + self-contained workers
- `packages/cli/src/audit/report.ts` — markdown writer
- `packages/cli/tests/audit.test.ts` — 8 tests (zero network)
