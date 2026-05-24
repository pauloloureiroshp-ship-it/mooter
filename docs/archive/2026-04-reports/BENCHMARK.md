# Latency benchmark — v0.7

> **tl;dr** — The `UserPromptSubmit` hook went from ~3s p50 in v0.6.1 to **113ms p50** in v0.7. A cross-session classify cache, async budget refresh, and Ollama keep-alive warmup did the heavy lifting. All three v0.7 targets are met on real hardware.

## Methodology

The `bench-hook.js` harness runs a mix of canonical prompts through the actual `inject_context.js` hook via `spawnSync`, measuring wall-clock time end-to-end including:

- Node cold start (~30ms)
- stdin payload read
- Tracker pid-file check
- Classify cache lookup (new in v0.7)
- `classify.js` spawn (on miss only)
- Budget fetch (now async)
- Option A Ollama pre-compute (short T0 prompts only)
- Hint emission

```bash
node tools/router/bench-hook.js --iters 5          # quick smoke
node tools/router/bench-hook.js --iters 20         # standard run
node tools/router/bench-hook.js --iters 50 --warm-first   # stable p50/p95/p99
```

Default prompt mix exercises all four paths: cached hit, cold classify, quality-intent promotion, and sub-tier code routing.

## v0.7 numbers (50 samples, RTX 4090, Windows 11)

```
Total samples:  50
Total wall:     10536 ms (210.7 ms/sample incl. spawn)
Hint bytes avg: 617

avg:  210.7 ms
p50:  112.8 ms    ← target <200ms  ✓
p95:  406.8 ms    ← target <500ms  ✓
p99:  1845.6 ms   ← target <4000ms ✓
max:  1845.6 ms
```

The p99 spike is almost always a cold `classify.js` spawn on a prompt that was never cached — unavoidable because the first turn in a session has nothing to cache against yet. After warm-up, p99 drops below p95.

## What v0.6.1 looked like (pre-v0.7 baseline)

Based on the audit in `.planning/latency-audit.md` (agent-generated, Phase 1 of v0.7 research):

| Stage | v0.6.1 blocking ms | v0.7 blocking ms | Notes |
|---|---:|---:|---|
| stdin read | 0-2 | 0-2 | unchanged |
| Tracker health check | 0-500 | 1-3 | TCP connect → fs.stat |
| classify.js spawn | 50-200 | 5-10 (cache hit) · 50-200 (miss) | cross-session cache skips respawn |
| Budget fetch | 0-3000 | 0-1 (fresh) · 1-3 (async refresh spawn) | async by default |
| Option A Ollama | 0-9000 | 0-2000 | keep-alive + reduced timeout |
| **Total (cache hit)** | **~3200-12700** | **~10-50** | |
| **Total (cache miss, warm Ollama)** | **~3200-5000** | **~100-400** | |
| **Total (cold everything)** | **~12000** | **~2000** | worst-case Option A on first turn |

## Feature flag rollback

If anything regresses, set `FRUGAL_V07_DISABLE=1` in the environment and the hook reverts to v0.6.1 behaviour (sync budget, no cache, no quality intent suppression). Useful for A/B comparison:

```bash
# Baseline (v0.6.1 behaviour)
FRUGAL_V07_DISABLE=1 node tools/router/bench-hook.js --iters 20

# v0.7
node tools/router/bench-hook.js --iters 20
```

## Reproducing

1. Pull frugal v0.7 and re-run the installer.
2. `ollama serve` must be running (warmup targets `localhost:11434`).
3. `qwen2.5:3b` must be pulled: `ollama pull qwen2.5:3b`.
4. Run `node tools/router/bench-hook.js --iters 20`.

Results vary by disk (cache lookups are IO-bound) and Ollama VRAM state. On an RTX 4090 with `OLLAMA_KEEP_ALIVE=-1` set, the numbers above are reproducible within ±15%.

## Related

- [COST_MODEL.md](COST_MODEL.md) — how v0.6 measures $USD savings
- [REAL_CORPUS_VALIDATION.md](REAL_CORPUS_VALIDATION.md) — the 1,370-prompt corpus replay
- [ROUTING_POLICY.md](ROUTING_POLICY.md) — tier → model mapping
