#!/usr/bin/env bash
# Wave 26 (26.G) — overnight LoRA training wrapper (Paulo runs on the RTX 4090).
#
# Creates an isolated venv, installs the pinned CUDA training stack, and runs
# scripts/train_lora.py over the Wave 23 corpus (212 score>=8 samples). Produces
# mooter-pastor-v1.gguf (Q4_K_M) at the repo root.
#
# Claude Code prepares this script; it never executes it (no GPU in the CC env).
#
# Usage:
#   bash scripts/train_lora.sh            # full run with defaults
#   bash scripts/train_lora.sh --epochs 4 # pass-through args to train_lora.py
#
# Requirements: NVIDIA GPU (>=16GB; 4090 ideal), CUDA 12.x driver, Python 3.10-3.12.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VENV_DIR="${MOOTER_LORA_VENV:-$REPO_ROOT/.venv-lora}"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "✗ nvidia-smi not found — this trainer needs a CUDA GPU. Run on the 4090 box." >&2
  exit 1
fi

echo "▶ GPU:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true

if [ ! -d "$VENV_DIR" ]; then
  echo "▶ Creating venv at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "▶ Installing pinned training stack (first run only; cached after)…"
pip install --quiet --upgrade pip
# unsloth pulls a matching torch/transformers/trl/peft set for the local CUDA.
pip install --quiet \
  "unsloth==2025.5.1" \
  "trl==0.8.6" \
  "transformers>=4.43,<4.46" \
  "datasets>=2.19" \
  "peft>=0.11"

echo "▶ Training…"
python3 "$REPO_ROOT/scripts/train_lora.py" "$@"

echo "✓ Training wrapper finished. GGUF should be at: $REPO_ROOT/mooter-pastor-v1.gguf"
