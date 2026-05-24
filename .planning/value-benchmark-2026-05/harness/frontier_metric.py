"""Frontier / AIQ-style metric for Arm A.

For each baseline, compute:
  - Cost-saving capture (% of oracle's cost reduction vs random captured)
  - Quality retention (% of oracle's quality retained vs random)
  - Pareto-efficient? (true if no other baseline dominates it in both dimensions)
  - AIQ proxy: (q - q_random) / (q_oracle - q_random) at the same or lower cost.
"""
import json
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

RES = Path(r"c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05/results/arm_a_results.json")
data = json.loads(RES.read_text(encoding="utf-8"))


def compute(label, results):
    print(f"\n=== {label} ===")
    # Anchor points
    random_q = sum(results[k]["avg_quality"] for k in ["random_seed1", "random_seed2", "random_seed3"]) / 3
    random_c = sum(results[k]["avg_cost"]    for k in ["random_seed1", "random_seed2", "random_seed3"]) / 3
    oracle = results["oracle_quality"]
    oracle_q, oracle_c = oracle["avg_quality"], oracle["avg_cost"]

    print(f"Anchors:")
    print(f"  random avg:  q={random_q:.4f}  c=${random_c:.6f}")
    print(f"  oracle:      q={oracle_q:.4f}  c=${oracle_c:.6f}")
    print(f"  oracle improvement: +{oracle_q-random_q:.4f} quality, -${random_c-oracle_c:.6f} cost")

    print(f"\n{'baseline':<22} {'q':>8} {'c ($)':>10} {'AIQ_q':>8} {'cost_save_%':>12} {'pareto':>10}")

    pts = []
    for b, s in results.items():
        if s["avg_quality"] is None or s["avg_cost"] is None:
            continue
        q, c = s["avg_quality"], s["avg_cost"]
        # AIQ-style: how much of oracle's quality gain is captured?
        aiq_q = (q - random_q) / (oracle_q - random_q) if (oracle_q - random_q) else None
        # Cost saving: what fraction of oracle's cost reduction is captured?
        cost_save = (random_c - c) / (random_c - oracle_c) if (random_c - oracle_c) else None
        pts.append((b, q, c, aiq_q, cost_save))

    # Determine Pareto frontier
    for b, q, c, aiq, cs in sorted(pts, key=lambda x: x[2]):
        dominated = any(q2 >= q and c2 <= c and (q2 > q or c2 < c)
                        for b2, q2, c2, _, _ in pts if b2 != b)
        flag = "DOMINATED" if dominated else "(Pareto)"
        print(f"  {b:<20} {q:>8.4f} {c:>10.6f} {(aiq if aiq is not None else 0):>8.3f} {((cs or 0)*100):>11.1f}% {flag:>10}")

    # Build a compact summary for the README
    summary = {}
    for b, q, c, aiq, cs in pts:
        dominated = any(q2 >= q and c2 <= c and (q2 > q or c2 < c)
                        for b2, q2, c2, _, _ in pts if b2 != b)
        summary[b] = {
            "quality": q,
            "cost": c,
            "aiq_q": aiq,
            "cost_save_pct_of_oracle": cs,
            "pareto_dominated": dominated,
        }
    return summary


primary = compute("PRIMARY MAPPING", data["primary_results"])
alt = compute("ALT MAPPING", data["alt_results"])

OUT = Path(r"c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05/results/frontier_metrics.json")
OUT.write_text(json.dumps({
    "primary": primary,
    "alt": alt,
    "interpretation": {
        "aiq_q": "% of oracle's quality improvement over random that was captured. Range: 0 (random) to 1 (oracle). Negative = worse than random.",
        "cost_save_pct_of_oracle": "% of oracle's cost reduction from random captured.",
        "pareto_dominated": "true if some other baseline matches or beats in BOTH dimensions."
    }
}, indent=2), encoding="utf-8")
print(f"\nwrote {OUT}")
