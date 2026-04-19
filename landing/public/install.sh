#!/usr/bin/env bash
# install.sh — mooter installer (Mac + Linux)
#
# One-liner:
#   curl -fsSL https://mooter.ai/install.sh | bash
#
# What it does (zero-admin, zero-sudo):
#   1. Verifies Claude Code + Node 18 (degrades gracefully on Ollama / API key)
#   2. Copies runtime to ~/.claude/tools/router/  (the existing routing engine)
#   3. Copies CLI to   ~/.mooter/cli/             (the new `mooter` binary)
#   4. Drops shim at   ~/.local/bin/mooter        (shell PATH entry)
#   5. Writes env file ~/.mooter/env              (sourced by shell profiles)
#   6. Registers hooks in ~/.claude/settings.json (non-destructive merge)
#   7. Prints the 3 commands the user should run next
#
# Safe to re-run. Flags: --dry-run, --no-path, --force, --channel=<name>

set -eu

DRY_RUN=0
NO_PATH=0
FORCE=0
CHANNEL="${MOOTER_CHANNEL:-stable}"

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --no-path)    NO_PATH=1 ;;
    --force)      FORCE=1 ;;
    --channel=*)  CHANNEL="${arg#--channel=}" ;;
    -h|--help)
      sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# ── UI helpers ──────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C1=$'\033[1;36m'; C2=$'\033[1;32m'; C3=$'\033[1;33m'; C4=$'\033[1;31m'; CD=$'\033[2m'; CB=$'\033[1m'; CM=$'\033[1;35m'; CR=$'\033[0m'
else
  C1=""; C2=""; C3=""; C4=""; CD=""; CB=""; CM=""; CR=""
fi
say()  { printf "  %s>%s %s\n" "$C1" "$CR" "$*"; }
ok()   { printf "  %s[OK]%s %s\n" "$C2" "$CR" "$*"; }
warn() { printf "  %s[!!]%s %s\n" "$C3" "$CR" "$*"; }
fail() { printf "  %s[XX]%s %s\n" "$C4" "$CR" "$*"; }
info() { printf "  %s%s%s\n" "$CD" "$*" "$CR"; }
do_run() { if [ "$DRY_RUN" = "1" ]; then echo "  [dry-run] $*"; else eval "$@"; fi; }

# ── Paths ───────────────────────────────────────────────────────────────
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
ROUTER_DIR="$CLAUDE_DIR/tools/router"
HOOKS_DIR="$CLAUDE_DIR/hooks"
MOOTER_DIR="$HOME/.mooter"
MOOTER_CLI_DIR="$MOOTER_DIR/cli"
MOOTER_ENV="$MOOTER_DIR/env"
LOCAL_BIN="$HOME/.local/bin"
SHIM="$LOCAL_BIN/mooter"
DEVICE_DIR="$HOME/.frugal"

# Determine SRC_DIR. When piped from curl, we can't rely on $0 — we detect that
# and clone/download the repo to a temp dir.
if [ -n "${BASH_SOURCE:-}" ] && [ -f "${BASH_SOURCE:-}" ]; then
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE:-$0}")" && pwd)"
else
  SRC_DIR="$(cd "$(dirname "$0")" && pwd 2>/dev/null || echo "")"
fi

if [ ! -f "$SRC_DIR/tools/router/classify.js" ]; then
  say "Running from curl pipe — downloading mooter source..."
  TMP_DIR="$(mktemp -d)"
  if command -v git >/dev/null 2>&1; then
    do_run "git clone --depth 1 --quiet https://github.com/paulo-loureiro/mooter.git '$TMP_DIR'"
  else
    fail "git not found — install git first or download the tarball manually from mooter.ai"
    exit 3
  fi
  SRC_DIR="$TMP_DIR"
fi

VERSION="$(node -e "console.log(require('$SRC_DIR/tools/router/version.json').version)" 2>/dev/null || echo "0.10.0")"

# ── Banner ──────────────────────────────────────────────────────────────
echo ""
echo "  ${CM}mooter${CR} ${CD}v${VERSION} (${CHANNEL})${CR}"
echo "  ${CD}Intelligent model routing for Claude Code.${CR}"
echo ""

# ── Prereq checks ───────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin|Linux) ok "Platform: $OS" ;;
  *) fail "This script is for macOS/Linux. Windows: run install.ps1 instead."; exit 3 ;;
esac

if ! command -v claude >/dev/null 2>&1; then
  fail "Claude Code CLI not found on PATH."
  echo ""
  info "  mooter wraps Claude Code — you need it installed first:"
  info "    curl -fsSL https://claude.ai/install.sh | bash"
  echo ""
  info "  Once installed, re-run: curl -fsSL https://mooter.ai/install.sh | bash"
  echo ""
  exit 3
fi
ok "Claude Code detected: $(command -v claude)"

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Install from https://nodejs.org or: brew install node"
  exit 3
fi
NODE_VER="$(node --version | sed 's/v//')"
NODE_MAJOR="${NODE_VER%%.*}"
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js $NODE_VER found — mooter needs Node 18+."
  info "Upgrade: brew upgrade node  (or) nvm install 20"
  exit 3
fi
ok "Node.js v$NODE_VER"

if [ ! -d "$CLAUDE_DIR" ]; then
  fail "~/.claude not found — open Claude Code once, then re-run."
  exit 3
fi
ok "~/.claude present"

# ── Copy runtime ────────────────────────────────────────────────────────
say "Installing runtime to ~/.claude/tools/router/..."
do_run "mkdir -p '$ROUTER_DIR' '$HOOKS_DIR' '$CLAUDE_DIR/agents' '$CLAUDE_DIR/skills' '$CLAUDE_DIR/docs' '$MOOTER_CLI_DIR' '$LOCAL_BIN' '$DEVICE_DIR'"

do_run "cp '$SRC_DIR/tools/router/'*.js '$ROUTER_DIR/' 2>/dev/null || true"
do_run "cp '$SRC_DIR/tools/router/'*.json '$ROUTER_DIR/' 2>/dev/null || true"

# Hooks live under ~/.claude/hooks/ (not ~/.claude/tools/router/).
for h in gsd-statusline.js gsd-turn-end.js frugal-turn-header.js exec-logger.js PostToolUse.js; do
  [ -f "$SRC_DIR/tools/router/$h" ] && do_run "cp '$SRC_DIR/tools/router/$h' '$HOOKS_DIR/$h'"
  do_run "rm -f '$ROUTER_DIR/$h'"
done

# Copy CLI to ~/.mooter/cli/
do_run "cp -R '$SRC_DIR/tools/cli/'* '$MOOTER_CLI_DIR/'"
do_run "cp '$SRC_DIR/tools/router/version.json' '$MOOTER_DIR/version.json' 2>/dev/null || true"

# Copy agents + skills (best-effort)
do_run "cp '$SRC_DIR/agents/'*.md '$CLAUDE_DIR/agents/' 2>/dev/null || true"
if [ -d "$SRC_DIR/skills" ]; then
  for skill in "$SRC_DIR/skills"/*/; do
    [ -d "$skill" ] || continue
    name="$(basename "$skill")"
    do_run "mkdir -p '$CLAUDE_DIR/skills/$name'"
    do_run "cp '$skill/SKILL.md' '$CLAUDE_DIR/skills/$name/SKILL.md' 2>/dev/null || true"
  done
fi

# CLAUDE.md (only if missing or --force)
if [ ! -f "$CLAUDE_DIR/CLAUDE.md" ] || [ "$FORCE" = "1" ]; then
  do_run "cp '$SRC_DIR/CLAUDE.md' '$CLAUDE_DIR/CLAUDE.md' 2>/dev/null || true"
fi

ok "Runtime installed"

# ── Write shim + env file ───────────────────────────────────────────────
say "Installing mooter shim to $LOCAL_BIN/mooter..."
if [ "$DRY_RUN" = "0" ]; then
  cat > "$SHIM" <<SHIM_EOF
#!/bin/sh
# mooter — launcher shim (installed by install.sh)
exec node "\$HOME/.mooter/cli/mooter.js" "\$@"
SHIM_EOF
  chmod +x "$SHIM"
fi
ok "Shim: $SHIM"

if [ "$DRY_RUN" = "0" ]; then
  cat > "$MOOTER_ENV" <<ENV_EOF
# mooter env — sourced by shell profiles to put ~/.local/bin on PATH.
case ":\$PATH:" in
  *":\$HOME/.local/bin:"*) ;;
  *) export PATH="\$HOME/.local/bin:\$PATH" ;;
esac
ENV_EOF
fi
ok "Env file: $MOOTER_ENV"

# ── Inject into shell profiles (idempotent) ─────────────────────────────
if [ "$NO_PATH" = "0" ]; then
  MARKER='# >>> mooter (managed) >>>'
  ENDMARK='# <<< mooter (managed) <<<'
  BLOCK="$MARKER\n. \"\$HOME/.mooter/env\"\n$ENDMARK"

  inject() {
    local rc="$1"
    [ -f "$rc" ] || return 0
    if ! grep -q "$MARKER" "$rc" 2>/dev/null; then
      if [ "$DRY_RUN" = "0" ]; then
        printf "\n%b\n" "$BLOCK" >> "$rc"
      fi
      ok "Added PATH entry to $rc"
    fi
  }
  # Only inject into profiles that actually exist.
  [ -f "$HOME/.zshrc" ]        && inject "$HOME/.zshrc"
  [ -f "$HOME/.bashrc" ]       && inject "$HOME/.bashrc"
  [ -f "$HOME/.bash_profile" ] && inject "$HOME/.bash_profile"
  [ -f "$HOME/.profile" ]      && inject "$HOME/.profile"
  # Fish has its own syntax; handle separately.
  if [ -d "$HOME/.config/fish" ] && [ -f "$HOME/.config/fish/config.fish" ]; then
    if ! grep -q "$MARKER" "$HOME/.config/fish/config.fish" 2>/dev/null; then
      if [ "$DRY_RUN" = "0" ]; then
        printf "\n%s\nfish_add_path -g \$HOME/.local/bin\n%s\n" "$MARKER" "$ENDMARK" >> "$HOME/.config/fish/config.fish"
      fi
      ok "Added PATH entry to ~/.config/fish/config.fish"
    fi
  fi
fi

# ── Hook registration in settings.json (non-destructive) ────────────────
if [ -f "$CLAUDE_DIR/settings.json" ]; then
  say "Registering hooks in settings.json..."
  do_run "node '$MOOTER_CLI_DIR/lib/register-hooks.js' '$CLAUDE_DIR/settings.json' '$ROUTER_DIR' '$HOOKS_DIR'"
  ok "Hooks registered (UserPromptSubmit + Stop)"
fi

# ── Device ID ───────────────────────────────────────────────────────────
if [ ! -f "$DEVICE_DIR/device.id" ]; then
  if [ "$DRY_RUN" = "0" ]; then
    node -e "require('fs').writeFileSync('$DEVICE_DIR/device.id', require('crypto').randomUUID() + '\\n')"
  fi
  ok "Device ID generated"
fi

# ── Ollama (optional, non-blocking) ─────────────────────────────────────
if command -v ollama >/dev/null 2>&1; then
  ok "Ollama detected"
  if ! ollama list 2>/dev/null | grep -q "qwen2.5:3b"; then
    say "Pulling qwen2.5:3b (~1.9 GB) — required for T0 tier..."
    do_run "ollama pull qwen2.5:3b" || warn "Pull failed — retry later: ollama pull qwen2.5:3b"
  else
    ok "qwen2.5:3b ready"
  fi
else
  warn "Ollama not installed — T0 (local, free) tier disabled."
  info "To enable T0 later:"
  info "  1. Install Ollama: https://ollama.com/download"
  info "  2. Run: mooter doctor"
fi

# ── API key hint ────────────────────────────────────────────────────────
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set — T1 will use subagent fallback (still works)."
fi

# ── Post-install ────────────────────────────────────────────────────────
echo ""
echo "  ${C2}mooter v${VERSION} installed.${CR}"
echo ""
echo "  Next steps:"
echo "    1. ${CB}source ~/.mooter/env${CR}  ${CD}(or open a new terminal)${CR}"
echo "    2. ${CB}mooter doctor${CR}         ${CD}(verify — 10 checks)${CR}"
echo "    3. ${CB}mooter${CR}                 ${CD}(launches Claude Code with routing)${CR}"
echo ""
echo "  ${CD}Uninstall anytime: mooter uninstall${CR}"
echo "  ${CD}Docs: https://mooter.ai${CR}"
echo ""
