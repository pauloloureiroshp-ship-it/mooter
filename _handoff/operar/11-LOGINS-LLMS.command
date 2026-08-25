#!/bin/zsh
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
echo "🐮 Logins das assinaturas — 3 passos, o browser abre em cada um. (codex $(codex --version 2>/dev/null) · kimi $(kimi --version 2>/dev/null) · gemini $(gemini --version 2>/dev/null))"
echo ""
echo "1/3 codex — entra com a conta ChatGPT no browser…"
codex login && codex login status
echo ""
echo "2/3 kimi — login da assinatura no browser…"
kimi login 2>/dev/null || kimi
echo ""
echo "3/3 gemini — conta Google no browser…"
gemini
echo ""
echo "✅ Feito. Podes fechar esta janela. O executor do mac passa a ter codex como refutador."
