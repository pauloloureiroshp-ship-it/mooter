#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG="$(cd "$(dirname "$0")/../.." && pwd)/_handoff/instalar-llms.log"
{
echo "=== instalar-llms v2 (diagnostico+fix) $(date) ==="
echo "node: $(command -v node) $(node --version 2>/dev/null)"
echo "npm:  $(command -v npm) $(npm --version 2>/dev/null)"
NPMBIN="$(npm prefix -g 2>/dev/null)/bin"
echo "npm global bin: $NPMBIN"
ls "$NPMBIN" 2>/dev/null | head -25
export PATH="$NPMBIN:$PATH"
echo "--- re-tenta instalacoes que faltarem ---"
command -v codex  >/dev/null || npm install -g @openai/codex      2>&1 | tail -1
command -v gemini >/dev/null || npm install -g @google/gemini-cli 2>&1 | tail -1
(command -v kimi >/dev/null || command -v kimi-code >/dev/null) || npm install -g @moonshot-ai/kimi-code --force 2>&1 | tail -1
echo "--- estado final ---"
for c in codex kimi kimi-code gemini; do echo "final $c: $(command -v $c || echo AUSENTE) $($c --version 2>/dev/null | head -1)"; done
# garante que o Terminal do dono encontre os CLIs: symlink em /usr/local/bin se necessario e possivel
for c in codex kimi kimi-code gemini; do
  if [ -x "$NPMBIN/$c" ] && ! command -v $c >/dev/null 2>&1; then ln -sf "$NPMBIN/$c" /usr/local/bin/$c 2>/dev/null && echo "symlink criado: $c"; fi
done
echo "LOGINS (gesto do dono): duplo-clique no 11-LOGINS-LLMS.command"
echo "=== fim $(date) · exit=$? ==="
} >> "$LOG" 2>&1
