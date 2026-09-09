# Slide P3 · Executed obedience: 0/20 in both arms — the local subagent was spawned 7 times in 40 sessions and never called the local model

**Setup:** 20 real prompts previously selected as T0/T1 by the rule with an API key, run without a key; each in a disposable copy of the repo; Claude Code `-p` with the owner's installed hooks on; Ollama behind a loopback counting proxy that records model and token counts per call. Pre-registered, committed before the first session. n = 20 per arm, one run per prompt, no significance test.

| | Native session (router hint only) | + PreToolUse hook that tries to rewrite the spawn to the router's tier |
|---|---|---|
| Sessions that spawned any subagent (95 % CI) | 4/20 · 20 % [8, 42] | 8/20 · 40 % [22, 61] |
| Sessions that spawned the local subagent | 3/20 | 4/20 |
| **Delegation executed locally** — local spawn *and* an Ollama call attributable to the subagent | **0/20 · 0 % [0, 16]** | **0/20 · 0 % [0, 16]** |
| Spawns to Haiku / cheap tier | 0/20 | 0/20 |
| Hook rewrite attempts logged | — | 8 in 8 spawns; application by the harness not verified |
| Ollama calls recorded | 18, all with the signature of the hook's own pre-answer (256-token cap) | 17, all with that signature, all before the rewrite timestamp |

**Printed loss:** the first executed, not hand-written delegation did not happen. Every local model call in 40 sessions came from the router hook's own pre-answer, not from a subagent; why the 7 spawned local subagents never called the local script is n/d (session streams were not persisted — an instrument gap on our side). The router's "decision at spawn" could not be measured either: it lives in one machine-wide file that every session, including the operator's, overwrites (defect D10).

*Does not prove: obedience above zero; quality of delegated work (P7); that the hook enforces or even changes a spawn; any effect of the hook (4 vs 8 spawns is one run each, no test); behaviour with an API key; run-to-run stability. Opus probe on 5 prompts: 1/5 local spawn, 0/5 executed.*
