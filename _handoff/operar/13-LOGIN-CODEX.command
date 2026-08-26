#!/bin/zsh
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG="$(cd "$(dirname "$0")/../.." && pwd)/_handoff/login-codex.log"
{
echo "=== login-codex $(date) ==="
# corre o login em background; a URL de autorizacao fica neste log
nohup codex login >> "$LOG" 2>&1 &
sleep 6
echo "--- status apos 6s ---"
codex login status 2>&1 | head -2
echo "(processo de login continua em background a espera da autorizacao no browser)"
} >> "$LOG" 2>&1
