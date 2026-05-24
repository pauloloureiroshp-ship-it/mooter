"""Verify Arm B prompts have NO close overlap with the Mooter's validation corpus.

Strategy: tokenize both sides into 5-grams; flag any Arm B prompt that shares
>= 3 5-grams with any validation-set entry. This catches near-duplicate phrasing
even after light paraphrase."""
import json
import sys
import io
import re
from pathlib import Path
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

REPO = Path(r"c:/Users/Paulo Loureiro/frugal")
ARM_B = REPO / ".planning" / "value-benchmark-2026-05" / "data" / "coding-fresh-prompts.jsonl"
VAL_SET = REPO / "tools" / "router" / "validation-set.json"
HIST_SAMPLE = REPO / "tools" / "router" / "validation-set-sample-historical.js"


def tokenize(s):
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) >= 2]


def shingles(toks, n=5):
    return {tuple(toks[i:i+n]) for i in range(len(toks) - n + 1)} if len(toks) >= n else set()


def load_corpus():
    """Returns list[(label, prompt)] of all corpus entries to avoid."""
    corpus = []
    if VAL_SET.exists():
        data = json.loads(VAL_SET.read_text(encoding="utf-8"))
        for bucket in ("canonical", "adversarial", "historical"):
            for entry in data.get(bucket, []):
                if "prompt" in entry:
                    corpus.append((f"val:{bucket}", entry["prompt"]))
    if HIST_SAMPLE.exists():
        text = HIST_SAMPLE.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r'prompt:\s*"([^"]+)"', text):
            corpus.append(("hist:sample", m.group(1)))
        for m in re.finditer(r"prompt:\s*'([^']+)'", text):
            corpus.append(("hist:sample", m.group(1)))
    return corpus


def main():
    corpus = load_corpus()
    print(f"Validation corpus entries: {len(corpus)}")
    corpus_shingles = [(label, shingles(tokenize(p))) for label, p in corpus]

    arm_b = [json.loads(line) for line in ARM_B.read_text(encoding="utf-8").splitlines() if line.strip()]
    print(f"Arm B prompts: {len(arm_b)}")
    # tier breakdown
    bucket = Counter(r["expected_tier"] for r in arm_b)
    print(f"Tier breakdown: {dict(bucket)}")

    flagged = []
    for rec in arm_b:
        toks = tokenize(rec["prompt"])
        sh = shingles(toks)
        if not sh:
            continue
        for label, c_sh in corpus_shingles:
            overlap = sh & c_sh
            if len(overlap) >= 3:
                flagged.append((rec["id"], label, len(overlap), rec["prompt"][:80]))
                break
    print(f"\nFlagged (>=3 shared 5-grams with corpus): {len(flagged)}")
    for fid, label, n, p in flagged:
        print(f"  {fid} | corpus={label} | overlap_5grams={n} | {p}")

    # Length distribution
    lengths = [len(r["prompt"]) for r in arm_b]
    print(f"\nPrompt length: min={min(lengths)} median={sorted(lengths)[len(lengths)//2]} max={max(lengths)}")


if __name__ == "__main__":
    main()
