#!/usr/bin/env bash
# Mooter Value Benchmark — one-command reproducer.
#
# Usage:  bash .planning/value-benchmark-2026-05/run_benchmark.sh [--skip-arm-a]
#
# Notes:
#   - Run from the repo root (parent of .planning/).
#   - Arm A downloads RouterBench from HuggingFace (~600 MB) into the HF cache
#     on first run. Subsequent runs are cached.
#   - Arm B uses Ollama `gemma3:12b` (~10 GB). Pull it first if missing:
#       ollama pull gemma3:12b
#   - The benchmark MUST be run against an unmodified `tools/router/classify.js`.
#     This script asserts the working tree is clean for that file and aborts
#     if not.
#
# Exit codes:
#   0 — all three arms completed
#   1 — classify.js dirty (refuse to benchmark a modified classifier)
#   2 — missing dependency
#   3 — runtime failure in one of the arms

set -euo pipefail

BENCH_DIR=".planning/value-benchmark-2026-05"
HARNESS="$BENCH_DIR/harness"
SKIP_ARM_A=0

for arg in "$@"; do
  case "$arg" in
    --skip-arm-a) SKIP_ARM_A=1 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

echo "==> step 1/6 — preflight: classify.js must be untouched"
if ! git diff --quiet -- tools/router/classify.js; then
  echo "ERROR: tools/router/classify.js has uncommitted changes. Refusing." >&2
  echo "Stash or revert first; this benchmark requires a frozen classifier." >&2
  exit 1
fi
HEAD_HASH=$(git rev-parse HEAD)
echo "    frozen at HEAD = $HEAD_HASH"

echo "==> step 2/6 — preflight: deps"
command -v python  >/dev/null 2>&1 || { echo "ERROR: python missing"  >&2; exit 2; }
command -v node    >/dev/null 2>&1 || { echo "ERROR: node missing"    >&2; exit 2; }
command -v ollama  >/dev/null 2>&1 || { echo "ERROR: ollama missing"  >&2; exit 2; }
python -c "import datasets, pandas, numpy" 2>/dev/null \
  || { echo "ERROR: python deps missing — pip install datasets pandas numpy" >&2; exit 2; }
ollama list | grep -q "gemma3:12b" \
  || { echo "ERROR: ollama model gemma3:12b not pulled — ollama pull gemma3:12b" >&2; exit 2; }

mkdir -p "$BENCH_DIR/raw" "$BENCH_DIR/results"

echo "==> step 3/6 — Arm A: RouterBench (OOD)"
if [ "$SKIP_ARM_A" -eq 0 ]; then
  PYTHONIOENCODING=utf-8 python "$HARNESS/arm_a_routerbench.py" 2>&1 \
    | tee "$BENCH_DIR/raw/arm_a_run.log" \
    || { echo "Arm A failed" >&2; exit 3; }
else
  echo "    --skip-arm-a passed; reusing prior results"
fi

echo "==> step 4/6 — Arm B: coding-fresh (in-domain)"
PYTHONIOENCODING=utf-8 python "$HARNESS/arm_b_judge.py" 2>&1 \
  | tee "$BENCH_DIR/raw/arm_b_judge.log" \
  || { echo "Arm B judge failed" >&2; exit 3; }

PYTHONIOENCODING=utf-8 python "$HARNESS/arm_b_classify_and_score.py" 2>&1 \
  | tee "$BENCH_DIR/raw/arm_b_run.log" \
  || { echo "Arm B scoring failed" >&2; exit 3; }

echo "==> step 5/6 — Arm C: risk axis"
PYTHONIOENCODING=utf-8 python "$HARNESS/arm_c_risk.py" 2>&1 \
  | tee "$BENCH_DIR/raw/arm_c_run.log" \
  || { echo "Arm C failed" >&2; exit 3; }

echo "==> step 6/6 — derived metrics: Pareto + frontier"
PYTHONIOENCODING=utf-8 python "$HARNESS/pareto_analysis.py"  > "$BENCH_DIR/raw/pareto.log"  2>&1
PYTHONIOENCODING=utf-8 python "$HARNESS/frontier_metric.py" > "$BENCH_DIR/raw/frontier.log" 2>&1

echo "==> integrity check: classify.js still byte-identical?"
if git diff --quiet -- tools/router/classify.js; then
  echo "    OK — no changes to tools/router/classify.js during the benchmark."
else
  echo "    WARN — classify.js changed during the benchmark. THIS INVALIDATES THE RUN." >&2
  exit 3
fi

echo ""
echo "================================================================"
echo "Benchmark complete. Frozen HEAD: $HEAD_HASH"
echo ""
echo "Read the portfolio summary:   $BENCH_DIR/README.md"
echo "Read the full verdict:        $BENCH_DIR/results/VERDICT.md"
echo "Methodology + provenance:     $BENCH_DIR/METHODOLOGY.md"
echo "Per-prompt outputs:           $BENCH_DIR/results/*.jsonl"
echo "Aggregates:                   $BENCH_DIR/results/*.json"
echo "================================================================"
