#!/bin/zsh
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG="$(cd "$(dirname "$0")/../.." && pwd)/_handoff/login-gemini-kimi.log"
{
echo "=== v2 $(date) ==="
# gemini: configura oauth-personal se settings nao definir auth
S="$HOME/.gemini/settings.json"
if [ ! -s "$S" ] || ! grep -q selectedAuthType "$S"; then
  mkdir -p "$HOME/.gemini"; printf '{"selectedAuthType":"oauth-personal"}\n' > "$S"; echo "settings.json escrito (oauth-personal)"
fi
echo "--- gemini oauth (NO_BROWSER, URL abaixo) ---"
NO_BROWSER=true nohup gemini -p "responde só: ok" >> "$LOG" 2>&1 &
sleep 12
echo "--- kimi: estado + retry ---"
grep -c . "$HOME/.kimi-code/credentials" >/dev/null 2>&1 && echo "kimi credentials: ficheiro presente ($(wc -c < "$HOME/.kimi-code/credentials" | tr -d ' ') bytes)"
kimi login < /dev/null 2>&1 | head -3
echo "=== fim v2 $(date) ==="
} >> "$LOG" 2>&1
