# Slide P3 · Executed obedience: 0/20 in both arms — the local subagent was spawned 7 times in 40 sessions and never called the local model

**Setup:** 20 real prompts previously selected as T0/T1 by the rule with an API key, run without a key; each in a disposable copy of the repo; Claude Code `-p` with the owner's installed hooks on; Ollama behind a loopback counting proxy that records model and token counts per call. Pre-registered, committed before the first session. n = 20 per arm, one run per prompt, no significance test.

| | Native session (router hint only) | + PreToolUse hook that tries to rewrite the spawn to the router's tier |
|---|---|---|
| Sessions that spawned any subagent (95 % CI) | 4/20 · 20 % [8, 42] | 8/20 · 40 % [22, 61] |
| Sessions that spawned the local subagent | 3/20 | 4/20 |
| **Delegation executed locally** — local spawn *and* an Ollama call attributable to the subagent | **0/20 · 0 % [0, 16]** | **0/20 · 0 % [0, 16]** |
| Spawns to Haiku / cheap tier | 0/20 | 0/20 |
| Hook rewrite attempts logged | — | 8 in 8 spawns; application by the harness not verified |
| Ollama calls recorded | 18 = 15 qwen3:30b with eval_count = 256 + 1 qwen2.5:3b with eval_count = 8 (n07) + 2 gemma4:e4b HTTP 400 errors without counts (n09); the analyser classifies all 18 as the hook's own pre-answer signature, by model name or by the 256-token cap | 17 = 15 qwen3:30b with eval_count = 256 + 2 qwen2.5:3b (eval_count 8 in n07, 1 in n20); all 17 classified as that signature; in the 6 sessions with both a rewrite and an Ollama call, the call precedes the rewrite |

**Printed loss:** the first executed, not hand-written delegation did not happen. Every local model call in 40 sessions is classified by the analyser as the router hook's own pre-answer (by model name or the 256-token cap), none as a subagent's; why the 7 spawned local subagents never called the local script is n/d (session streams were not persisted — an instrument gap on our side). The router's "decision at spawn" could not be measured either: it lives in one machine-wide file that every session, including the operator's, overwrites (defect D10).

*Does not prove: obedience above zero; quality of delegated work (P7); that the hook applies its rewrite, or changes a spawn at all; any effect of the hook (4 vs 8 spawns is one run each, no test); behaviour with an API key; run-to-run stability. Opus probe on 5 prompts: 1/5 local spawn, 0/5 executed.*
