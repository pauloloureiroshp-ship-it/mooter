#!/usr/bin/env bash
# sync-to-runtime.sh — copy router files from frugal repo (source of truth)
# to ~/.claude/tools/router/ (runtime location used by hooks).
#
# The frugal repo is the git-versioned source. The runtime in ~/.claude/
# is what hooks actually execute. This script keeps them in sync.
#
# Usage:
#   bash tools/router/sync-to-runtime.sh              # sync all
#   bash tools/router/sync-to-runtime.sh --dry-run    # show what would change
#   bash tools/router/sync-to-runtime.sh --diff       # show diffs only
#
# Run after each commit to frugal/tools/router/* to propagate changes.
# Could be wired into a post-commit hook if desired.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$HOME/.claude/tools/router"

DRY_RUN=false
DIFF_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --diff)    DIFF_ONLY=true ;;
  esac
done

# Files to sync (JS modules used by hooks + runtime config).
# Excludes: test files, docs, .cmd scripts, data files (decisions.log etc),
# and tuning-state.json (runtime-owned, written by update-router.js —
# syncing it would overwrite live tuning with stale canonical defaults).
SYNC_FILES=(
  paths.js
  classify.js
  patterns.js
  inject_context.js
  arbiter.js
  backtest.js
  feedback-collector.js
  savings-tracker.js
  shadow-mode.js
  shadow-judge.js
  signals.js
  ground-truth.js
  similarity.js
  privacy.js
  user-profile.js
  pricing.js
  event-builder.js
  budget-engine.js
  frugal-mode.js
  ollama_call.sh
  anthropic_call.sh
  model-catalog.json
  model-profile.json
  version.json
  quota-tracker.js
  statusline-multi.js
  token_tracker.js
  providers/_load-env.js
  providers/codex-cli.js
  providers/openai-api.js
  providers/ollama-api.js
  providers/CODEX_CLI_NOTES.md
  providers/README.md
)

echo "Sync: $REPO_DIR → $RUNTIME_DIR"
echo ""

synced=0
skipped=0
diverged=0

for f in "${SYNC_FILES[@]}"; do
  src="$REPO_DIR/$f"
  dst="$RUNTIME_DIR/$f"

  if [ ! -f "$src" ]; then
    continue
  fi

  # Make sure subdirectories under RUNTIME_DIR exist (e.g. providers/).
  dst_dir="$(dirname "$dst")"
  if [ "$DRY_RUN" = false ] && [ "$DIFF_ONLY" = false ]; then
    mkdir -p "$dst_dir"
  fi

  if [ ! -f "$dst" ]; then
    echo "  NEW  $f"
    if [ "$DRY_RUN" = false ] && [ "$DIFF_ONLY" = false ]; then
      cp "$src" "$dst"
      synced=$((synced + 1))
    else
      diverged=$((diverged + 1))
    fi
    continue
  fi

  if diff -q "$src" "$dst" > /dev/null 2>&1; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "  DIFF $f"
  if [ "$DIFF_ONLY" = true ]; then
    diff --color=auto "$dst" "$src" | head -20 || true
    echo ""
  fi
  diverged=$((diverged + 1))

  if [ "$DRY_RUN" = false ] && [ "$DIFF_ONLY" = false ]; then
    # Backup runtime version before overwriting
    cp "$dst" "$dst.sync-bak" 2>/dev/null || true
    cp "$src" "$dst"
    synced=$((synced + 1))
  fi
done

echo ""
echo "Result: $synced synced, $skipped identical, $diverged diverged"
if [ "$DRY_RUN" = true ]; then
  echo "(dry-run — no files changed)"
fi
