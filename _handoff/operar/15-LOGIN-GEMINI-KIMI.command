#!/bin/zsh
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG="$(cd "$(dirname "$0")/../.." && pwd)/_handoff/login-gemini-kimi.log"
{
echo "=== login-gemini-kimi $(date) ==="
echo "--- gemini (tenta modos nao-interativos de auth; URLs ficam neste log) ---"
nohup gemini auth login >> "$LOG" 2>&1 &
sleep 5
echo "--- kimi ---"
nohup kimi login >> "$LOG" 2>&1 &
sleep 5
echo "--- estado ---"
ls "$HOME/.gemini" 2>/dev/null | tr '\n' ' '; echo
ls "$HOME/.kimi-code" 2>/dev/null | tr '\n' ' '; echo
echo "(processos em background; URLs de auth acima, se emitidas)"
} >> "$LOG" 2>&1
