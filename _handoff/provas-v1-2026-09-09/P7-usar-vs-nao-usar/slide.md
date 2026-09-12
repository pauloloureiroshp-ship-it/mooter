# Slide P7 · On 23 real repository tasks with frozen external tests, the session with Mooter's hook delivered accepted work in ≤ 0.8× the time on 18 of them — pre-registered threshold met, confirmatory status not claimed

**Pre-registered 2026-09-04, frozen before the first run** (`r24-prereg.json`): n = 23, threshold 16, α 0.05, one-sided exact binomial (p₀ = 0.5), intention-to-treat, ON/OFF order counterbalanced by seed. `Z = 1` requires **both** that the ON arm's work passes the repository's own frozen test **and** that it takes **≤ 0.8×** the OFF arm's time on the same task. Being faster is not enough.

| | ON (hook installed, budget state frozen) | OFF (no hook) |
|---|---|---|
| **Tasks with Z = 1** | **18/23 · 78.3 % [58.1, 90.3]** (Wilson 95 %) | — |
| Tasks accepted by the frozen test | **23/23** | **23/23** |
| Time-to-green, median | **77 s** | 145 s |
| Time-to-green, total over 23 tasks | **62 min** | 91 min |
| ON/OFF ratio: min · median · max | 0.36 · **0.56** · **2.29** | — |
| ON was faster | 22/23 | — |

**Result:** X = 18 ≥ threshold 16, **p = 0.00531** — the *nominal* p of the specified test. The controller printed `R-24 · GANHOU`; an independent reader re-derived the same 18 and the same p from the raw ledger. It is nominal, not a calibrated inference: independence across 23 heterogeneous tasks from one repository, run in sequence and sharing state, is assumed by the test and not established.

**Quality did not move; time did.** Both arms produced work the repository's own test accepted, in all 23 tasks. A binary test does not separate the two, and a binary test is all this design has.

**The confirmatory reading does not stand, and that is the most serious thing on this card.** The pre-registered plan said run 3 would be the last. Run 3 did not close, and a fourth was run after 12 successes in 13 pairs were already visible. The threshold, seed, assignment and executor never changed; **the stopping rule did, after seeing results.** Against the fishing reading: run 1 held 16 successes in 21 valid pairs, so even two losses in the missing pair would have reached the threshold — abandoning it cost an easier win rather than buying this one.

**Four runs, three published as non-results.** Runs 1 and 2 died on the provider's session limit (21/23 and 0/23 valid pairs); run 3 was halted by the executor's own integrity guard when this measuring session refreshed the router's budget cache mid-run (defect D15). All are published in full with the numbers they printed.

**The treatment in run 4 is not the treatment in the others.** Freezing that cache file is *inside* the treatment by the pre-registration's own definition ("the pinned router **plus this environment and this state**"), so the ON arm here is **hook installed with frozen budget state**. Its behavioural neutrality was not demonstrated.

**Five tasks missed the threshold, not three, and the ON arm was faster in four of them** — `t21` missed by **0.703 s** after saving 82 s. Only `t22` was genuinely slower (2.29×). The longest task Mooter won (`t12`, 519 s) is longer than two of the five.

**Exploratory, and confounded:** none of the 3 tasks the hint marked T2 reached Z = 1 (T0: 18/20). But that stratum is defined by an output of the treatment itself, and those 3 tasks are also the last 3 in sequence and all ran OFF-first — tier, order and position are not separable at n = 3. Restricted to T0 tasks, the order comparison is 11/12 vs 7/8, not the dramatic split the full-set numbers suggest. **The order comparison does not exclude prompt-cache effects**; there is no cache telemetry.

**Manipulation and integrity:** the hook fired in 23/23 ON arms and 0/23 OFF arms; **no arm touched the test file**; `router_sha` and the live-state fingerprint were constant across all 46 arms.

*Does not prove: generalisation to another repository, machine or model (23 tasks, one repo, one machine); quality beyond the test passing; obedience — the design is intention-to-treat and executed obedience remains 0/20 (P3); separating "the hint helped" from "the hint consumed context" (~2.5 KB added per prompt); cost in money or tokens (the pre-registration measures time); independence across tasks; absence of cache effects; behavioural neutrality of the frozen cache; and, because of the stopping rule, confirmatory status. This card was rewritten after an adversarial round in a different engine that caught two factual errors in the first version. Cost: 4 runs × up to 46 full agent invocations, on subscription; API spend US$ 0.*
