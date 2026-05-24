"""Inspect Mooter's tier distribution on Arm A and quick sanity checks."""
import json
import sys
import io
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

per_prompt = Path(r"c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05/results/arm_a_per_prompt.jsonl")

dist = Counter()
cat_dist = Counter()
per_eval = defaultdict(Counter)
conf_buckets = defaultdict(list)

with per_prompt.open(encoding="utf-8") as f:
    for line in f:
        r = json.loads(line)
        t = r.get("mooter_tier", "ERROR")
        dist[t] += 1
        cat_dist[r.get("mooter_category") or "?"] += 1
        per_eval[r["eval_name"]][t] += 1
        c = r.get("mooter_confidence")
        if c is not None:
            conf_buckets[t].append(c)

total = sum(dist.values())
print(f"Total prompts: {total}\n")
print("Mooter tier distribution:")
for t, n in sorted(dist.items()):
    pct = 100.0 * n / total
    avg_conf = sum(conf_buckets[t]) / len(conf_buckets[t]) if conf_buckets[t] else None
    print(f"  {t}: {n} ({pct:.1f}%)   avg_conf={avg_conf:.3f}" if avg_conf else f"  {t}: {n} ({pct:.1f}%)")

print("\nTop 10 task_category labels:")
for cat, n in cat_dist.most_common(10):
    print(f"  {cat}: {n} ({100.0*n/total:.1f}%)")

print("\nPer eval_name tier breakdown (selected):")
for ev in ["grade-school-math", "hellaswag", "winogrande", "mbpp",
          "mmlu-college-mathematics", "mtbench"]:
    if ev in per_eval:
        c = per_eval[ev]
        tot = sum(c.values())
        line = " ".join(f"{t}={c[t]}" for t in ["T0", "T1", "T2", "T3"] if c[t])
        print(f"  {ev:<35} n={tot:<4}  {line}")
