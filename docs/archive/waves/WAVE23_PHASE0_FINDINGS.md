# Wave 23 Phase 0 — Findings

> Setup + v167 SubagentStop recapture + audit infrastructure. 2026-06-06.

## Key findings (TL;DR)

1. **No v167 regression.** The CC v2.1.167 SubagentStop payload is backward-compatible
   with the Wave 22 22.A hook — same `agent_id`/`agent_type`/`agent_transcript_path`/
   `session_id`, plus 3 additive keys (`last_assistant_message`, `background_tasks`,
   `session_crons`). The herd writer fired correctly end-to-end. **No hook fix shipped**
   — fabricating one would violate the honesty foundation. Schema in
   [`WAVE23_PHASE0_V167_SCHEMA.md`](./WAVE23_PHASE0_V167_SCHEMA.md).
2. **Discovery 2 confirmed LIVE in v167.** `local-summarizer` routes T0/qwen3:30b but
   executes T1/claude-haiku-4-5 (4 wrapper calls). Statusline renders `⚠ exec T1 haiku · 4 calls`.
3. **🐄 chip works.** Herd file → `subagent_tracker.snapshot()` → statusline render all
   green. Validation gate item "🐄 chip works in CC v167" already PASS.

## Execution-model decision (Paulo, AskUserQuestion)

400 subagent spawns through the orchestrator is infeasible (context blow-up) and the
Agent-tool `local-summarizer` path routes to cloud Haiku. Chosen path:

- **Corpus (Phase 1):** node → Ollama **direct** (qwen2.5-coder:7b), 366 files, ~$0, no
  orchestrator context burn. This is the project's canonical local model (Wave 12 Gate A
  "keep-qwen2.5-coder") and — unlike qwen3:30b — emits clean output (qwen3 leaked
  chain-of-thought into summaries despite `think:false`).
- **Discovery 2 quantification (Phase 4):** controlled sample, not 400 cloud spawns.

## Infrastructure built (`tools/audit/`, 6 files + tests)

| File | Role |
|---|---|
| `audit_pii_redactor.js` | strip home paths / user / email / secrets; `hasPII()` guard |
| `audit_corpus_builder.js` | scan-list (366 files) + Ollama summaries + stats; resumable |
| `audit_validator.js` | Haiku drift validation + histogram; resumable; mockable |
| `audit_insights.js` | digest + Sonnet prompt + AUDIT_REPORT.md renderer |
| `audit_benchmark.js` | real cost breakdown + LoRA export + honest quant + marketing |
| `audit_pipeline.js` | status/plan orchestrator |
| `audit.test.js` | 6 tests (1/module), all pure/mock — **6/6 pass** |

Scan-list: router 158 · strategy 122 · landing 45 · hub 22 · root 16 · audit 7 = **367**.
Self-audit invariant held: `tools/audit/*.js` are in their own scan-list.

## Honesty notes baked into the tooling

- Corpus `cost_actual_usd: 0` (local T0); cloud divergence quantified separately.
- Quant benchmark **refuses to fabricate a Q4-vs-FP16 number** (no FP16 weights in-env);
  reports Q4 accuracy as judged by Haiku + an optional 7b-vs-14b agreement probe.
- Every disk write goes through `redactObject`/`redact`.

## Non-negotiables status

- classify.js sha256 `7b01eb86…87762` — **unchanged** (verified, not touched).
- settings.json restored byte-identical to pre-wave backup (debug handler removed).
- Wave 21/22 trackers untouched.
