"""Arm B — run classify.js on every fresh coding prompt, then score Mooter
vs baselines against the judge labels (and against my expected_tier labels
as a second-opinion ground truth).

Outputs:
  results/arm_b_decisions.jsonl  — per-prompt Mooter output + baselines
  results/arm_b_metrics.json     — aggregate metrics
  results/arm_b_confusion.txt    — confusion matrix
"""
import json
import subprocess
import sys
import io
import time
import random
import math
from pathlib import Path
from collections import defaultdict, Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

REPO = Path(r"c:/Users/Paulo Loureiro/frugal")
CLASSIFY_JS = REPO / "tools" / "router" / "classify.js"
PROMPTS = REPO / ".planning" / "value-benchmark-2026-05" / "data" / "coding-fresh-prompts.jsonl"
JUDGE = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_b_judge_labels.jsonl"
OUT_DECISIONS = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_b_decisions.jsonl"
OUT_METRICS = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_b_metrics.json"
OUT_CONFUSION = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_b_confusion.txt"

TIER_ORDER = ["T0", "T1", "T2", "T3"]
TIER_INDEX = {t: i for i, t in enumerate(TIER_ORDER)}

# Cost-weighted error: an under-tier (e.g. judge=T3, mooter=T0) is much worse
# than an over-tier (judge=T0, mooter=T3). Weights are asymmetric.
# Rows = judge label (truth), cols = predicted tier.
# Diagonal = 0 (correct). Off-diagonal: under-route = large quality loss;
# over-route = wasted cost. Quality loss dominates.
UNDER_PENALTIES = {
    # delta = truth_idx - predicted_idx > 0 means under-routed
    1: 1.0,   # off-by-one under
    2: 3.0,
    3: 8.0,
}
OVER_PENALTIES = {
    # delta = truth_idx - predicted_idx < 0 means over-routed
    -1: 0.3,
    -2: 0.8,
    -3: 1.5,
}


def cost_weighted_error(truth, predicted):
    delta = TIER_INDEX[truth] - TIER_INDEX[predicted]
    if delta == 0:
        return 0.0
    if delta > 0:
        return UNDER_PENALTIES.get(delta, 8.0)
    return OVER_PENALTIES.get(delta, 1.5)


def random_tier(seed, prompt):
    return random.Random(hash((seed, prompt)) & 0xFFFFFFFF).choice(TIER_ORDER)


def length_heuristic(prompt):
    L = len(prompt)
    if L < 80:
        return "T0"
    if L < 200:
        return "T1"
    if L < 500:
        return "T2"
    return "T3"


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
    if risk >= 2:
        return "T3"
    if risk >= 1 and L > 200:
        return "T3"
    if L < 80:
        return "T0"
    if L < 300:
        return "T1"
    if L < 800:
        return "T2"
    return "T3"


def load_prompts():
    arr = [json.loads(line) for line in PROMPTS.read_text(encoding="utf-8").splitlines() if line.strip()]
    return arr


def load_judge():
    j = {}
    if not JUDGE.exists():
        return j
    for line in JUDGE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        j[r["id"]] = r
    return j


def run_classifier(prompt):
    res = subprocess.run(
        ["node", str(CLASSIFY_JS), prompt],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=30,
    )
    try:
        return json.loads(res.stdout)
    except json.JSONDecodeError:
        return {"tier": "ERROR", "stderr": res.stderr[:200]}


def accuracy_within(rows, truth_key, pred_key, tol=0):
    n = good = 0
    for r in rows:
        truth = r.get(truth_key)
        pred = r.get(pred_key)
        if truth not in TIER_INDEX or pred not in TIER_INDEX:
            continue
        n += 1
        if abs(TIER_INDEX[truth] - TIER_INDEX[pred]) <= tol:
            good += 1
    return (good / n) if n else None, n


def confusion(rows, truth_key, pred_key):
    cm = [[0] * 4 for _ in range(4)]
    for r in rows:
        truth = r.get(truth_key)
        pred = r.get(pred_key)
        if truth in TIER_INDEX and pred in TIER_INDEX:
            cm[TIER_INDEX[truth]][TIER_INDEX[pred]] += 1
    return cm


def ece(rows, truth_key, pred_key, conf_key, n_bins=10):
    """Expected Calibration Error of Mooter's confidence.
    Bin by confidence, compute |accuracy - confidence| weighted by bin size."""
    bins = [[] for _ in range(n_bins)]
    for r in rows:
        truth = r.get(truth_key)
        pred = r.get(pred_key)
        conf = r.get(conf_key)
        if truth not in TIER_INDEX or pred not in TIER_INDEX or conf is None:
            continue
        b = min(int(conf * n_bins), n_bins - 1)
        bins[b].append((1 if truth == pred else 0, conf))
    total_n = sum(len(b) for b in bins)
    if total_n == 0:
        return None
    score = 0.0
    for b in bins:
        if not b:
            continue
        acc = sum(x[0] for x in b) / len(b)
        avg_conf = sum(x[1] for x in b) / len(b)
        score += (len(b) / total_n) * abs(acc - avg_conf)
    return score


def main():
    prompts = load_prompts()
    judge = load_judge()
    print(f"Prompts: {len(prompts)}  Judge labels available: {len(judge)}", flush=True)
    if not judge:
        print("WARN: no judge labels yet. Run arm_b_judge.py first.", file=sys.stderr)

    rows = []
    t0 = time.time()
    for i, rec in enumerate(prompts):
        mooter = run_classifier(rec["prompt"])
        row = {
            "id": rec["id"],
            "prompt": rec["prompt"],
            "expected_tier": rec["expected_tier"],
            "judge_tier": judge.get(rec["id"], {}).get("judge_tier"),
            "judge_reason": judge.get(rec["id"], {}).get("judge_reason"),
            "mooter_tier": mooter.get("tier"),
            "mooter_category": mooter.get("task_category"),
            "mooter_confidence": mooter.get("confidence"),
            "mooter_reason": mooter.get("reasoning"),
        }
        # baselines
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
        if (i + 1) % 25 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            print(f"  [{i+1}/{len(prompts)}] {rate:.1f}/s", flush=True)

    print(f"Total classify time: {time.time()-t0:.1f}s", flush=True)

    # Persist per-prompt decisions
    with OUT_DECISIONS.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Score each baseline against judge_tier AND against expected_tier
    BASELINES = ["mooter_tier", "b_always_T0", "b_always_T1", "b_always_T2", "b_always_T3",
                 "b_random_seed1", "b_random_seed2", "b_random_seed3",
                 "b_length", "b_tenline"]

    def score_against(truth_key):
        results = {}
        for b in BASELINES:
            acc_exact, n = accuracy_within(rows, truth_key, b, tol=0)
            acc_within1, _ = accuracy_within(rows, truth_key, b, tol=1)
            # cost-weighted error
            cwe_total = 0.0
            cwe_n = 0
            for r in rows:
                t = r.get(truth_key)
                p = r.get(b)
                if t in TIER_INDEX and p in TIER_INDEX:
                    cwe_total += cost_weighted_error(t, p)
                    cwe_n += 1
            results[b] = {
                "accuracy_exact": acc_exact,
                "accuracy_within1": acc_within1,
                "n": n,
                "cost_weighted_error_avg": (cwe_total / cwe_n) if cwe_n else None,
            }
        return results

    out_metrics = {
        "n_prompts": len(rows),
        "tier_distribution_expected": dict(Counter(r["expected_tier"] for r in rows)),
        "tier_distribution_judge": dict(Counter(r["judge_tier"] for r in rows if r["judge_tier"])),
        "tier_distribution_mooter": dict(Counter(r["mooter_tier"] for r in rows if r["mooter_tier"])),
        "scored_against_judge": score_against("judge_tier"),
        "scored_against_expected": score_against("expected_tier"),
        "ece_mooter_vs_judge": ece(rows, "judge_tier", "mooter_tier", "mooter_confidence"),
        "ece_mooter_vs_expected": ece(rows, "expected_tier", "mooter_tier", "mooter_confidence"),
    }
    with OUT_METRICS.open("w", encoding="utf-8") as f:
        json.dump(out_metrics, f, indent=2, ensure_ascii=False)

    # Confusion matrices
    cm_judge_vs_mooter = confusion(rows, "judge_tier", "mooter_tier")
    cm_expected_vs_mooter = confusion(rows, "expected_tier", "mooter_tier")
    cm_judge_vs_expected = confusion(rows, "judge_tier", "expected_tier")
    cm_judge_vs_tenline = confusion(rows, "judge_tier", "b_tenline")
    cm_judge_vs_length = confusion(rows, "judge_tier", "b_length")

    def cm_str(name, cm):
        s = [f"\n--- {name} ---\n              predicted",
             "              " + "   ".join(TIER_ORDER),
             "         +" + "------" * 4]
        for i, t in enumerate(TIER_ORDER):
            row = "  ".join(f"{cm[i][j]:>3}" for j in range(4))
            s.append(f"truth {t} | {row}")
        return "\n".join(s)

    cm_text = "\n".join([
        cm_str("Mooter vs Judge (rows=judge truth)", cm_judge_vs_mooter),
        cm_str("Mooter vs Expected", cm_expected_vs_mooter),
        cm_str("Expected vs Judge (sanity: my labels vs gemma)", cm_judge_vs_expected),
        cm_str("Tenline-classifier vs Judge", cm_judge_vs_tenline),
        cm_str("Length-heuristic vs Judge", cm_judge_vs_length),
    ])
    OUT_CONFUSION.write_text(cm_text, encoding="utf-8")

    # Print summary
    print("\n=== METRICS ===")
    print(f"Mooter tier distribution: {out_metrics['tier_distribution_mooter']}")
    print(f"Judge tier distribution:  {out_metrics['tier_distribution_judge']}")
    print(f"Expected tier distribution: {out_metrics['tier_distribution_expected']}")
    print(f"\nECE Mooter vs Judge: {out_metrics['ece_mooter_vs_judge']:.4f}" if out_metrics['ece_mooter_vs_judge'] else "ECE unavailable")
    print(f"ECE Mooter vs Expected: {out_metrics['ece_mooter_vs_expected']:.4f}" if out_metrics['ece_mooter_vs_expected'] else "")

    print("\nScored against JUDGE:")
    print(f"{'baseline':<22} {'acc_exact':>10} {'acc_within1':>12} {'cw_err':>10}")
    for b, s in sorted(out_metrics["scored_against_judge"].items(),
                       key=lambda kv: -(kv[1].get("accuracy_exact") or 0)):
        ae = s["accuracy_exact"]
        aw = s["accuracy_within1"]
        ce = s["cost_weighted_error_avg"]
        print(f"  {b:<20} {(ae or 0):>10.3f} {(aw or 0):>12.3f} {(ce or 0):>10.3f}")

    print("\nScored against EXPECTED (my labels):")
    for b, s in sorted(out_metrics["scored_against_expected"].items(),
                       key=lambda kv: -(kv[1].get("accuracy_exact") or 0)):
        ae = s["accuracy_exact"]
        aw = s["accuracy_within1"]
        ce = s["cost_weighted_error_avg"]
        print(f"  {b:<20} {(ae or 0):>10.3f} {(aw or 0):>12.3f} {(ce or 0):>10.3f}")

    print("\n" + cm_text)


if __name__ == "__main__":
    main()
