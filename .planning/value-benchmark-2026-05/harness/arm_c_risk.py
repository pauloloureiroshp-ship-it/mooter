"""Arm C — Risk-axis adversarial test.

For each of the 50 prompts in data/risk-axis-prompts.jsonl, ask whether each
baseline routes to T3 (a proxy for "treat as risky") and compute:

  - TPR (recall):     of true-risk prompts, % routed to T3
  - FPR:              of non-risk prompts, % routed to T3 (wasteful)
  - Precision:        of T3-routed, % that were truly risky
  - Per-bucket breakdown (safe / indirect / disguised / explicit / mixed)

Higher TPR with lower FPR is better. always_T3 has TPR=1.0 FPR=1.0 (no
discrimination). always_T0 has TPR=0.0 FPR=0.0 (no protection).

This dimension was explicitly listed as "NOT measured" in the Arm-A/B run.
The Mooter is expected to outperform trivial baselines here because its
HIGH_RISK regex bank is the doctrine guard the rest of the system delegates to.
"""
import json
import random
import subprocess
import sys
import io
import time
from pathlib import Path
from collections import defaultdict, Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

REPO = Path(r"c:/Users/Paulo Loureiro/frugal")
CLASSIFY_JS = REPO / "tools" / "router" / "classify.js"
PROMPTS = REPO / ".planning" / "value-benchmark-2026-05" / "data" / "risk-axis-prompts.jsonl"
OUT_DECISIONS = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_c_decisions.jsonl"
OUT_METRICS = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_c_metrics.json"

TIER_ORDER = ["T0", "T1", "T2", "T3"]


def random_tier(seed, prompt):
    return random.Random(hash((seed, prompt)) & 0xFFFFFFFF).choice(TIER_ORDER)


def length_heuristic(prompt):
    L = len(prompt)
    if L < 80: return "T0"
    if L < 200: return "T1"
    if L < 500: return "T2"
    return "T3"


# Identical 10-line classifier as in Arm B — same baseline, no peeking at risk axis
RISK_KW = [
    "env", "deploy", "migration", "production", "prod ", "secret",
    "credential", "force push", "drop table", "rm -rf", "rollback",
    "merge to main", "release", "destructive", "pre-merge", "pre-deploy",
    "audit", "compliance", "outage", "downtime", "shard", "rotate",
    "decommission", "replat", "incident",
]


def tenline_classifier(prompt):
    L = len(prompt)
    p = prompt.lower()
    risk = sum(1 for k in RISK_KW if k in p)
    if risk >= 2: return "T3"
    if risk >= 1 and L > 200: return "T3"
    if L < 80: return "T0"
    if L < 300: return "T1"
    if L < 800: return "T2"
    return "T3"


def run_classifier(prompt):
    res = subprocess.run(
        ["node", str(CLASSIFY_JS), prompt],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=30,
    )
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return {"tier": "ERROR"}


def main():
    prompts = [json.loads(l) for l in PROMPTS.read_text(encoding="utf-8").splitlines() if l.strip()]
    print(f"Arm C prompts: {len(prompts)}")
    print(f"Buckets: {dict(Counter(p['bucket'] for p in prompts))}")
    print(f"Risk count (is_risk=True): {sum(1 for p in prompts if p['is_risk'])}")

    rows = []
    t0 = time.time()
    for rec in prompts:
        mooter = run_classifier(rec["prompt"])
        row = {
            "id": rec["id"],
            "bucket": rec["bucket"],
            "is_risk": rec["is_risk"],
            "expected_t3": rec["expected_t3"],
            "prompt": rec["prompt"],
            "mooter_tier": mooter.get("tier"),
            "mooter_category": mooter.get("task_category"),
            "mooter_confidence": mooter.get("confidence"),
            "mooter_reason": mooter.get("reasoning"),
        }
        row["b_always_T0"] = "T0"
        row["b_always_T1"] = "T1"
        row["b_always_T2"] = "T2"
        row["b_always_T3"] = "T3"
        row["b_random_seed1"] = random_tier(1, rec["prompt"])
        row["b_random_seed2"] = random_tier(2, rec["prompt"])
        row["b_random_seed3"] = random_tier(3, rec["prompt"])
        row["b_length"] = length_heuristic(rec["prompt"])
        row["b_tenline"] = tenline_classifier(rec["prompt"])
        rows.append(row)

    print(f"Classify time: {time.time()-t0:.1f}s")

    with OUT_DECISIONS.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # ── Risk-axis metrics ──
    BASELINES = ["mooter_tier", "b_always_T0", "b_always_T1", "b_always_T2", "b_always_T3",
                 "b_random_seed1", "b_random_seed2", "b_random_seed3",
                 "b_length", "b_tenline"]

    def is_t3(t): return t == "T3"

    metrics = {}
    for b in BASELINES:
        tp = fp = fn = tn = 0
        per_bucket_tpr = defaultdict(lambda: [0, 0])  # [tp, total_risk]
        per_bucket_fpr = defaultdict(lambda: [0, 0])  # [fp, total_norisk]
        for r in rows:
            predicted_t3 = is_t3(r.get(b))
            actual_risk = r["is_risk"]
            if actual_risk and predicted_t3:
                tp += 1
                per_bucket_tpr[r["bucket"]][0] += 1
                per_bucket_tpr[r["bucket"]][1] += 1
            elif actual_risk and not predicted_t3:
                fn += 1
                per_bucket_tpr[r["bucket"]][1] += 1
            elif not actual_risk and predicted_t3:
                fp += 1
                per_bucket_fpr[r["bucket"]][0] += 1
                per_bucket_fpr[r["bucket"]][1] += 1
            else:
                tn += 1
                per_bucket_fpr[r["bucket"]][1] += 1
        tpr = tp / (tp + fn) if (tp + fn) else None
        fpr = fp / (fp + tn) if (fp + tn) else None
        precision = tp / (tp + fp) if (tp + fp) else None
        # F1-like (Youden's J also useful: TPR - FPR)
        youden = (tpr - fpr) if (tpr is not None and fpr is not None) else None
        metrics[b] = {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "tpr_risk_recall": tpr,
            "fpr_false_alarm": fpr,
            "precision_at_t3": precision,
            "youden_j": youden,
            "per_bucket_tpr": {k: (v[0] / v[1] if v[1] else None) for k, v in per_bucket_tpr.items()},
            "per_bucket_fpr": {k: (v[0] / v[1] if v[1] else None) for k, v in per_bucket_fpr.items()},
        }

    OUT_METRICS.write_text(json.dumps({
        "n_prompts": len(rows),
        "buckets": dict(Counter(r["bucket"] for r in rows)),
        "n_risk": sum(1 for r in rows if r["is_risk"]),
        "n_norisk": sum(1 for r in rows if not r["is_risk"]),
        "metrics": metrics,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    # ── Summary table ──
    print(f"\n{'baseline':<22} {'TPR':>7} {'FPR':>7} {'Precision':>10} {'Youden':>7}")
    print("-" * 60)
    for b, m in sorted(metrics.items(), key=lambda kv: -(kv[1].get("youden_j") or -2)):
        tpr = m["tpr_risk_recall"]
        fpr = m["fpr_false_alarm"]
        prec = m["precision_at_t3"]
        youden = m["youden_j"]
        print(f"  {b:<20} {(tpr or 0):>7.3f} {(fpr or 0):>7.3f} {(prec or 0):>10.3f} {(youden or 0):>7.3f}")

    print("\nPer-bucket TPR (recall on risky prompts):")
    print(f"  {'baseline':<22} {'safe':>6} {'indirect':>10} {'disguised':>11} {'explicit':>10} {'mixed':>8}")
    for b in BASELINES:
        m = metrics[b]
        line = f"  {b:<22}"
        for bucket in ["safe", "indirect", "disguised", "explicit", "mixed"]:
            v = m["per_bucket_tpr"].get(bucket)
            line += f" {(v if v is not None else 0):>6.2f}" if bucket == "safe" else (
                    f" {(v if v is not None else 0):>10.2f}" if bucket == "indirect" else
                    f" {(v if v is not None else 0):>11.2f}" if bucket == "disguised" else
                    f" {(v if v is not None else 0):>10.2f}" if bucket == "explicit" else
                    f" {(v if v is not None else 0):>8.2f}")
        print(line)

    print("\nPer-bucket FPR (over-routes to T3 on non-risky):")
    print(f"  {'baseline':<22} {'safe':>6} {'indirect':>10} {'disguised':>11} {'explicit':>10} {'mixed':>8}")
    for b in BASELINES:
        m = metrics[b]
        line = f"  {b:<22}"
        for bucket in ["safe", "indirect", "disguised", "explicit", "mixed"]:
            v = m["per_bucket_fpr"].get(bucket)
            line += f" {(v if v is not None else 0):>6.2f}" if bucket == "safe" else (
                    f" {(v if v is not None else 0):>10.2f}" if bucket == "indirect" else
                    f" {(v if v is not None else 0):>11.2f}" if bucket == "disguised" else
                    f" {(v if v is not None else 0):>10.2f}" if bucket == "explicit" else
                    f" {(v if v is not None else 0):>8.2f}")
        print(line)


if __name__ == "__main__":
    main()
