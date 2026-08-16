# Frente `contrato-sandbox` — um teste que corre em produção

**Aberta:** 2026-08-16 · **Origem:** CC · f-mu0, descoberto ao investigar um hang da `onda-a3`
**Worktree:** `.claude/worktrees/contrato-sandbox` · **Branch:** `contrato-sandbox/isolar-o-teste`
**Base:** `main@c3ed3563` · **Nada corrigido** — abrir a frente é pôr o problema na mesa.

## Como apareceu

A suite do bridge pendurou duas vezes durante a `onda-a3`, sempre no mesmo sítio.
Da primeira atribuí-o à máquina estar carregada e deixei passar — era um sinal e
li-o como ruído. Da segunda medi: o processo ficou **9 minutos sem escrever um
byte**, e corre com `--test-timeout=0`, portanto nunca desistiria sozinho.

## O que `contrato.test.js` é

É o **único ficheiro de teste do pacote sem isolamento nenhum**:

| | `contrato.test.js` | os irmãos que despacham |
|---|---|---|
| `MOOTER_HOME` | **0 ocorrências** | temp por ficheiro |
| `OLLAMA_HOST` | **0** | `127.0.0.1:1` (porta morta) |
| `setJobSpawner` | **0** | spawner falso |
| worktree usada | **`process.cwd()`** | temp |

Irmãos que isolam: `path.test.js:28-41`, `ondaA.test.js:16-30`, `seamless.test.js:18-31`,
`downgrade.test.js:36-60`, `actor.test.js`, `v12.test.js`, `broker.test.js`, `audit.test.js`.

K4, K7 e K8 chamam `seam.toolDispatch` **real**. Não é mock: lança jobs verdadeiros.

## Medido no ledger de PRODUÇÃO (`~/.mooter/ledger.jsonl`)

**Os números vivem num script, não nesta página.** Corre:

```
bash _handoff/contrato-sandbox/contar.sh
```

Esta frente já teve a mesma contagem escrita com três valores diferentes em
cinco sítios, e um deles trocava EVENTOS por JOBS (inflaciona ~5x). Um número
de ledger pinado num documento apodrece: o ledger é vivo. O que fica aqui é a
forma do problema, não o valor.

Snapshot de 2026-08-16T16:00Z, para dar ordem de grandeza a quem lê:
**498 eventos** que são **96 jobs únicos** — 92 `moo` na GPU do dono e
**4 `cc`, o CLI pago**, mais 96 dispatches e 40 `orphaned-by-restart`.

Os worktrees registados incluem `scratchpad/ensaio-merge` e `scratchpad/merge-final`
— worktrees temporários que a própria validação do merge da `onda-a3` criou. Ou
seja: correr a suite para validar um merge lançou jobs reais e escreveu-os na
produção do dono.

## Experiência decisiva, já corrida

```
OLLAMA_HOST=127.0.0.1:1 node --test contrato.test.js   (3 corridas)
  corrida 1: 28s · rc=0 · 9 verdes
  corrida 2: 33s · rc=0 · 9 verdes
  corrida 3: 29s · rc=0 · 9 verdes
```

**Com o Ollama inalcançável o hang desaparece.** O que segurava o processo era um
job real na GPU: `toolDispatch` devolve imediatamente (`seamless.js:2586`) mas o
socket HTTP para `/api/chat` e os processos-filho ficam *ref'd* no event loop. O
watchdog de 30 min está `unref()`-ado (`seamless.js:2294`), logo não mata nada;
com `--test-timeout=0` nada limita a espera.

Mas repare-se: **mesmo com o Ollama morto, o ficheiro continuou a escrever no
ledger de produção**. São dois defeitos independentes: o hang e a poluição.

## O DEFEITO CENTRAL: os asserts leem uma chave que a recusa nunca escreve

Este é o achado que vale mais que o hang, e é verificável em três linhas:

```
guardCheck recusado → { error: '❌ guard recusou o dispatch', reasons }   seamless.js:1987
asserts K4/K7/K8    → assert.notEqual(r && r.erro, 'capacidade_incompativel')
                                        ^^^^                contrato.test.js:95, 133, 144
```

`error` é inglês, `erro` é português. **São chaves diferentes.** A chave `erro`
só é escrita por `recusaContratoDeLeitura` (`seamless.js:1392`) e por três
caminhos de worktree (`:3228`, `:3246`, `:3287`) — nunca pelo guard.

Quando o guard recusa, `r.erro` é `undefined`, e
`assert.notEqual(undefined, 'capacidade_incompativel')` **passa trivialmente**.

**O teste fica verde tanto quando exerce o contrato como quando não exerce
absolutamente nada.** Não é uma fragilidade teórica: é o que acontece sempre que
o ledger partilhado tem lixo de uma corrida anterior.

## Porque é INTERMITENTE (e porque "isolado passa 3/3" me enganou)

O WIP guard (`seamless.js:630-631`) recusa o dispatch se `activeJobsByWorktree`
devolver algo — e lê o **ledger partilhado**. Daí os dois regimes:

- **ledger com lixo** → tudo recusado → passa em milissegundos, verde vazio (é o
  "isolado passa 3/3" que me levou a concluir, erradamente, que estava bem)
- **ledger limpo** → despacha a sério → nascem processos reais

O mecanismo sob carga é mais subtil do que parece, e ao contrário do que se
poderia supor **não é o job local lento que pendura**. K4/K7/K8 são `await`
sequenciais sobre a mesma worktree, e o guard serializa-os. Com a GPU saturada:

1. `pickModelExplained` filtra por VRAM (`moo.js:301`) e devolve `model:null`
   com `motivo_nao_local:'falta_vram'` (`moo.js:381-389`)
2. o ramo `no-local-model` (`seamless.js:2210-2237`) escreve um evento
   **terminal** de imediato → **a worktree fica livre**
3. K7 volta a tentar, K8 passa o guard e faz **`spawn` real do `claude`/`codex`**
   (`realSpawnJob`, `seamless.js:839-848`)

É esse **CLI real** que corre minutos e produz a linha
«saiu 0, mas terminou a pedir aprovação («posso»)» — assinatura de um agente de
CLI, não de um modelo local de 3B. É ele que segura o event loop.

Agravante medido: 40 dos 96 dispatches terminaram em `orphaned-by-restart`,
porque `ledgerAppend({event:'dispatched'})` corre em `seamless.js:2135` mas o
`owner.json` só é escrito depois do spawn (`:2392`). Nessa janela outro processo
que corra `sweepOrphans` marca o job como órfão — o que **limpa o WIP guard**.

## Porque isto bloqueia toda a gente

Qualquer frente que corra a suite do bridge pode pendurar indefinidamente sem
razão aparente, e o próximo a apanhá-lo vai culpar o próprio diff — como eu
quase fiz. É o mesmo género de bloqueio que fez nascer a `onda-a3`.

## O trabalho desta frente

1. **Dar sandbox ao `contrato.test.js`**, igual ao dos irmãos: `MOOTER_HOME` temp,
   `MOOTER_WORKTREE_ROOT` temp, `OLLAMA_HOST='127.0.0.1:1'`, `setJobSpawner`
   falso. Tudo **antes** dos `require` — `seamless.js` lê `MOOTER_REPO` no topo do
   módulo.
2. **Corrigir os asserts para falharem alto quando o guard recusa.** É o ponto
   mais importante e sem ele os pontos 1 e 3 produzem verde vazio na mesma:
   ```js
   assert.ok(!r.error, 'o guard recusou e o teste não exerceu nada: '
     + JSON.stringify(r && r.reasons));
   assert.notEqual(r && r.erro, 'capacidade_incompativel');   // o que já lá está
   ```
3. **Confirmar que os K continuam a provar o que provavam.** Um teste que passa
   a correr em sandbox e continua verde pode ter deixado de exercer o contrato.
   Provar com **mutação**: partir o contrato de capacidade e verificar que K
   falha. Verde sem prova de que morde não conta — este ficheiro já demonstrou
   saber ficar verde sem exercer nada.
4. **Decidir o que fazer com os eventos de teste** já no ledger de produção (ver `contar.sh`). Não é
   cosmético: contaminam qualquer medição de volume de jobs `moo` lida do ledger,
   incluindo as que a `onda-a3` usou para decidir. Opções: deixar e declarar ·
   marcar como teste · segregar por `MOOTER_HOME`. **Decisão do dono.**
5. **Considerar** (pode virar frente própria): o watchdog `unref()`-ado que nunca
   mata um job encravado, e a janela `dispatched` → `owner.json` que produz
   `orphaned-by-restart` em quase metade dos dispatches.

## Limites

- **Não tocar** em `tools/router/classify.js` (FROZEN, sha CI-enforced
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`).
- Adds selectivos; nunca `git add -A`.
- **Zero push.** O merge é gesto do dono.
- Prova obrigatória: par vermelho→verde em ficheiro, com a **suite completa**
  (`cd packages/mooter-bridge && node --test`), e a suite tem de fechar **sem
  pendurar** — que é o ponto todo.
- Mutação obrigatória no ponto 2: verde sem prova de que morde não conta.
- G4 crítico≠autor antes de fechar.
