"""Arm A — score Mooter against RouterBench (out-of-domain general benchmark).

Pipeline:
  1. Load routerbench_0shot.pkl with RestrictedUnpickler.
  2. Compute per-model average quality across all 36,497 prompts.
  3. Choose 4 rungs (weakest→strongest) and map T0..T3.
  4. Stratified subsample 3000 prompts across eval_name (16 datasets in RB).
  5. Run classify.js on each prompt in batch (subprocess).
  6. Score Mooter + baselines on each sampled prompt.
  7. Write per-baseline (avg_quality, avg_cost) + per-prompt JSONL.

Also runs a sensitivity check with an alternative mapping (skip-rungs).
"""
import sys
import io
import os
import json
import random
import subprocess
import time
from pathlib import Path
from collections import defaultdict

# Force UTF-8 stdout on Windows so printing prompts/responses doesn't blow up
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

THIS_DIR = Path(__file__).parent
BENCH_DIR = THIS_DIR.parent
sys.path.insert(0, str(THIS_DIR))
from load_routerbench import restricted_load  # type: ignore

REPO_ROOT = Path(r"c:/Users/Paulo Loureiro/frugal")
CLASSIFY_JS = REPO_ROOT / "tools" / "router" / "classify.js"
RB_PATH = Path(r"C:/Users/Paulo Loureiro/.cache/huggingface/hub/datasets--withmartian--routerbench/snapshots/784021482c3f320c6619ed4b3bb3b41a21424fcb/routerbench_0shot.pkl")

MODELS = [
    "WizardLM/WizardLM-13B-V1.2",
    "claude-instant-v1",
    "claude-v1",
    "claude-v2",
    "gpt-3.5-turbo-1106",
    "gpt-4-1106-preview",
    "meta/code-llama-instruct-34b-chat",
    "meta/llama-2-70b-chat",
    "mistralai/mistral-7b-chat",
    "mistralai/mixtral-8x7b-chat",
    "zero-one-ai/Yi-34B-Chat",
]

SAMPLE_N = 3000  # stratified across eval_name
SEED = 42


def to_quality_float(x):
    """Normalize the per-cell quality value.

    RouterBench quality columns are stored as 'object' dtype because they
    sometimes hold booleans, floats, or strings depending on the task family.
    """
    if x is None:
        return None
    if isinstance(x, bool):
        return float(x)
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        s = x.strip().lower()
        if s in ("true", "t", "yes"):
            return 1.0
        if s in ("false", "f", "no"):
            return 0.0
        try:
            return float(s)
        except ValueError:
            return None
    return None


def main():
    print(">> loading RouterBench...", flush=True)
    df = restricted_load(str(RB_PATH))
    print(f"   rows={len(df)} cols={len(df.columns)}", flush=True)

    # ── Step 1: rank models by average quality ──
    print(">> computing model rankings...", flush=True)
    rankings = {}
    for m in MODELS:
        col = df[m]
        vals = [to_quality_float(v) for v in col]
        vals = [v for v in vals if v is not None]
        if not vals:
            print(f"   WARN: model {m} has no parseable quality values")
            rankings[m] = float("nan")
        else:
            rankings[m] = sum(vals) / len(vals)
    sorted_models = sorted(rankings.items(), key=lambda kv: kv[1])
    print("   ranking (weakest→strongest):")
    for m, q in sorted_models:
        avg_cost_col = f"{m}|total_cost"
        costs = [c for c in df[avg_cost_col] if c is not None and c == c]
        avg_cost = sum(costs) / len(costs) if costs else float("nan")
        print(f"     q={q:.4f}  cost={avg_cost:.6f}  {m}")

    # ── Step 2: pick 4 rungs ──
    # Primary mapping: evenly-spaced quartiles across the ranking.
    n = len(sorted_models)
    primary_idx = [0, n // 3, 2 * n // 3, n - 1]
    primary_mapping = {
        "T0": sorted_models[primary_idx[0]][0],
        "T1": sorted_models[primary_idx[1]][0],
        "T2": sorted_models[primary_idx[2]][0],
        "T3": sorted_models[primary_idx[3]][0],
    }
    print(f">> primary mapping (T0..T3):")
    for t, m in primary_mapping.items():
        print(f"     {t} → {m}  (q={rankings[m]:.4f})")

    # Sensitivity mapping: skip-rungs (different rungs)
    alt_idx = [1, 3, 6, 9]  # different rungs
    alt_mapping = {
        "T0": sorted_models[alt_idx[0]][0],
        "T1": sorted_models[alt_idx[1]][0],
        "T2": sorted_models[alt_idx[2]][0],
        "T3": sorted_models[alt_idx[3]][0],
    }
    print(f">> sensitivity (alt) mapping (T0..T3):")
    for t, m in alt_mapping.items():
        print(f"     {t} → {m}  (q={rankings[m]:.4f})")

    # ── Step 3: stratified subsample ──
    print(">> stratified subsampling...", flush=True)
    eval_groups = defaultdict(list)
    for i in range(len(df)):
        eval_groups[df["eval_name"].iloc[i]].append(i)
    print(f"   eval_name buckets: {len(eval_groups)}")
    for name, idx in sorted(eval_groups.items()):
        print(f"     {name}: {len(idx)} rows")

    rng = random.Random(SEED)
    per_bucket = SAMPLE_N // max(1, len(eval_groups))
    sampled_idx = []
    for name, idx in eval_groups.items():
        rng.shuffle(idx)
        sampled_idx.extend(idx[:per_bucket])
    print(f"   sampled rows: {len(sampled_idx)}")

    # ── Step 4: extract prompts and per-model quality/cost rows ──
    rows = []
    for i in sampled_idx:
        row = df.iloc[i]
        prompt = str(row["prompt"])
        if not prompt or len(prompt) > 8000:
            continue
        rec = {
            "idx": int(i),
            "prompt": prompt,
            "eval_name": str(row["eval_name"]),
            "quality": {m: to_quality_float(row[m]) for m in MODELS},
            "cost": {m: (float(row[f"{m}|total_cost"]) if row[f"{m}|total_cost"] == row[f"{m}|total_cost"] else None) for m in MODELS},
            "oracle_model": str(row["oracle_model_to_route_to"]) if row["oracle_model_to_route_to"] is not None else None,
        }
        rows.append(rec)
    print(f"   usable rows after prompt filter: {len(rows)}")

    # ── Step 5: classify each prompt with Mooter ──
    print(">> running classify.js on each prompt...", flush=True)
    t0 = time.time()
    for i, rec in enumerate(rows):
        result = subprocess.run(
            ["node", str(CLASSIFY_JS), rec["prompt"]],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=30,
        )
        try:
            rec["mooter"] = json.loads(result.stdout)
        except json.JSONDecodeError:
            rec["mooter"] = {"tier": "ERROR", "error": result.stderr[:300]}
        if (i + 1) % 200 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(rows) - i - 1) / rate
            print(f"   [{i+1}/{len(rows)}] {rate:.1f}/s, eta {eta:.0f}s", flush=True)
    print(f"   total classify time: {time.time()-t0:.1f}s", flush=True)

    # ── Step 6: compute baselines per row ──
    BASELINES = ["mooter", "always_T0", "always_T1", "always_T2", "always_T3",
                 "random_seed1", "random_seed2", "random_seed3",
                 "length_heuristic", "tenline_classifier", "oracle_quality"]
    TIER_ORDER = ["T0", "T1", "T2", "T3"]

    def random_tier(seed, prompt):
        return random.Random(hash((seed, prompt)) & 0xFFFFFFFF).choice(TIER_ORDER)

    def length_heuristic(prompt):
        L = len(prompt)
        if L < 200:
            return "T0"
        if L < 600:
            return "T1"
        if L < 1500:
            return "T2"
        return "T3"

    RISK_KW = ["env", "deploy", "migration", "production", "secret",
               "credential", "force push", "drop table", "DROP TABLE",
               "rm -rf", "delete", "rollback", "release", "merge to main"]

    def tenline_classifier(prompt):
        L = len(prompt)
        risk = sum(1 for k in RISK_KW if k.lower() in prompt.lower())
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

    for rec in rows:
        rec["baselines"] = {
            "mooter": rec["mooter"].get("tier", "T3"),
            "always_T0": "T0",
            "always_T1": "T1",
            "always_T2": "T2",
            "always_T3": "T3",
            "random_seed1": random_tier(1, rec["prompt"]),
            "random_seed2": random_tier(2, rec["prompt"]),
            "random_seed3": random_tier(3, rec["prompt"]),
            "length_heuristic": length_heuristic(rec["prompt"]),
            "tenline_classifier": tenline_classifier(rec["prompt"]),
        }

    # ── Step 7: score each baseline under both mappings ──
    def aggregate(mapping):
        scores = defaultdict(lambda: {"n": 0, "q_sum": 0.0, "c_sum": 0.0, "q_n": 0, "c_n": 0})
        for rec in rows:
            for b, t in rec["baselines"].items():
                if t not in mapping:
                    continue
                model = mapping[t]
                q = rec["quality"].get(model)
                c = rec["cost"].get(model)
                s = scores[b]
                s["n"] += 1
                if q is not None:
                    s["q_sum"] += q
                    s["q_n"] += 1
                if c is not None:
                    s["c_sum"] += c
                    s["c_n"] += 1
        agg = {}
        for b, s in scores.items():
            agg[b] = {
                "n": s["n"],
                "avg_quality": (s["q_sum"] / s["q_n"]) if s["q_n"] else None,
                "avg_cost":    (s["c_sum"] / s["c_n"]) if s["c_n"] else None,
            }
        # Oracle: per-prompt, pick the cheapest model that gets the max quality
        # available across all 11 models. If multiple models match, cheapest wins.
        oracle_q_sum = oracle_c_sum = 0.0
        oracle_n = 0
        for rec in rows:
            best_q = max((q for q in rec["quality"].values() if q is not None), default=None)
            if best_q is None:
                continue
            candidates = [(m, rec["cost"].get(m, float("inf"))) for m, q in rec["quality"].items() if q == best_q]
            cheapest = min(candidates, key=lambda kv: (kv[1] if kv[1] is not None else float("inf")))
            mq = rec["quality"][cheapest[0]]
            mc = rec["cost"].get(cheapest[0])
            if mq is not None and mc is not None:
                oracle_q_sum += mq
                oracle_c_sum += mc
                oracle_n += 1
        agg["oracle_quality"] = {
            "n": oracle_n,
            "avg_quality": oracle_q_sum / oracle_n if oracle_n else None,
            "avg_cost":    oracle_c_sum / oracle_n if oracle_n else None,
        }
        return agg

    primary_agg = aggregate(primary_mapping)
    alt_agg = aggregate(alt_mapping)

    # ── Save outputs ──
    out_dir = BENCH_DIR / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Per-prompt jsonl
    with (out_dir / "arm_a_per_prompt.jsonl").open("w", encoding="utf-8") as f:
        for rec in rows:
            # Strip the heavy model_response columns (not needed)
            slim = {k: v for k, v in rec.items() if k != "mooter"}
            slim["mooter_tier"] = rec["mooter"].get("tier")
            slim["mooter_confidence"] = rec["mooter"].get("confidence")
            slim["mooter_category"] = rec["mooter"].get("task_category")
            f.write(json.dumps(slim, ensure_ascii=False) + "\n")
    # Aggregates
    with (out_dir / "arm_a_results.json").open("w", encoding="utf-8") as f:
        json.dump({
            "n_prompts": len(rows),
            "model_rankings": {m: q for m, q in sorted_models},
            "primary_mapping": primary_mapping,
            "alt_mapping": alt_mapping,
            "primary_results": primary_agg,
            "alt_results": alt_agg,
        }, f, indent=2, ensure_ascii=False)

    # ── Print summary table ──
    print("\n>> PRIMARY MAPPING RESULTS:")
    print(f"{'baseline':<22} {'avg_quality':>12} {'avg_cost':>12}")
    for b, s in sorted(primary_agg.items(), key=lambda kv: kv[1].get("avg_cost") or 0):
        q = s["avg_quality"]
        c = s["avg_cost"]
        print(f"  {b:<20} {q:>12.4f} {c:>12.6f}" if q is not None and c is not None else f"  {b:<20} {'-':>12} {'-':>12}")

    print("\n>> ALT MAPPING RESULTS:")
    for b, s in sorted(alt_agg.items(), key=lambda kv: kv[1].get("avg_cost") or 0):
        q = s["avg_quality"]
        c = s["avg_cost"]
        print(f"  {b:<20} {q:>12.4f} {c:>12.6f}" if q is not None and c is not None else f"  {b:<20} {'-':>12} {'-':>12}")


if __name__ == "__main__":
    main()
