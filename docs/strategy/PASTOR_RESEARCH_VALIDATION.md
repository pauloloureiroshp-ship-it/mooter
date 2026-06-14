# Pastor v2 — Research Validation (HONEST)

**Wave 58.4 · Block G (D.3) · 2026-06-14**

This note grounds Mooter's routing philosophy — and the Pastor v2 statusline chip
(`🎓 Pastor v2 · N decisions · TF-IDF (Occam-aligned)`) — in the 2025 academic
literature on LLM routing. It is written to be **citable** in future landing copy
and the Wave 65 public report, so every claim is scoped to what the cited papers
actually show and what Mooter actually does. No fabrication (Doctrine V4 #5).

---

## The thesis: simple, deterministic routers are state-of-art

Two independent 2025 papers converge on the same conclusion — that the field's
drift toward heavy *learned/neural* routers is not justified by results, and that
**simple, low-latency methods match or beat them**:

### 1. "When Simple kNN Beats Complex Learned Routers" (arXiv 2505.12601)

> *Rethinking Predictive Modeling for LLM Routing: When Simple kNN Beats Complex
> Learned Routers* (submitted 2025-05-19).

What it shows (verified from the abstract, not paraphrased beyond it):
- A **well-tuned k-Nearest-Neighbours router consistently matches or outperforms
  a wide range of complex learned routers** across instruction-following, QA, and
  reasoning tasks.
- It argues the field's reliance on complex learned strategies — trained on
  disparate data with incomparable eval setups — makes generalisation hard, and
  that **simplicity is more effective**.
- It introduces standardised routing benchmarks (incl. the first multi-modal
  routing dataset).

### 2. "Cost-Aware Contrastive Routing for LLMs" (arXiv 2508.12491)

> *Cost-Aware Contrastive Routing for LLMs* — Shirkavand, Gao, Yu, Huang.
> NeurIPS 2025 (spotlight).

What it shows:
- CSCR maps prompts and models into a shared embedding space; at **inference,
  routing reduces to a single kNN lookup (FAISS index)** — *microsecond latency*,
  **no retraining when the model pool changes**.
- It improves the accuracy–cost tradeoff by up to **25%** and generalises to
  unseen models.

The takeaway across both: **the winning routers are cheap, deterministic-at-
inference, and re-pool without retraining** — explicitly *not* big neural
classifiers that must be retrained as the model landscape shifts.

---

## Where Mooter sits (precise, no overclaim)

Mooter's router is **even simpler than kNN** and shares the same Occam-aligned
spirit, but the mechanisms are not identical — stating that honestly matters:

| | 2505.12601 / CSCR | Mooter |
|---|---|---|
| Decision mechanism | kNN over learned/embedding features | **Deterministic regex + TF-IDF** in the FROZEN `classify.js` (zero-LLM, <50ms) |
| "Learning" | offline contrastive / kNN index build | **Pastor v2**: offline threshold tuning from the user's *own* `decisions.log` (`backtest.js → update-router.js → tuning-state.json`) — `classify.js` stays byte-identical |
| Re-pool cost | none (kNN re-index) | none (matrix + pricing are data; classifier untouched) |
| Latency | microseconds (kNN) | sub-50ms (regex), zero network |
| Per-task adaptation | embedding similarity | TF-IDF routing confidence + per-task adapters (`pastor-status.js`) |

**So the honest positioning is:** the 2025 literature *validates Mooter's design
choice* — reject complex neural routers in favour of a simple, deterministic,
cheap-to-run, re-poolable mechanism. Mooter reaches that point via regex + TF-IDF
+ local threshold tuning rather than a kNN/FAISS index, but it lands in the same
"simple beats complex" camp the research now endorses.

### The naming caveat (important)

The internal "LoRA"/"LORAUTER" naming is historical. **Pastor v2 is NOT a neural
LoRA and Mooter does no neural training.** The chip therefore displays **"TF-IDF",
never "LoRA"**, so users are never misled about the mechanism. The "(Occam-
aligned)" tag is the honest one-word summary of the research above: prefer the
simplest router that works.

---

## The deterministic trade-off (state it both ways)

Being deterministic-and-regex rather than learned-and-embedding is a genuine
trade-off, not a free win — honesty requires naming the cost:

- **Win:** zero inference cost, zero network, full transparency (every decision is
  an inspectable rule + confidence), no training data needed, no retraining when
  models change, trivially auditable. This is exactly the property both papers
  prize (re-pool without retraining).
- **Cost:** a regex/TF-IDF classifier cannot capture semantic nuance a learned
  embedding kNN can. Mooter mitigates this with (a) the Haiku **arbiter** on the
  ~17% ambiguous long tail, and (b) Pastor v2 threshold tuning from real outcomes
  — but it does not claim parity with embedding-similarity routing on hard
  semantic edge cases. That is the honest boundary of the claim.

---

## Usage

- **Landing copy (future):** may cite both papers to support "local-first,
  deterministic routing is state-of-art" — but must keep the precise framing
  above (Mooter is *aligned with*, not an *implementation of*, kNN routing).
- **Wave 65 public report (LLMRouterBench):** this note is the reference for the
  "why deterministic" section; pair it with Mooter's own measured numbers, never
  with the papers' numbers presented as Mooter's.

## Sources

- [arXiv 2505.12601 — Rethinking Predictive Modeling for LLM Routing: When Simple kNN Beats Complex Learned Routers](https://arxiv.org/abs/2505.12601)
- [arXiv 2508.12491 — Cost-Aware Contrastive Routing for LLMs (NeurIPS 2025)](https://arxiv.org/abs/2508.12491)
