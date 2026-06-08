#!/usr/bin/env bash
# install-mac-smoke.sh — macOS install path smoke test (Wave 33.10)
#
# Docker-free, runnable on a real Mac. The Linux container test
# (tests/install-smoke.sh) cannot validate the Darwin branch, so this fills the
# gap: parse, the two-copies sync invariant, the real-model guard, the macOS
# code markers, a sandboxed dry-run, and the RAM probe.
#
# Usage:
#   bash tests/install-mac-smoke.sh           # fast: parse + static + dry-run
#   MOOTER_MAC_FULL=1 bash tests/install-mac-smoke.sh   # + real install (needs npm)
#
# Static assertions run on any OS (so this doubles as a CI lint). Assertions
# that need Darwin (Platform label, sysctl RAM) are skipped with a note on Linux.

set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="$REPO/install.sh"
LANDING="$REPO/landing/public/install.sh"
OS="$(uname -s)"

PASS=0; FAIL=0; SKIP=0
ok()   { printf "  \033[1;32m[PASS]\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
no()   { printf "  \033[1;31m[FAIL]\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }
skip() { printf "  \033[2m[SKIP]\033[0m %s\n" "$1"; SKIP=$((SKIP+1)); }
hdr()  { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

# ── 1. Parse-only (bash -n) ───────────────────────────────────────────────
hdr "1. Parse (bash -n)"
if bash -n "$INSTALL" 2>/dev/null; then ok "install.sh parses"; else no "install.sh parse error"; fi
if bash -n "$LANDING" 2>/dev/null; then ok "landing/public/install.sh parses"; else no "landing copy parse error"; fi

# ── 2. Two copies stay in sync (mirrors install-reliability.yml) ──────────
hdr "2. Sync invariant"
if diff -q "$INSTALL" "$LANDING" >/dev/null 2>&1; then
  ok "install.sh ≡ landing/public/install.sh (byte-identical)"
else
  no "install.sh and landing/public/install.sh diverged — CI gate will fail"
fi

# ── 3. Real-model guard (Wave 2 ADR 017 retired qwen3:30b) ───────────────
hdr "3. Model guard"
if grep -q "qwen2.5:3b" "$INSTALL"; then ok "pulls the real model qwen2.5:3b"; else no "qwen2.5:3b reference missing"; fi
if grep -q "qwen3:30b" "$INSTALL"; then
  # Only acceptable inside the explanatory RAM comment ("NOT the retired ...").
  if grep -q "retired qwen3:30b" "$INSTALL"; then
    ok "qwen3:30b appears only in the 'retired' comment (intentional)"
  else
    no "qwen3:30b referenced as an active pull — it was retired (ADR 017)"
  fi
else
  ok "no qwen3:30b reference at all"
fi

# ── 4. macOS code markers present ────────────────────────────────────────
hdr "4. macOS markers"
grep -q 'IS_MAC=1'                 "$INSTALL" && ok "IS_MAC platform flag set"        || no "IS_MAC flag missing"
grep -q 'xcode-select --install'   "$INSTALL" && ok "xcode-select hint on git-missing" || no "xcode-select hint missing"
grep -q '/opt/homebrew/bin'        "$INSTALL" && ok "Homebrew (Apple Silicon) PATH probe" || no "/opt/homebrew/bin probe missing"
grep -q 'sysctl -n hw.memsize'     "$INSTALL" && ok "RAM probe uses sysctl on macOS"   || no "sysctl hw.memsize probe missing"
grep -q 'Platform: macOS'          "$INSTALL" && ok "macOS platform label present"     || no "macOS platform label missing"

# ── 5. Sandboxed dry-run (no writes to the real HOME) ────────────────────
hdr "5. Sandboxed dry-run"
TMPH="$(mktemp -d)"
mkdir -p "$TMPH/.local/bin" "$TMPH/.claude"
printf '#!/bin/sh\necho fake-claude\n' > "$TMPH/.local/bin/claude"
chmod +x "$TMPH/.local/bin/claude"
echo '{"hooks":{}}' > "$TMPH/.claude/settings.json"
OUT="$(env HOME="$TMPH" PATH="$TMPH/.local/bin:$PATH" MOOTER_NO_PULL=1 \
        bash "$INSTALL" --dry-run --no-path 2>&1)"
RC=$?
if [ "$RC" = "0" ]; then ok "dry-run exits 0"; else no "dry-run exit=$RC"; fi
case "$OUT" in
  *"[dry-run] mkdir"*) ok "dry-run guards real writes (mkdir not executed)" ;;
  *) no "dry-run did not show guarded [dry-run] markers" ;;
esac
if [ "$OS" = "Darwin" ]; then
  case "$OUT" in
    *"Platform: macOS"*) ok "Darwin branch prints 'Platform: macOS'" ;;
    *) no "expected 'Platform: macOS' on this Mac" ;;
  esac
else
  skip "Platform-label check (needs Darwin; this is $OS)"
fi
# Real HOME untouched
[ ! -e "$TMPH/.mooter/cli-v1/mooter.js" ] && ok "no artifacts written in dry-run" || no "dry-run wrote artifacts"
rm -rf "$TMPH"

# ── 6. RAM probe returns a sane number ───────────────────────────────────
hdr "6. RAM probe"
if [ "$OS" = "Darwin" ]; then
  B="$(sysctl -n hw.memsize 2>/dev/null || echo "")"
  if [ -n "$B" ] && [ "$B" -gt 0 ] 2>/dev/null; then
    ok "sysctl hw.memsize = $(( B / 1024 / 1024 / 1024 )) GB"
  else
    no "sysctl hw.memsize returned nothing"
  fi
else
  if [ -r /proc/meminfo ]; then
    KB="$(awk '/^MemTotal:/{print $2; exit}' /proc/meminfo)"
    [ -n "$KB" ] && ok "/proc/meminfo MemTotal = $(( KB / 1024 / 1024 )) GB (Linux fallback)" \
                 || no "/proc/meminfo MemTotal unreadable"
  else
    skip "RAM probe (no sysctl/proc on $OS)"
  fi
fi

# ── 7. Full install into sandbox (opt-in, needs npm) ─────────────────────
hdr "7. Full install (opt-in)"
if [ "${MOOTER_MAC_FULL:-0}" = "1" ]; then
  TMPH="$(mktemp -d)"
  mkdir -p "$TMPH/.local/bin" "$TMPH/.claude"
  printf '#!/bin/sh\necho fake-claude\n' > "$TMPH/.local/bin/claude"
  chmod +x "$TMPH/.local/bin/claude"
  echo '{"hooks":{}}' > "$TMPH/.claude/settings.json"
  if env HOME="$TMPH" PATH="$TMPH/.local/bin:$PATH" MOOTER_NO_PULL=1 \
        bash "$INSTALL" >/dev/null 2>&1; then
    [ -x "$TMPH/.local/bin/mooter" ] && ok "shim installed at ~/.local/bin/mooter" || no "shim missing"
    [ -f "$TMPH/.mooter/env" ]       && ok "env file written"                       || no "env file missing"
    if [ "$OS" = "Darwin" ]; then
      [ -f "$TMPH/.zshrc" ] && ok "~/.zshrc seeded on macOS" || no "~/.zshrc not seeded"
    else
      skip "~/.zshrc seed check (Darwin-only)"
    fi
  else
    no "full install exited non-zero"
  fi
  rm -rf "$TMPH"
else
  skip "full install (set MOOTER_MAC_FULL=1 to run; needs npm + network)"
fi

# ── Summary ──────────────────────────────────────────────────────────────
hdr "Summary"
printf "  %d passed · %d failed · %d skipped\n\n" "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ] || exit 1
