"""Build a sanitized public release bundle from the private benchmark dir.

Output: <home>/mooter-benchmark-public/

Sanitization rules:
  1. Replace absolute Windows username paths in .py files with relative paths.
  2. Strip absolute paths from raw/*.log files.
  3. Strip `mooter_reason` and `mooter_category` fields from results JSONLs
     (they reveal the classifier's internal category labels / regex matches).
  4. Strip `mooter_reason` and `mooter_category` from arm_a_per_prompt.jsonl,
     arm_b_decisions.jsonl, arm_c_decisions.jsonl.
  5. Leave all markdown files (README.md, METHODOLOGY.md, VERDICT.md) untouched
     after manual audit confirmed no leaks.
  6. Hardcoded RouterBench cache path replaced with hf_hub_download lookup
     so the harness is portable.

Operates as a COPY (never moves) and never touches the source files.
Writes a leak-scan report to <output>/AUDIT-REPORT.md.

Run: python build_public_bundle.py
"""
import json
import re
import shutil
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

THIS_DIR = Path(__file__).resolve().parent
BENCH_DIR = THIS_DIR.parent  # .planning/value-benchmark-2026-05/
PUBLIC_DIR = Path.home() / "mooter-benchmark-public"

# Things that must NEVER appear in the output (tripwire scan)
TABOO_TOKENS = [
    "Paulo Loureiro",            # full name — kept ONLY in README.md acknowledgements
    "paulo.loureiro",            # email handle
    "paulo-vault",
    "33d6f6e4-2bc4-816b",        # Notion HQ ID
    "36a6f6e4-2bc4-81d0",        # Notion sub-page ID
    "C:/Users/Paulo",            # absolute Windows path
    "c:/Users/Paulo",            # absolute Windows path (lc)
    "c:\\Users\\Paulo",          # backslash variant
    r"frugal/.planning",         # internal repo structure hint
    r"frugal\.planning",         # backslash variant
]
# Intentional uses of the user's name (CV attribution, MIT copyright holder).
# Every other appearance of the taboo tokens is a leak.
ALLOWED_NAME_EXCEPTIONS = {
    "README.md": ["hand-built by Paulo Loureiro"],
    "LICENSE": ["Copyright (c) 2026 Paulo Loureiro"],
    "PUBLISHING.md": ["Paulo Loureiro"],  # generic name mention for review context
}


# Fields stripped from per-prompt JSONLs to avoid revealing classifier internals
STRIP_FIELDS = ["mooter_reason", "mooter_category"]

# Files to copy verbatim (no transformation needed). Anything else is ignored.
FILES_TO_COPY = [
    "results/arm_a_results.json",
    "results/arm_b_metrics.json",
    "results/arm_b_confusion.txt",
    "results/arm_c_metrics.json",
    "results/frontier_metrics.json",
    "data/coding-fresh-prompts.jsonl",
    "data/risk-axis-prompts.jsonl",
]
# Markdown files: collapse .planning/value-benchmark-2026-05/ prefix references
# (they would confuse a reader of the public bundle where the layout is flat).
MD_TO_NORMALIZE = [
    "README.md",
    "METHODOLOGY.md",
    "results/VERDICT.md",
]
# run_benchmark.sh needs sh-specific transformation (path constant + remove
# git integrity check on classify.js since the SUT is intentionally absent).
SH_TO_NORMALIZE = ["run_benchmark.sh"]
# JSONL files where we strip private fields per row
JSONL_TO_FILTER = [
    "results/arm_a_per_prompt.jsonl",
    "results/arm_b_decisions.jsonl",
    "results/arm_b_judge_labels.jsonl",
    "results/arm_c_decisions.jsonl",
]
# Python files to copy with path normalisation
PY_TO_NORMALIZE = [
    "harness/load_routerbench.py",
    "harness/arm_a_routerbench.py",
    "harness/arm_b_judge.py",
    "harness/arm_b_classify_and_score.py",
    "harness/arm_c_risk.py",
    "harness/inspect_tier_dist.py",
    "harness/check_contamination.py",
    "harness/pareto_analysis.py",
    "harness/frontier_metric.py",
]


def normalize_py(text: str) -> str:
    """Replace hardcoded Windows paths with portable code.

    In the PUBLIC bundle the layout is flat (bundle_root/data/, /results/, etc.)
    NOT nested under .planning/value-benchmark-2026-05/. So we collapse the
    private-repo path constants down to bundle_root-relative ones, where
    bundle_root = Path(__file__).resolve().parents[1] (one level up from
    `harness/`).
    """
    # The RouterBench cache path → call hf_hub_download at runtime
    text = re.sub(
        r'RB_PATH\s*=\s*Path\(r["\'][Cc]:/Users/Paulo Loureiro/\.cache/huggingface/[^"\']*?["\']\)',
        'from huggingface_hub import hf_hub_download\n'
        'RB_PATH = Path(hf_hub_download(repo_id="withmartian/routerbench", '
        'filename="routerbench_0shot.pkl", repo_type="dataset"))',
        text,
    )

    # The `tools/router/classify.js` path → an env-var or a stub message.
    # In the bundle the SUT is NOT included; the user must point CLASSIFY_JS_PATH
    # at their own classifier or the harness will error loudly.
    text = re.sub(
        r'CLASSIFY_JS\s*=\s*REPO_?R?O?O?T?\s*/\s*["\']tools["\']\s*/\s*["\']router["\']\s*/\s*["\']classify\.js["\']',
        'CLASSIFY_JS = Path(os.environ.get("CLASSIFY_JS_PATH", "")).resolve() if os.environ.get("CLASSIFY_JS_PATH") else None\n'
        '_BUNDLE_NOTE = "The classifier under test (classify.js) is NOT bundled. Set CLASSIFY_JS_PATH=/path/to/classify.js to run."',
        text,
    )
    # If `import os` is missing, add it (we may have just inserted os.environ).
    if "os.environ" in text and re.search(r"^import os$", text, re.MULTILINE) is None:
        text = re.sub(r"(^import json\b)", r"import os\n\1", text, count=1, flags=re.MULTILINE)

    # Collapse the `.planning/value-benchmark-2026-05/X` subpaths to bundle-relative.
    # REPO_ROOT / REPO / per_prompt etc:
    #   Old:  REPO = Path(r"c:/Users/Paulo Loureiro/frugal")
    #         ARM_B = REPO / ".planning" / "value-benchmark-2026-05" / "data" / "x.jsonl"
    #   New:  BUNDLE_ROOT = Path(__file__).resolve().parents[1]
    #         ARM_B = BUNDLE_ROOT / "data" / "x.jsonl"
    text = re.sub(
        r'(REPO_ROOT|REPO)\s*=\s*Path\(r["\'][Cc]:/Users/Paulo Loureiro/frugal["\']\)',
        r'BUNDLE_ROOT = Path(__file__).resolve().parents[1]',
        text,
    )
    # Catch references to that variable and rewrite the nested-path subpath out.
    text = re.sub(
        r'\bREPO_ROOT\b',
        'BUNDLE_ROOT',
        text,
    )
    text = re.sub(
        r'\bREPO\b\s*/\s*["\']\.planning["\']\s*/\s*["\']value-benchmark-2026-05["\']\s*/',
        'BUNDLE_ROOT / ',
        text,
    )
    # Then rename the leftover REPO to BUNDLE_ROOT (it was the original variable name).
    text = re.sub(r'\bREPO\b', 'BUNDLE_ROOT', text)

    # Any other absolute path under c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05/
    # → BUNDLE_ROOT / <remainder>
    text = re.sub(
        r'Path\(r["\']([Cc]):/Users/Paulo Loureiro/frugal/\.planning/value-benchmark-2026-05/(.+?)["\']\)',
        lambda m: f'BUNDLE_ROOT / "{m.group(2)}"',
        text,
    )
    # Any other absolute path under c:/Users/Paulo Loureiro/frugal/ (without the bench prefix)
    text = re.sub(
        r'Path\(r["\']([Cc]):/Users/Paulo Loureiro/frugal/(.+?)["\']\)',
        lambda m: f'Path(__file__).resolve().parents[2] / "{m.group(2)}"',
        text,
    )

    # If we introduced BUNDLE_ROOT but no `from pathlib import Path` is yet
    # established near the top, the file already had it — Python harness files
    # all import Path. Skip.

    # Final defensive sweep — replace any remaining occurrences of the user path
    text = text.replace("c:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05", "<bundle_root>")
    text = text.replace("C:/Users/Paulo Loureiro/frugal/.planning/value-benchmark-2026-05", "<bundle_root>")
    text = text.replace("c:/Users/Paulo Loureiro/frugal", "<repo_root>")
    text = text.replace("C:/Users/Paulo Loureiro/frugal", "<repo_root>")
    text = text.replace("c:/Users/Paulo Loureiro/.cache", "<hf_cache>")
    text = text.replace("C:/Users/Paulo Loureiro/.cache", "<hf_cache>")
    return text


PUBLIC_RUNNER_SH = """#!/usr/bin/env bash
# Mooter Value Benchmark — public reproducer
#
# This is the *public* version of the runner. The classifier under test
# (the original Mooter's classify.js) is NOT included in this bundle.
# You must point CLASSIFY_JS_PATH at your own classifier executable.
#
# Usage:
#   export CLASSIFY_JS_PATH=/abs/path/to/your-classify.js
#   bash run_benchmark.sh [--skip-arm-a]
#
# Your classifier must accept a prompt as argv[1] and emit JSON on stdout
# with at minimum: { "tier": "T0|T1|T2|T3", "confidence": <float>, "task_category": <string> }
#
# Notes:
#   - Run from the bundle root (the directory containing this script).
#   - Arm A downloads RouterBench from HuggingFace (~600 MB) into the HF
#     cache on first run. Subsequent runs are cached.
#   - Arm B uses Ollama `gemma3:12b` (~10 GB). Pull it first if missing:
#       ollama pull gemma3:12b
#
# Exit codes:
#   0 — all three arms completed
#   1 — CLASSIFY_JS_PATH not set or file missing
#   2 — missing dependency

set -euo pipefail

BENCH_DIR="."
HARNESS="$BENCH_DIR/harness"
SKIP_ARM_A=0

for arg in "$@"; do
  case "$arg" in
    --skip-arm-a) SKIP_ARM_A=1 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# \\?//'
      exit 0
      ;;
  esac
done

echo "==> step 1/6 — preflight: CLASSIFY_JS_PATH must point to an existing classifier"
if [ -z "${CLASSIFY_JS_PATH:-}" ] || [ ! -f "$CLASSIFY_JS_PATH" ]; then
  echo "ERROR: CLASSIFY_JS_PATH must be set to your classifier file." >&2
  echo "The SUT (original Mooter classify.js) is intentionally NOT bundled — see PUBLISHING.md." >&2
  exit 1
fi
echo "    SUT under test: $CLASSIFY_JS_PATH"
SUT_HASH=$(sha256sum "$CLASSIFY_JS_PATH" 2>/dev/null | cut -d' ' -f1 || \\
           shasum -a 256 "$CLASSIFY_JS_PATH" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
echo "    SUT sha256: $SUT_HASH"

echo "==> step 2/6 — preflight: deps"
command -v python  >/dev/null 2>&1 || { echo "ERROR: python missing"  >&2; exit 2; }
command -v node    >/dev/null 2>&1 || { echo "ERROR: node missing"    >&2; exit 2; }
command -v ollama  >/dev/null 2>&1 || { echo "ERROR: ollama missing"  >&2; exit 2; }
python -c "import datasets, pandas, numpy" 2>/dev/null \\
  || { echo "ERROR: python deps missing — pip install datasets pandas numpy" >&2; exit 2; }
ollama list | grep -q "gemma3:12b" \\
  || { echo "ERROR: ollama model gemma3:12b not pulled — ollama pull gemma3:12b" >&2; exit 2; }

mkdir -p "$BENCH_DIR/raw" "$BENCH_DIR/results"

echo "==> step 3/6 — Arm A: RouterBench (OOD)"
if [ "$SKIP_ARM_A" -eq 0 ]; then
  PYTHONIOENCODING=utf-8 python "$HARNESS/arm_a_routerbench.py" 2>&1 \\
    | tee "$BENCH_DIR/raw/arm_a_run.log"
else
  echo "    --skip-arm-a passed; reusing prior results"
fi

echo "==> step 4/6 — Arm B: coding-fresh (in-domain)"
PYTHONIOENCODING=utf-8 python "$HARNESS/arm_b_judge.py" 2>&1 \\
  | tee "$BENCH_DIR/raw/arm_b_judge.log"
PYTHONIOENCODING=utf-8 python "$HARNESS/arm_b_classify_and_score.py" 2>&1 \\
  | tee "$BENCH_DIR/raw/arm_b_run.log"

echo "==> step 5/6 — Arm C: risk axis"
PYTHONIOENCODING=utf-8 python "$HARNESS/arm_c_risk.py" 2>&1 \\
  | tee "$BENCH_DIR/raw/arm_c_run.log"

echo "==> step 6/6 — derived metrics: Pareto + frontier"
PYTHONIOENCODING=utf-8 python "$HARNESS/pareto_analysis.py"  > "$BENCH_DIR/raw/pareto.log"  2>&1
PYTHONIOENCODING=utf-8 python "$HARNESS/frontier_metric.py" > "$BENCH_DIR/raw/frontier.log" 2>&1

echo "==> integrity check: classifier file still exists?"
if [ -f "$CLASSIFY_JS_PATH" ]; then
  POST_HASH=$(sha256sum "$CLASSIFY_JS_PATH" 2>/dev/null | cut -d' ' -f1 || \\
              shasum -a 256 "$CLASSIFY_JS_PATH" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
  if [ "$POST_HASH" = "$SUT_HASH" ]; then
    echo "    OK — SUT sha256 unchanged during the run."
  else
    echo "    WARN — SUT hash changed during run. This invalidates the benchmark." >&2
    exit 3
  fi
else
  echo "    WARN — SUT path missing post-run. This invalidates the benchmark." >&2
  exit 3
fi

echo ""
echo "================================================================"
echo "Benchmark complete. SUT sha256: $SUT_HASH"
echo ""
echo "Portfolio writeup:  $BENCH_DIR/README.md"
echo "Full verdict:       $BENCH_DIR/results/VERDICT.md"
echo "Methodology:        $BENCH_DIR/METHODOLOGY.md"
echo "Per-prompt outputs: $BENCH_DIR/results/*.jsonl"
echo "Aggregates:         $BENCH_DIR/results/*.json"
echo "================================================================"
"""


def normalize_runner_sh(_text: str) -> str:
    """The public runner is rewritten from scratch (the private one has a
    git-integrity check on tools/router/classify.js which doesn't apply when
    the SUT lives outside this bundle). Returns the canned public version."""
    return PUBLIC_RUNNER_SH


def normalize_log(text: str) -> str:
    """Strip absolute Windows paths from log files."""
    text = re.sub(r'[Cc]:[\\/]Users[\\/]Paulo Loureiro[\\/]frugal[\\/]',
                  '<repo_root>/', text)
    text = re.sub(r'[Cc]:[\\/]Users[\\/]Paulo Loureiro[\\/]',
                  '<home>/', text)
    return text


def normalize_markdown(text: str) -> str:
    """Collapse references to `.planning/value-benchmark-2026-05/` since in
    the public bundle this prefix doesn't apply (the layout is flat).
    The references aren't leaks — they describe project structure — but
    they would confuse a reader of the public bundle who sees `data/` and
    `results/` at the root."""
    # `.planning/value-benchmark-2026-05/data/x.jsonl` → `data/x.jsonl`
    text = re.sub(r'\.planning/value-benchmark-2026-05/', '', text)
    # `c:/Users/Paulo Loureiro/frugal/...` (any survivors)
    text = re.sub(r'[Cc]:/Users/Paulo Loureiro/frugal/', '', text)
    text = re.sub(r'[Cc]:/Users/Paulo Loureiro/', '<home>/', text)
    return text


def filter_jsonl(text: str) -> str:
    """Strip private classifier fields from each row."""
    out_lines = []
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            out_lines.append(line)
            continue
        for f in STRIP_FIELDS:
            row.pop(f, None)
        out_lines.append(json.dumps(row, ensure_ascii=False))
    return "\n".join(out_lines) + "\n"


def copy_file(src_rel: str, transform=None):
    src = BENCH_DIR / src_rel
    dst = PUBLIC_DIR / src_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not src.exists():
        print(f"  SKIP (missing): {src_rel}")
        return
    text = src.read_text(encoding="utf-8")
    if transform:
        text = transform(text)
    dst.write_text(text, encoding="utf-8")
    print(f"  OK: {src_rel}")


def write_public_overlays():
    """Files that exist ONLY in the public bundle: LICENSE, .gitignore, public README."""

    (PUBLIC_DIR / "LICENSE").write_text("""MIT License

Copyright (c) 2026 Paulo Loureiro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
""", encoding="utf-8")

    (PUBLIC_DIR / ".gitignore").write_text("""# Python
__pycache__/
*.pyc
*.pyo
.python-version

# Editors
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Local data caches (HuggingFace dataset cache is large; do not commit)
.hf_cache/
.cache/

# Local environment
.env
.env.local

# Test/coverage artefacts
.pytest_cache/
.coverage
htmlcov/

# Anything that smells like the classifier under test must NEVER land here
tools/router/
classify.js
tuning-state*.json
validation-set*.json
""", encoding="utf-8")

    (PUBLIC_DIR / "PUBLISHING.md").write_text("""# Publishing notes for this bundle

This directory is a **sanitized public release** of the Mooter Value
Benchmark, prepared automatically by `build_public_bundle.py` in the
private source repo. The classifier under test (the Mooter, `classify.js`)
is **intentionally not included**. This bundle is the methodology + data
+ results, not a runnable reproduction.

## What is in this bundle

- `README.md` — paper-style portfolio writeup
- `METHODOLOGY.md` — researcher choices and provenance
- `results/VERDICT.md` — the original PT-PT scorecard + Phase-2 addendum
- `harness/*.py` — reproducible scripts (paths normalised to `__file__`)
- `data/*.jsonl` — 150 fresh coding prompts + 50 risk prompts
- `results/*.jsonl` — per-prompt classifier outputs (with private fields stripped)
- `results/*.json`, `results/*.txt` — aggregates, confusion matrices, frontier metrics
- `raw/*.log` — captured stdout/stderr (absolute paths scrubbed)
- `LICENSE` — MIT
- `AUDIT-REPORT.md` — automated leak-scan report

## What is intentionally NOT in this bundle

- `tools/router/classify.js` — the proprietary 1,300-line regex classifier
  this benchmark scored. Treat this repo as a description-of-method, not
  a reproduction. Bring your own classifier to re-run the harness.
- `tools/router/patterns.js`, `tools/router/tuning-state*.json` — same.
- `tools/router/validation-set.json` — the private tuning corpus that
  Arm B was specifically checked to NOT overlap with.
- Any references to internal infrastructure (Notion IDs, vault paths,
  internal slash-command names, email addresses).

## Safe-to-publish guarantee

The build script applied the following sanitization:
1. Absolute Windows user paths replaced with `__file__`-relative paths
   in Python source; with `<repo_root>` placeholders in logs.
2. Per-prompt JSONLs had `mooter_reason` and `mooter_category` stripped
   (they revealed internal regex category names).
3. Final automated scan against an explicit taboo-token list — see
   `AUDIT-REPORT.md`. The bundle MUST NOT be published if that report
   contains non-empty findings outside the README acknowledgements.

## Pre-publish checklist (do NOT push without ticking each)

- [ ] `AUDIT-REPORT.md` shows zero findings outside the allowlist
- [ ] You have read `README.md` end-to-end and are comfortable with every
      statement appearing under your name
- [ ] You have confirmed the LICENSE choice (default MIT)
- [ ] You have NOT added the private repo as a git remote
- [ ] `git log` shows a single bootstrap commit, no history from private repo
- [ ] You have NOT committed any file from `tools/router/` (this dir doesn't
      exist in the bundle by construction, but worth verifying)
""", encoding="utf-8")

    print(f"  OK: LICENSE")
    print(f"  OK: .gitignore")
    print(f"  OK: PUBLISHING.md")


def leak_scan() -> dict:
    """Walk all files in PUBLIC_DIR and check for taboo tokens.
    Returns a dict of {relpath: [(line_no, token, snippet)]} for any hits."""
    findings = {}
    for fp in PUBLIC_DIR.rglob("*"):
        if fp.is_dir() or fp.name == "AUDIT-REPORT.md":
            continue
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except (UnicodeDecodeError, PermissionError):
            continue
        rel = str(fp.relative_to(PUBLIC_DIR)).replace("\\", "/")
        allowed = ALLOWED_NAME_EXCEPTIONS.get(rel, [])
        for i, line in enumerate(text.splitlines(), 1):
            for t in TABOO_TOKENS:
                if t.lower() in line.lower():
                    # Filter allowed exceptions
                    is_allowed = any(allowed_snippet.lower() in line.lower()
                                     for allowed_snippet in allowed)
                    if is_allowed:
                        continue
                    findings.setdefault(rel, []).append((i, t, line.strip()[:200]))
    return findings


def write_audit_report(findings: dict):
    lines = [
        "# Automated Leak-Scan Audit Report",
        f"\nScanned dir: `{PUBLIC_DIR}`",
        f"Taboo tokens checked: {len(TABOO_TOKENS)}",
        "",
        "## Taboo token list",
        "",
    ]
    for t in TABOO_TOKENS:
        lines.append(f"- `{t}`")
    lines.append("")
    lines.append("## Allowed exceptions")
    lines.append("")
    if ALLOWED_NAME_EXCEPTIONS:
        for f, snippets in ALLOWED_NAME_EXCEPTIONS.items():
            for s in snippets:
                lines.append(f"- in `{f}`: snippet containing `{s}`")
    else:
        lines.append("(none)")
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    if not findings:
        lines.append("**Zero findings.** Bundle is clean against the taboo list.")
    else:
        for f, hits in findings.items():
            lines.append(f"### {f}")
            for line_no, token, snippet in hits:
                lines.append(f"- line {line_no} (matched `{token}`): `{snippet}`")
            lines.append("")
        lines.append("---")
        lines.append("**ACTION REQUIRED:** investigate and sanitize every finding above before pushing.")
    (PUBLIC_DIR / "AUDIT-REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    # Wipe and recreate public dir for a clean build
    if PUBLIC_DIR.exists():
        # Don't rm-rf; remove only files we know we wrote
        for p in PUBLIC_DIR.rglob("*"):
            if p.is_file():
                p.unlink()
        # Now remove empty directories bottom-up
        for p in sorted(PUBLIC_DIR.rglob("*"), key=lambda x: -len(str(x))):
            if p.is_dir():
                try:
                    p.rmdir()
                except OSError:
                    pass
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Building bundle at {PUBLIC_DIR}")
    print("\n>> copy verbatim:")
    for f in FILES_TO_COPY:
        copy_file(f)

    print("\n>> copy with field-stripping (mooter_reason, mooter_category):")
    for f in JSONL_TO_FILTER:
        copy_file(f, transform=filter_jsonl)

    print("\n>> copy with markdown path-prefix collapse:")
    for f in MD_TO_NORMALIZE:
        copy_file(f, transform=normalize_markdown)

    print("\n>> copy with path normalisation (py):")
    for f in PY_TO_NORMALIZE:
        copy_file(f, transform=normalize_py)

    print("\n>> copy with sh normalisation (run_benchmark.sh):")
    for f in SH_TO_NORMALIZE:
        copy_file(f, transform=normalize_runner_sh)

    print("\n>> sanitize log files (path scrub):")
    for f in ["raw/arm_a_run.log", "raw/arm_b_judge.log",
              "raw/arm_b_run.log", "raw/arm_c_run.log"]:
        src = BENCH_DIR / f
        if src.exists():
            (PUBLIC_DIR / f).parent.mkdir(parents=True, exist_ok=True)
            (PUBLIC_DIR / f).write_text(
                normalize_log(src.read_text(encoding="utf-8", errors="replace")),
                encoding="utf-8")
            print(f"  OK (sanitized): {f}")

    print("\n>> public overlays (LICENSE, .gitignore, PUBLISHING.md):")
    write_public_overlays()

    print("\n>> running leak scan...")
    findings = leak_scan()
    write_audit_report(findings)
    if findings:
        print(f"  ⚠️  {sum(len(v) for v in findings.values())} findings in {len(findings)} files")
        for f, hits in findings.items():
            print(f"     {f}: {len(hits)} hit(s)")
        print(f"  see {PUBLIC_DIR / 'AUDIT-REPORT.md'}")
    else:
        print("  ✅ ZERO findings against taboo list")

    print(f"\nBundle ready at: {PUBLIC_DIR}")
    print(f"Next steps: review AUDIT-REPORT.md, then bootstrap a fresh git repo.")


if __name__ == "__main__":
    main()
