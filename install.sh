#!/usr/bin/env bash
# install.sh — one-command installer for the Claude Code Router.
#
# Bootstrap a personal mediator-router into ~/.claude/ on a fresh machine.
# Idempotent: safe to re-run. Backs up anything it touches.
#
# Usage:
#   bash install.sh                 # full install
#   bash install.sh --dry-run       # show what would change
#   bash install.sh --uninstall     # restore backups, remove router files
#   bash install.sh --doctor        # diagnose current install
#
# Detects:
#   - existing ~/.claude (creates if missing)
#   - existing settings.json hooks (merges non-destructively)
#   - ollama binary + recommended models
#   - ANTHROPIC_API_KEY in env
#   - existing CLAUDE.md (will not overwrite without --force)

set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
ROUTER_DIR="$CLAUDE_DIR/tools/router"
BACKUP_DIR="$CLAUDE_DIR/backups/install-$(date +%Y%m%d-%H%M%S)"
RECOMMENDED_OLLAMA_TERSE="qwen2.5:3b"
RECOMMENDED_OLLAMA_REASON="qwen3:30b"

DRY_RUN=0
UNINSTALL=0
DOCTOR=0
FORCE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --doctor)    DOCTOR=1; shift ;;
    --force)     FORCE=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

say()    { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
ok()     { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn()   { printf '\033[1;33m⚠\033[0m %s\n' "$*"; }
fail()   { printf '\033[1;31m✗\033[0m %s\n' "$*"; }
do_run() { if [ "$DRY_RUN" = "1" ]; then echo "  [dry-run] $*"; else eval "$@"; fi; }

# ─────────────────────────────────────────────────────────────
# DOCTOR mode
# ─────────────────────────────────────────────────────────────
if [ "$DOCTOR" = "1" ]; then
  echo ""
  echo "Claude Code Router — Doctor"
  echo "═══════════════════════════"
  [ -d "$CLAUDE_DIR" ] && ok "~/.claude exists" || fail "~/.claude missing"
  [ -f "$CLAUDE_DIR/CLAUDE.md" ] && ok "CLAUDE.md present" || warn "CLAUDE.md missing"
  [ -f "$CLAUDE_DIR/settings.json" ] && ok "settings.json present" || warn "settings.json missing"
  [ -f "$ROUTER_DIR/classify.js" ] && ok "classifier installed" || fail "classifier missing"
  [ -f "$ROUTER_DIR/inject_context.js" ] && ok "hook entry installed" || fail "hook missing"

  if command -v ollama >/dev/null 2>&1; then
    ok "ollama detected: $(ollama --version 2>/dev/null | head -1)"
    MODELS=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')
    if echo "$MODELS" | grep -q "$RECOMMENDED_OLLAMA_TERSE"; then
      ok "terse model present: $RECOMMENDED_OLLAMA_TERSE"
    else
      warn "terse model missing — run: ollama pull $RECOMMENDED_OLLAMA_TERSE"
    fi
  else
    warn "ollama not found — install from https://ollama.com (T0 tier will be unavailable)"
  fi

  if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    ok "ANTHROPIC_API_KEY set — T1 (direct Haiku) tier active"
  else
    warn "ANTHROPIC_API_KEY not set — T1 will route through cheap-triage subagent (still works)"
  fi

  if [ -f "$ROUTER_DIR/decisions.log" ]; then
    LINES=$(wc -l < "$ROUTER_DIR/decisions.log")
    ok "telemetry log has $LINES decisions — run: node $ROUTER_DIR/stats.js"
  else
    warn "no decisions yet — telemetry will start on next prompt"
  fi
  echo ""
  exit 0
fi

# ─────────────────────────────────────────────────────────────
# UNINSTALL mode
# ─────────────────────────────────────────────────────────────
if [ "$UNINSTALL" = "1" ]; then
  say "Uninstalling Claude Code Router…"
  LATEST_BACKUP=$(ls -1dt "$CLAUDE_DIR/backups"/*/ 2>/dev/null | head -1 || true)
  if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP/settings.json.bak" ]; then
    do_run "cp '$LATEST_BACKUP/settings.json.bak' '$CLAUDE_DIR/settings.json'"
    ok "restored settings.json from $LATEST_BACKUP"
  fi
  do_run "rm -f '$CLAUDE_DIR/CLAUDE.md'"
  do_run "rm -rf '$ROUTER_DIR'"
  do_run "rm -rf '$CLAUDE_DIR/skills/model-router'"
  for a in model-architect model-reasoner cheap-triage local-summarizer local-transformer final-reviewer; do
    do_run "rm -f '$CLAUDE_DIR/agents/$a.md'"
  done
  ok "Uninstalled. Backups kept in $CLAUDE_DIR/backups/."
  exit 0
fi

# ─────────────────────────────────────────────────────────────
# INSTALL mode
# ─────────────────────────────────────────────────────────────
say "Claude Code Router — installer"
say "Target: $CLAUDE_DIR"

# 1. ~/.claude exists?
if [ ! -d "$CLAUDE_DIR" ]; then
  warn "~/.claude does not exist — Claude Code may not be installed."
  warn "Install Claude Code first: https://docs.anthropic.com/claude-code"
  exit 3
fi

# 2. backup
do_run "mkdir -p '$BACKUP_DIR'"
[ -f "$CLAUDE_DIR/settings.json" ] && do_run "cp '$CLAUDE_DIR/settings.json' '$BACKUP_DIR/settings.json.bak'"
[ -f "$CLAUDE_DIR/CLAUDE.md" ] && do_run "cp '$CLAUDE_DIR/CLAUDE.md' '$BACKUP_DIR/CLAUDE.md.bak'"
ok "backed up to $BACKUP_DIR"

# 3. ollama check
if command -v ollama >/dev/null 2>&1; then
  ok "ollama detected"
  if ! ollama list 2>/dev/null | grep -q "$RECOMMENDED_OLLAMA_TERSE"; then
    say "pulling $RECOMMENDED_OLLAMA_TERSE (~1.9 GB)…"
    do_run "ollama pull $RECOMMENDED_OLLAMA_TERSE"
  else
    ok "$RECOMMENDED_OLLAMA_TERSE already installed"
  fi
else
  warn "ollama not found — T0 tier will be unavailable until you install it"
  warn "  → https://ollama.com/download"
fi

# 4. anthropic key
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set — T1 will use cheap-triage subagent (slightly higher latency, still works)"
  warn "  → optional: add 'export ANTHROPIC_API_KEY=...' to your shell rc"
fi

# 5. file install: copies from repo root (this script's parent) into ~/.claude/
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SRC_DIR/router" ] && [ -d "$SRC_DIR/agents" ]; then
  do_run "mkdir -p '$ROUTER_DIR' '$CLAUDE_DIR/agents' '$CLAUDE_DIR/skills/model-router' '$CLAUDE_DIR/docs'"
  do_run "cp '$SRC_DIR/router/'*.js '$SRC_DIR/router/'*.sh '$ROUTER_DIR/'"
  do_run "cp '$SRC_DIR/agents/'*.md '$CLAUDE_DIR/agents/'"
  do_run "cp '$SRC_DIR/skills/model-router/'*.md '$CLAUDE_DIR/skills/model-router/'"
  do_run "cp '$SRC_DIR/docs/'*.md '$CLAUDE_DIR/docs/'"
  if [ ! -f "$CLAUDE_DIR/CLAUDE.md" ] || [ "$FORCE" = "1" ]; then
    do_run "cp '$SRC_DIR/CLAUDE.md' '$CLAUDE_DIR/CLAUDE.md'"
    ok "installed CLAUDE.md doctrine"
  else
    warn "CLAUDE.md exists — not overwriting (use --force to replace, backup is in $BACKUP_DIR)"
  fi
  do_run "chmod +x $ROUTER_DIR/*.sh $ROUTER_DIR/*.js"
  ok "installed router files into $ROUTER_DIR"
else
  warn "router/ or agents/ directory not found in $SRC_DIR — running in self-test mode"
fi

# 6. settings.json hook merge (non-destructive)
if [ -f "$CLAUDE_DIR/settings.json" ]; then
  if grep -q "inject_context.js" "$CLAUDE_DIR/settings.json"; then
    ok "UserPromptSubmit hook already registered"
  else
    say "merging UserPromptSubmit hook into settings.json…"
    do_run "node -e \"
      const fs=require('fs');
      const path='$CLAUDE_DIR/settings.json';
      const s=JSON.parse(fs.readFileSync(path,'utf8'));
      s.hooks=s.hooks||{};
      s.hooks.UserPromptSubmit=s.hooks.UserPromptSubmit||[];
      s.hooks.UserPromptSubmit.push({hooks:[{type:'command',command:'node \\\"$ROUTER_DIR/inject_context.js\\\"',timeout:3}]});
      fs.writeFileSync(path,JSON.stringify(s,null,2));
    \""
    ok "hook installed"
  fi
fi

# 7. self-test
say "running self-test…"
if [ -f "$ROUTER_DIR/classify.js" ]; then
  TEST_OUT=$(node "$ROUTER_DIR/classify.js" "refator a arquitetura para multi-tenant" 2>&1 || echo FAIL)
  if echo "$TEST_OUT" | grep -q '"tier": "T3"'; then
    ok "classifier working: T3 detected for architecture prompt"
  else
    fail "classifier self-test failed:"
    echo "$TEST_OUT"
    exit 4
  fi
fi

# 8. benchmark (optional)
if [ -f "$ROUTER_DIR/benchmark.sh" ] && [ "$DRY_RUN" = "0" ]; then
  say "running benchmark (12 prompts, ~5s)…"
  bash "$ROUTER_DIR/benchmark.sh" 2>&1 | tail -8
fi

echo ""
ok "Install complete!"
echo ""
echo "Next steps:"
echo "  • Open a new Claude Code session (CLAUDE.md auto-loads)"
echo "  • Try a prompt — you'll see a <router-hint> in the next reply"
echo "  • After 10+ prompts: node $ROUTER_DIR/stats.js"
echo "  • Re-run: bash $0 --doctor"
echo ""
echo "Documentation:"
echo "  • $CLAUDE_DIR/docs/HOW_IT_WORKS.md"
echo "  • $CLAUDE_DIR/docs/ROUTING_POLICY.md"
echo "  • $CLAUDE_DIR/docs/BENEFITS.md"
echo "  • $CLAUDE_DIR/docs/VALIDATION_REPORT.md"
echo ""
