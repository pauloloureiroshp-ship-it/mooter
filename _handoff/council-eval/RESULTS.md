# Council Quality Eval — RESULTS (2026-06-22)

1. **Question:** does the Council *improve* (not just *change*) the answer vs the best single model? (Gate A's open caveat.)
2. **Run:** REAL, 100% local, $0 — no cloud keys. 43 items (32 verifiable + 11 open). Branch `wave-autopilot-loop` off `wave-council-d`.
3. **Hygiene (what Gate A lacked):** verifiable graded by execution/gabarito (never LLM); open by a **cross-vendor** (Gemma↔Qwen), **blind**, both-orders, **length-neutral** pairwise judge.
4. **Pre-registered bar:** quality tool iff *(open)* WIN−LOSS>0 with CI excluding 0 **AND** *(verifiable)* accuracy_delta ≥0.
5. **Verifiable (n=32):** single **78.1%** → council **84.4%**, **Δ=+6.3pp**, no regression. Gain in **security-audit 67→100%** & **factual-grounding 80→100%**; regresses coding-bugfix 80→60%.
6. **Open (n=11):** council **2 win / 7 tie / 2 loss** → WIN−LOSS=0, CI95 [15,85] includes 0 → **no clean win**.
7. **Cost/latency:** $0 (local); single 415s vs council **2367s** (~5.7× slower) — latency is the real cost.
8. **Calibration:** confidence ≥0.6 → 91% (holds); but CONFIRMED-convergence → 80% vs not → 92% (**inverted — recalibrate ACT signal**).
9. **Decision (outcome 2 of 3): GATED to high-risk.** Keep the council on the ESCALATE valve for security/factual/hallucination-prone tasks; do NOT sell as "better answers" globally. Not a net-win (don't merge+tag flagship); not a net-loss (no urgent judge fix).
10. **Gate:** PR opened `wave-autopilot-loop → wave-council-d` (NOT main). Evidence: `packages/council/scripts/quality-eval-results.json`. Caveats: all-local, mono-vendor (Qwen) council, n=11 open → wide CI.
