---
name: moo-sync
description: Alinha ESTE device com o Mooter — puxa o repo, espelha o runtime (router, hooks, skills), reconstrói o índice do vault, e diz se o conector do Claude Desktop está desactualizado (descarregando o .mcpb). Corre igual em macOS, Linux e Windows. Usar quando o Paulo disser "/moo-sync", "alinha este device", "actualiza o mooter aqui", antes de lançar o Moo Pilot num device novo, ou quando alguma coisa se comportar como se fosse de outra versão.
---

# moo-sync — pôr este device em dia, seja ele qual for

> Script canónico: `tools/cockpit/sync-device.mjs`. Esta skill não faz nada que
> o script não faça — só sabe conduzi-lo e ler o que ele diz.

## Numa máquina NOVA — o arranque, antes de haver skill nenhuma

A skill que estás a ler vive em `~/.claude/skills/`, e quem a põe lá é este
repo. **Numa máquina onde o repo ainda não existe, esta skill também não
existe** — não há slash command para lançar. Alguma coisa tem de chegar
primeiro, e o vault já chega a todas as máquinas:

```bash
node ~/paulo-vault/.claude/moo-bootstrap.mjs
```

**Windows (PowerShell)**
```powershell
node $HOME\paulo-vault\.claude\moo-bootstrap.mjs
```

Clona o repo se faltar, corre o alinhamento, e diz quais as variáveis de
ambiente em falta com o comando certo para aquele sistema. A partir daí a skill
existe e o resto desta página aplica-se.

## O gesto

**macOS / Linux**
```bash
cd ~/frugal && npm run device:sync
```

**Windows (PowerShell)**
```powershell
cd $HOME\frugal ; npm run device:sync
```

`npm run device:check` relata sem escrever nada.

## Porque é que isto existe

Um device novo — ou parado há uma semana — falha sempre pelas **mesmas quatro
coisas**, e nenhuma grita:

| o que está errado | o sintoma que dá |
|---|---|
| código antigo | um bug já corrigido continua a aparecer |
| espelhos por sincronizar | o repo está em dia e a máquina corre o de ontem |
| índice do vault velho | os agentes não encontram o que lá está |
| conector de outra versão | a skill e o painel discordam sobre o que é verdade |

Cada uma dá um sintoma que parece outra coisa, e perde-se uma hora a debugar a
errada. O script percorre-as por ordem de **dependência** — o código primeiro,
porque tudo o resto copia ficheiros dele. Sincronizar espelhos a partir de
código velho é espalhar o problema por mais sítios.

## O que fazes, por ordem

1. **Corre o script** e lê a última linha. Se disser `ALINHADO`, acabou.
2. **Se parou nalguma coisa**, cada linha traz o comando que a resolve. Dá-lho
   ao Paulo tal e qual, sem reescrever.
3. **O conector é o único passo que o script não fecha** — ver abaixo.
4. **Depois de alinhado**, lança: `npm run pilot`. O lançamento faz a sua
   própria verificação de alinhamento e volta a avisar se algo escapou.

## O conector — e porque é que paramos aí

Instalar um `.mcpb` no Claude Desktop é uma instalação **aprovada por quem está
ao teclado**. Escrever à mão no registo de extensões da app forjaria um estado
que a própria app não conhece: a primeira vez que o Desktop abrisse, encontrava
uma versão que nunca instalou.

O script **descarrega** o ficheiro (via `gh release download`) e diz onde ficou.
O último gesto é do dono, de propósito. Diz-lhe o caminho e para aí — **não
inventes uma forma de contornar isto.**

## Regras

- **Informa, nunca bloqueia.** O script nunca sai com erro. Um alinhador que
  devolve código de erro acaba dentro de um `|| true` na primeira semana.
- **`n/d` não é `ok`.** Não encontrar o registo do Claude Desktop não prova que
  a versão está alinhada — e o script di-lo assim.
- **Nada de shell.** Só `git` e ficheiros, para correr igual nos três sistemas.
  Se acrescentares um passo, mantém a regra.
- Não mandes o Paulo correr comandos de macOS numa máquina Windows: o script já
  sabe onde está, e a saída dele já vem correcta.

## Quando esta skill está a mentir

Se algum caminho ou comando aqui não existir,
`tools/cockpit/runner/sync-device.test.mjs` falha. Uma skill que promete o que o
código não faz é o pilar P3 a falhar em casa.
