# Canal de sync da frota — veredicto da `agent-sync-fleet-v3`, e o desenho do `fleet-state`

**Estado:** desenho para decisão do dono. Nada aqui foi implementado.
**Medido em:** 2026-08-25, no `Mac-mini-de-Paulo` (`mac/sistema-sync-2026-08-25`), contra
`main @ fbfb33b4` e `origin/codex/agent-sync-fleet-v3 @ 01266f2b`.
**Adversário:** `codex` é **n/d** nesta máquina (não instalado — verificado com `which`).
A refutação correu em **Ollama local** (`gpt-oss:20b`), e está declarada como tal na §4.
Um `codex` no PC deve repetir a §4 antes de qualquer merge.

---

## 0. A pergunta, e porque é por esta ordem

O alarme que abriu esta frente foi: *«283 de 300 commits das últimas 24 h são beacons,
e o `.git` do vault tem 14 MB»*. A conclusão natural — *«o canal está a rebentar,
desenha-se um novo»* — é a que este documento **não** toma, por duas razões medidas.

E antes de desenhar canal nenhum havia uma branch inteira sobre este assunto, parada.
Desenhar por cima dela sem a ler seria a terceira vez que este projeto reconstrói algo
que já existia.

---

## 1. O número que abriu a frente está certo, e o enquadramento está errado

Medições no vault real, 2026-08-25:

| o que | medido | como |
|---|---|---|
| commits nas últimas 24 h | **300**, dos quais **282 beacons** (94%) | `git log --since` |
| commits nos últimos 7 dias | **1239**, dos quais **1200 beacons** (97%) | idem |
| commits desde sempre | **1322**, dos quais **1200 beacons** (91%) | idem |
| `.git` em disco | **14 MB** | `du -sh .git` |
| `.git` num **clone fresco** | **5,9 MB** | `git clone` + `du` |
| pack + soltos no vault local | 6,13 MiB pack + 1441 objectos soltos (6,59 MiB) | `git count-objects -vH` |
| **custo dos beacons no pack** | **0,79 MiB** (0,58 blobs + 0,21 commits) | `rev-list --objects … \| cat-file --batch-check` |
| tempo de clone | **2865 ms** | cronometrado |

**Os beacons são 91% dos commits e ~13% do peso.** Custam **0,67 KiB cada** no pack.
Os 14 MB não são história de beacons: são **1441 objectos soltos por compactar**, e é
por isso que um clone fresco dá 5,9 MB. A frase *«o `.git` tem 14 MB por causa dos
beacons»* é falsa, e foi verificada sem escrever nada no vault do dono — o clone fresco
prova-o sem precisar de um `git gc`.

**Consequência para a decisão:** hoje o problema **não é tamanho**. É **legibilidade**
(§5) e é a **projecção** (§3).

---

## 2. Veredicto sobre a `codex/agent-sync-fleet-v3` — item a item, com prova

A branch tem **8 commits**, está **529 commits atrás** do main, e nenhum dos seus
módulos novos chegou alguma vez ao tronco (verificado com `git cat-file -e main:<f>`).

### O teste que decide

Enxertei os ficheiros da branch numa **worktree limpa do `main` de hoje** e corri as suites.
Não é uma leitura — é uma execução.

| enxerto | resultado |
|---|---|
| `agent-sync-vault-git.js` + `install-agent-sync-autosync.js` (728 linhas) + os seus testes | **13/13 verdes** |
| \+ `agent-sync-ledger.js` da branch, contra os testes do **main** | **44/44 verdes** (zero regressão) |
| \+ o `agent-sync-ledger.test.js` da branch | **56/56 verdes** |
| suite completa do `tools/router` com tudo enxertado | **1170 testes, 3 falhas** — e as 3 são a fuga de HOME do `statusline-multi.js`, pré-existente no main e corrigida noutro commit desta sessão. Nenhuma vem do enxerto. |

**529 commits de deriva não partiram nada.** Os módulos são auto-contidos contra a
superfície estável do `agent-sync-ledger.js`.

### Onde é que o main andou, ficheiro a ficheiro

| ficheiro | main mexeu? | branch mexe | veredicto |
|---|---|---|---|
| `tools/router/agent-sync-ledger.js` | **não (0 linhas)** | +299/−46 | **aproveitar** — aplica limpo, sem conflito |
| `tools/router/agent-sync-vault-git.js` | não existe | +480 | **aproveitar** — provado verde |
| `tools/router/install-agent-sync-autosync.js` | não existe | +248 | **aproveitar** — provado verde |
| os 3 ficheiros de teste correspondentes | não existem | +709 | **aproveitar** |
| `.github/workflows/no-frugal.yml` | não (0) | +25/−4 | **aproveitar**, mas reler: foi escrito contra um CI de há 529 commits |
| `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` | não (0) | +30/−13 | **aproveitar** — aplica limpo |
| `.claude/skills/agent-sync/SKILL.md` | não (0) | +16/−5 | **aproveitar** |
| `.roo/rules/mooter-agent-sync.md` | não (0) | +13 | **aproveitar** |
| `landing/public/install.sh` | **sim (+12/−5)** | +3/−1 | **reaplicar à mão** — os dois mexeram |
| `tools/router/gsd-turn-end.js` | **sim (+51)** | +9/−3 | **reaplicar à mão** — os dois mexeram |
| `*/package-lock.json` (3 ficheiros) | sim, muito | −984 no do router | **DESCARTAR e regenerar** — a versão da branch **reverteria** o main |

**Veredicto global: aproveitar.** A branch não está podre; está desactualizada **só nos
lockfiles**. O corpo dela — 1437 linhas de código+testes — corre verde no main de hoje
sem uma linha de adaptação.

**Recomendação mecânica:** não fazer merge da branch. Fazer *cherry-pick* dos ficheiros
(a tabela acima é a lista), regenerar os locks com `npm install`, e reaplicar à mão os
dois ficheiros onde ambos mexeram. Uma PR por si, com a suite completa.

---

## 3. O que os dois módulos fazem, e porque não são o `beacon-publisher`

Isto responde à objecção óbvia — *«o main já resolveu isto»*. Não resolveu o mesmo.

| | `beacon-publisher.mjs` (main, 159 linhas) | `agent-sync-vault-git.js` (branch, 480 linhas) |
|---|---|---|
| escreve | `50-fleet/<device>.json` — **um** ficheiro, reescrito | `30-learnings/agent-sync/**` — recibos **append-only** |
| cadência | relógio, 10 min | por evento (fim de turno) |
| recusa se | `MERGE_HEAD`/`REBASE_HEAD`, `index.lock` fresco, staging alheio | idem + **allowlist de caminhos** + recibos têm de estar **untracked** (imutabilidade) |
| concorrência | recusa e espera pelo ciclo seguinte | **reconcilia por rebase**, e só se todos os commits locais tocarem na árvore permitida |
| lock | remove `index.lock` órfão **por idade (5 min)** | lock **próprio** com PID vivo, stale a 15 min |
| confirma que empurrou | não | **sim** (`verifyPushedHead`) |

São payloads diferentes em caminhos diferentes. O da branch é materialmente **mais
cuidadoso** em quatro pontos (allowlist, imutabilidade, PID no lock, verify-pushed-head).

### ⚠️ O risco que isto cria, e que ninguém mediu

Este é o achado da refutação (§4), e é o único bloqueio real ao merge:

> **Os dois publicadores não se conhecem.** O da branch toma um lock próprio
> (`mooter-agent-sync-vault.lock`) que o `beacon-publisher` **não lê**. E o
> `beacon-publisher` **apaga o `.git/index.lock` quando ele tem mais de 5 minutos**
> (`LOCK_ORFAO_MIN = 5`), presumindo-se a si próprio o dono do lock órfão — o que era
> verdade quando havia **um** escritor.
>
> O módulo da branch corre `rebase`, `add`, `commit` e `push`, todos os quais tomam o
> `index.lock`. Um `push` pendurado ou um `rebase` lento numa ligação má passa os 5
> minutos, e o `beacon-publisher` apaga um lock **vivo** de um git a correr.

**Mitigação que já existe:** o `estadoDoVault` recusa perante `REBASE_HEAD`, o que tapa
o caso mais provável. O buraco que fica é `index.lock` **sem** `REBASE_HEAD` — durante
um `add`/`commit` grande ou um `push` pendurado.

**Severidade honesta:** baixa em probabilidade, alta em consequência (corromper o índice
do repositório pessoal do dono), e **trivial de fechar**: os dois publicadores passam a
tomar o **mesmo** lock nomeado antes de qualquer operação git no vault. É uma correcção
de ~20 linhas, e é **pré-requisito do merge**, não trabalho a seguir.

---

## 4. Refutação (Ollama local — `codex` é n/d nesta máquina)

O veredicto da §2 foi submetido a um refutador com instrução explícita de o atacar.
Aqui está o que sobreviveu e o que não:

| objecção levantada | sobrevive? |
|---|---|
| «os dois publicadores podem colidir a escrever no vault» | **SIM** — é o §3 acima. Não estava medido. Vira pré-requisito do merge. |
| «não houve lint nem análise estática, só testes» | **SIM, parcialmente** — corri suites, não `eslint`. Fica como passo da PR de enxerto. |
| «529 commits podem ter introduzido regressões» | **não** — a suite completa do router no enxerto É essa medição. |
| «os `package-lock` desactualizados podem partir o build» | **não** — o veredicto já manda descartá-los. O refutador devolveu a minha própria conclusão como objecção. |
| «impacto em performance/tamanho de bundle» | **não** — são scripts Node, não entram em bundle nenhum, e não correm sem inscrição explícita. |
| «as 3 falhas pré-existentes indicam instabilidade» | **não** — estão diagnosticadas e corrigidas nesta mesma sessão (fuga de `opts.home` no `renderResolved`). |

**Um refutador que só aprova não correu.** Este produziu uma objecção material em oito,
e ela mudou o veredicto de «aproveitar» para «aproveitar **depois de** fechar o lock
partilhado».

---

## 5. O canal `fleet-state` separado — desenho, e o gatilho que o dispara

### O problema REAL de hoje (não é tamanho, é legibilidade)

`git log` no vault é ilegível: 94% das linhas das últimas 24 h são `chore(fleet): beacon`.
O histórico humano — decisões, canon, learnings — está enterrado sob telemetria.

**Isto resolve-se hoje, sem canal nenhum, com um alias** (§6). É a razão pela qual este
desenho fica em gaveta em vez de ser executado.

### O gatilho numérico

Não se implementa isto por sensação. Implementa-se quando **qualquer** destas linhas for
ultrapassada, e cada uma tem a medição de hoje ao lado:

| gatilho | hoje | disparo |
|---|---|---|
| `.git` de um **clone fresco** | 5,9 MB | **> 50 MB** |
| tempo de `git clone` | 2,9 s | **> 30 s** |
| commits de beacon no total | 1200 | **> 25 000** |
| devices a publicar | 2 | **> 5** |

À taxa medida (**~200 commits de beacon/dia**, 0,67 KiB cada) o pack cresce
**~48 MiB/ano**. O gatilho dos 50 MB chega por volta de **2027-08**; o dos 25 000
commits chega antes, por volta de **2027-01**. Ou seja: **há ~5 meses de folga**, e é
por isso que isto é um desenho e não uma onda.

*(Os dois gatilhos de contagem valem por si: um `git log` que já é 94% ruído com 1200
beacons fica insuportável muito antes de o disco doer.)*

### O desenho, quando disparar

**Branch órfã `fleet-state` no mesmo repositório.** Não um repositório novo.

- `git checkout --orphan fleet-state` — história própria, zero antepassados comuns.
- Os beacons passam a ser commitados **só** nessa branch; `main` deixa de os ver.
- O leitor (`fleet-remoto.mjs`) já lê de `origin/<ref>` com `git show` — muda **uma
  constante**, não a arquitectura. Foi por isso que se escolheu órfã e não repo novo.
- **Squash periódico:** a branch é reescrita (`--force-with-lease`) para um único commit
  por semana. Perde-se história de beacons, que é telemetria descartável por desenho —
  os recibos que **não** são descartáveis vivem no ledger, noutro caminho.
- Um clone normal **não** traz a branch órfã (`--single-branch` é o padrão do
  `git clone`), portanto o custo de clone volta ao do canon puro.

**O que este desenho NÃO faz:** não mexe no `beacon-publisher.mjs`. Esse módulo tem
testes, tem uma decisão consciente documentada no cabeçalho (publicar por relógio, não
por ronda, precisamente para não dar milhares de commits), e já pagou um incidente
para chegar onde está. Muda-se-lhe a **referência de destino**, nada mais.

### Custo de reverter

Alto o suficiente para justificar o gatilho: uma branch órfã com squash **apaga
história**, e um `--force-with-lease` mal cronometrado entre dois devices perde o beacon
de um deles. É reversível enquanto o `main` ainda tiver os beacons antigos; deixa de o
ser depois do primeiro squash.

---

## 6. O que se faz HOJE, sem esperar por decisão nenhuma

O alias de leitura, que resolve 100% do problema de legibilidade a custo zero e
reversível a custo zero:

```sh
git -C "$VAULT_PATH" config alias.hlog "log --oneline -- ':!50-fleet'"
git -C "$VAULT_PATH" hlog -15    # o histórico HUMANO, sem telemetria
```

Documentado no vault em `00-core/onde-vive-o-que.md` e configurado por device.

---

## 7. Gate de red-team (as oito perguntas, respondidas)

| # | pergunta | resposta |
|---|---|---|
| 1 | **fonte de verdade** | O git do vault. O painel é projecção; o beacon é telemetria. Nada aqui cria uma segunda fonte. |
| 2 | **escritor único** | **Não, e é o achado.** Hoje há um (`beacon-publisher`). A branch traz um segundo que não o conhece — §3. Fechar o lock partilhado **antes** do merge. |
| 3 | **reversível vs irreversível** | Alias e cherry-pick: reversíveis. Squash da branch órfã: **irreversível** — por isso está atrás de gatilho e de GO do dono. |
| 4 | **script-first** | Todos os números vêm de comandos citados. Nenhum foi estimado. |
| 5 | **projecção vs 2ª verdade** | O `fleet-state` seria uma projecção (telemetria descartável), não uma segunda verdade. Os recibos não-descartáveis ficam no ledger. |
| 6 | **degradação graciosa** | Sem a branch órfã, tudo funciona como hoje. Sem o alias, o `git log` continua a funcionar (só ilegível). |
| 7 | **frozen/allowlist/n-d** | `classify.js` intocado. O enxerto toca em `tools/router/*` (não congelado) e em `packages/*`: **nenhum**. `codex` declarado `n/d`. |
| 8 | **custo de reverter** | Cherry-pick: um `git revert`. Alias: um `git config --unset`. Squash: **não reversível** depois do primeiro. |

**Objecção real produzida:** sim — a colisão de dois publicadores (§3), levantada na
refutação e não prevista pelo veredicto original. Mudou a recomendação.

---

## 8. O que pede a mão do dono

1. **GO/NO-GO no enxerto da `agent-sync-fleet-v3`** (§2) — com o lock partilhado (§3)
   como pré-requisito, não como trabalho a seguir.
2. **GO/NO-GO no espelho privado como 2º remoto** — ver `DR_VAULT.md`. É a outra metade
   desta frente.
3. **Nada a decidir sobre o `fleet-state`** — está atrás de um gatilho numérico e há
   ~5 meses de folga. Fica registado para não ser redescoberto.
