#!/bin/bash
cd "$HOME/frugal" || exit 1
echo "═══ reiniciar o F10 com o fix ═══"
pkill -f "tools/cockpit/runner/f10-server.mjs" 2>/dev/null && echo "→ F10 antigo terminado"
sleep 2
node tools/cockpit/runner/f10-server.mjs >"$HOME/.mooter/f10.log" 2>&1 &
sleep 4
U=http://127.0.0.1:4290
echo ""
echo "═══ TESTE ADVERSARIAL do fix ═══"
echo -n "1) GET sem Origin (curl local) responde? .......... "
curl -s -m 5 "$U/fleet.json" >/dev/null && echo "✅ SIM (nao quebrou)" || echo "❌ QUEBROU"
echo -n "2) header com Origin LOOPBACK (deve ecoar) ........ "
H=$(curl -s -m 5 -D - -o /dev/null -H "Origin: http://127.0.0.1:4290" "$U/fleet.json" | grep -i "access-control-allow-origin")
[ -n "$H" ] && echo "✅ ${H}" || echo "⚠️ sem header (panel same-origin nao precisa)"
echo -n "3) header com Origin MALICIOSA (NAO deve vir '*') . "
E=$(curl -s -m 5 -D - -o /dev/null -H "Origin: https://site-malicioso.example" "$U/fleet.json" | grep -i "access-control-allow-origin")
if [ -z "$E" ]; then echo "✅ nenhum header — site externo NAO le"; else echo "❌ AINDA EXPOE: $E"; fi
echo -n "4) POST /stop com Origin MALICIOSA (deve 403) ..... "
C=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST -H "Origin: https://site-malicioso.example" "$U/stop")
[ "$C" = "403" ] && echo "✅ 403 recusado" || echo "❌ devolveu $C"
echo -n "5) o painel ainda serve? ......................... "
curl -s -m 5 -o /dev/null -w "%{http_code}" "$U/panel" | grep -q 200 && echo "✅ 200 OK" || echo "❌ painel em baixo"
echo ""
echo "(janela 40s)"; sleep 40
