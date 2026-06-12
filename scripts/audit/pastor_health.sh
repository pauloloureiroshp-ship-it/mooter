#!/usr/bin/env bash
# Wave 55 (Phase D.3) — Pastor LoRA health. Read-only: reports the runtime Pastor
# state (~/.mooter/pastor) and the in-repo training corpus. Absent runtime state
# is a ⚠️ (Pastor adapters are not yet materialised — Wave 31/Mega finding), not a
# failure: the corpus + trainer are what matter for the overnight train.
#
#   bash scripts/audit/pastor_health.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOME_DIR="${MOOTER_HOME:-$HOME/.mooter}"
PASTOR="$HOME_DIR/pastor"

echo "🐂 Pastor LoRA health"

# 1. Runtime Pastor state
if [ -d "$PASTOR" ]; then
  echo "✅ pastor dir present: $PASTOR"
  ls -1 "$PASTOR" 2>/dev/null | sed 's/^/     /' | head -20
else
  echo "⚠️  pastor runtime dir absent ($PASTOR) — adapters not materialised yet (expected pre-train)"
fi

# 2. Materialised adapters
ADAPTERS="$HOME_DIR/adapters"
if [ -d "$ADAPTERS" ] && [ -n "$(ls -A "$ADAPTERS" 2>/dev/null)" ]; then
  echo "✅ adapters present:"; ls -1 "$ADAPTERS" | sed 's/^/     /'
else
  echo "⚠️  no materialised adapters ($ADAPTERS) — train via scripts/train_lora.sh (see docs/strategy/LORA_TRAINING_RUNBOOK.md)"
fi

# 3. In-repo training corpus (authoritative — what the trainer consumes). Run node
# from $ROOT with a RELATIVE path (node.exe can't resolve an MSYS /c/… absolute).
CORPUS="$ROOT/audit/lora_train.jsonl"
if [ -f "$CORPUS" ]; then
  TOTAL="$(wc -l < "$CORPUS" | tr -d ' ')"
  HIGH="$(cd "$ROOT" && node -e "let c=0;for(const l of require('fs').readFileSync('audit/lora_train.jsonl','utf8').trim().split('\n')){try{if((JSON.parse(l).score||0)>=8)c++;}catch{}}console.log(c)" 2>/dev/null || echo '?')"
  echo "✅ training corpus: $TOTAL samples ($HIGH at score≥8 — trainer floor is 20)"
else
  echo "❌ training corpus missing ($CORPUS)"
fi

# 4. Trainer present
[ -f "$ROOT/scripts/train_lora.sh" ] && echo "✅ trainer: scripts/train_lora.sh" || echo "❌ trainer missing"
[ -f "$ROOT/scripts/requirements-lora.txt" ] && echo "✅ pinned deps: scripts/requirements-lora.txt (unsloth 2026.6.1)" || echo "⚠️  requirements-lora.txt missing"

echo "🐮 pastor health: corpus + trainer are the gate; runtime adapters land after the overnight train."
