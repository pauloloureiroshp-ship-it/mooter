#!/usr/bin/env bash
# uninstall.sh — frugal uninstaller
# Rollback clean. Always preserves decisions.log.
#
# Flag: --force (skip confirmation)
#
# Removes:
#   ~/.claude/tools/router/
#   ~/.claude/agents/{model-architect,model-reasoner,cheap-triage,local-summarizer,local-transformer,final-reviewer}
#   ~/.claude/skills/model-router/
#   frugal-specific docs in ~/.claude/docs/
#   `statusline` config block from ~/.claude/settings.json
#   `frugal mediator doctrine` section from ~/.claude/CLAUDE.md
#
# Never removes:
#   ~/.claude/decisions.log
#   ~/.claude/backups/
#   anything else in settings.json or CLAUDE.md

set -euo pipefail

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

CLAUDE_DIR="${HOME}/.claude"
ROUTER_DIR="${CLAUDE_DIR}/tools/router"
AGENTS_DIR="${CLAUDE_DIR}/agents"

echo "── frugal uninstaller ──"

if [ "$FORCE" -ne 1 ]; then
  read -rp "This will remove frugal from ~/.claude/. Continue? [y/N] " ans
  case "$ans" in y|Y|yes) ;; *) echo "Aborted."; exit 1 ;; esac
fi

# Find latest backup
LATEST_BACKUP=$(ls -1dt "${CLAUDE_DIR}/backups/frugal-install-"* 2>/dev/null | head -1 || true)

# Restore settings.json from backup if available
if [ -n "${LATEST_BACKUP}" ] && [ -f "${LATEST_BACKUP}/settings.json" ]; then
  cp "${LATEST_BACKUP}/settings.json" "${CLAUDE_DIR}/settings.json"
  echo "  ✓ Restored settings.json from ${LATEST_BACKUP}"
else
  echo "  ⚠ No backup found — leaving settings.json untouched"
fi

# Restore CLAUDE.md from backup if available
if [ -n "${LATEST_BACKUP}" ] && [ -f "${LATEST_BACKUP}/CLAUDE.md" ]; then
  cp "${LATEST_BACKUP}/CLAUDE.md" "${CLAUDE_DIR}/CLAUDE.md"
  echo "  ✓ Restored CLAUDE.md from ${LATEST_BACKUP}"
fi

# Remove router tools
[ -d "${ROUTER_DIR}" ] && rm -rf "${ROUTER_DIR}" && echo "  ✓ Removed ${ROUTER_DIR}"

# Remove frugal subagents
for agent in model-architect model-reasoner cheap-triage local-summarizer local-transformer final-reviewer; do
  for ext in md json; do
    f="${AGENTS_DIR}/${agent}.${ext}"
    [ -f "$f" ] && rm -f "$f" && echo "  ✓ Removed agents/${agent}.${ext}"
  done
done

# Remove model-router skill
[ -d "${CLAUDE_DIR}/skills/model-router" ] && rm -rf "${CLAUDE_DIR}/skills/model-router" \
  && echo "  ✓ Removed skills/model-router"

# Remove frugal docs
for doc in ROUTING_POLICY.md HOW_IT_WORKS.md MODEL_MAPPING.md LIMITATIONS.md VALIDATION_REPORT.md; do
  f="${CLAUDE_DIR}/docs/${doc}"
  [ -f "$f" ] && rm -f "$f" && echo "  ✓ Removed docs/${doc}"
done

# Confirm decisions.log preserved
if [ -f "${CLAUDE_DIR}/decisions.log" ]; then
  echo "  ✓ Preserved decisions.log ($(wc -l < "${CLAUDE_DIR}/decisions.log") entries)"
fi

echo ""
echo "── frugal removed ──"
echo "  Backups remain in ${CLAUDE_DIR}/backups/ — delete manually if no longer needed."
