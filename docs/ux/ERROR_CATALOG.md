# Mooter — Error & Recovery Catalog (Wave 30 Phase M)

The 7 failure scenarios Mooter detects, the signal it uses, and the recovery it
maps to. Source of truth in code: `packages/validation/src/recovery/error-catalog.ts`
(this doc is generated-equivalent and kept in sync by `recovery.test.ts`).

| # | Scenario | Detect | User impact | Recovery | Auto? | Statusline |
|---|----------|--------|-------------|----------|-------|------------|
| 1 | Ollama down / model-bare | `GET /api/tags` fails or 0 models | local tier has no backend → everything escalates to cloud | `mooter setup repair` (start ollama, pull default model) | ✅ | 🔧 ollama down — setup repair |
| 2 | Hub unreachable | heartbeat/sync times out or 5xx | telemetry/sync can't upload; Pastor hints stale | queue events locally (`sync-queue.jsonl`), retry later — no data lost | ✅ | 📡 hub offline — queued |
| 3 | Quota exhausted | provider 429 / quota header 0 | cloud tiers unavailable for the window | bias routing hard to local; surface reset ETA | ✅ | 🪫 quota out — local only |
| 4 | Workflow crash | run row stuck `running`, no recent checkpoint | partial work; restart-from-scratch anxiety | `mooter workflow resume <runId>` from last checkpoint | ⚠️ manual | 🔄 workflow resumable |
| 5 | LoRA incompatible | base-model mismatch / signature fail at activation | adapter bias unsafe/unavailable | fall back to baseline router (adapter disabled) | ✅ | 🧩 adapter off — baseline |
| 6 | Disk low | free space < 500 MB at pre-flight | model pulls / state writes may fail mid-op | pre-flight `mooter setup audit` warns before a big pull | ⚠️ manual | 💾 disk low |
| 7 | Network slow | rolling avg cloud latency > 5000 ms | cloud calls lag; sessions stall | auto-degrade: prefer local where quality allows until latency recovers | ✅ | 🐢 net slow — local-bias |

## Detection → action mapping

`planRecovery(signals)` (in `auto-recover.ts`) turns live signals into an ordered
action list (highest user-impact first: ollama → quota → hub → workflow → lora →
disk → network). `autoActions()` filters to the subset safe to apply without
asking. Thresholds (`DEFAULT_THRESHOLDS`): disk 500 MB, latency 5000 ms, quota 10 %.

## Day-0 relevance

This wave's own Day 0 hit scenario #1 live: Ollama was up but **model-bare**
(`ollamaModelCount === 0`), which `planRecovery` flags as `repair_ollama`. The
recovery taken was the manual equivalent (`ollama pull`). That real incident is
why the catalog treats "reachable but 0 models" as down.
