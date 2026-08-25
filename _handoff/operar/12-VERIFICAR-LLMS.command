#!/bin/zsh
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG="$(cd "$(dirname "$0")/../.." && pwd)/_handoff/verificar-llms.log"
{
echo "=== verificar-llms $(date) ==="
echo "codex: $(codex login status 2>&1 | head -1)"
echo "gemini config: $([ -d "$HOME/.gemini" ] && ls "$HOME/.gemini" | head -4 | tr '\n' ' ' || echo 'sem ~/.gemini')"
echo "kimi config:   $(ls "$HOME/.kimi"* 2>/dev/null | head -2 | tr '\n' ' ' || echo 'n/d')"
echo "codex auth:    $([ -f "$HOME/.codex/auth.json" ] && echo 'auth.json PRESENTE' || echo 'auth.json ausente')"
echo "=== fim $(date) ==="
} >> "$LOG" 2>&1
