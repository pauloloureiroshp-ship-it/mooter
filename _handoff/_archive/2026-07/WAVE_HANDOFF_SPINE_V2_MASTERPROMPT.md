# ⇄ COWORK/CODEX → CLAUDE CODE
# WAVE HANDOFF SPINE V2 — tornar o Perfect Handoff realmente perfeito

> Packet emitido pelo Cowork em 2026-07-10. Autor do draft: Paulo + Codex (recon 2026-07-10).
> Emenda de premissas: Cowork (verificação read-only via device, mesma data — ver § Emenda Cowork).

## MISSÃO

Resolver integralmente as falhas encontradas na auditoria multiagente do sistema de handoff do Mooter:

1. Preservar e validar as correções já implementadas pelo Codex.
2. Separar o Ledger durável do buffer móvel de contexto.
3. Tornar escrita, deduplicação, rollover e projeções seguras sob concorrência.
4. Fazer Ledger → reducer → handoffs/SYNC/cockpit ser o único fluxo de verdade.
5. Tornar locks e fechamento de waves fail-closed.
6. Limpar a arquitetura de informação sem apagar ou perder trabalho.
7. Encerrar com testes completos, evidência ligada ao HEAD e handoff executável.

Continue autonomamente em todo trabalho reversível. Pare apenas nos STOPs e gates humanos definidos abaixo.

---

## HEADER

- Orquestrador: Claude Code, usando o modelo confiável mais alto disponível.
- Não usar `@fable` sem opt-in explícito de Paulo.
- Repo canônico: `C:\Users\Paulo Loureiro\frugal`
- Worktree inicial: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-recon`
- Branch inicial: `feat/handoff-spine-v2-recon`
- Base: `main`, depois de reconfirmar o HEAD real (⚠ ver Emenda Cowork: main local está STALE; a base efetiva é `origin/main` após fetch).
- Relatório Day 0: `.planning/handoff-spine-v2/DAY0_RECON.md`
- Nenhum novo `.md` na raiz.
- Máximo de quatro subagentes simultâneos.
- Um único agente writer por branch; revisores são read-only.

### Estado observado pelo Codex em 2026-07-10 — TRATE COMO PREMISSA A VERIFICAR

- shared tree: `wave/honest-controls @ eba5d3b`
- `main @ 35c19f9`
- latest tag observado: `cockpit-v0.16.39`
- working tree extremamente dirty, com trabalho de várias frentes
- `classify.js` no SHA correto
- Node indisponível apenas no shell WSL do Codex
- arquivos `agent-sync` ausentes neste checkout
- 12 arquivos da auditoria Codex continuam uncommitted
- `SYNC.md` excede o orçamento de ~200 linhas
- existem dezenas de packets ativos/untracked

Não herde nenhum desses fatos sem verificar.

### ⚠️ EMENDA COWORK — verificação read-only de 2026-07-10 (device, sem git write, sem tocar o index)

Confrontação das premissas Codex com o filesystem real do shared tree (`.git` lido diretamente):

| Premissa Codex | Verificação Cowork 2026-07-10 | Veredito |
|---|---|---|
| shared tree `wave/honest-controls @ eba5d3b` | `.git/HEAD` → `wave/honest-controls`; ref → `eba5d3b` | ✅ confirmada |
| `main @ 35c19f9` | `refs/heads/main` = `35c19f9` **mas** `refs/remotes/origin/main` = **`c5cda85`** — MEO (PR #237, `wave/directors-cut-v2 @ e3d35dc`, release 0.16.63) já está em origin/main | ⚠️ **STALE** — a base da wave é `origin/main` após `git fetch origin main --tags`; nunca criar branch a partir do main local sem fetch |
| latest tag `cockpit-v0.16.39` | último tag cockpit *fetched localmente* = `cockpit-v0.16.39`; a release 0.16.63 (MEO) pode ter tag ainda não fetched | 🟡 parcial — reconfirmar após `git fetch --tags` |
| `classify.js` no SHA correto | `sha256sum` = `427d8c0b…48f` no shared tree | ✅ confirmada |
| 12 arquivos Codex uncommitted | os 12 arquivos **existem** no tree; estado staged/uncommitted NÃO foi medido (Cowork não roda `git status` para não tocar o index) | 🟡 existência ✅, estado git a confirmar no Day 0 |
| arquivos agent-sync ausentes | `tools/router/agent-sync-ledger.js`, `_handoff/agent-sync/latest.md`, `_handoff/agent-context/bundle.md`, `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` — todos MISS; worktree `frugal-eyeball` existe (`feat/lp-cockpit-layout`) | ✅ confirmada — diff com eyeball é viável |
| SYNC.md > ~200 linhas | 317 linhas | ✅ confirmada |
| tree extremamente dirty | não medido pelo Cowork; board fleet de 2026-07-10 10:51 reporta **135 dirty · 19 sessões no mesmo tree · 13 UNPUSHED · 1 DUP** | 🟡 herdar do board, medir no Day 0 |

**Trabalho vivo no tree — NÃO tocar, NÃO "limpar", NÃO stagear por engano (Day 0 deve inventariar à parte):**

1. **Flicker-fix (handoff 2026-07-10 07:02, ✅ aceite provado):** 4 ficheiros no working tree do `frugal` aguardam stage seletivo do CC — `tools/router/backtest.js` (null-guard + windowsHide), `tools/router/vram_detect.js`, `packages/overclock-moo/src/runner.mjs` + `benchmark.mjs` (allowlist pontual aprovada pelo Paulo). Backups em `_to_delete/flicker-fix/`. Commit `21408f5` em `feat/fleet-arm` (frugal-fleet-arm) está **UNPUSHED** à espera de gate.
2. **`wave-w3 @ da42695`** (frugal-wave-w3) — 1 commit por push (parked).
3. **MEO follow-ups (memória 2026-07-10):** `frugal-ratchet` vermelho em main é **PRÉ-EXISTENTE** (174 vs baseline 146, drift do rebrand) — nos gates desta wave, classificar como falha preexistente, nunca como regressão. Faxina do board (13 UNPUSHED antigas) é follow-up separado — a Fase E pode propor, não executar sem Paulo.
4. **SYNC.md**: o snapshot com MEO shipped ainda não foi escrito (follow-up #3 do MEO). A redução do SYNC na Fase C/E deve incorporar esse update, não competir com ele.

Tudo o resto do bloco Codex permanece premissa a refutar no Day 0.

---

# GATE PHASE 0 — DAY 0 RECON

## 0.1 STOP antes de escrever

Não edite, stage, restaure, mova ou apague nada no shared tree.

Proibido:

- `git reset`
- `git clean`
- `git checkout --`
- `git restore`
- `git add -A`
- stash global ou automático
- aplicar patch sobre o shared tree
- remover worktrees
- mover handoffs antes do inventário e aprovação

Primeiro produza o recon.

## 0.2 Verificações obrigatórias

Registre comando, saída e conclusão para cada item:

```powershell
cd C:\Users\Paulo Loureiro\frugal
git status --short --branch
git worktree list --porcelain
git rev-parse --short HEAD
git rev-parse --short main
git rev-parse --short origin/main   # emenda Cowork: main local está stale
git rev-list --left-right --count main...HEAD
git describe --tags --abbrev=0
Get-FileHash tools\router\classify.js -Algorithm SHA256
node --version
npm --version
Get-Content tools\router\version.json
Get-Content landing\app\version.json
```

O SHA obrigatório é:

```
427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
```

Verifique também:

- existência e estado de `AGENTS.md`, `CLAUDE.md`, `SYNC.md`;
- `docs/strategy/PERFECT_HANDOFF_SPEC.md`;
- `_handoff/codex/scaffold/HANDOFF.template.md`;
- `tools/docs-hygiene.js`;
- `tools/router/agent-sync-ledger.js`;
- `_handoff/agent-sync/latest.md`;
- `_handoff/agent-context/bundle.md`;
- `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`;
- baseline dos packages afetados;
- diferenças entre este checkout e `frugal-eyeball`, se acessível;
- se qualquer agente/processo está atualmente escrevendo nos mesmos arquivos;
- **(emenda Cowork)** os 4 ficheiros do flicker-fix e os commits UNPUSHED listados na Emenda — inventariar e proteger, nunca absorver nesta wave.

## 0.3 Correções Codex a preservar

Localize e confronte exatamente estas alterações no shared tree:

- `_handoff/_MASTER_ORCHESTRATION.md`
- `_handoff/codex/MOOTER_CODEX_MASTERPROMPT.md`
- `_handoff/codex/scaffold/HANDOFF.template.md`
- `docs/strategy/PERFECT_HANDOFF_SPEC.md`
- `package.json`
- `packages/vscode-extension/src/handoff-accumulator.test.js`
- `packages/vscode-extension/src/host-extra.js`
- `tools/router/ledger-decision.js`
- `tools/router/ledger-decision.test.js`
- `tools/router/package.json`
- `tools/docs-hygiene.js`
- `tools/docs-hygiene.test.js`

Não presuma que estão corretas. Faça review linha por linha.

Preserve essas mudanças em patch/cópia isolada sem tocar no index do shared tree. Registre hashes dos arquivos copiados.

## 0.4 Refuted / corrected brief premises

Antes de escrever código, crie a seção:

```markdown
## Refuted / corrected brief premises

1. <premissa>
   - Evidência:
   - Correção:
   - Impacto no plano:
```

Refute no mínimo:

- "Tudo já está resolvido."
- "O journal atual é um Ledger append-only durável."
- "O conductor impede operações concorrentes."
- "`wave ship` exige prova suficiente."
- "SYNC.md ainda é somente snapshot."
- "O checkout já possui o protocolo agent-sync."
- "As alterações Codex podem ser aplicadas cegamente sobre main."
- "SQLite é automaticamente a melhor solução."
- **(emenda Cowork)** "O main local é a base correta da wave." — já refutada acima; documente no DAY0_RECON com a evidência própria.

Se SQLite exigir nova dependência nativa no hot path do router, trate isso como risco. O projeto tem viés zero-dependency. Prefira Node builtins ou pare para decisão arquitetural.

## 0.5 Baseline

Antes das mudanças, execute e registre os resultados reais:

```powershell
cd C:\Users\Paulo Loureiro\frugal\tools\router
npm test
cd C:\Users\Paulo Loureiro\frugal\packages\vscode-extension
npm test
cd C:\Users\Paulo Loureiro\frugal\packages\cli
npm test
cd C:\Users\Paulo Loureiro\frugal\packages\synthesis
npm test
cd C:\Users\Paulo Loureiro\frugal\packages\worktree-conductor
npm test
```

Se dependências estiverem ausentes, instale apenas dentro do package correspondente.

Diferencie:

- falha preexistente (inclui o `frugal-ratchet` 174 vs 146 — ver Emenda);
- falha ambiental;
- regressão da wave;
- teste não executado.

Nunca transforme "não executado" em "passou".

---

## DOUTRINA — NÃO NEGOCIÁVEL

- `tools/router/classify.js` é FROZEN: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Deve permanecer byte-identical.
- Packages congelados só podem ser alterados nos arquivos explicitamente allowlisted neste prompt.
- Tier ladder: T0–T3 auto; T5 somente via `@fable`; não existe T4.
- Qualquer preço deve deferir ao skill pricing-correto-2026; nunca usar preços de memória.
- Selective adds somente; nunca `git add -A`.
- Cada fase usa branch própria a partir de main atualizado.
- Cada branch deve ser independentemente revisável.
- Não pushar, mergear, deployar, deletar ou arquivar sem Paulo.
- Nenhuma métrica, contagem de teste ou estado git pode ser inferido.
- Narrativa LLM nunca é fonte de verdade.
- Um resultado sem evidência deve ser n/d.
- PT-BR na comunicação; inglês em código e identificadores.

---

## FASE A — PRESERVAR E VALIDAR O PATCH CODEX

Branch após Day 0: `feat/handoff-spine-v2-a-audit-fixes`
Worktree: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-a`

### Allowlist exclusiva

- `_handoff/_MASTER_ORCHESTRATION.md`
- `_handoff/codex/MOOTER_CODEX_MASTERPROMPT.md`
- `_handoff/codex/scaffold/HANDOFF.template.md`
- `docs/strategy/PERFECT_HANDOFF_SPEC.md`
- `package.json`
- `packages/vscode-extension/src/handoff-accumulator.test.js`
- `packages/vscode-extension/src/host-extra.js`
- `tools/router/ledger-decision.js`
- `tools/router/ledger-decision.test.js`
- `tools/router/package.json`
- `tools/docs-hygiene.js`
- `tools/docs-hygiene.test.js`

### Objetivos

- Importar somente o patch Codex.
- Confirmar que `composeHandoff()` preserva: `perfect`; `ledgerEvents`; `sessionGit`; `expectedCwd`; `recent`; demais opções determinísticas.
- Confirmar que tool errors nunca viram decisões humanas.
- Validar o doctor de higiene: SHA; SYNC.md longo; fila congestionada; packets untracked; packets sem status; referências quebradas; duplicados; artefatos operacionais no topo; `--strict`.
- Confirmar que o novo template não cria um segundo Ledger manual.
- Confirmar que documentos superseded não podem ser confundidos com instruções ativas.

### Gate A

```powershell
cd <worktree>
npm run test:docs-hygiene
cd tools\router
node --test ledger-decision.test.js ledger-prov.test.js ledger-event.test.js ledger-reduce.test.js
npm test
cd ..\..\packages\vscode-extension
node --test src\handoff-accumulator.test.js src\perfect-handoff.test.js
npm test
```

Além disso:

- SHA intacto;
- JSON válido;
- `git diff --check`;
- diff somente na allowlist;
- nenhum arquivo do shared tree alterado;
- reviewer independente sobre o diff.

Pare com branch pronta para revisão. Não mergeie.

---

## FASE B — LEDGER DURÁVEL E CONCORRENTE

Só iniciar após a Fase A estar revisada e integrada por Paulo.

Branch: `feat/handoff-spine-v2-b-durable-ledger`
Worktree: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-b`

### Allowlist

- `tools/router/handoff-journal.js`
- `tools/router/handoff-journal.test.js`
- `tools/router/handoff-rollup.js`
- `tools/router/handoff-rollup.test.js`
- `tools/router/ledger-prov.js`
- `tools/router/ledger-prov.test.js`
- `tools/router/ledger-event.test.js`
- `tools/router/ledger-reduce.js`
- `tools/router/ledger-reduce.test.js`
- `tools/router/gsd-turn-end.js`
- `tools/router/stop-hook.test.js`
- `tools/router/package.json`
- `tools/router/ledger-store.js` — NEW permitido
- `tools/router/ledger-store.test.js` — NEW permitido
- `tools/router/ledger-lock.js` — NEW, somente se necessário
- `tools/router/ledger-lock.test.js` — NEW, somente se necessário

⚠ Emenda Cowork: `tools/router/backtest.js` e `tools/router/vram_detect.js` têm mudanças vivas do flicker-fix no working tree do shared tree — esta fase trabalha em worktree próprio a partir de origin/main; se o flicker-fix ainda não tiver aterrado em main quando a Fase B abrir, NÃO absorver nem sobrescrever essas mudanças.

### Contrato obrigatório

Separar fisicamente:

**Context journal:**

- buffer bounded;
- pode reter somente os últimos turnos;
- nunca é chamado de Ledger durável.

**Event Ledger:**

- append-only;
- sem truncar eventos silenciosamente;
- `schema_version`;
- `event_id`;
- `sid`;
- `seq` monotônico;
- timestamp interno;
- agent/model/tier internos ou validados;
- hashes recalculados internamente;
- hash anterior ou mecanismo equivalente de detecção de corrupção;
- idempotência que sobrevive a rollover/restart;
- limites de payload;
- redaction de segredos;
- recuperação honesta de linhas parciais;
- sem dependência LLM.

**Rollup:**

- cursor monotônico;
- nunca usar somente `entries.length`;
- continuar absorvendo turnos após 50, 100 e 500 entradas;
- eventos não podem falsear o contador de turnos.

**Concorrência:**

- single-writer ou lock exclusivo real;
- temp files únicos;
- stale lock recuperável;
- fsync quando aplicável;
- nenhuma janela check-then-append sem proteção.

Não adicionar `better-sqlite3` ao router sem STOP e aprovação. Uma dependência nativa no hot/runtime path exige decisão explícita.

### Testes obrigatórios B

- 100+ turnos preservam intents/decisions/outcomes.
- Dedupe após mais de 50 entradas.
- Dois ou mais processos escrevendo simultaneamente.
- Crash entre append, fsync e rename.
- Linha JSON parcial.
- Lock stale.
- IDs que colidem após sanitização.
- Payload excessivo.
- Redaction de token, API key e private key.
- Replay determinístico.
- Restart de processo preserva sequência.
- Rollup continua atualizando após saturação do buffer.

### Gate B

- todos os testes do router;
- stress multiprocess repetido;
- SHA intacto;
- zero perda/duplicação observada;
- reviewer independente;
- sem mudança fora da allowlist.

Pare para gate humano. Não mergeie.

---

## FASE C — REDUCER ÚNICO + AGENT SYNC

Só iniciar após a Fase B estar em main.

Branch: `feat/handoff-spine-v2-c-projections`
Worktree: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-c`

### Allowlist

- `tools/router/ledger-reduce.js`
- `tools/router/ledger-reduce.test.js`
- `tools/router/agent-sync-ledger.js` — NEW permitido
- `tools/router/agent-sync-ledger.test.js` — NEW permitido
- `tools/router/agent-context-bundle.js` — NEW permitido
- `tools/router/agent-context-bundle.test.js` — NEW permitido
- `tools/router/package.json`
- `packages/vscode-extension/src/host-extra.js`
- `packages/vscode-extension/src/guardian-prebake.js`
- `packages/vscode-extension/src/*handoff*.test.js`
- `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` — NEW permitido
- `_handoff/agent-sync/.gitkeep` — somente se realmente necessário

### Objetivos

Um único schema/event vocabulary:

`intent · brief · turn · decision · artifact · gate · handoff · outcome · sync · review · blocker`

Evidence vocabulary:

`code · test · git · doc · handoff · runtime · connector · inference`

Todas as projeções devem nascer do Ledger/reducer:

- Guardian;
- handoff de sessão;
- handoff de projeto;
- briefs por agente;
- latest;
- context bundle;
- cockpit;
- SYNC.md.

SYNC.md deve ser snapshot:

- estado atual;
- "a única coisa";
- blockers;
- ponteiros;
- poucos handoffs recentes;
- ≤ ~200 linhas.

Handoffs completos ficam no Ledger/projeções próprias, não acumulados indefinidamente no SYNC.md.

⚠ Emenda Cowork: o snapshot do SYNC.md com o MEO shipped (follow-up de 2026-07-10) deve ser incorporado por esta projeção — não escrever dois SYNCs concorrentes.

Se `frugal-eyeball` contiver uma implementação anterior de agent-sync:

- faça diff;
- extraia apenas contratos comprovados;
- não copie cegamente;
- documente divergências de checkout.

Implemente:

```powershell
node tools\router\agent-sync-ledger.js simulate
```

Resultado obrigatório: `SIMULATION=pass`

A simulação deve cobrir Claude Code, Codex, Gemini/Roo e Ollama sem chamada externa.

### Gate C

- replay gera projeções byte-idênticas;
- writers diretos antigos falham testes ou deixam de existir;
- duas sessões atualizando projeções não perdem blocos;
- SYNC.md não cresce sem limite;
- simulation pass;
- router e VS Code extension completos;
- SHA intacto;
- reviewer independente.

Pare para gate humano.

---

## FASE D — SHIP GATE E LOCKS FAIL-CLOSED

Esta fase modifica packages congelados. Este prompt concede allowlist SOMENTE aos arquivos abaixo.

Branch: `feat/handoff-spine-v2-d-enforcement`
Worktree: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-d`

### Allowlist congelada

- `packages/cli/src/commands/wave.ts`
- `packages/cli/tests/wave.test.ts`
- `packages/synthesis/src/state/central-state.ts`
- `packages/synthesis/tests/*wave*.test.ts` — somente teste correspondente
- `packages/worktree-conductor/src/commands.ts`
- `packages/worktree-conductor/src/conductor.ts` — somente se estritamente necessário
- `packages/worktree-conductor/tests/worktree-conductor.test.ts`

Qualquer outro arquivo exige STOP e Paulo.

### D.1 Wave ship honesto

`ship` só pode produzir `shipped` se houver:

- todas as fases concluídas;
- outcome/gate ligado ao branch + HEAD exatos;
- SHA congelado correto;
- testes requeridos passados;
- worktree limpo;
- merge commit confirmado em main;
- aprovação humana registrada;
- nenhum blocker aberto.

Remover a possibilidade de `--force` transformar SHA incorreto em `shipped`.

Se for necessário um fluxo de emergência:

- estado `override-requested`;
- nunca `shipped`;
- exige Paulo;
- motivo e evidência registrados;
- não executa merge/deploy.

### D.2 Locks fail-closed

Para operações mutáveis:

- conflito de lock deve bloquear ou enfileirar;
- warning com exit 0 não é lock;
- comandos read-only continuam livres;
- stale lock só é recuperado após heartbeat/owner check;
- override humano é explícito e auditável;
- um writer por worktree/recurso.

Cobrir pelo menos: commit concorrente; merge concorrente; rebase; tag; push; worktree add/remove; deploy; release.

### Gate D

```powershell
cd packages\cli
npm test
cd ..\synthesis
npm test
cd ..\worktree-conductor
npm test
```

Mais:

- teste prova que uma wave incompleta não pode shipar;
- teste prova que SHA mismatch nunca vira `shipped`;
- teste prova que lock conflitante bloqueia mutação;
- inspeção read-only continua permitida;
- SHA intacto;
- reviewer independente.

Pare para gate humano.

---

## FASE E — HIGIENE E ARQUIVO CONTROLADO

Branch de recon: `feat/handoff-spine-v2-e-hygiene-recon`

Esta fase começa read-only.

### Primeiro: inventário verificável

Execute:

```powershell
node tools\docs-hygiene.js --json
```

Produza uma tabela: path · tracked/untracked · tipo · status declarado · idade · supersedes · superseded_by · referências de entrada · evidência de shipped · ação proposta · confiança.

Classifique: active; blocked; ready; shipped; superseded; historical; generated runtime; unknown.

### Regras

- Nenhum delete.
- Nenhum move sem lista completa e aprovação de Paulo.
- Untracked é alerta vermelho.
- Não arquivar baseado apenas no título.
- Confrontar git, último handoff e estado da frente.
- Runtime files devem ir para diretório operacional apropriado, não misturados à fila de work orders.
- Consolidar specs duplicadas somente quando houver um spec vivo claramente identificado.
- Histórico vai para archive, nunca é apagado.
- ⚠ Emenda Cowork: a faxina do board Moo (13 UNPUSHED antigas, 1 DUP, 2 parked — follow-up MEO #2) e os packets do flicker-fix são trabalho vivo/aceite — classificar com evidência, propor, nunca executar sem Paulo.

### Entrega antes de qualquer move

- KEEP ACTIVE
- ARCHIVE
- CONSOLIDATE
- MOVE TO RUNTIME DIR
- UNKNOWN — PAULO DECIDES

Somente após aprovação explícita:

- executar moves seletivos;
- reduzir SYNC.md;
- manter histórico em `docs/foundation/SYNC_ARCHIVE_2026.md` ou destino canônico existente (⚠ já existe `docs/foundation/SYNC_ARCHIVE_2026H1.md` — usar/estender o canônico, não criar segundo archive);
- atualizar ponteiros;
- executar doctor novamente;
- ativar `--strict` apenas quando o baseline estiver honestamente limpo.

---

## FASE F — INTEGRAÇÃO E PROVA FINAL

Somente após A–E estarem revisadas e integradas na ordem aprovada.

### Gate completo

- SHA congelado.
- `git diff --check`.
- JSON/YAML válidos.
- Tests completos: tools/router; vscode-extension; cli; synthesis; worktree-conductor.
- Stress multiprocess.
- Rollover 500+.
- Replay determinístico.
- Agent-sync simulation.
- Doctor de higiene.
- SYNC.md dentro do contrato.
- Runtime hook self-check.
- Nenhum direct writer fora do reducer.
- Nenhum pacote/arquivo fora da allowlist.
- Nenhum segredo ou prompt privado em artifacts.
- Classificação correta de uncommitted/unpushed.

Execute obrigatoriamente o skill `final-reviewer-honest`. O reviewer deve:

- verificar o SHA;
- executar suites completas;
- procurar métricas inventadas;
- revisar selective adds;
- confrontar branch/worktree reais;
- emitir SHIP, SHIP-WITH-NITS ou NO-SHIP.

Nenhum push, merge, release ou deploy sem Paulo.

---

## STOP CRITERIA

Pare imediatamente e retorne a Paulo se ocorrer qualquer item:

- SHA diferente do congelado;
- necessidade de editar `classify.js`;
- arquivo necessário fora da allowlist;
- baseline vermelho sem causa isolada;
- incapacidade de separar patch Codex do trabalho alheio;
- shared tree alterado acidentalmente;
- segredo, migration ou produção;
- mudança de CI/settings compartilhados;
- nova dependência runtime/nativa;
- operação destrutiva;
- move/archive sem aprovação;
- push/merge/deploy/release;
- mais de cinco subagentes em um turno;
- lock conflitante sem mecanismo fail-closed;
- divergência entre código, Ledger, git e handoff;
- testes não executáveis no ambiente nativo;
- qualquer necessidade de "assumir" um pass.

Ao parar:

```
BLOCKED:
EVIDENCE:
SAFE STATE:
UNCOMMITTED:
HUMAN DECISION REQUIRED:
EXACT RESUME COMMAND:
```

---

## SHIP PROBABILITY — HONESTA, PRÉ-RECON

| Fase | Probabilidade | Desconto honesto |
|---|---|---|
| Day 0 | 90% | shared tree muito dirty e branches divergem (↑ ligeiro: Cowork já pré-verificou 6 premissas) |
| A · patch Codex | 85% | implementação existe, mas nunca executou em Node neste checkout |
| B · durable Ledger | 60% | concorrência Windows, crash safety e zero-dependency são difíceis |
| C · reducer/sync | 65% | vários writers e projeções existentes precisam convergir |
| D · enforcement | 65% | altera packages congelados e comportamento operacional |
| E · higiene | 55% | depende de classificação humana de muitos artifacts untracked |
| F · integração | 55% | depende de todas as fases, runtime live e gates humanos |

Atualize estas probabilidades depois do Day 0. Nunca use 100% para código não executado.

---

## FORMATO DE RETORNO OBRIGATÓRIO

Retorne ao Paulo/Cowork:

**TL;DR** — Estado geral: · Única ação de maior alavanca: · Fases concluídas: · Fases bloqueadas: · Veredito:

**PROVENIÊNCIA** — Worktree: · Branch: · HEAD: · Base/main: · Dirty: · Uncommitted: · Unpushed: · PR: · Merge: · CI:

**MUDANÇAS** — Arquivos alterados: · Arquivos novos: · Arquivos movidos: · Arquivos preservados: · Fora de escopo:

**PROVAS** — Comandos executados: · Testes pass/total reais: · Testes não executados: · SHA: · Simulation: · Stress: · Replay: · Doctor: · Final reviewer:

**REFUTAÇÕES** — Premissa: / Evidência: / Correção:

**RISCOS / NITS** — P0: · P1: · P2: · P3:

**HUMAN GATES** — Decisão necessária: · Opções completas: · Recomendação: · Consequência:

**NEXT** — `<um comando exato para retomar>`

Nunca responda apenas "feito". O retorno precisa permitir que outro agente continue sem screenshot, sem chat anterior e sem adivinhar nada.
