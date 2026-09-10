# Defeitos apanhados — onboarding v2

Registo por onda. Cada entrada diz **o que se observou**, **o que se conseguiu
descartar por medição**, e **o que fica `n/d`**. Uma causa não verificada
escreve-se como hipótese, nunca como facto.

---

## W1-D1 · `UserPromptSubmit · loader:1520` no plugin (aberto)

**Reportado por:** o dono, 2026-09-10, a pedir que ficasse registado nesta onda.
**Severidade:** por determinar — depende de o hook chegar ou não a correr.
**Estado:** **aberto**, causa `n/d`.

### O que se observou

O Claude Code emite um erro de hook rotulado `UserPromptSubmit · loader:1520`.
O `loader:1520` aponta para uma linha do **carregador de plugins do próprio
Claude Code** — código que não vive neste repositório. Não é uma linha de
nenhum ficheiro do Mooter.

### O que foi descartado, por medição neste worktree (2026-09-10)

| Hipótese | Verificação | Resultado |
|---|---|---|
| O script do hook tem erro de sintaxe | `node --check plugin/mooter/hooks/route-or-bootstrap.js` | **passa** |
| O script rebenta ou sai ≠ 0 | `echo '{"prompt":"teste"}' \| node …/route-or-bootstrap.js` | **exit 0**, sem stdout, sem stderr |
| O hook está declarado em dois sítios (colisão) | `grep -rn UserPromptSubmit plugin/` | **uma só** declaração, em `hooks/hooks.json` |
| O `settings.json` do plugin declara hooks a competir | leitura directa | declara só `subagentStatusLine` |

O script é defensivo por construção: todo o corpo está dentro de `try {} catch {}`
e termina com `process.exit(0)` incondicional («absolute never-throw guarantee»).
Um erro **dentro** dele não produziria uma mensagem do carregador.

### Hipótese que sobra (não verificada)

O erro é de **carregamento**, não de execução: o carregador falha a resolver ou
a validar a declaração do hook antes de alguma vez o correr. O candidato mais
provável é a expansão de `${CLAUDE_PLUGIN_ROOT}` em
`node "${CLAUDE_PLUGIN_ROOT}/hooks/route-or-bootstrap.js"` — se essa variável
vier vazia, o comando resolve para `node "/hooks/route-or-bootstrap.js"`, que
não existe.

**Isto é hipótese e está escrito como tal.** Não foi reproduzido.

### Porque é que isto importa mais do que parece

Se o hook não carrega, o Mooter **não injecta a rota** nas sessões que dependem
do plugin. Essa é exactamente a métrica que a **R9** protege: obediência do host.
Um hook que falha a carregar em silêncio conta como desobediência e a medição de
W4/W6 não sabe distinguir «o host ignorou» de «o hook nunca lá esteve».

### O que é preciso para fechar

1. A mensagem de erro **completa** e a versão do Claude Code onde aparece
   (o `loader:1520` sozinho não localiza nada fora do binário).
2. `echo $CLAUDE_PLUGIN_ROOT` no ambiente onde o erro acontece.
3. Se a hipótese se confirmar: trocar a interpolação por um caminho resolvido
   pelo próprio script — a mesma lição do `gh-bin.mjs`, onde um binário
   assumido no `PATH` falhava sob `launchd` e a correcção foi resolver em
   código em vez de cravar o ambiente.

**Não corrigido nesta onda de propósito:** não se corrige por adivinhação um
defeito cuja causa não se mediu. Uma "correcção" sem reprodução não se distingue
de uma alteração ao acaso, e passa a esconder o defeito real.
