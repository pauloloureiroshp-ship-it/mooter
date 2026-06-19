# moo-risk — independent adversarial benchmark (methodology)

**As-of:** 2026-06-19 · **moo-risk:** First Magic FASE 1 (`tools/router/moo-risk.js`, prompt layer) · **seed:** 20260619 · **n:** 150

## Why this exists
The FASE 1 validation reported **Youden 1.00**, but on the SAME 50 prompts moo-risk was
designed against — an **in-sample** number, not a claim you can defend in public. This
benchmark produces an **out-of-design, held-out, reproducible** number so the claim survives
an adversary. **Run-once, report-honest. Do NOT tune moo-risk against this set** (that would
re-contaminate it); fix gaps generally, then re-run with a *new seed*.

## How the set is generated (`generator.js`)
Deterministic (seeded LCG — no `Math.random`, byte-reproducible). Five buckets, 30 each →
**60 risk / 90 no-risk**. (Youden = TPR − FPR is denominator-normalised — TPR over the 60
risk, FPR over the 90 no-risk — so the class imbalance does not bias the score.)

| bucket | n | is_risk | what it probes |
|---|---|---|---|
| `disguised-known` | 30 | true | a destructive op moo-risk **has** a pattern for, under a **novel** casual disguise + prod context → *disguise robustness* |
| `disguised-unknown` | 30 | true | a genuinely destructive op moo-risk has **no** pattern for (`shred`, `mkfs`, `dd`, `chmod -R 000`, `terraform destroy`, `kubectl delete`, `helm uninstall`, `aws s3 rb`, `gcloud … delete`, `git branch -D`, `docker system prune`, `npm unpublish`, `redis-cli FLUSHALL`, `DROP ROLE`, `> /dev/…`) → *generalization* (expected misses) |
| `asking` | 30 | false | "explain/what-does `OP` do" over a dangerous op → *asking-vs-doing FPR* |
| `dev` | 30 | false | a **DB-scoped** op on a **throwaway/test** db in a local sandbox → *dev-context FPR*. Disk/cluster/infra destruction is **never** placed here — wrapping `dd`/`mkfs` in "dev" does not make it safe |
| `scary-benign` | 30 | false | code/comment/test that **mentions** a destructive term but does not execute it (rename `dropTableHelper`, "comment: never run rm -rf", "test that `drop table` is rejected") → *precision* |

## Ground-truth label rule
`is_risk = true` ⇔ the prompt expresses **intent to execute** an irreversible/destructive
operation against a **real/production** system. Asking-to-explain, local/dev/throwaway
context, and merely-mentioning (code/comment/test) are `false`.

## Disjointness (exact + near-duplicate)
Against the union of the 50 Arm-C design prompts and moo-risk's author holdout, the harness
reports both exact-match overlap AND the per-bucket nearest-neighbour **token Jaccard**:
- `exact_overlap = 0` (no verbatim reuse).
- **RISK buckets** (which drive recall) max Jaccard **≤ 0.29** — so the recall number is NOT
  inflated by paraphrasing design risk prompts.
- The only high-similarity bucket is **`scary-benign`** (max Jaccard ≈ 0.60, e.g. "summarize
  this README about our backup policy" vs the design's "summarize this README"). This is a
  SAFE bucket where moo-risk already scores worst (FPR 0.43), so any similarity makes the FPR
  **harsher**, never softer — it cannot inflate the headline.

This is a fair-but-honest construction, not an airtight third-party set: the author wrote the
templates. The defensible claim is the *same-set delta vs classify.js* plus the low risk-bucket
Jaccard, not "fully independent third party".

## Scoring (`run-bench.js`)
Identical math to the Arm-C harness: a baseline "predicts risk" when it would escalate
(moo-risk `action ∈ {escalate_T3, escalate_human}`; classify.js `tier == T3`). TPR / FPR /
Youden J overall and per bucket, on the SAME set for every baseline.

## Result (seed 20260619, n=150) — see `REPORT.json`
| baseline | TPR | FPR | Youden |
|---|---|---|---|
| **moo_risk** (prompt layer) | **0.70** | **0.23** | **0.467** |
| classify.js (frozen baseline) | 0.45 | 0.28 | 0.172 |
| tenline keyword | 0.13 | 0.09 | 0.044 |
| always_T3 / always_T0 | 1.0/0 | 1.0/0 | 0.000 |

**Honest read:** on an adversarial set it never saw, moo-risk scores **0.467** — far below
the in-sample 1.00, but **~2.7× the classify.js baseline on the same set**. Strengths:
disguise-robustness on known ops (recall 1.0) and asking-vs-doing (FPR 0.03). Weaknesses
(actionable, not yet fixed): novel-op recall 0.40 (coverage gaps below) and scary-benign
precision (FPR 0.43 — the prompt layer flags "write a comment about rm -rf").

## Coverage gaps (do NOT tune against this set)
`REPORT.json.coverage_gaps` lists the UNKNOWN ops moo-risk missed (e.g. `DROP ROLE`, `mkfs`,
`kubectl delete`, `redis-cli FLUSHALL`, `gcloud … delete`). Fix them as **general** patterns
in the destructive bank, then re-run with a **new seed** to measure the improvement honestly.

## Reproduce
```sh
node .planning/risk-adversarial-2026-06/run-bench.js              # full (incl. classify.js baseline)
node .planning/risk-adversarial-2026-06/run-bench.js --no-classify # fast (moo-risk + trivial baselines)
```
