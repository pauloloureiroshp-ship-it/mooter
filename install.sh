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
  echo "  frugal — running comprehensive doctor check..."
  echo ""
  if command -v node >/dev/null 2>&1 && [ -f "$ROUTER_DIR/frugal-doctor.js" ]; then
    node "$ROUTER_DIR/frugal-doctor.js" "$@"
    exit $?
  fi
  # Fallback: basic checks if frugal-doctor.js not installed yet
  echo "Claude Code Router — Doctor (basic)"
  echo "════════════════════════════════════"
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

  SKILL_COUNT=$(ls "$CLAUDE_DIR/skills/" 2>/dev/null | grep -c "^frugal" || echo 0)
  if [ "$SKILL_COUNT" -ge 8 ]; then
    ok "$SKILL_COUNT frugal slash commands installed (/frugal-status, /frugal-savings, /frugal-beast, /frugal-zen, /frugal-auto, etc.)"
  else
    warn "frugal slash commands missing ($SKILL_COUNT/8) — re-run install.sh to add them"
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
  for skill in frugal-status frugal-savings frugal-update frugal-summary frugal-route frugal-beast frugal-zen frugal-auto frugal-hello frugal-doctor; do
    do_run "rm -rf '$CLAUDE_DIR/skills/$skill'"
  done
  for a in model-architect model-reasoner cheap-triage local-summarizer local-transformer final-reviewer; do
    do_run "rm -f '$CLAUDE_DIR/agents/$a.md'"
  done
  ok "Uninstalled. Backups kept in $CLAUDE_DIR/backups/."
  exit 0
fi

# ─────────────────────────────────────────────────────────────
# INSTALL mode
# ─────────────────────────────────────────────────────────────
echo ""
echo "  frugal v0.9.4"
echo "  Stop paying for a brain surgeon when you need a band-aid."
echo ""
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
#
# Source layout in the repo:
#   tools/router/*.{js,sh,cmd}   → runtime router scripts (canonical)
#   agents/*.md                   → subagent definitions
#   skills/model-router/*.md      → optional slash command skill
#   docs/*.md                     → routing policy + how-it-works reference
#   CLAUDE.md                     → mediator doctrine
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SRC_DIR/tools/router" ] && [ -d "$SRC_DIR/agents" ]; then
  do_run "mkdir -p '$ROUTER_DIR' '$CLAUDE_DIR/agents' '$CLAUDE_DIR/skills/model-router' '$CLAUDE_DIR/docs' '$CLAUDE_DIR/hooks'"
  do_run "cp '$SRC_DIR/tools/router/'*.js '$ROUTER_DIR/'"
  do_run "cp '$SRC_DIR/tools/router/'*.sh '$ROUTER_DIR/' 2>/dev/null || true"
  do_run "cp '$SRC_DIR/tools/router/'*.cmd '$ROUTER_DIR/' 2>/dev/null || true"
  # Hook files ship alongside router scripts in the repo but live under hooks/ at runtime.
  # Keep the canonical copies in ~/.claude/hooks/ and remove the duplicates created
  # by the bulk *.js cp above (which would otherwise sit in router/ as orphans).
  if [ -f "$SRC_DIR/tools/router/gsd-statusline.js" ]; then
    do_run "cp '$SRC_DIR/tools/router/gsd-statusline.js' '$CLAUDE_DIR/hooks/gsd-statusline.js'"
  fi
  if [ -f "$SRC_DIR/tools/router/gsd-turn-end.js" ]; then
    do_run "cp '$SRC_DIR/tools/router/gsd-turn-end.js' '$CLAUDE_DIR/hooks/gsd-turn-end.js'"
  fi
  if [ -f "$SRC_DIR/tools/router/frugal-turn-header.js" ]; then
    do_run "cp '$SRC_DIR/tools/router/frugal-turn-header.js' '$CLAUDE_DIR/hooks/frugal-turn-header.js'"
  fi
  do_run "rm -f '$ROUTER_DIR/gsd-statusline.js' '$ROUTER_DIR/gsd-turn-end.js' '$ROUTER_DIR/frugal-turn-header.js' 2>/dev/null || true"
  do_run "cp '$SRC_DIR/agents/'*.md '$CLAUDE_DIR/agents/'"
  do_run "cp '$SRC_DIR/skills/model-router/'*.md '$CLAUDE_DIR/skills/model-router/' 2>/dev/null || true"
  # Install frugal slash command skills
  for skill in frugal-status frugal-savings frugal-update frugal-summary frugal-route frugal-beast frugal-zen frugal-auto frugal-hello frugal-doctor; do
    if [ -d "$SRC_DIR/skills/$skill" ]; then
      do_run "mkdir -p '$CLAUDE_DIR/skills/$skill'"
      do_run "cp '$SRC_DIR/skills/$skill/SKILL.md' '$CLAUDE_DIR/skills/$skill/SKILL.md'"
    fi
  done
  ok "installed 10 frugal slash commands (/frugal-status, /frugal-savings, /frugal-update, /frugal-summary, /frugal-route, /frugal-beast, /frugal-zen, /frugal-auto, /frugal-hello, /frugal-doctor)"
  do_run "cp '$SRC_DIR/docs/'*.md '$CLAUDE_DIR/docs/' 2>/dev/null || true"
  if [ ! -f "$CLAUDE_DIR/CLAUDE.md" ] || [ "$FORCE" = "1" ]; then
    do_run "cp '$SRC_DIR/CLAUDE.md' '$CLAUDE_DIR/CLAUDE.md'"
    ok "installed CLAUDE.md doctrine"
  else
    warn "CLAUDE.md exists — not overwriting (use --force to replace, backup is in $BACKUP_DIR)"
  fi
  do_run "chmod +x $ROUTER_DIR/*.sh $ROUTER_DIR/*.js 2>/dev/null || true"
  ok "installed router files into $ROUTER_DIR"
else
  warn "tools/router/ or agents/ directory not found in $SRC_DIR — running in self-test mode"
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
      fs.writeFileSync(path, JSON.stringify(s, null, 2));
    \""
    ok "hook registered in settings.json"
  fi
  # frugal-turn-header.js — second UserPromptSubmit hook that emits a visible
  # "routing → tier · model · confidence · est. save" message every turn, so
  # users SEE the routing decision (not just hidden in the hint).
  if grep -q "frugal-turn-header.js" "$CLAUDE_DIR/settings.json"; then
    ok "turn-header hook already registered"
  else
    say "merging turn-header hook into settings.json…"
    do_run "node -e \"
      const fs=require('fs');
      const path='$CLAUDE_DIR/settings.json';
      const s=JSON.parse(fs.readFileSync(path,'utf8'));
      s.hooks=s.hooks||{};
      s.hooks.UserPromptSubmit=s.hooks.UserPromptSubmit||[];
      s.hooks.UserPromptSubmit.push({hooks:[{type:'command',command:'node \\\"$CLAUDE_DIR/hooks/frugal-turn-header.js\\\"',timeout:3}]});
      fs.writeFileSync(path, JSON.stringify(s, null, 2));
    \""
    ok "turn-header hook registered in settings.json"
  fi
  # Stop hook — feedback loop telemetry (writes turn_end events for backtest.resolveFeedback)
  if grep -q "gsd-turn-end.js" "$CLAUDE_DIR/settings.json"; then
    ok "Stop hook already registered"
  else
    say "merging Stop hook into settings.json…"
    do_run "node -e \"
      const fs=require('fs');
      const path='$CLAUDE_DIR/settings.json';
      const s=JSON.parse(fs.readFileSync(path,'utf8'));
      s.hooks=s.hooks||{};
      s.hooks.Stop=s.hooks.Stop||[];
      s.hooks.Stop.push({hooks:[{type:'command',command:'node \\\"$CLAUDE_DIR/hooks/gsd-turn-end.js\\\"',timeout:3}]});
      fs.writeFileSync(path, JSON.stringify(s, null, 2));
    \""
    ok "Stop hook registered in settings.json (feedback loop enabled)"
  fi
else
  warn "settings.json not found — Claude Code may not be installed or not yet run once"
  warn "  Open Claude Code at least once, then re-run this installer to register the hook"
fi

# 7. Subscription profile wizard (interactive, only if not already configured)
SUB_PROFILE_PATH="$ROUTER_DIR/subscription-profile.json"
if [ ! -f "$SUB_PROFILE_PATH" ] || [ "$FORCE" = "1" ]; then
  echo ""
  say "Let's configure your subscription profile so frugal can route optimally."
  echo ""
  printf "  Do you have Claude Max (unlimited Opus)? [y/N]: "
  read -r HAS_MAX < /dev/tty 2>/dev/null || HAS_MAX="n"
  printf "  Do you have an Anthropic API key (pay-per-token)? [y/N]: "
  read -r HAS_API < /dev/tty 2>/dev/null || HAS_API="n"
  printf "  Do you have an OpenAI API key? [y/N]: "
  read -r HAS_OPENAI < /dev/tty 2>/dev/null || HAS_OPENAI="n"
  printf "  Do you have Gemini API access? [y/N]: "
  read -r HAS_GEMINI < /dev/tty 2>/dev/null || HAS_GEMINI="n"

  # Map answers to profile values
  case "${HAS_MAX,,}" in y|yes|s|sim) ANTHROPIC_PLAN="max" ;;
    *) case "${HAS_API,,}" in y|yes|s|sim) ANTHROPIC_PLAN="api-paid" ;;
       *) ANTHROPIC_PLAN="none" ;; esac ;;
  esac
  case "${HAS_OPENAI,,}" in y|yes|s|sim) OPENAI_PLAN="api-paid" ;; *) OPENAI_PLAN="none" ;; esac
  case "${HAS_GEMINI,,}" in y|yes|s|sim) GEMINI_PLAN="api-paid" ;; *) GEMINI_PLAN="none" ;; esac

  do_run "node -e \"
    const fs=require('fs');
    const profile={
      updated_at: new Date().toISOString(),
      profiles: { anthropic: '$ANTHROPIC_PLAN', openai: '$OPENAI_PLAN', gemini: '$GEMINI_PLAN' },
      budget_strategy: 'auto',
      notes: 'Configured during install.sh v2'
    };
    fs.writeFileSync('$SUB_PROFILE_PATH', JSON.stringify(profile, null, 2));
  \""
  ok "subscription profile saved (anthropic: $ANTHROPIC_PLAN | openai: $OPENAI_PLAN | gemini: $GEMINI_PLAN)"
else
  ok "subscription profile already configured — skipping wizard"
fi

# 8. macOS LaunchAgent for auto-learning backtest at 02:00 daily
if [ "$(uname)" = "Darwin" ]; then
  LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$LAUNCH_AGENTS_DIR/com.frugal.backtest.plist"
  BACKTEST_LOG="$ROUTER_DIR/backtest-cron.log"

  if [ ! -f "$PLIST_PATH" ]; then
    say "Installing macOS LaunchAgent (backtest at 02:00 daily)…"
    do_run "mkdir -p '$LAUNCH_AGENTS_DIR'"
    if [ "$DRY_RUN" = "0" ]; then
      cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frugal.backtest</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(command -v node)</string>
        <string>$ROUTER_DIR/backtest.js</string>
        <string>--export-delta</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$BACKTEST_LOG</string>
    <key>StandardErrorPath</key>
    <string>$BACKTEST_LOG</string>
    <key>RunAtLoad</key>
    <false/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
PLIST_EOF
      if launchctl load "$PLIST_PATH" 2>/dev/null; then
        ok "LaunchAgent installed and loaded (backtest runs daily at 02:00)"
      else
        ok "LaunchAgent file installed at $PLIST_PATH"
        warn "Could not load automatically — run: launchctl load '$PLIST_PATH'"
      fi
    fi
  else
    ok "macOS LaunchAgent already installed"
  fi
elif [ "$(uname)" != "Darwin" ] && [ ! "$IS_WINDOWS" ]; then
  # Linux cron fallback
  if command -v crontab >/dev/null 2>&1; then
    if ! crontab -l 2>/dev/null | grep -q "backtest.js"; then
      say "Adding cron job for auto-learning backtest at 02:00 daily…"
      do_run "(crontab -l 2>/dev/null; echo '0 2 * * * $(command -v node) $ROUTER_DIR/backtest.js --export-delta >> $ROUTER_DIR/backtest-cron.log 2>&1') | crontab -"
      ok "cron job added (backtest at 02:00 daily)"
    else
      ok "cron job already configured"
    fi
  fi
fi

# 9. Start savings tracker in background
if command -v node >/dev/null 2>&1 && [ -f "$ROUTER_DIR/savings-tracker.js" ]; then
  if ! curl -sf "http://127.0.0.1:7821/health" >/dev/null 2>&1; then
    say "Starting savings tracker (port 7821)…"
    do_run "nohup node '$ROUTER_DIR/savings-tracker.js' >/dev/null 2>&1 &"
    sleep 1
    if curl -sf "http://127.0.0.1:7821/health" >/dev/null 2>&1; then
      ok "savings tracker running on :7821"
    else
      warn "savings tracker starting (will be ready on next prompt)"
    fi
  else
    ok "savings tracker already running on :7821"
  fi
fi

# 10. Smoke test — validate the classifier works
if command -v node >/dev/null 2>&1 && [ -f "$ROUTER_DIR/smoke-test.js" ]; then
  say "Running smoke test…"
  SMOKE_OUT=$(node "$ROUTER_DIR/smoke-test.js" 2>&1)
  SMOKE_EXIT=$?
  if [ "$SMOKE_EXIT" = "0" ]; then
    ok "smoke test passed — classifier is working"
  else
    warn "smoke test had failures:"
    echo "$SMOKE_OUT" | grep "✗" | sed 's/^/    /'
  fi
fi

# ── Final summary ────────────────────────────────────────────────────────────
echo ""
echo "  ┌────────────────────────────────────────────────────┐"
echo "  │   frugal v0.9.4 installation complete              │"
echo "  └────────────────────────────────────────────────────┘"
echo ""
ok "Files installed to $CLAUDE_DIR"
ok "Hook registered in settings.json"
if [ "$(uname)" = "Darwin" ]; then
  ok "LaunchAgent: backtest auto-learning at 02:00 daily"
fi
echo ""
say "Next steps:"
echo "  1. Open Claude Code in any project"
echo "  2. Type: /frugal-hello  (see your first routing decision)"
echo "  3. Type: /frugal-status (full health check)"
echo "  4. Use Claude normally — frugal routes silently in the background"
echo ""
say "Verify everything is working:"
echo "  node $ROUTER_DIR/frugal-doctor.js"
echo "  node $ROUTER_DIR/frugal-doctor.js --fix   (auto-fix issues)"
echo ""