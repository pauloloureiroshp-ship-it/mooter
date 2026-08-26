#!/usr/bin/env bash
# TESTE DE MORDIDA do medidor de rede do braco A.
#
# O criterio 5 do §4 do pre-registo ("o codigo saiu da maquina?") e medido em
# `braco-a-semgrep.sh --strace` por contagem de `connect()`. As tres corridas deram
# ZERO. Zero e o resultado esperado — e por isso mesmo e indistinguivel de um tracer
# que nao esta a ver nada. Um guarda que nunca falhou nao e um guarda.
#
# Este ficheiro poe o MESMO comando de strace a apontar para casos maus conhecidos.
# Se o detector devolver 0 em qualquer um deles, a medicao do criterio 5 nao vale
# nada e tem de ser declarada `n/d`.
#
#   mau 1  processo directo abre TCP para fora            -> tem de detectar >=1
#   mau 2  processo FILHO abre TCP para fora              -> tem de detectar >=1
#          (este e o que importa: o semgrep lanca o semgrep-core como filho. Um
#           tracer sem `-f` daria 0 nas tres corridas pela razao errada.)
#   mau 3  socket de dominio UNIX                          -> tem de detectar >=1
#          (prova que o filtro nao esta cego a AF_UNIX, so a AF_INET)
#   bom    processo que so faz aritmetica                  -> tem de dar 0
#
# O alvo de rede e 1.1.1.1:53, um SYN de TCP sem payload nenhum. Nao leva codigo,
# nao leva nome de ficheiro, nao leva nada do repositorio: existe so para provar
# que o tracer ve um connect() quando ha um connect() para ver.
set -uo pipefail

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FALHAS=0

conta() {  # conta() <rotulo> <esperado: zero|naozero> <cmd...>
  local rotulo="$1" esperado="$2"; shift 2
  strace -f -qq -e trace=connect -o "$TMP/t" "$@" >/dev/null 2>&1
  local n; n=$(grep -c "connect(" "$TMP/t" 2>/dev/null); n=${n:-0}
  local veredicto
  if [ "$esperado" = naozero ]; then
    [ "$n" -ge 1 ] && veredicto=MORDEU || { veredicto="NAO-MORDEU  <== detector cego"; FALHAS=$((FALHAS+1)); }
  else
    [ "$n" -eq 0 ] && veredicto=OK || { veredicto="FALSO-POSITIVO"; FALHAS=$((FALHAS+1)); }
  fi
  printf '%-46s connect()=%-3s %s\n' "$rotulo" "$n" "$veredicto"
  [ "$n" -ge 1 ] && grep -m2 "connect(" "$TMP/t" | sed 's/^/      /'
  return 0
}

echo "== teste de mordida do medidor de rede (braco A, criterio 5) =="

conta "mau 1 · TCP directo para 1.1.1.1:53" naozero \
  python3 -c 'import socket
try: socket.create_connection(("1.1.1.1",53),timeout=2).close()
except Exception: pass'

conta "mau 2 · TCP num processo FILHO" naozero \
  python3 -c 'import subprocess,sys
subprocess.run([sys.executable,"-c","import socket\ntry: socket.create_connection((\"1.1.1.1\",53),timeout=2).close()\nexcept Exception: pass"])'

conta "mau 3 · socket AF_UNIX" naozero \
  python3 -c 'import socket,os,threading
p="/tmp/mordida.sock"
try: os.unlink(p)
except OSError: pass
s=socket.socket(socket.AF_UNIX); s.bind(p); s.listen(1)
threading.Thread(target=lambda: s.accept(),daemon=True).start()
c=socket.socket(socket.AF_UNIX); c.connect(p); c.close(); s.close(); os.unlink(p)'

conta "bom  · so aritmetica, zero rede" zero \
  python3 -c 'print(sum(range(1000)))'

echo
if [ "$FALHAS" -eq 0 ]; then
  echo "RESULTADO: o detector morde nos 3 casos maus e nao dispara no bom."
  echo "           logo o ZERO das corridas do braco A e um zero medido, nao um zero cego."
  exit 0
else
  echo "RESULTADO: $FALHAS caso(s) falharam. O criterio 5 do braco A e n/d."
  exit 1
fi
