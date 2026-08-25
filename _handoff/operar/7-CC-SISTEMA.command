#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{
  echo "=== cc-sistema $(date) ==="
  caffeinate -i claude --dangerously-skip-permissions -p "$(cat _handoff/MASTERPROMPT-SISTEMA-SYNC-2026-08-25.md)

DEVICE: deteta com hostname; és o executor DESTE device. Itens [PC] declara e salta se fores o Mac. NO TALO: codex e Ollama como músculo principal de leitura/refutação/varredura; tu só código+suite+git."
  echo "=== fim $(date) · exit=$? ==="
} >> _handoff/cc-sistema.log 2>&1
