# Mooter Showcase Benchmark v2 — Report
Generated: 2026-06-07T16:46:59Z
Tasks: 24 · models: qwen3:30b, claude-haiku-4-5-20251001, claude-sonnet-4-6 · runs/task: 1

> Mooter Showcase Benchmark v2 — 24 tasks across 8 segments, tier-labelled. `check` grades the routed model output objectively (regex) so MLWR needs no judge where possible; subjective tasks fall back to an LLM judge.
## MLWR (Mooter Locality Win Rate) — local routed model meets the objective bar
| Tier | pass | total | MLWR |
|------|------|-------|------|
| T0 | 6 | 6 | 100% |
| T1 | 6 | 6 | 100% |
| T2 | 6 | 6 | 100% |
| T3 | 6 | 6 | 100% |
| **overall** | — | 24 | **100%** |
Local cost: $0.0000 · cloud cost: $0.1327
## Per-model pass rate
| Model | pass | total | rate | cost |
|-------|------|-------|------|------|
| qwen3:30b | 24 | 24 | 100% | $0.0000 |
| claude-haiku-4-5-20251001 | 24 | 24 | 100% | $0.0327 |
| claude-sonnet-4-6 | 24 | 24 | 100% | $0.1000 |
## Reliability
- total runs: 72
- errors/skips: 0
## Interpretation (honest)

MLWR here is the **objective floor**: the local model output contains the expected keyword/regex per task. A 100% MLWR means qwen3:30b cleared that floor on every task — NOT a token-for-token quality-parity claim. The bar is permissive by design, so it under-discriminates on T2/T3. Spot-checks show the local T3 answers are genuinely substantive (the multi-user-vault design covers auth/isolation/migration with explicit trade-offs), but for a defensible parity claim run the **blinded judge** variant (local vs always-cloud, `judge.ts`). This run = 1 run/task × 3 models (qwen3:30b, Haiku, Sonnet); the full reproducible target is 24×5×3 = 360 with Opus + a 3-judge panel.
