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
CHANNEL="${MOOTER_CHANNEL:-friends-beta}"

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

# Wave 11 (PUB-STUB) — when piped from curl there's no local checkout, so fetch
# the now-public repo to a temp dir and install from there. Mirrors the token
# installer (/i/<token>). Graceful exit if git or network is unavailable.
REPO_URL="${MOOTER_REPO_URL:-https://github.com/pauloloureiroshp-ship-it/mooter.git}"
if [ ! -f "$SRC_DIR/tools/router/classify.js" ]; then
  if ! command -v git >/dev/null 2>&1; then
    fail "git not found — install git first, then re-run, or clone manually:"
    info "  git clone $REPO_URL mooter && cd mooter && bash install.sh"
    exit 1
  fi
  CLONE_PARENT="$(mktemp -d 2>/dev/null || echo "/tmp/mooter-install.$$")"
  CLEANUP_CLONE="$CLONE_PARENT"
  trap '[ -n "${CLEANUP_CLONE:-}" ] && rm -rf "$CLEANUP_CLONE" 2>/dev/null || true' EXIT
  say "Fetching mooter from the public repo..."
  if do_run "git clone --depth 1 '$REPO_URL' '$CLONE_PARENT/mooter'"; then
    SRC_DIR="$CLONE_PARENT/mooter"
  else
    fail "Couldn't fetch mooter — check your network, or clone manually:"
    info "  git clone $REPO_URL mooter && cd mooter && bash install.sh"
    exit 1
  fi
  if [ "$DRY_RUN" != "1" ] && [ ! -f "$SRC_DIR/tools/router/classify.js" ]; then
    fail "Fetched repo is missing the router runtime — please report at https://mooter.ai."
    exit 1
  fi
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

# Provider wrappers live in a subdir — the top-level *.js glob above misses them,
# so router-execute would fail with `wrapper_missing` for ollama/codex/openai pins
# (Wave 61). Copy the providers/ subdir explicitly.
do_run "mkdir -p '$ROUTER_DIR/providers'"
do_run "cp '$SRC_DIR/tools/router/providers/'*.js '$ROUTER_DIR/providers/' 2>/dev/null || true"

# Hooks live under ~/.claude/hooks/ (not ~/.claude/tools/router/).
# NOTE: keep this list in lockstep with WIRED_HOOKS in tools/router/sync-hooks.js
# and $hookNames in install.ps1. live-preview-tap.js (Live Preview MP0) is the
# file-bus tap — additive/read-only/fail-soft.
for h in gsd-statusline.js gsd-turn-end.js mooter-turn-header.js frugal-turn-header.js exec-logger.js PostToolUse.js live-preview-tap.js; do
  [ -f "$SRC_DIR/tools/router/$h" ] && do_run "cp '$SRC_DIR/tools/router/$h' '$HOOKS_DIR/$h'"
  do_run "rm -f '$ROUTER_DIR/$h'"
done

# Copy legacy CLI to ~/.mooter/cli/ (installer lifecycle: doctor/update/uninstall
# + register-hooks/skill-gen). Preserved as-is — the hybrid shim still routes these.
do_run "cp -R '$SRC_DIR/tools/cli/'* '$MOOTER_CLI_DIR/'"
do_run "cp '$SRC_DIR/tools/router/version.json' '$MOOTER_DIR/version.json' 2>/dev/null || true"

# ── Wave 8 — v1.0 product CLI (feedback/forge/login/adapter/trail/pack/...) ──
# Built from source into a self-contained esbuild bundle and shipped alongside
# the legacy CLI (hybrid). packs/ are copied so `mooter pack`/`init` work too.
MOOTER_CLI_V1_DIR="$MOOTER_DIR/cli-v1"
MOOTER_PACKS_DIR_INST="$MOOTER_DIR/packs"
if command -v npm >/dev/null 2>&1; then
  say "Building v1.0 CLI bundle (esbuild)..."
  do_run "mkdir -p '$MOOTER_CLI_V1_DIR' '$MOOTER_PACKS_DIR_INST'"
  if do_run "cd '$SRC_DIR/packages/cli' && npm install --no-audit --no-fund --silent && npm run build"; then
    do_run "cp '$SRC_DIR/packages/cli/mooter.js' '$MOOTER_CLI_V1_DIR/mooter.js'"
    do_run "cp -R '$SRC_DIR/packs/'* '$MOOTER_PACKS_DIR_INST/' 2>/dev/null || true"
    ok "v1.0 CLI bundle installed (feedback · forge · login · adapter · trail · pack)"
  else
    warn "v1.0 bundle build failed — legacy CLI only (feedback/forge unavailable). Re-run with npm available."
  fi

  # ── Wave A — pack-hint hook (axis-2 domain packs) ──────────────────────
  # Standalone fail-silent emitter: reads the prompt on stdin, emits
  # <pack-hint> only when a pack matches. Bundled from packages/router.
  say "Building pack-hint hook bundle (esbuild)..."
  if do_run "cd '$SRC_DIR/packages/router' && npm install --no-audit --no-fund --silent && npm run build:packhint && cp pack-hint.cjs '$HOOKS_DIR/pack-hint.cjs'"; then
    ok "pack-hint hook installed (Moo Packs wired)"
  else
    warn "pack-hint build failed — packs install but <pack-hint> won't be emitted. Re-run installer to retry."
  fi
else
  warn "npm not found — v1.0 commands (feedback/forge/...) unavailable; legacy CLI only."
fi

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

# CLAUDE.md (only if missing or --force) — install the personal-doctrine
# template, never the repo's own project-specific CLAUDE.md (that one is
# Mooter-internal: FROZEN classify.js, sha256, tier ladder — not meant to
# become the user's global ~/.claude/CLAUDE.md).
if [ ! -f "$CLAUDE_DIR/CLAUDE.md" ] || [ "$FORCE" = "1" ]; then
  do_run "cp '$SRC_DIR/CLAUDE.md.template' '$CLAUDE_DIR/CLAUDE.md' 2>/dev/null || true"
fi

ok "Runtime installed"

# ── Write shim + env file ───────────────────────────────────────────────
say "Installing mooter shim to $LOCAL_BIN/mooter..."
if [ "$DRY_RUN" = "0" ]; then
  cat > "$SHIM" <<SHIM_EOF
#!/bin/sh
# mooter — launcher shim (installed by install.sh). Wave 8 hybrid dispatch:
#   v1.0 product commands  → bundled CLI (~/.mooter/cli-v1/mooter.js)
#   legacy/installer cmds  → legacy CLI  (~/.mooter/cli/mooter.js)
export MOOTER_PACKS_DIR="\${MOOTER_PACKS_DIR:-\$HOME/.mooter/packs}"
V1="\$HOME/.mooter/cli-v1/mooter.js"
LEGACY="\$HOME/.mooter/cli/mooter.js"
case "\$1" in
  feedback|forge|login|logout|adapter|trail|quiet|hub|explain|sync|pack|init|dashboard)
    if [ -f "\$V1" ]; then exec node "\$V1" "\$@"; else exec node "\$LEGACY" "\$@"; fi ;;
  doctor|update|uninstall|--version|-v|version|help|--help|-h|"")
    exec node "\$LEGACY" "\$@" ;;
  *)
    if [ -f "\$V1" ]; then exec node "\$V1" "\$@"; else exec node "\$LEGACY" "\$@"; fi ;;
esac
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
  # On macOS, ~/.zshrc may not exist on a fresh install (zsh is default
  # shell since Catalina but the file isn't created until customised).
  # Create an empty one so PATH injection lands somewhere persistent.
  if [ "$(uname -s)" = "Darwin" ] && [ ! -f "$HOME/.zshrc" ]; then
    if [ "$DRY_RUN" = "0" ]; then touch "$HOME/.zshrc"; fi
  fi
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
    # Wave 11 (D4-5) — consent before a ~1.9 GB download instead of pulling
    # blindly. Prompt on a real TTY (default yes, 10s timeout → yes). When
    # non-interactive (curl|bash, CI), default yes too but honor MOOTER_NO_PULL=1.
    PULL_MODEL=1
    if [ "${MOOTER_NO_PULL:-0}" = "1" ]; then
      PULL_MODEL=0
    elif [ -r /dev/tty ]; then
      printf "  %s>%s Pull qwen2.5:3b (~1.9 GB) for free local T0 routing? [Y/n] " "$C1" "$CR"
      ans=""; read -t 10 -r ans < /dev/tty 2>/dev/null || ans=""
      case "$ans" in [Nn]*) PULL_MODEL=0 ;; esac
    fi
    if [ "$PULL_MODEL" = "1" ]; then
      say "Pulling qwen2.5:3b (~1.9 GB) — enables the T0 (local, free) tier..."
      do_run "ollama pull qwen2.5:3b" || warn "Pull failed — retry later: ollama pull qwen2.5:3b"
    else
      warn "Skipped model pull. Enable T0 later: ollama pull qwen2.5:3b"
    fi
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

# ── Fleet heartbeat (fail-silent, anonymous — device_id only, no PII) ───
# Confirms install success so mooter.ai fleet counters reflect reality.
# Wave F0 (2026-07-28) — this used to fire before consent existed, which
# contradicted the "telemetry is opt-in" promise made elsewhere (plugin
# README, PRIVACY.md). Explicit opt-in now, same shape as the Ollama pull
# consent above: MOOTER_HEARTBEAT=1 forces yes (CI/automation), a real TTY
# prompts (default No on timeout/empty), anything else skips.
SEND_HEARTBEAT=0
if [ "${MOOTER_HEARTBEAT:-0}" = "1" ]; then
  SEND_HEARTBEAT=1
elif [ -r /dev/tty ]; then
  printf "  %s>%s Send anonymous install heartbeat (device id only, no prompt content)? [y/N] " "$C1" "$CR"
  ans=""; read -t 10 -r ans < /dev/tty 2>/dev/null || ans=""
  case "$ans" in [Yy]*) SEND_HEARTBEAT=1 ;; esac
fi
if [ "$SEND_HEARTBEAT" = "1" ]; then
  HUB_URL="${MOOTER_HUB_URL:-${FRUGAL_HUB_URL:-https://mooter-hub.frugal-hub.workers.dev}}"
  DEVICE_ID_HB="$(cat "$HOME/.mooter/device.id" 2>/dev/null || cat "$HOME/.frugal/device.id" 2>/dev/null || echo unknown)"
  ( curl -s -m 5 -X POST "$HUB_URL/api/device-heartbeat" \
      -H 'Content-Type: application/json' \
      -d "{\"device_id\":\"$DEVICE_ID_HB\",\"setup_version\":\"install.sh@v$VERSION\",\"event\":\"install_ok\",\"platform\":\"$(uname -s)\",\"node_version\":\"$NODE_VER\",\"ts\":\"$(date -u +%FT%TZ)\"}" \
      >/dev/null 2>&1 & ) 2>/dev/null
else
  info "Skipped install heartbeat (opt-in, declined). Enable anytime: MOOTER_HEARTBEAT=1 ./install.sh"
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
