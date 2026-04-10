# tools/router/ — File Map

All files live flat in this directory because they use `require('./')` and
`path.join(__dirname, ...)` extensively. Moving to subdirectories would break
the runtime hook chain. This README documents the logical grouping instead.

## Core (runtime-critical — called by the hook)

| File | Role |
|---|---|
| `inject_context.js` | UserPromptSubmit hook entry point |
| `classify.js` | Regex classifier (<50ms) |
| `patterns.js` | HIGH_RISK, MED_RISK, LOW_RISK, TRIVIAL patterns |
| `arbiter.js` | Low-confidence arbiter (calls Haiku) |
| `pricing.js` | Per-model pricing table |
| `model-catalog.json` | Model catalog for multi-provider routing |

## Adapters (external calls)

| File | Role |
|---|---|
| `ollama_call.sh` | Direct Ollama call (shell) |
| `ollama_call_node.js` | Direct Ollama call (Node) |
| `anthropic_call.sh` | Direct Haiku/Sonnet API call |
| `hub-push.js` | Privacy-preserving delta push to frugal-hub |
| `hub-pull.js` | Pull community config from frugal-hub |
| `hub-status.js` | Hub health check |

## Analytics (telemetry + tuning)

| File | Role |
|---|---|
| `backtest.js` | Daily analyser + auto-tuning |
| `backtest.test.js` | Unit tests for backtest |
| `replay.js` | Replay decisions.log against current classifier |
| `aggregate-deltas.js` | Multi-user delta aggregator |
| `savings-tracker.js` | HTTP server tracking live savings |
| `stats.js` | Aggregate stats printer |
| `fx.js` | Currency exchange helpers |

## Setup (run-once scripts)

| File | Role |
|---|---|
| `onboarding.js` | First-run hardware detection + profile |
| `setup-profile.js` | Subscription profile setup |
| `check-local-models.js` | Verify Ollama models |
| `gpu-probe.js` | GPU detection (NVIDIA/Apple/AMD/CPU) |
| `install-stop-hook.sh` | Install StopTurn hook |
| `ollama-warmup.js` | Pre-warm Ollama models |

## UI (statusline + turn tracking)

| File | Role |
|---|---|
| `gsd-statusline.js` | 7-segment statusline renderer |
| `gsd-turn-end.js` | StopTurn hook — logs decisions |
| `statusline.sh` | Legacy shell statusline |

## CLI (user commands)

| File | Role |
|---|---|
| `frugal-mode.js` | Beast/Zen/Auto mode CLI |
| `refresh-budget.js` | Refresh OAuth budget cache |
| `update-router.js` | Apply backtest tuning to classify.js |

## Bench (performance testing)

| File | Role |
|---|---|
| `bench-hook.js` | Hook latency benchmark |
| `benchmark.sh` | Full benchmark suite |
| `run-backtest.cmd` | Windows scheduled task entry |
