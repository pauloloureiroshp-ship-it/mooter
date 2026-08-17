#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/ai.mooter.nosleep.plist"; LABEL="ai.mooter.nosleep"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-s</string><string>-i</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" 2>/dev/null || true
sleep 1
launchctl list 2>/dev/null | grep -qi nosleep && echo "✅ ANTI-SONO ATIVO — o Mac não dorme enquanto ligado à corrente" || echo "⚠️ ver /tmp"
echo "Para desligar depois: launchctl bootout gui/\$(id -u)/ai.mooter.nosleep && rm ~/Library/LaunchAgents/ai.mooter.nosleep.plist"
echo "(janela 30s)"; sleep 30
