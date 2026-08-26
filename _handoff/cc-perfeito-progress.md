# CC · "deixar rodando perfeito" — 2026-08-26 (Mac)

Delegação escrita do dono (26/08): *"autorizo o que for necessário pra deixar rodando perfeito"*.
Não cobre a decisão de IP (repo público A/B) — não foi tocada.

MUTEX verificado antes de começar: `cc-merges`, `cc-construir` e `cc-sistema` têm todos
`=== fim … exit=0`. Nenhum outro executor.

---

## O que inverteu a onda

O kickoff pedia, em P1, para religar dois pilares (P4 e P5) apagando `activo: false`. Ao abrir
`context-pack.mjs`, **a descrição dos dois no kickoff não corresponde ao código**:

| | kickoff diz | o que é |
|---|---|---|
| **P4** | "higiene/segurança, **zero-LLM**, não gasta modelo" | enunciado de LLM: *a última linha deste `.md` está cortada a meio?* 382 rondas de GPU, 62 achados, **0 de 78 sobrevivem** a um verificador determinista — e das 443 `.md` em `docs/`, **0** acabam a meio de uma palavra. A classe não existe neste repo. |
| **P5** | "motor/GPU/MooterBench — **mede JÁ os modelos candidatos**" | enunciado sobre formas de `return` repetidas. Desligado como `falso-em-ambos`: produziu no semeado **e** no controlo, os dois falsos, e falhou o defeito que estava semeado. Não mede modelo nenhum. |

E o "+603 linhas de ledger na madrugada, $0" **não era saúde**. O processo vivo (PID 82662/82667,
arrancado **25/08 às 08:13**, antes de o dono desligar o P2 e o P3 nesse mesmo dia) tinha o
catálogo **antigo em memória** e passou ~15 h a produzir **P2 e P3** — os dois pilares de que o
dono decidiu 19 achados à mão e não guardou nenhum. Medido ao vivo às 11:14Z: último recibo
`P2`, 26 s antes. É essa produção que enche a fila humana e causa a pausa `human queue full (6/6)`
que o próprio kickoff descreve como sintoma.

**Religar P4+P5 seria somar dois fabricadores medidos a uma fila já envenenada.** Não o fiz.
O kickoff autoriza a troca ("PODES trocar — declara a troca e o porquê"); esta é a declaração.

---

## P1 · o portão dos pilares — a correcção um nível acima ✅ `2c51ec9b`

`moo-runner.mjs:88` já escrevia que zero pilares activos *"é o estado honesto: nove de nove
reprovaram por medição"*. O que faltava não era ligar dois — era **ligar um voltar a custar
alguma coisa**.

O #389 tinha tirado esse desenho das REGRAS do modo ancorado **na véspera**, derivando a decisão
de uma `medicao` estruturada, e escreveu porquê: *"foi assim que o P11 entrou"*. Os **pilares**,
de onde o problema veio, ficaram de fora dessa correcção.

Agora `PILLAR_IDS = idsActivos(PILLARS)` e `idsActivos` chama `podeEntrar`: um pilar só corre com
`activo: true` **e** `medicao: {candidatos, lidos, reais}` a dar ≥10 reais e ≥30 % de precisão,
**derivada**, nunca declarada.

**O resultado não muda hoje — a lista continua vazia. Muda a razão.** Forçar `activo: true` nos
onze dá zero, e cada recusa traz o seu número:

```
P4   0 reais em 78 lidos          P7   0 reais em 3 lidos
P11  1 real em 87 lidos (1,1%)    P6 P8 P9 P10   zero triagem
P1 P2 P3 P5   sem medição de campo — n/d, e o portão recusa por isso
```

Os números vieram do comentário de cada pilar. Onde a triagem de **campo** não está registada,
`medicao: null` — não um número plausível. (O ledger deste device tem contagens diferentes,
de metodologias e datas diferentes; usá-las aqui criava uma terceira verdade.)

Cinco comentários diziam **"Reversível numa linha: apagar este `activo: false`"**. Passaram a ser
falsos com esta mudança — e um comentário que diverge do código é o defeito que o P3 dizia
procurar. Corrigidos os cinco.

`portao.mjs` é novo e **não importa nada**: `context-pack → ancora → portao-de-existencia →
context-pack` fechava um ciclo. Provavelmente funcionaria, mas `PILLAR_IDS` é calculado na
inicialização do módulo, e a ordem de import passaria a ser a diferença entre a rotação certa e
uma vazia, **sem erro nenhum a dizê-lo**.

⚠️ **O que isto NÃO fecha, e ficou escrito no código:** `loadPillars` nunca passou os pilares de um
projecto (`.mooter/pilares.json`) por este filtro — devolve `Object.keys` directamente, e
`validarPilares` nem preserva o campo `medicao`. Um projecto continua a poder correr pilares sem
medição nenhuma. Não fechei porque fechá-lo em silêncio deixava qualquer `pilares.json` existente
com zero pilares e sem dizer porquê.

---

## P2 · o conflito do #396 ✅ `b4c5167a`

Cinco conflitos. A decisão delegada ("fica a versão do #396") vale para **um** deles.

- **`package.json` e `tools/router/package.json`** — listas de ficheiros de teste. Escolher um lado
  **desligava testes**: o main trazia `painel-cartao.test.mjs`, `retomar.test.js` e
  `--test-force-exit`; o #396 trazia `rotulos-da-frota`, `frescura-por-camada`, `metrica-mae`.
  Resolvidos por **união** — 0 testes perdidos de qualquer lado.

- **`moo-pilot-shell.html`** — o conflito a sério, e **a premissa do kickoff não se confirma.**
  O kickoff diz que o #396 "já antecipa a do #401". Verificado em `rotuloDeDevice`: o ramo da
  pausa vinha **antes** de qualquer teste de morte. Tomar o #396 tal e qual **reintroduzia, dentro
  do módulo, o defeito que o #401 tinha acabado de fechar no HTML** — o PC pintado de laranja a
  dizer `holding`, sem idade, com o beacon a 3592 s. Mover lógica para onde se pode testar não a
  corrige sozinha. Ficou a **arquitectura do #396 com a regra do #401 lá dentro**.

- **`SYNC.md`** — aqui a decisão delegada é a correcta: 219 linhas contra 390, cumpre o tecto.
  Mas o #396 só tinha rolado para o arquivo **três das quatro** entradas de 25/08 do main. A quarta
  — *o dia em que o roadmap do PC foi demolido pelo próprio método*, com a hipótese do autor
  refutada contra 57 etiquetas — não estava em lado nenhum do #396. **Resgatada** para
  `SYNC_ARCHIVE_2026.md` com nota de proveniência. Rolada, não perdida.

Três testes do #396 mudaram: fixavam a regra que o #401 refutou por medição. O núcleo válido deles
— *um device em pausa com beacon **fresco** não se pinta de morto* — passou a caso explícito.
Novo: **`as duas vias concordam`** confronta o rótulo servido contra o recurso local do painel em
8 casos. Um recurso que diverge do rótulo servido mostra uma coisa com o servidor velho e outra
com ele em dia, sem dizer qual é qual.

---

## P4 · o achado de UX ✅ (em `b4c5167a` + `d52aea31`)

O rótulo do cartão da frota já tratava a pausa (#401, 24-25/08). O que faltava era o **escalonador
saber nomear a causa**: com `ids = []`, `pickNext` respondia
`no eligible loop (all capped / paused / suspended)` — e as três coisas que essa frase nomeia são
**falsas** quando não há pilar nenhum.

A diferença importa porque as **acções são opostas**: "tudo no tecto" manda o dono triar a fila;
ele triava, e a pausa continuava sem nada explicar porquê. Corrigido, com teste.

**Ao vivo, depois do relançamento** (11:18Z):

```
frescura      stale · 181 s · "no receipt for 181s"
pausa.activa  true  · "zero pilares na rotacao — nenhum passa o portao de medicao" · idade 27 s
painel pinta  holding · zero pilares na rotacao — nenhum passa o portao de medicao   [classe warn]
```

Não diz `morto`, não diz `STALE`, não diz "all capped". Diz a verdade.

Nota de desenho: `frescura.estado` **continua** a ser a idade crua do último recibo, e isso está
certo — é o que o próprio docstring dele promete. Quem decide o rótulo é `rotulos-da-frota.mjs`,
um só escritor, com testes.

---

## P5 · relançado, com a prova — e um gate que NÃO passa ✅/⚠️

Ontem o CC recusou relançar, e a razão era medida: *"o loop recarrega o checkout, fica com zero
pilares, e `nextPillar(n, [])` devolve `undefined` **em silêncio** — o device pára de produzir e
nada no painel o diz. É o modo de falha '63 sessões, 0 journals'."*

**Essa objecção é exactamente o que o `d52aea31` fecha.** Com a pausa nomeada e visível, relançar
deixou de ser silencioso. Só então relancei.

Detalhe do relançamento: `ai.mooter.runner` estava **carregado mas não era ele que corria** —
`launchctl list` dava PID `-`, e o processo real (82667, de 25/08) tinha sido lançado à mão e
segurava o lock. SIGTERM (saiu limpo, libertou o lock) → `launchctl kickstart` → **PID 11825**,
sob o launchd, com o código novo. Estável.

Os quatro gates que o kickoff pediu, medidos:

| gate | resultado |
|---|---|
| (a) `:4290` vivo e beacon assinado fresco | ✅ `engine: ollama-local`; beacon reescrito 11:17Z, durante a pausa |
| (b) **ledger cresce** | ❌ **não cresce, e é o correcto** — ver abaixo |
| (c) `PILLAR_IDS` já não é `[]` | ❌ **continua `[]`**, agora derivado de medição |
| (d) painel sem "STALE" | ✅ pinta `holding · <razão>`, classe `warn` |

**(b) e (c) não passam, e não os vou disfarçar.** Com zero pilares não há ronda: o comandante
pausa, publica estado e beacon, e recua até 60 s. As 2 linhas que o ledger ganhou (6110 → 6112)
foram as **últimas rondas do processo antigo**, não do novo.

Isto é a decisão do dono de 25/08 a chegar finalmente à máquina. A alternativa era continuar a
gastar GPU a produzir achados de **0 % de precisão medida** que consomem a atenção dele na
triagem. **Produzir nada, e dizer porquê, é estritamente melhor do que produzir falso.**

Para o ledger voltar a crescer é preciso **um pilar que passe o portão** — ≥10 defeitos reais e
≥30 % de precisão, triados à mão. Isso é uma onda de medição, não um booleano, e não cabia aqui
sem inventar os números.

---

## P3 · #400 e #402 — avaliados, não merjidos

- **#400 (kimi)** — a condição do kickoff é *"só entra na rota com o veto de egress em main"*.
  **Verificado em `origin/main`: o veto não existe** (`packages/slack-spike/` só tem a exclusão
  dura e a prosa que a explica). O PR **não** admite o kimi: converte a exclusão dura numa condição
  mecânica **fail-closed** (`gate.LINHA_KIMI`), e essa linha não existe em ficheiro nenhum — o
  kimi continua recusado, agora por uma razão datada em vez de uma porta soldada. Condição
  mantida, como pedido.
  ⚠️ **Objecção a citar se ele for merjido:** a condição é uma **linha no `SYNC.md`**, não a
  presença do veto em **código**. Para uma fronteira de egress, quem escrever a frase abre a rota
  sem que o veto exista. O portão devia verificar o código, como o `podeEntrar` faz com a medição.

- **#402 (M1 v0)** — desligado por omissão, `criarProxy()` recusa-se a construir sem a flag,
  bind `127.0.0.1` com teste que falha se `0.0.0.0` aparecer, `501` fail-closed para tier
  desconhecido, não grava o prompt (há teste de contrabando). 14/14 testes.

**Nenhum dos dois merjido nesta sessão**, e a razão é de custódia, não de mérito: os dois estão
🔴 **por refutar por um adversário externo** (`design-m1-v0.md`), o `codex` não está instalado
nesta máquina, e a refutação local em Ollama já foi declarada como *não sendo* o adversário. A
delegação cobre merges; não substitui a refutação que os próprios desenhos exigem.

---

## Estado do #396

`MERGEABLE` (conflitos fechados). CI a correr no momento em que isto foi escrito — ver secção
final do log da sessão para o veredicto.

---

## Vermelhos que ficam (nenhum destes é meu para fechar sozinho)

1. **O espelho do cockpit está 42 ficheiros atrás** e `sync:cockpit:check` falha — **e não é ele
   que a máquina corre**: o `ai.mooter.runner.plist` aponta **directo para dentro do checkout**
   (`~/frugal/tools/cockpit/runner/moo-runner.mjs`). É exactamente a deriva que o `CLAUDE.md`
   descreve. Não mexi na topologia de arranque: é decisão de infra, não de sessão.
2. **`.mooter/pilares.json` continua a contornar o portão** (ver P1).
3. **#400 e #402 por refutar por adversário externo.**
4. Os 2 `todo` da suite do cockpit são **pré-existentes** e não foram tocados.

## Gate

```
cockpit   940 testes · 938 pass · 0 fail · 2 todo (pré-existentes)
router    978 testes · 977 pass · 0 fail · 1 skip
classify.js  427d8c0b…  intacto
commits   b4c5167a (merge) · 2c51ec9b (portão) · d52aea31 (comandante)
loop      PID 11825, sob launchd, código novo, a pausar com razão visível
```
