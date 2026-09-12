#!/usr/bin/env bash
# Quantas das regras vendorizadas CORRERAM de facto no braco A.
#
# PORQUE ISTO E PRECISO: o `regras-semgrep/MANIFESTO.json` diz 409 regras somadas
# e 292 ids distintos. Quem ler esses numeros como cobertura le mal. O §2.2 fixa o
# ambito em JS/TS, e o semgrep so aplica a um alvo as regras cuja `languages`
# inclui a linguagem do alvo. O numero que o semgrep reporta nas tres corridas e
# `Rules run: 89`. Este ficheiro mede de onde vem esse 89, conjunto a conjunto,
# passando um .js e um .ts triviais a cada conjunto isolado.
#
# So le. Nao toca em nenhum sujeito.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"; export SEMGREP_ENABLE_VERSION_CHECK=0
# As regras estao FORA do repo desde 2026-09-12 (licenca; ver MANIFESTO.json e braco-a-semgrep.sh).
REGRAS="${AB_REGRAS_SEMGREP:-$HOME/ab-braco-a/regras-semgrep}"
for f in p-javascript p-typescript p-security-audit p-nodejs; do
  [ -f "$REGRAS/$f.yaml" ] || { echo "regras fora do repo por licenca: falta $REGRAS/$f.yaml" >&2; exit 66; }
done
T=$(mktemp -d)
printf 'const x = 1;\n' > "$T/a.js"; printf 'const y: number = 1;\n' > "$T/b.ts"
corre() { semgrep scan --metrics=off --no-git-ignore --no-rewrite-rule-ids "$@" "$T" 2>&1 \
  | grep -aoE 'Rules run: *[0-9]+' | grep -oE '[0-9]+' | tail -1; }

printf '{\n  "medido_em": "%s",\n  "alvo": "um .js trivial + um .ts trivial",\n  "conjuntos": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sep=""
for f in p-javascript p-typescript p-security-audit p-nodejs; do
  ids=$(grep -cE '^  - id:|^- id:' "$REGRAS/$f.yaml")
  n=$(corre --config "$REGRAS/$f.yaml")
  printf '%s    { "conjunto": "%s", "ids_no_ficheiro": %s, "correram_em_js_ts": %s }' "$sep" "$f" "$ids" "${n:-null}"
  sep=$',\n'
done
TODOS=$(corre --config "$REGRAS/p-javascript.yaml" --config "$REGRAS/p-typescript.yaml" \
              --config "$REGRAS/p-security-audit.yaml" --config "$REGRAS/p-nodejs.yaml")
printf '\n  ],\n  "uniao_dos_quatro_correram_em_js_ts": %s,\n' "${TODOS:-null}"
printf '  "nota": "O total de ids distintos vendorizados (292) NAO e cobertura. A cobertura do braco A e a uniao acima, e e a mesma nos tres sujeitos porque o ambito do §2.2 e JS/TS nos tres."\n}\n'
