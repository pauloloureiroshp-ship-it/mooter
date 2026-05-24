"""Arm B — label fresh coding prompts with Ollama gemma3:12b as blind judge.

The judge sees the prompt + rubric, NOT the Mooter's output. Returns one of
{T0,T1,T2,T3} with one-line justification.
"""
import json
import subprocess
import sys
import io
import time
import re
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

REPO = Path(r"c:/Users/Paulo Loureiro/frugal")
ARM_B = REPO / ".planning" / "value-benchmark-2026-05" / "data" / "coding-fresh-prompts.jsonl"
OUT = REPO / ".planning" / "value-benchmark-2026-05" / "results" / "arm_b_judge_labels.jsonl"

JUDGE_MODEL = "gemma3:12b"

RUBRIC = """You are an independent rubric labeler. Read the developer prompt below and decide which tier of model is required to handle it well. Decide based on COMPLEXITY and RISK — do not consider cost.

Tiers (use exactly one of T0, T1, T2, T3):

T0 = TRIVIAL / MECHANICAL. Single-action edit: rename, typo fix, color change, single-line config change, format transform, trivial summary or single-fact lookup, regex you can write in 5 seconds. A local small model can handle it.

T1 = SIMPLE MECHANICAL with mild context. Commit message, docstring, short explanation of a known error, simple regex with edge cases, basic test case generation, language-quirk explanation, single small bug fix. A cheap fast model (Haiku-tier) handles it.

T2 = REASONING / DEBUGGING / COMPARISON. Bug investigation (root cause), comparison of 2-3 approaches with trade-offs, perf analysis, multi-step reasoning. Needs a mid-tier reasoning model (Sonnet-tier).

T3 = ARCHITECTURE / HIGH-RISK / MULTI-FILE / PRODUCTION. Multi-file refactors, architecture decisions with trade-offs, database migrations, anything touching production/CI/secrets, pre-merge or pre-deploy reviews, destructive operations (drop/delete), security audits, multi-service rollouts. Use Opus-tier.

RULES:
- "Help me reason about X" with non-trivial trade-offs => T2.
- Pre-merge / pre-deploy / pre-release / pre-rollback => T3 even if the change is small.
- Touches prod, .env, CI/CD, migrations, secrets, credentials => T3.
- Refactor across >3 files => T3.
- Length is NOT the criterion; complexity/risk is.

PROMPT:
\"\"\"
{PROMPT}
\"\"\"

Answer in this exact format on ONE line (no other text, no preamble, no explanation):
TIER=<T0|T1|T2|T3> | REASON=<one short sentence>
"""


def judge_one(prompt_text):
    rubric = RUBRIC.replace("{PROMPT}", prompt_text)
    res = subprocess.run(
        ["ollama", "run", JUDGE_MODEL, rubric],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=120,
    )
    out = (res.stdout or "").strip()
    err = (res.stderr or "").strip()
    # Find the FIRST "TIER=Tx" pattern in the output
    m = re.search(r"TIER\s*=\s*(T[0-3])", out)
    if m:
        tier = m.group(1)
    else:
        # Fall back: just grab first T0..T3 token in output
        m2 = re.search(r"\bT([0-3])\b", out)
        tier = f"T{m2.group(1)}" if m2 else "UNK"
    reason_m = re.search(r"REASON\s*=\s*([^\n]+)", out)
    reason = reason_m.group(1).strip() if reason_m else out[:200].replace("\n", " ")
    return tier, reason, out, err


def main():
    arm_b = [json.loads(line) for line in ARM_B.read_text(encoding="utf-8").splitlines() if line.strip()]
    print(f"Judging {len(arm_b)} prompts with {JUDGE_MODEL}...", flush=True)

    out_f = OUT.open("w", encoding="utf-8")
    t0 = time.time()
    for i, rec in enumerate(arm_b):
        tier, reason, raw, err = judge_one(rec["prompt"])
        rec_out = {
            "id": rec["id"],
            "prompt": rec["prompt"],
            "expected_tier": rec["expected_tier"],
            "judge_tier": tier,
            "judge_reason": reason,
            "judge_raw": raw[:500],
        }
        out_f.write(json.dumps(rec_out, ensure_ascii=False) + "\n")
        out_f.flush()
        if (i + 1) % 10 == 0 or i == len(arm_b) - 1:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            eta = (len(arm_b) - i - 1) / rate if rate > 0 else 0
            print(f"  [{i+1}/{len(arm_b)}] {rate:.2f}/s eta {eta:.0f}s | last: {rec['id']} expected={rec['expected_tier']} judge={tier}", flush=True)
    out_f.close()
    print(f"\nDone in {time.time()-t0:.1f}s — wrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
