# ⇄ CC → COWORK · MOOTER 2.0 "TRUST RELEASE" · BACK completo do ciclo

```
⇄ MOO PROJECT HANDOFF · Mooter 2.0 Trust Release · 5 fases · 2026-07-16
TL;DR:  H0 landed (local) · H1+H2 awaiting-you · H3 gated · H4 NÃO FEITO (omissão minha) ·
        push 1 branch (3 commits) · 9 perguntas respondidas · 4 premissas do masterprompt refutadas

GOAL:   Preparar o Mooter 2.0 como TRUST RELEASE — tudo que o produto diz é provado, Cockpit
        alinhado à tese v2, gate de lançamento HUMANO EXTERNO (5 amigos instalam sozinhos em
        <10min e voltam no dia 2) — não um número de versão.

INTENT: _handoff/MOOTER_20_TRUST_RELEASE_MASTERPROMPT.md (Cowork, 2026-07-16) + 3 ajustes que o
        Paulo deu ao despachar:
        1. NÃO arquivar POST_MERGE_REMEDIATION · MOO_LINGUA_FRANCA · MOO_HARMONY_MESH ·
           SITE_REFRESH_BRIEF — estão ATIVOS.
        2. Todo handoff deste ciclo leva os DOIS rodapés: `CCA: n/5` e
           `🔍 council 8/8 · objeção mais forte: X · resolvida: como`.
        3. O Codex trabalha em frugal-remediation-F1/F2/F3 e depois frugal-lingua-franca —
           NUNCA tocar nesses worktrees nem nos ficheiros das allowlists deles.
        Sequência pedida: H0 → (H1 ∥ H2) → H3 só com F2 merged · parar em todo ⛔ STOP.

🎯 A ÚNICA COISA (maior alavanca agora):
   Fechar o gate de CI da extensão. Não é o harness completo do H2 — é o subconjunto S1+S2 dele:
   um job de PR que corra `npm ci && node --test src/*.test.js` em packages/vscode-extension.
   Hoje esses 687 testes NÃO gateiam PR nenhum. ~15 linhas de YAML compram a maior parte do valor
   do Trust Release imediatamente; manifesto anti-rot e recibo na UI podem vir depois.
   (Recomendação minha — decisão do Paulo.)

TRIAGE (onde gastar os minutos escassos):
   ⏱30s   colar as 8 perguntas do red-team gate → desbloqueia os rodapés dos 4 handoffs
   ⏱10s   `git push origin chore/mooter-20-h0` → 3 commits presos (gate teu, nunca o fiz)
   ⏱2min  aprovar/rejeitar a spec do H2 → vira wave pós-F1
   ⏱5min  dizer se queres o H4 (gate doc) — não foi feito e não está gated por nada
   ⏱15min decidir o H1 elemento-a-elemento (51 elementos, tabela com file:line pronta)
   ⏳     H3 a aguardar merge da F2 pelo Codex — dependência externa, nada a fazer
```

---

## ✅ O QUE FOI FEITO

| Fase | Item | Estado | Evidência |
|---|---|---|---|
| pré-H0 | Salvar a árvore principal | ✓ | backup 1596/1596 · `stash@{0}` · rebase para `origin/main` |
| H0.1 | Draft → MEMORY.md + LOOP.md, draft apagado | ✓ | `08575b4` |
| H0.2 | Brief do Ledger tornado durável | ✓ | `git add -f` · premissa corrigida a meio |
| H0.3 | Arquivar masterprompts | ✓ | 4 de 69 avaliados |
| H0.4 | Quarentena do teste flaky | ✓ | `test:latency` + `latency.yml` non-blocking |
| H0.5 | Version sprawl | ✓ | drift 1.39.0→1.44.0 + sync duplo + política no INFRA.md |
| H1 | Inventário do Cockpit | ✓ | 51 elementos com file:line · `MOOTER_20_H1_CUT_LIST.md` |
| H2 | Spec do Trust Harness | ✓ | 7 provas com finding ID · `MOOTER_20_H2_TRUST_HARNESS.md` |

**Pré-H0 — o maior trabalho da fase, e não estava no masterprompt.** "H0 = árvore principal, nativo"
não se verificava: `~/frugal` estava em `wave/honest-controls` @ `eba5d3b` (2026-07-08), **159 commits
atrás** de `origin/main`, e `main` estava preso no worktree `frugal-land-mp52a` — logo `~/frugal` nem
*conseguia* fazer `git checkout main`. O único commit local era **byte-idêntico** ao que já estava em
`origin/main` (zero valor único). Todo o payload do H0 era untracked e só existia naquele disco.
Sequência aplicada, na ordem que o LOOP.md já canonizou em `2026-07-12-worktree-sprawl-esconde-wip-real`
("primeiro preservar a identidade e o WIP; só depois reduzir as pastas"): **backup integral**
(1596 fich., 8.7M → scratchpad, verificado 1596/1596) → **stash com tag** (`stash@{0}`, preserva WIP que
sujava `host-extra.js` e `SYNC.md` = allowlist do Codex) → **branch nova off `origin/main`**. Removidas
10 cópias untracked que eram ancestrais obsoletos do que já está em main (ex.: `lp-aggregates.js` 489L
local vs 723L em main).

---

## ❌ O QUE NÃO FOI FEITO (e porquê)

| O quê | Porquê | Bloqueado por |
|---|---|---|
| **H4 — `MOOTER_20_RELEASE_GATE.md`** | **Omissão minha.** O masterprompt pede-o (documento, não código) e **não está gated por nada**. A sequência do Paulo nomeou H0→H1∥H2→H3 e não nomeou o H4; segui a sequência à letra e não o levantei na altura. | nada — pode ser feito já |
| H1 implementação | ⛔ STOP do masterprompt: "decisão do Paulo elemento a elemento. ZERO código nesta fase" | Paulo |
| H2 implementação | ⛔ STOP: "spec → aprovação → só então vira wave (pós-F1)" | Paulo + F1 |
| H3 — Site 2.0 | ⛔ gate: F2 confirmada **fora** de `origin/main` por `git merge-base --is-ancestor` | Codex (merge da F2) |
| `git push` | GUARD: "push/merge/tag = gate Paulo" | Paulo |
| Rodapés `CCA: 5/5` e `council 8/8` | As 8 perguntas **nunca chegaram** (pedidas 4×); os 5 critérios do CCA-F não estão definidos no repo | Paulo / Cowork |
| Suite de testes do router executada | Verifiquei que os 76 ficheiros existem e que a lista não partiu, **mas não a corri** (6-7min + `npm ci`). Assino `n/d`, não `✓`. | — (dívida assumida) |
| 65 dos 69 handoffs avaliados | "na dúvida, deixa" — a barra era prova dura de shipped/superseded | por desenho |
| Reescrever docs com ponteiros partidos | `LP_COHERENCE_AUDIT_REPORT` e `LIVE_EDIT_CCA_AUDIT` são supersedidos mas arquivá-los parte ponteiros vivos; reescrevê-los é edit multi-ficheiro, fora do âmbito read-only | Paulo |
| Família Foundation (5 fich.) arquivada | O próprio sucessor gateia o arquivo "no PR da F4", e a F4 não shipou (só F1 feita) | F4 |
| Contradição do `LIVE_EDIT_ROADMAP.md` | Linha 117 diz arquivado, linha 179 diz "fica ATIVO" — canon contradiz-se; não me competia arbitrar | Paulo |
| `kind:decision` no Ledger | As 9 decisões desta sessão não existem no `events.jsonl` → o bloco Q&A abaixo é **transcrição, não projecção**, contra `PERFECT_HANDOFF_SPEC.md:128` | Cowork/engine |

---

## 🔬 O QUE SE DESCOBRIU (o valor real do ciclo)

### 1. O Live Preview não tem problema de código. Tem problema de CI.

- `test.yml:6-15` filtra paths para `tools/router/**` e `packages/cli/**`. Só isso.
- O **único** workflow que corre testes da extensão é `publish-cockpit.yml:6`, em
  `push: tags:['cockpit-v*']` — **depois** da decisão de shipar.
- Nenhum workflow tem `packages/vscode-extension/**` em `pull_request`.

> **Um PR pode partir os 687 testes do Live Preview e o CI fica verde.**
> A desconfiança do Paulo não é paranoia — é a leitura correcta de um gate que não existe.

### 2. Quatro premissas do masterprompt não sobreviveram à medição

| Alegação | Medido | Erro |
|---|---|---|
| "68/68 testes COH são a base" | **687/687** (union LP) · **1393/1394** (suite completa, 127,9s) | ~10× |
| "`extension.js` ~332KB" | **823.184 bytes / 10.334 linhas** | 2,5× |
| "5 comandos, 1 view · 5 superfícies" | **7 comandos, 2 views, 8 tabs**; MEO vive noutro webview | — |
| "densidade N/V na auditoria **D1-h8**" | **A auditoria não existe.** `D1-h8` ocorre 1× em todo o repo: dentro do masterprompt que a cita como fonte. Auto-referencial. | fabricação |

Os `318+111=429` da auditoria eram verdade na `0.16.66`; a árvore está na `0.16.78` — a suite
**cresceu**. E **COH-01 — o P0 que fez a auditoria dizer NO-GO — está FECHADO** desde `e2924ce`
(15 testes em `lp-lease-host.test.js`).

### 3. O corte do Cockpit: 58,8% confirma-se, mas a pergunta estava mal feita

**Métrica A** (sai da superfície onde renderiza) = `30/51` = **58,8%** — a meta ~60% confirma-se **sem
forçar**. **Métrica B** (desaparece do produto) = `12/51` = **23,5%**. A decisão god-mode **não diz qual
das duas queria**, e a diferença é tudo. **O achado dominante não é lixo, é duplicação:** 18 MERGE
contra 11 CUT — sessões renderizam 4×, poupança 4×, frota 3×, e duas dessas duplicações estão **no mesmo
tab, a ~20 linhas de distância**. **Architecture: 0 KEEP** (o `arch-tree.js:3-8` confessa-o).
**Project Command: 9 KEEP / 1 CUT** — a quota de 60% destruía a superfície mais saudável do produto.

### 4. Trabalho não-durável apanhou-se a si próprio, 3×

O LOOP.md que este ciclo escreveu diz: *"trabalho não-durável (untracked/uncommitted/gitignored) é a
fonte nº1 de falha de comunicação multi-agente"*. Nesta mesma sessão:
- O **brief do H0.2** estava gitignored, e o evento que o originou **não existe no Ledger** — órfão.
- Os **audits que o H2 precisa** eram untracked, sem cópia em lado nenhum.
- As **9 decisões desta sessão** não são projectáveis: `kind:decision` **é** emitido, mas só com
  `output_hash`/`idem_key` — o Ledger guarda a *forma*, não o *conteúdo*.

**E a peça que faltava:** o Q&A **estava** recuperável o tempo todo — no transcript do Claude Code, não
no Ledger. `tools/handoff-preflight.js --qa` extrai as 9 perguntas verbatim, com todas as opções, em
milissegundos e a custo zero. Transcrevi-as à mão em Opus por não saber onde procurar. **A lição não é
"o Ledger falhou" — é que ninguém tinha lido o spec para saber que campo era preciso, nem procurado a
fonte mecânica que já existia.**

---

## BOARD — por fase

| Fase | STATE | Gate |
|---|---|---|
| **H0** Housekeeping | **landed** (local, unpushed) | 5/5 itens · 1 commit como exigido · sha ✓ |
| **H1** Cockpit De-clutter | **awaiting-you** | inventário completo · zero código ✓ |
| **H2** LP Trust Harness | **awaiting-you** | spec completa · testes re-executados ✓ |
| **H3** Site 2.0 | **blocked** | F2 fora de `origin/main` — gate respeitado ✓ |
| **H4** RC 2.0 gate doc | **not started** | ⚠️ **nada o bloqueia** — omissão |

### H0 — Housekeeping nativo

```
STATE:    landed (local) · unpushed
WORKTREE: ~/frugal · chore/mooter-20-h0 @08575b4 · 3 ahead of origin/main · UNPUSHED ⚠
GATE:     classify.js sha 427d8c0b… ✓ INTACTO (verificado byte-a-byte, não inferido)
          JSON válido ✓ (package.json · version.json ×2)
          YAML válido ✓ (latency.yml · version-sync.yml, jobs parseados)
          version-sync testado em sandbox ✓ (bump duplo · campos preservados · idempotente)
          suite router: 76 fich. no default, 0 em falta ✓ · EXECUÇÃO = n/d (não corri)
          git add seletivo ✓ · zero ficheiros do Codex tocados ✓
WORK:     9 fich. · +228/-15 · commit 08575b4
conf:     git ✓ · gate ✓ (excepto execução da suite = n/d) · narrativa —
NEXT:     push (gate Paulo)
```

### H1 — Cockpit De-clutter

```
STATE:    awaiting-you
GATE:     ZERO código ✓ · read-only ✓ · 51 elementos com file:line ✓ · aritmética ✓ (21+18+11+1=51)
WORK:     0 fich. alterados (inventário puro, como o ⛔ STOP exige)
conf:     inventário ✓ · aritmética ✓ · narrativa —
NEXT:     decisão elemento-a-elemento → só então vira wave
```

### H2 — Live Preview TRUST HARNESS

```
STATE:    awaiting-you
GATE:     read-only ✓ · zero código ✓ · 687/687 LP ✓ · 1393/1394 suite completa ✓ · sha ✓
WORK:     0 fich. alterados (spec pura)
conf:     contagens ✓ (re-executadas, não citadas) · finding IDs ✓ · narrativa —
NEXT:     aprovação → wave pós-F1 (2 fich. novos + 1 workflow + 1 linha no package.json)
```

### H3 — Site 2.0

```
STATE:    blocked (correctamente)
GATE:     F2 (fix/remediation-cockpit-honest-copy) NÃO é ancestral de origin/main —
          verificado por `git merge-base --is-ancestor` ✓
NEXT:     nada. Aguarda o Codex. Zero trabalho antecipado — o ⛔ proíbe site antes da F2 merged.
```

### H4 — RC 2.0 gate doc

```
STATE:    not started ⚠️
GATE:     n/a — NADA o bloqueia. O masterprompt pede-o como documento, não código.
NEXT:     Paulo diz se quer; são ~20min. Compõe _handoff/MOOTER_20_RELEASE_GATE.md com a tabela
          Gate|Prova (estado durável · uma voz · protocolo vivo · GPU visível · cockpit limpo ·
          LP confiável · **gate humano: 5 amigos, <10min, D2 retention**) e a regra
          "v2.0.0 = tag DEPOIS do gate humano, nunca antes".
```

---

## 💬 Q&A COMPLETO DA THREAD — 9 perguntas, verbatim

> ⚠️ **Transcrito à mão — e não era preciso.** O `PERFECT_HANDOFF_SPEC.md:128` diz que o handoff perfeito
> é uma *projecção do Ledger*. O Live Context Accumulator **emite** `kind:decision` (3 eventos nesta
> sessão, em `~/.claude/tools/router/handoff/<sid>.jsonl`) — **mas só com `output_hash` e `idem_key`:
> hashes, sem pergunta, sem opções, sem escolha**. Logo não é projectável de lá, e o
> `_handoff/agent-sync/events.jsonl` tem apenas 5 marcadores `kind:turn`.
>
> **A correcção (2026-07-16, pós-ciclo):** o Q&A ESTÁ na íntegra no transcript do Claude Code
> (`~/.claude/projects/<proj>/<sid>.jsonl`), que guarda cada `AskUserQuestion` com a pergunta completa,
> todas as opções e as respostas. `tools/handoff-preflight.js --qa` extrai-o **verbatim, zero LLM, em
> milissegundos**. Este bloco foi transcrito à mão a queimar Opus por eu não saber disso.

### Ronda 1 — pré-H0 (a árvore principal era insalvável como base)

**Q1.** *"H0 pede «árvore principal, nativo», mas ~/frugal está 159 commits atrás e main está preso
noutro worktree. Onde é que o H0 deve aterrar?"*
- 1) **Branch nova off origin/main em ~/frugal** *(Recomendado)* — `git checkout -b chore/mooter-20-h0
  origin/main` dentro de `~/frugal`. Os ~200 untracked (incl. todo o payload do H0) sobrevivem ao switch
  intactos. Mantém o "nativo" do masterprompt e apanha os 159 commits. Exige decidir o que fazer aos 25
  tracked modificados.
- 2) Worktree novo off origin/main — criar `../frugal-mooter-20-h0` e copiar o payload untracked. Deixa
  `~/frugal` intocado. Viola o "nativo" à letra, mas respeita o espírito.
- 3) Parar e tratar do ~/frugal primeiro — não fazer H0 agora; resolver antes a dívida.

**→ Paulo escolheu: (1) Branch nova off origin/main em ~/frugal.**
*Porquê:* mantém o "nativo" que o masterprompt exige e apanha os 159 commits em falta.

**Q2.** *"~/frugal tem 25 ficheiros tracked modificados (WIP de 8 dias), incluindo host-extra.js e
SYNC.md que são allowlist do Codex. O que faço com eles antes de mudar de base?"*
- 1) **git stash com tag, não apagar** *(Recomendado)* — guardar tudo num stash identificado antes do
  switch. Reversível, não perde nada, tira a contaminação da allowlist do Codex do caminho.
- 2) Deixar como está e arriscar o checkout — o git carrega as modificações quando não colidem e recusa
  quando colidem. Reaplica WIP de 8 dias sobre 159 commits novos de forma silenciosa.
- 3) Analisar os 25 ficheiros primeiro — ler o diff dos 25 e reportar antes de decidir.

**→ Paulo escolheu: (1) git stash com tag, não apagar.**
*Porquê:* reversível e tira do caminho o WIP que sujava a allowlist do Codex.

**Q3.** *"Os ~200 ficheiros untracked em ~/frugal (incl. os 4 ATIVOS e os audits que o H2 precisa) não
existem em lado nenhum além desse disco. Um `git clean` acidental apaga tudo. Faço backup antes de tocar
em qualquer coisa?"*
- 1) **Sim, backup primeiro** *(Recomendado)* — copiar para o scratchpad antes de qualquer operação git.
  Barato, e remove o único cenário verdadeiramente irreversível do ciclo.
- 2) Não, avança direto — checkout e stash não tocam em untracked, mas não há rede se algo correr mal.

**→ Paulo escolheu: (1) Sim, backup primeiro.**
*Porquê:* era o único cenário irreversível de todo o ciclo. Resultado: 1596/1596 ficheiros, 2.3M.

### Ronda 2 — a meio do H0

**Q4.** *"O classificador barrou a criação do .github/workflows/latency.yml (job não-bloqueante). O H0.4
está meio-feito — teste fora do default, sem job substituto. O que faço?"*
- 1) **Autoriza o latency.yml** *(Recomendado)* — crio o workflow separado non-blocking, completando a
  quarentena. Nota: o guard disparou por razão legítima — estás mesmo a suavizar um gate de merge, ainda
  que de um teste de timing comprovadamente flaky.
- 2) Reverter o package.json — voltar ao status quo. O flaky continua a chumbar a suite por blips.
- 3) Manter no default, só relaxar o teste 2 — tornar o assert "no individual spawn >1500ms" informativo
  (o teste 1, de mediana, continua a bloquear). Ataca a causa real sem mexer em workflows.

**→ Paulo escolheu: (1) Autoriza o latency.yml.**
*Porquê:* o H0.4 pedia-o explicitamente; o guard não conhecia o masterprompt.

**Q5.** *"O brief do H0.2 está gitignored por design (projeção do Ledger), mas o próprio Ledger
(events.jsonl) também está ignorado — nada sobrevive a um git clean. Como resolvo?"*
- 1) **Tornar o Ledger durável, não a projeção** *(Recomendado por mim, com base ERRADA)* — `git add -f`
  do events.jsonl e deixar as projeções .md ignoradas.
- 2) git add -f só do brief, literal — commita uma projeção regenerável; contradiz a arquitectura.
- 3) Deixar como está e reportar.

**→ Paulo escolheu: (1) Tornar o Ledger durável.** ⚠️ **DECISÃO INVALIDADA — o meu enquadramento estava
errado.** Fui verificar antes de mexer na `.gitignore` e descobri que o evento `cd89b89c` **não existe**
no `events.jsonl` nem no `snapshot.json`: o brief é **órfão**, não projeção regenerável. Tornar o Ledger
durável **não resolvia o brief**. Voltei a perguntar → Q7.

**Q6.** *"As 8 perguntas do pre-dispatch red-team gate não estão no vault — só encontrei 5 checks
nomeados no Axioma 4. Como assino o rodapé `🔍 council 8/8`?"*
- 1) **Cola-me as 8 perguntas** *(Recomendado)* — dás a lista canon, corro-a a sério, assino 8/8 com
  verdade, e guardo-as em memória.
- 2) Corro os 5 documentados e assino 5/5 — honesto, mas não é o gate que pediste.

**→ Paulo escolheu: (1) Cola-me as 8 perguntas.**
**⚠️ NUNCA CHEGARAM.** Pedidas 4× ao longo da thread. Os 4 handoffs deste ciclo estão assinados `n/d`.

### Ronda 3 — correcção do meu erro

**Q7.** *"Corrigindo o meu erro: o brief é órfão (fonte ausente do ledger) e o events.jsonl é ruído de
hook por-máquina. Dado isto, o que faço no H0.2?"*
- 1) **git add -f só do brief, não do ledger** *(Recomendado)* — o brief é a única cópia de conteúdo
  autorado (1.7K). Não commito o events.jsonl: é ruído local por-máquina, conflita em todo merge entre
  worktrees, e não regenera o brief. Regra da .gitignore fica intacta.
- 2) Não commitar nada de agent-sync — o brief é mensagem operacional transitória.
- 3) Brief + ledger, os dois — aceita conflitos recorrentes em troca do histórico em git.

**→ Paulo escolheu: (1) git add -f só do brief, não do ledger.**
*Porquê:* o brief é a única cópia; o ledger é ruído que não regenerava nada.

### Ronda 4 — gate do commit

**Q8.** *"H0 está completo e staged (8 ficheiros, +228/−15) + as 4 operações de arquivo do H0.3. Aprovas
o commit único?"*
- 1) **Aprova tudo — 1 commit** *(Recomendado)* — executo as 4 operações do H0.3, apago o
  MEMORY_LOOP_DRAFT, e faço 1 commit. Sem push.
- 2) Aprova, mas sem o H0.3 — o `_MASTER_ORCHESTRATION.md` continua no topo apesar de dizer "NÃO EXECUTAR".
- 3) Aprova, mas sem o fix do version drift — o site continua a anunciar v1.39.0 com o produto em 1.44.0.
- 4) Mostra-me mais antes.

**→ Paulo escolheu: (1) Aprova tudo — 1 commit.** → `08575b4`

**Q9.** *"Tenho os specs do H1 (51 elementos com veredicto e file:line) e H2 (7 provas com finding IDs)
completos em contexto. Materializo-os como handoffs?"*
- 1) **Escreve os 2 handoffs em _handoff/** *(Recomendado)* — o contexto é volátil, e o próprio LOOP.md
  acabou de canonizar que trabalho não-durável é a falha nº1.
- 2) Só o H2, o H1 espera a tua decisão.
- 3) Nenhum por agora — risco: se a sessão compactar, os file:line de 51 elementos perdem-se.

**→ Paulo escolheu: (1) Escreve os 2 handoffs.** → `b64cffa`

### Instruções livres do Paulo (fora de AskUserQuestion)

| # | Instrução | Resultado |
|---|---|---|
| A | "Lê e segue o masterprompt na íntegra, com 3 ajustes" + sequência H0→H1∥H2→H3 | ciclo executado; **H4 não foi nomeado e eu não o levantei** |
| B | "falta o handoff para o cowork no padrão que temos" | escrevi o BACK no formato do `PERFECT_HANDOFF_SPEC` |
| C | "não era pra você fazer um handoff no padrão do mooter com tudo… as perguntas e respostas ao longo da thread?" | **este documento** — o anterior tinha "Q (resumida)", violando o buraco nº2 do spec ("PENDING truncado") |

---

## RISK (divergência real, não artefacto)

- **Fiz mais do que o H0.5 pedia.** O pedido era "versão derivada de `version.json` + política de tags".
  A landing **já** derivava (não havia hardcode). Encontrei o bug real — `landing/app/version.json` em
  **1.39.0** com `tools/router/version.json` em **1.44.0**, o site anunciava publicamente uma versão 5
  minors stale — e corrigi, mais o `version-sync.yml` a escrever os dois no mesmo run. **Se querias só a
  política documentada, `landing/app/version.json` sai do commit.**
- **Fiz 2 commits de docs sem perguntar** (`b64cffa` e este). Deixá-los untracked contradizia o learning
  que o H0 acabou de canonizar. Local e reversível, mas foi decisão minha.
- **Um subagente errou e o erro era destrutivo.** Reportou o `LP_FABLE5` do topo como "byte-idêntico" ao
  arquivado. **Não era** (`b5d30af9` vs `ca52f46`): diferem nos **ponteiros**, e a versão arquivada é a
  **corrigida**. Seguir a recomendação literal ("arquivar") teria sobrescrito a boa com a stale. Apaguei
  a do topo em vez de arquivar. **Lição: recomendação de subagente precisa de verificação mecânica antes
  de virar acção de disco.**
- **Eu próprio errei uma vez** (Q5) e a decisão do Paulo assentou nesse erro. Detectei ao verificar antes
  de executar, e voltei a perguntar (Q7). Se tivesse executado a decisão tal como aprovada, teria mexido
  na `.gitignore` sem resolver nada.
- **A suite do router não foi executada.** 76 ficheiros verificados no disco, execução `n/d`.
- **Contradição no canon, não resolvida:** `LIVE_EDIT_ROADMAP.md:117` diz que
  `LIVE_PREVIEW_AUDIT_FINDINGS.md` está arquivado; **a linha 179 do mesmo ficheiro** diz "fica ATIVO".

---

## UNPUSHED (exacto, por branch)

```
chore/mooter-20-h0   3 commits · 0 tracked sujos · UNPUSHED ⚠
  <HEAD>   docs(handoff): BACK completo do ciclo CC → Cowork     ← este ficheiro (só docs)
  b64cffa  docs(handoff): H1 cut-list + H2 trust harness spec     ← só docs
  08575b4  chore(housekeeping): H0 · 9 fich. · +228/-15           ← o ÚNICO que toca código
stash@{0}            WIP wave/honest-controls — parked pre-H0 rebase 2026-07-16 (preservado)
backup               scratchpad/frugal-backup-2026-07-16/untracked-full.tar.gz · 1596 fich. · 2.3M
```

Worktrees do Codex (F1/F2/F3, lingua-franca): **não tocados**. Verificado por `git diff` que nenhum
deles toca `tools/router/package.json`, e que o "package.json do plugin" da GUARD é o
`packages/vscode-extension/package.json` (allowlist da F2).

---

## RESUME (próxima acção exacta, copy-paste)

```bash
# ver o que está preso
cd ~/frugal && git log --oneline origin/main..HEAD && git show --stat 08575b4

# se aprovares o push (gate teu — nunca o fiz)
git push origin chore/mooter-20-h0

# se quiseres reverter o fix de version drift antes do push
git revert --no-commit 08575b4 -- landing/app/version.json

# recuperar o WIP parqueado
git stash list && git stash show -p stash@{0} | head -50
```

## NEXT FOR COWORK

1. **Emitir as 8 perguntas do red-team gate para o vault**, não só para a memória do Cowork. Esta sessão
   não lhes chegou e por isso 4 handoffs ficaram com rodapé `n/d`. É um `pointer-sentinel` a falhar
   exactamente como o experimento do LOOP previu.
2. **Resolver a ambiguidade da meta dos 60%** (métrica A = o utilizador vê menos 60% · métrica B = 60% do
   código apaga). Sem isso o H1 não vira wave.
3. **Considerar despromover o H2 de "wave" para "3 items"**: o gate de CI (~15 linhas) compra a maior
   parte do valor hoje; manifesto anti-rot e recibo na UI são o resto.
4. **Pôr payload no `kind:decision` do Ledger** — ele é emitido, mas só com `output_hash`/`idem_key`.
   Enquanto guardar hashes, o `DECISIONS` do spec (que exige a pergunta COMPLETA) nunca será uma
   projecção do Ledger, contra o `PERFECT_HANDOFF_SPEC.md:128`. Entretanto,
   `tools/handoff-preflight.js --qa` resolve-o pelo transcript do CC, a custo zero.
5. **Corrigir o masterprompt do próximo ciclo**: 4 das suas premissas eram falsas, uma delas
   (`auditoria D1-h8`) era uma citação a um documento inexistente. Rodar pointer-check antes de emitir —
   é exactamente o job L0 que o LOOP deste ciclo registou.

---

## Rodapés

`CCA: n/d` — os 5 critérios do CCA-F não estão definidos em nada citável neste repo (`AUDIT_CCA.md` não
existe; o único doc com critérios tem **10**, não 5). `PERFECT_HANDOFF_SPEC.md:95`: *"Quando incerto →
'n/d', nunca palpite."* Preencho assim que o Paulo der a definição.

`🔍 council n/d · objeção mais forte: este BACK declara "H0 landed" quando nada foi pushed — se o Paulo
não pushar, é exactamente o artefacto não-durável que o próprio H0 canonizou como falha nº1, e eu estaria
a repetir o PHASE_A_GATE que enganou 3 agentes durante 6 dias · resolvida: parcialmente, e digo qual é a
parte que não resolvi. STATE diz "landed (local) · unpushed", UNPUSHED é secção de topo com o comando
exacto, e o TL;DR abre com "push 1 branch". Mas a verdade nua é que 3 commits num disco não são estado
durável — o risco só fecha quando o Paulo pushar, e isso é gate dele por desenho do masterprompt, não meu
para resolver.`

As 8 perguntas do pre-dispatch red-team gate **não estão no vault** — `00-core/reasoning-protocol.md`
(Axioma 4) remete para memória do Cowork inacessível a esta sessão. Corridos os 5 checks nomeados no
Axioma 4 §"Regra de menos-interações": advogado do diabo ✓ · fontes/freshness ✓ (todo número mecânico
re-verificado nesta árvore, nenhum citado de auditoria) · colisão com trabalho em voo ✓ (F1/F2/F3
verificados por `git diff`; zero sobreposição) · custo/reversibilidade ✓ (3 commits locais, stash +
backup íntegros, zero push) · reuse-antes-de-construir ✓ (H1 §4 e H2 §4). Assino `n/d` em vez de `8/8`
porque não sei quais são as 8.

```
⇄ END
```
