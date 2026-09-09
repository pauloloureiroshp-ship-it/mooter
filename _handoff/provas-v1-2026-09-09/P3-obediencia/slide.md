# Slide P3 · Obedience is above zero and small: 3/20 native sessions executed a delegation locally with token counts on the receipt; with a spawn-rewrite hook, 4/20 — and the hook reached 8/8 spawns

**Setup:** 20 real prompts the router marks T0/T1; each in a disposable copy of the repo; Claude Code `-p` with the owner's installed hooks on; Ollama behind a loopback counting proxy that records model and token counts per call (the receipt line). Pre-registered, committed before the first session. n = 20 per arm, no significance test.

| | Native session (router hint only) | + PreToolUse hook that rewrites the spawn to the router's tier (never upward) |
|---|---|---|
| Sessions that spawned any subagent (95 % CI) | 4/20 · 20 % [8, 42] | 8/20 · 40 % [22, 61] |
| **Delegation executed locally** (local subagent spawned *and* an Ollama call with token counts in the same session) | **3/20 · 15 % [5, 36]** | **4/20 · 20 % [8, 42]** |
| Spawns to Haiku / cheap tier | 0/20 | 0/20 |
| Hook reached / rewrote | — | **8 / 8** (Explore, model-reasoner → local-summarizer) |
| Ollama tokens on the receipt | 5,389 | 5,420 |

**What the hook can and cannot do:** it rewrote every spawn the model made; it cannot create a spawn — 12/20 sessions never delegated, so it had nothing to act on. The 4 → 8 spawn difference between arms is not attributable to the hook (it does not induce spawns); n = 20, one run per prompt.

**Printed limits:** T1 never happened (no API key on this machine, and a live budget-cap defect pushed 33/40 decisions to T0); the router's decision at spawn time differed between arms on 4 prompts (live hook state); 16/20 sessions show *some* Ollama call, but that includes the hook's own pre-answer and is not obedience.

*Does not prove: quality of delegated work (P7); that the hook enforces anything (it is gated best-effort); a causal effect of the hook on delegation rate; behaviour with an API key; run-to-run stability. Opus probe on 5 prompts: 1/5 executed locally (descriptive only).*
