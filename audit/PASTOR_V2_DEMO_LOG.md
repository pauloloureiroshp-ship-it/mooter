# Pastor v2 (LORAUTER) — live demo log

**Date:** 2026-06-08 · **Wave:** 31 · **Build:** `packages/cli` bundle (esbuild, clean)

All commands run against the **real** repo decisions log (1807 lines, 656 classified
events) and a fresh temp `MOOTER_HOME`. Routing is deterministic (no LLM, no network).

## 1. Per-task adapters registered (6 types)

```
$ mooter pastor adapters
🧠 Pastor v2 — per-task adapters (LORAUTER)
  coding-frontend  pastor-frontend    [qwen2.5-coder:7b]  not trained yet
  coding-backend   pastor-backend     [qwen2.5-coder:7b]  not trained yet
  coding-data      pastor-data        [qwen2.5-coder:7b]  not trained yet
  prose-pt-pt      pastor-portuguese  [qwen3:30b]         not trained yet
  prose-en         pastor-english     [qwen3:30b]         not trained yet
  baseline         pastor-baseline    [qwen3:30b]         not trained yet
```

`not trained yet` is honest: routing is live now; adapter *materialisation* is the
overnight `train_lora.sh` job. The routing decision works regardless of training state.

## 2. LORAUTER routes 5 task types correctly (threshold 0.70)

```
$ mooter pastor route "<prompt>" --json   (task_type · confidence)

  "muda a cor do botão React no Button.tsx layout css"          → coding-frontend  0.88
  "add API auth middleware to the server route handler ..."     → coding-backend   0.91
  "write a SQL query aggregating the dataset dataframe etl ..." → coding-data      0.73
  "escreve um resumo em português e redige um parágrafo ..."    → prose-pt-pt      0.89
  "write a blog article draft summary and proofread the copy"  → prose-en         0.90
```

All five clear the 0.70 threshold and match the intended adapter. An ambiguous prompt
("what do you think about this?") falls back to `baseline` (sub-threshold) — verified in
the unit suite.

## 3. Doctrine guardrail — tier never changes

`routeAdapter` returns the classifier's tier verbatim for every tier (T0–T3); LORAUTER
only biases the adapter *within* that tier. Asserted in `lora-routing.test.ts`
("doctrine guardrail: tier passes through unchanged for every tier") and in the MCP test.

## 4. Distillation — 656 real decisions → installable skill

```
$ mooter pastor distill --from tools/router/decisions.log
✓ distilled 656 routing decisions → skill
  ~/.mooter/distilled/pastor-2026-06-08.skill.md
  install: npx skills add ~/.mooter/distilled/pastor-2026-06-08.skill.md
  top patterns: architecture_or_critical→T3 · simple_transform_or_explain→T1 · trivial_local→T0
```

Learned tier mix: **T3 48% · T1 32% · T0 18% · T2 2%**. The full skill (real output) is
checked in at `.claude/skills/pastor-distill/example-distilled.md`.

## 5. Obsidian vault-sync pack

```
$ mooter pack install obsidian-vault-sync   # seeds <vault>/Mooter/ (README + preferences.md)
$ mooter pack sync                          # writes learnings-<date>.md, imports preferences
```

Vault auto-detected via `.obsidian/` (native + WSL `/mnt/c/Users/*/Documents`). Bidirectional,
local-only, features-only. Non-destructive uninstall. 14 pack tests green.

## 6. New MCP tools (Wave 30 registry → 8)

```
$ mooter mcp list | grep -E 'pastor|obsidian'
  • mooter_pastor_adapter_suggest
  • mooter_obsidian_sync
```

## Test totals (this wave)

`synthesis 88 · cli 238 · packs 20 · mcp-server 13 · hub 63 · router line-3 11` — all green.
`classify.js` sha intact (`7b01eb86…87762`). Bundle builds clean.
