#!/bin/bash
GUARD="$HOME/.mooter/ollama-watchdog.sh"
PLIST="$HOME/Library/LaunchAgents/ai.mooter.ollama-watchdog.plist"
LABEL="ai.mooter.ollama-watchdog"
mkdir -p "$HOME/.mooter" "$HOME/Library/LaunchAgents"
echo "→ a escrever o watchdog..."
cat > "$GUARD" <<'SH'
#!/bin/bash
# Ollama caiu? ressuscita. Corre a cada 120s via LaunchAgent.
if ! curl -s -m 4 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  open -a Ollama 2>/dev/null || (command -v ollama >/dev/null && nohup ollama serve >/tmp/ollama-serve.log 2>&1 &)
fi
SH
chmod +x "$GUARD"
echo "→ a escrever o LaunchAgent..."
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$GUARD</string></array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>/tmp/ollama-watchdog.err</string>
</dict></plist>
PL
echo "→ a carregar..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null || true
sleep 2
echo ""; echo "═══ verificação ═══"
if launchctl list 2>/dev/null | grep -qi ollama-watchdog; then echo "✅ GUARDA ATIVO — verifica o Ollama a cada 120s e ressuscita se cair"; else echo "⚠️ não apareceu no launchctl — vê /tmp/ollama-watchdog.err"; fi
curl -s -m 4 http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && echo "✅ Ollama vivo agora" || echo "🟡 Ollama em baixo — o guarda ressuscita em <=120s"
echo ""; echo "(janela fica aberta 40s)"; sleep 40
