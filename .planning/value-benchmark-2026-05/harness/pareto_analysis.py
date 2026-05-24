"""Compute Pareto position of Mooter on Arm A — who dominates whom."""
import json
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

RES = Path(r"c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05/results/arm_a_results.json")
data = json.loads(RES.read_text(encoding="utf-8"))


def analyze(label, results):
    print(f"\n=== {label} ===")
    pts = []
    for b, s in results.items():
        if s["avg_quality"] is None or s["avg_cost"] is None:
            continue
        pts.append((b, s["avg_cost"], s["avg_quality"]))
    pts.sort(key=lambda x: x[1])  # by cost ascending

    print(f"{'baseline':<22} {'cost ($)':>12} {'quality':>10}  dominators?")
    for b, c, q in pts:
        dominators = []
        for b2, c2, q2 in pts:
            if b2 == b:
                continue
            if c2 <= c and q2 >= q and (c2 < c or q2 > q):
                dominators.append(f"{b2}")
        flag = ", ".join(dominators) if dominators else "(on Pareto)"
        print(f"  {b:<20} {c:>12.6f} {q:>10.4f}  {flag}")

    mooter_pt = next((p for p in pts if p[0] == "mooter"), None)
    oracle_pt = next((p for p in pts if p[0] == "oracle_quality"), None)
    t3_pt = next((p for p in pts if p[0] == "always_T3"), None)
    if mooter_pt:
        mname, mc, mq = mooter_pt
        # cost reduction vs always_T3
        if t3_pt:
            t3c = t3_pt[1]
            t3q = t3_pt[2]
            print(f"\n  Mooter vs always_T3: cost {100*mc/t3c:.1f}% | quality {100*mq/t3q:.1f}%")
            print(f"  Cost reduction:     {100*(1 - mc/t3c):.1f}%")
            print(f"  Quality retention:  {100*mq/t3q:.1f}%")
        if oracle_pt:
            oc, oq = oracle_pt[1], oracle_pt[2]
            print(f"  Mooter vs oracle:   cost {100*mc/oc:.1f}% | quality {100*mq/oq:.1f}%")
            print(f"  Gap to oracle:      quality {100*(oq-mq)/oq:.1f}pp below oracle")


analyze("PRIMARY MAPPING", data["primary_results"])
analyze("ALT MAPPING (sensitivity)", data["alt_results"])
