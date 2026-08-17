#!/bin/bash
API="http://127.0.0.1:11434/api/tags"
echo "═══════ diagnóstico Ollama ═══════"
echo "-- processo ollama --"; pgrep -lf ollama || echo "  (nenhum processo ollama a correr)"
echo -n "-- responde agora? "; curl -s -m 3 "$API" >/dev/null 2>&1 && echo "✅ SIM (vivo)" || echo "❌ NÃO"
echo "-- porque caiu (últimas linhas do log) --"
tail -20 "$HOME/.ollama/logs/server.log" 2>/dev/null | grep -iE "error|panic|fatal|oom|killed|shutdown|signal|memory" | tail -8 || echo "  (sem log legível)"
echo ""
echo "═══════ a ressuscitar ═══════"
if curl -s -m 3 "$API" >/dev/null 2>&1; then
  echo "já está vivo — nada a reiniciar"
else
  open -a Ollama 2>/dev/null && echo "→ abri a app Ollama" || echo "→ app não encontrada, a tentar CLI"
  sleep 4
  if ! curl -s -m 3 "$API" >/dev/null 2>&1; then
    nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
    echo "→ iniciei 'ollama serve' (pid $!)"; sleep 5
  fi
fi
echo ""
echo "═══════ verificação final ═══════"
if curl -s -m 6 "$API" >/dev/null 2>&1; then
  echo "✅ OLLAMA DE VOLTA. Modelos disponíveis:"
  curl -s "$API" | python3 -c "import sys,json;[print('   •',m['name']) for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null
  echo "→ a aquecer o qwen2.5-coder:14b..."
  curl -s -m 30 http://127.0.0.1:11434/api/generate -d '{"model":"qwen2.5-coder:14b","prompt":"ok","stream":false}' >/dev/null 2>&1 && echo "   ✅ modelo respondeu — o runner vai voltar a produzir recibos reais"
else
  echo "❌ ainda não responde. Abre a app Ollama manualmente (Spotlight → Ollama) e corre este .command outra vez."
fi
echo ""; echo "(janela fica aberta 45s)"; sleep 45
