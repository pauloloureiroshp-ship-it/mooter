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

```
eventos com "wave":"contrato-test" ........ 497
dispatches reais .......................... 87+
jobs "agent":"moo" (GPU do dono) .......... 461
dispatches do CLI `claude` REAL ............. 4   <- consome subscrição
```

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
ledger de produção** (467 → 497 eventos). São dois defeitos independentes.

## Porque é INTERMITENTE (e porque "isolado passa 3/3" enganou)

O WIP guard (`seamless.js:630-631`) recusa o dispatch se `activeJobsByWorktree`
devolver algo — e lê o **ledger partilhado**. Se a corrida anterior deixou lá um
job sem evento terminal, **todos** os dispatches são recusados, o ficheiro passa
em milissegundos e os asserts passam na mesma (uma recusa do guard não é
`capacidade_incompativel`, que é o que K8 afere).

Ou seja: **o teste fica verde tanto quando exerce o contrato como quando não
exerce nada**, e alterna entre "segundos" e "pendurado" conforme o lixo que a
corrida anterior deixou. Foi isto que produziu os 3/3 isolados logo a seguir aos
dois hangs — e que me levou a concluir, erradamente, que o ficheiro estava bem.

Agravante medido: 40 dos 87 dispatches terminaram em `orphaned-by-restart`,
porque `ledgerAppend({event:'dispatched'})` corre em `seamless.js:2135` mas o
`owner.json` só é escrito depois do spawn (`:2392`). Nessa janela outro processo
que corra `sweepOrphans` marca o job como órfão — o que **limpa o WIP guard** e
deixa K7/K8 despachar em paralelo em vez de serem serializados.

## Porque isto bloqueia toda a gente

Qualquer frente que corra a suite do bridge pode pendurar indefinidamente sem
razão aparente, e o próximo a apanhá-lo vai culpar o próprio diff — como eu
quase fiz. É o mesmo género de bloqueio que fez nascer a `onda-a3`.

## O trabalho desta frente

1. **Dar sandbox ao `contrato.test.js`**, igual ao dos irmãos: `MOOTER_HOME` temp,
   `MOOTER_WORKTREE_ROOT` temp, `OLLAMA_HOST='127.0.0.1:1'`, `setJobSpawner`
   falso. Tudo **antes** dos `require` — `seamless.js` lê `MOOTER_REPO` no topo do
   módulo.
2. **Confirmar que os K continuam a provar o que provavam.** Um teste que passa
   a correr em sandbox e continua verde pode ter deixado de exercer o contrato —
   é exactamente o defeito descrito acima. Provar com **mutação**: partir o
   contrato de capacidade e verificar que K falha.
3. **Decidir o que fazer com os 497 eventos** já no ledger de produção. Não é
   cosmético: contaminam qualquer medição de volume de jobs `moo` lida do ledger,
   incluindo as que a `onda-a3` usou para decidir. Opções: deixar e declarar ·
   marcar como teste · segregar por `MOOTER_HOME`. **Decisão do dono.**
4. **Considerar** (pode virar frente própria): o watchdog `unref()`-ado que nunca
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
