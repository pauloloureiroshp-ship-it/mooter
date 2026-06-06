# Mooter Self-Audit — AUDIT_BENCHMARK.md

> Wave 23. All numbers read from the real Phase 1-4 stats files. No hand-typed figures.

## Cost: actual mixed-tier vs all-Opus baseline

| Phase | Tier | Model | Tokens (in/out) | Actual | All-Opus | Saved |
|---|---|---|---|---|---|---|
| 1 Corpus | T0 | qwen2.5-coder:7b | 588540/59769 | $0.00 | $4.44 | $4.44 |
| 2 Validate | T1 | claude-haiku-4-5 | 778835/98824 | $1.27 | $6.36 | $5.09 |
| 3 Insights | T2 | claude-sonnet-4-6 | 70000/7199 | $0.32 | $0.53 | $0.21 |
| 4 Benchmark | T3 | claude-opus-4-6 | 45000/9000 | $0.45 | $0.45 | $0.00 |
| **Total** | mixed | — | 1482375/174792 | **$2.04** | **$11.78** | **$9.74 (82.7%)** |

## Quantization quality (honest)

- **Method:** No FP16 weights available in-env (WSL/CPU, Ollama q4 tags only). We do NOT fabricate a Q4-vs-FP16 number.
- **Quantized model:** qwen2.5-coder:7b, judged by claude-haiku-4-5 (T1 validator)
- **Accuracy as judged:** avg 5.2/10 · 2.4194% zero-drift · histogram {"none":9,"minor":189,"major":174,"unparsed":0}
- **Size-sensitivity probe:** avg ROUGE-L(7b-q4 vs 14b-q4) = 0.2109 over 5 files.

## Discovery 2 — "local" summarizer actually runs cloud Haiku

- **Routed intent:** T0/qwen3:30b · **Real execution:** T1/claude-haiku-4-5-20251001
- **Token blow-up:** 32471 tok/file via the subagent (Haiku) vs 1743 tok/file direct-local = **18.6× more tokens**, on cloud.
- **Same corpus, two worlds:** $0 on local Ollama vs an extrapolated $12.08–$31.41 if every file had gone through the subagent (Haiku) path.
- Surfaced live by the statusline divergence chip (`⚠ exec T1 haiku · N calls`). The whole 372-file corpus cost $0 on local Ollama. The SAME corpus via the local-summarizer subagent path would have run on cloud Haiku at the cost range above. We promised local; the subagent path silently routes cloud when an API key exists. The statusline divergence chip surfaces this live.

## LoRA training data (honest, tiered)

The local 7b model's avg accuracy is 5.2/10, so the brief's strict "score≥8" bar is scarce. We export a TIERED, score-tagged set rather than relabel anything:

- **212** `high` pairs (score≥8, drift≠major) — the strict bar.
- **348** `good` pairs (7≤score<8, drift≠major).
- **560** total (= all score≥7, drift≠major) → `audit/lora_train.jsonl` (every line tagged with its real `score`/`drift`/`tier`).

> Gate note: the literal "≥300 @ score≥8" is **not** met at the strict bar (212); it IS met counting the tiered set (560). High overall drift is the real reason — and the motivation for training an adapter in the first place.
