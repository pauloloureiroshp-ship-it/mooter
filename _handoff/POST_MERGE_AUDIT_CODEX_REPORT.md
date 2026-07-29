# Auditoria independente pós-merge — tese v2 (#248) + Spine Fase A (#249)

**Data:** 2026-07-15  
**Repositório:** `pauloloureiroshp-ship-it/mooter`  
**Alvo auditado:** `origin/main@71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7`  
**Worktree de prova:** `C:\tmp\frugal-postmerge-audit` (detached, descartável)  
**Modo:** produto read-only; nenhum fix, commit, push ou edição de fonte

## TL;DR executivo

- **Veredicto global: PARTIAL.** Os dois merges estão em `origin/main`, o classificador está intacto e os fixes centrais do Spine exercitados funcionam.
- O plugin real é substancialmente mais testado do que o inventário antigo: **1393 pass, 0 fail, 1 skip em 1394 testes / 91 ficheiros**.
- O VSIX real `0.16.78` foi empacotado, instalado e ativado via `onStartupFinished` num perfil VS Code isolado, sem erro de ativação.
- A baseline não é integralmente verde: `tools/router` terminou **979 pass, 2 fail, 1 skip / 982**, ambos no gate de latência sob carga.
- O teste de latência isolado passou **15/15 corridas** (45/45 subtestes; 75 cold spawns), confirmando sensibilidade à carga, não uma falha funcional determinística.
- A nova tese não chegou à verdade pública do plugin: marketplace/README ainda prometem “Cost Cockpit”, “read-only” e “never touches your code”, contraditos pelo código atual.
- A Fase A não deixou o gate prometido no commit: `.planning/handoff-spine-v2/PHASE_A_GATE.md` está ausente; os **5 gates P1** do Perfect Handoff continuam abertos.
- `SYNC.md` cumpre o orçamento (99 linhas), mas está materialmente stale; o Ledger ainda não é a única rota de escrita.
- O ratchet “no-frugal” tem uma folga real de 1 ficheiro e pode aceitar uma regressão.

## Escopo, pré-condição e proveniência

| Verificação | Evidência | Veredicto |
|---|---|---|
| PR #248 mergeado | `9f263c6 Merge pull request #248 ...` no histórico de `origin/main` | PASS |
| PR #249 mergeado | `71340b2 Merge pull request #249 ...` no topo de `origin/main` | PASS |
| SHA exato | `git rev-parse HEAD` e `git rev-parse origin/main` → `71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7` | PASS |
| Isolamento | `node_modules` inexistente antes do install na raiz, extensão e conductor; worktree criada no SHA remoto | PASS |
| Contexto multiagente | `AGENTS.md`, `CLAUDE.md`, `SYNC.md`, protocolo e handoff relevante lidos. `_handoff/agent-sync/latest.md` e `_handoff/agent-context/bundle.md` não existiam no commit limpo; `agent-sync` gerou só projeção local ignorada | PARTIAL |
| Vault/Notion | Vault local consultado por retrieval. O mirror Notion tinha última sincronização Mooter em 2026-06-20 (~25 dias); os hits eram históricos. Sem inferir estado atual a partir deles | PARTIAL |

## A. Baseline honesto

| Item | Evidência executada | Veredicto |
|---|---|---|
| A1 — SHA congelado | `sha256sum tools/router/classify.js` → `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` | PASS |
| A2 — suites completas/targeted | Router: 982 total, 979 pass, 2 fail, 1 skip. Extensão: 1394 total, 1393 pass, 0 fail, 1 skip. Docs hygiene: 6/6. Ledger decision: 7/7 | PARTIAL |
| A3 — “your llm router” vivo | Há hits normativos vivos, incluindo `.claude/skills/moo-help/SKILL.md:12`, `MEMORY.md:179`, `docs/foundation/SYSTEM_DESIGN.md:17`, `docs/MOOTER_OPERATIONS_GUIDE_v1.0.md:9` e `packages/cli/src/index.ts:74` | FAIL |
| A4 — tagline limitada aos 4 locais aceites | O grep retornou **17 ficheiros**, incluindo `SYSTEM_DESIGN.md`, operations guide, docs estratégicos/ADR/archives e CLI; a landing esperada nem aparece no inventário atual. A lista “só 4” está obsoleta | FAIL |

### A2 — detalhe da falha

As duas falhas da suite completa são de `gsd-statusline-latency`:

1. mediana observada de **1402 ms**, acima do budget de 600 ms (amostras: 1402, 1167, 1261, 2131, 1468 ms);
2. uma corrida individual excedeu o limite de 1500 ms/timeout.

Em isolamento, o mesmo ficheiro passou 15 vezes seguidas (ver C5). Portanto, a baseline agregada continua vermelha, mas a evidência aponta para contenção de processos sob paralelismo, não regressão lógica reproduzível em repouso.

## B. Tese v2 / régua nova (#248)

| Item | Evidência executada | Veredicto |
|---|---|---|
| B1 — ADR-0001 superseded | `docs/decisions/2026-06-07-mission-statement.md:3` contém exatamente o status exigido. O único outro hit de `ADR-0001` é `docs/decisions/2026-06-07-pricing-pending.md:26`, que o referencia historicamente, não como vigente | PASS |
| B2 — AGENTS/CLAUDE na tese nova | Ambos foram lidos integralmente. A régua ativa descreve motor=fosso, cabine=produto e Resume/Plan/Route/Watch/Review; “$0 first” sobrevive como princípio de execução, não como tese | PASS |
| B3 — roadmap | `docs/strategy/MOOTER_ROADMAP.md:3-16` aponta para North Star F0–F5 e explica expressamente a diferença entre tese e princípio “$0 primeiro” | PASS |
| B4 — SYSTEM_DESIGN preciso | 5+ afirmações confrontadas. Paths/hash/porta/componentes/MCP conferem, mas missão, T5 backend, timeout do hook e cron jobs divergem do código. Documento canónico está materialmente stale | FAIL |
| B5 — plugin alinhado à tese | `package.json:3-4,25-35,191-212`, `README.md:1-3,30,34` e walkthrough continuam router/custo/savings/read-only-first; não apresentam as 5 experiências. O inventário antigo de 8 testes está corrigido pela realidade: 91 ficheiros, 1394 testes | FAIL |

### B4 — confronto de afirmações do System Design

| Afirmação | Código/estado real | Veredicto |
|---|---|---|
| Classificador congelado no path/hash documentado (`SYSTEM_DESIGN.md:105-107`) | Path existe; hash A1 confere | PASS |
| Tracker em `127.0.0.1:7821` (`:120,146`) | `tools/router/savings-tracker.js:58-63` usa esse default | PASS |
| Sete módulos do router listados em `:147` | Todos existem | PASS |
| MCP expõe 20 tools (`:151`) | Contagem real de declarações `mooter_*` = 20 | PASS |
| Missão antiga em `:17-27` | Contradiz a tese v2 recém-mergeada | FAIL |
| T5/Fable sob “Anthropic API” em `:69,77` | `tools/router/classify.js:228-229,991` fixa backend `claude_subagent` | FAIL |
| Hook “~2 ms, 500 ms hard timeout” em `:124` | `tools/router/inject_context.js:651-655` aplica 1500 ms ao spawn do classificador | FAIL |
| Hub com 4 cron jobs em `:150` | `hub/wrangler.mooter.toml:21-24` tem triggers comentados e só 3 expressões cron, explicitamente adiadas | FAIL |

### B5 — verdade pública versus produto atual

`packages/vscode-extension/package.json:3-4` vende “Cost Cockpit” e “Read-only cockpit”; `README.md:30-34` diz “never touches your code”, “only reads”, “no network calls ... beyond localhost”. O produto atual escreve ficheiros (`extension.js:3050,3211,3331,3747,4673`), faz commit/push (`host-extra.js:1495,1651`; `extension.js:4237,4250`) e executa deploy Vercel (`extension.js:4443`). Não é só naming antigo: é uma promessa de segurança/capacidade factualmente falsa.

## C. Spine Fase A (#249)

| Item | Evidência executada | Veredicto |
|---|---|---|
| C1 — 3 nits P2 fechados | Os testes provam os três contratos: `error != null` (7/7), `expectedCwd` + `recent` (9/9), duplicados/deletion buckets (6/6). Porém o artefacto exigido `.planning/handoff-spine-v2/PHASE_A_GATE.md` **não existe no SHA mergeado** | FAIL |
| C2 — `composeHandoff()` preserva 5 campos | Fixture independente com `baseAhead=2`, `mixedSessions=true` e valores não triviais preservou `perfect`, `sessionGit`, `ledger`, `expectedCwd` e `recent`; asserts automatizados também existem | PASS |
| C3 — scripts pós-conflito | `agent-sync`, `agent-sync:simulate`, `test:agent-sync` e os quatro scripts Ledger foram executados individualmente e passaram | PASS |
| C4 — auto-merge de `host-extra.js` | Diff do merge contra o primeiro parent tem só 8 linhas (7+/1-), substituindo a lista fechada por `Object.assign({}, opts, ...)`; contra o feature parent não há diff no ficheiro. Nenhuma função adjacente foi removida | PASS |
| C5 — latência n≥15 | 15/15 processos passaram; 45/45 subtestes e 75 cold spawns, zero falhas | PASS |

### C3 — resultados individuais

| Script | Resultado |
|---|---:|
| `npm run agent-sync` | PASS; classificador intacto; projeção local, 0 eventos |
| `npm run agent-sync:simulate` | PASS; `SIMULATION=pass`, 4 agentes, 0 missing |
| `npm run test:agent-sync` | 10/10 |
| `npm run test:ledger-prov` | 5/5 |
| `npm run test:ledger-event` | 5/5 |
| `npm run test:ledger-decision` | 7/7 |
| `npm run test:ledger-reduce` | 6/6 |

## D. UX/UI do plugin VS Code

### D1 — heurísticas de Nielsen

| Heurística | Evidência objetiva | Veredicto |
|---|---|---|
| 1. Visibilidade do estado | Live Preview contém `role=status`/`aria-live`, erro `role=alert`, readiness, progress e estados de security em `extension.js:6087-6141,6877-6882` | PASS |
| 2. Correspondência com o mundo real | Ações críticas usam “Review”, “Publish”, OK/reverter e destino explícito, mas marketplace/copy descreve um produto router/read-only que já não existe | PARTIAL |
| 3. Controlo e liberdade | Cancelamento do agente (`:1737,2896,6141`), undo/revert por item e SHA-guard (`:3196-3250,5164-5215`) | PASS |
| 4. Consistência e padrões | O mesmo produto mistura inglês e PT (“Mission Control”, “Project command”, “Arquitectura”, “Review”, “Publish”) e mantém duas teses incompatíveis entre UI e marketplace | PARTIAL |
| 5. Prevenção de erros | Lease de origem, uma tarefa ativa, aprovação/revert, proteção de WIP pré-existente e gates de security/publish são fail-closed (`:1879,2350,3744,4833-4851`; `lp-publish-view.js:120,163-164`) | PASS |
| 6. Reconhecimento > memorização | Botões têm texto+ícone, `title`, `aria-label`, breadcrumbs, labels de tier e estados textuais; informação não depende só da cor | PASS |
| 7. Flexibilidade/eficiência | Atalho `Ctrl/Cmd+K Ctrl/Cmd+M`, presets $0, modos de prompt e comando para advanced views existem e estão registrados | PASS |
| 8. Design minimalista | Densidade visual real nas três superfícies exige inspeção/screenshot em temas e tamanhos reais; código estático não fornece critério suficiente | N/V |
| 9. Diagnóstico e recuperação | Razões de bloqueio são específicas e indicam ação; undo/revert é recusado em hash stale, sem escrita cega (`:3196-3208`; `lp-publish-view.js:163-164,239`) | PASS |
| 10. Ajuda/documentação | Há coach e walkthrough, mas o walkthrough continua restrito a engine/savings/tier mix e não ensina a cabine/5 experiências atual | PARTIAL |

**D1 global:** PARTIAL. Os mecanismos de controlo/feedback são fortes; consistência de linguagem, verdade pública e ajuda estão atrasadas.

### D2 — regressão COH-01…19

Spot-check de cinco áreas (origem/lease, geometria da toolbar, multi-root, roteamento/T5 e state reducer/reduced motion) executou cinco ficheiros e cobriu também contratos associados: **68/68 pass, 0 fail**. Não foi observada regressão nos COH-01, COH-02, COH-05, COH-09 e COH-14. **Veredicto: PASS.**

### D3 — WCAG estrutural

| Critério | Evidência | Veredicto |
|---|---|---|
| Tokens de tema/fallback | `lp-sidebar-view.js:58-82`; `extension.js:8476-8517` usam `--vscode-*`/`--vscode-charts-*` com fallback | PASS |
| Foco visível | `lp-sidebar-view.js:81-82`; `extension.js:8529` e regras equivalentes | PASS |
| Informação redundante | Estados/tier/actions usam texto, ícone e ARIA; ex. `:6087-6177,6877-6882` | PASS |
| Reduced motion | `extension.js:8514` desliga animation/transition/scroll-behavior | PASS |
| Contraste real nos 3 temas | Não há harness de contraste nem screenshot desta corrida; fallback hex isolado não prova contraste composto em runtime | N/V |

**D3 global:** PARTIAL; estrutura verde, contraste visual runtime não verificado.

### D4 — promessa versus prática

| Afirmação de UI/manifesto | Prova | Veredicto |
|---|---|---|
| `mooter.trackerPort` muda a porta | Lido em `extension.js:199`; default 7821 no manifesto | PASS |
| `mooter.statusBar.enabled` controla status bar | Lido em `extension.js:473`; default true | PASS |
| Comandos Open Cockpit/New Session/Refresh/Open Live Preview funcionam | Registrados em `extension.js:8434-8447` | PASS |
| “read-only / never touches your code” | Contradito pelos writes reais em `:3050,3211,3331,3747,4673` | FAIL |
| “no network calls ... beyond localhost” | Contradito pelo Agent SDK opcional e `vercel --prod` em `:4443` | FAIL |

**D4 global:** FAIL; 3 promessas operacionais conferem, 2 promessas centrais de segurança/capacidade não.

## E. Metodologia — promessa versus execução

| Item | Evidência executada | Veredicto |
|---|---|---|
| E1 — fluxo operacional e artefactos | AGENTS/CLAUDE descrevem gate/SYNC/Ledger. O gate `.planning/handoff-spine-v2/PHASE_A_GATE.md` não foi mergeado. `SYNC.md:6-8` ainda aponta para 2026-07-13, main `89ff3e3`, PR #246 e extensão 0.16.67/0.16.72, enquanto o alvo é #249/`71340b2`/0.16.78 | FAIL |
| E2 — orçamento do SYNC | `wc -l SYNC.md` → 99, abaixo de ~200 | PASS |
| E3 — Ledger como única verdade / gates P1 | `PERFECT_HANDOFF_SPEC.md:23-31` mantém 5/5 P1 abertos. `writeHandoffToSync()` escreve diretamente `SYNC.md` (`host-extra.js:2984-3009`); `agent-sync-ledger.js:277-290,525-544` grava eventos/projeções sem tornar `ledger-reduce` o único writer | FAIL |

Os cinco P1 ainda abertos são: buffer de contexto compartilhado com eventos; ausência de single-writer/lock transacional; writers que contornam reducer; `wave ship --force` capaz de contornar gates/SHA; conductor que avisa sem bloquear git concorrente.

## F. Ratchet “no-frugal”

| Evidência | Resultado |
|---|---|
| Lógica | `.github/workflows/no-frugal.yml:13-21` conta ficheiros no checkout do PR e só falha se `COUNT > BASELINE`; uma redução apenas emite notice |
| Baseline versionada | `docs/rebrand/frugal-baseline.txt` = 176 |
| Contagem limpa dos ficheiros rastreados no SHA | 175 |
| Cenário adversarial | Um PR pode adicionar 1 novo ficheiro com “frugal”: 175 → 176, ainda `COUNT == BASELINE`, logo passa |

**Veredicto: FAIL.** O mecanismo não é um ratchet estrito contra o base ref; existe margem de uma regressão. Além disso, `grep -rli` sobre o working tree pode contar artefactos ignorados gerados antes do step, tornando o resultado dependente do ambiente.

## G. Varredura aberta de oportunidades e riscos

### G1 — estado real da keep-list F5

| PR | Estado GitHub em 2026-07-15 | Draft? | Resultado |
|---|---|---:|---|
| #233 — quota | OPEN | sim | continua na keep-list |
| #229 — eval | OPEN | não | continua na keep-list |
| #225 — moo-loop | OPEN | não | continua na keep-list |
| #244 — MEO | OPEN | não | continua na keep-list |

Nenhuma das quatro foi mergeada/fechada. A verificação de rede foi concluída. **Veredicto G1: PASS.**

### G2 — Arbiter Haiku OFF no build do amigo

Não há flag/config específica de friend-build. `inject_context.js:811-826` chama o Arbiter quando a decisão é ambígua e o kill-switch amplo `FRUGAL_V07_DISABLE` não está ativo. `arbiter.js:274-280` desliga implicitamente apenas quando `ANTHROPIC_API_KEY` não existe. Logo, uma chave herdada no ambiente reativa Haiku; o kill-switch disponível desliga mais do que o Arbiter.

**Veredicto G2: FAIL.** A decisão “Arbiter OFF no build do amigo” ainda é intenção operacional, não enforcement técnico.

### G3 — MED-1 / #239

#239 está **OPEN/DRAFT**, com dois ficheiros e um único commit. Liga o adaptive learner atrás de `use_learned`, default `false`; o próprio PR declara que nenhum caller ativa a opção, portanto o feature continua dark. Dois checks do ratchet estão vermelhos; os restantes checks/audits e Vercel estavam verdes na consulta.

O passo barato e honesto é rebasear e manter o default off, acrescentando um A/B shadow: para cada decisão real, registar candidate baseline versus learned candidate e associar outcome real sem alterar routing. Isso fecha instrumentação/wiring, mas **não** prova “learns forever”; a prova continua dependente de dados pareados e outcomes reais.

**Veredicto G3: PARTIAL.** Há ação barata para gerar evidência; a claim MED-1 continua não provada.

### G4 — achados adicionais

1. **Documentação canónica temporalmente incoerente:** `SYSTEM_DESIGN.md`, `SYNC.md`, README/marketplace e walkthrough ficaram para trás dos dois merges.
2. **Suite agregada sensível à contenção:** o gate de latência passa isolado e falha no full suite; isso cria falso vermelho/falso diagnóstico conforme carga da máquina.
3. **Tooling de extensão sem Extension Host CI:** 91 ficheiros de `node:test` cobrem lógica/HTML, mas não existe runner `@vscode/test-cli`/`@vscode/test-electron`; a prova instalada desta auditoria não está automatizada.
4. **Install não determinístico do conductor:** `npm install` gerou `packages/worktree-conductor/package-lock.json` não rastreado.
5. **Dois imports opcionais só funcionam por fallback duplicado no VSIX:** `guardian-chip.js:19` e `guardian-prebake.js:73` tentam `../../../tools/router/compaction-advisor.js`, ausente no pacote. O `try/catch` é intencional e a ativação passou, mas há duas cópias de thresholds que podem divergir.

**Veredicto G4: PARTIAL.** Não houve dano colateral funcional óbvio do rebase; foram encontrados riscos concretos de SSOT, CI/tooling e drift.

## H. Setup completo do plugin VS Code

| Item | Evidência executada | Veredicto |
|---|---|---|
| H1 — install limpo | `node_modules` não existia na worktree. `npm install` na extensão: 4 packages, 5 auditadas, 0 vulnerabilidades, 1,82 s | PASS |
| H2 — build de produção | O package não tem build/watch nem bundle: `main` é `./src/extension.js` e o único script é `node --test src/*.test.js` (`package.json:59-61`). O artefacto de produção é o source empacotado pelo VSIX, não um build intermediário | N/V |
| H3 — contrato de empacotamento | `@vscode/vsce ls` listou parser, 48 módulos source, runners e assets. 58 imports relativos estáticos: 56 presentes, 2 opcionais fail-soft documentados. `live-edit-packaging.test.js`: 9/9 | PASS |
| H4 — VSIX instalado/ativado | VSIX 1.099.009 bytes, 83 ficheiros; instalado num `--user-data-dir` e `--extensions-dir` isolados. `code --list-extensions` → `mooter.mooter-cockpit@0.16.78`. Log mostra load de `src/extension.js` e ativação `onStartupFinished`, sem erro | PASS |
| H5 — testes/runner | 91 ficheiros; `node:test`; suite 1393 pass, 0 fail, 1 skip. Não usa `@vscode/test-cli` nem `@vscode/test-electron`, portanto não há teste automatizado dentro do Extension Host | PARTIAL |
| H6 — F5 Extension Development Host | `.vscode/launch.json` só contém debug do classifier/backtest/tracker/tests; não há `type: extensionHost` nem `--extensionDevelopmentPath`. Não existe launch local no package | FAIL |
| H7 — zero mudança de fonte | `git diff --exit-code` e inventário de tracked changes: zero. `git status` contém apenas artefactos untracked da auditoria/install (`.audit-vscode-*`, extração VSIX, VSIX ignorado, lockfile gerado e um ficheiro diagnóstico vazio `nul`) | PASS |

### H3 — conteúdo crítico do VSIX

Presentes no pacote real:

```text
extension/src/extension.js
extension/src/live-edit-sdk-runner.mjs
extension/src/live-edit-task-runner.mjs
extension/assets/skills/a11y.md
extension/assets/live-edit/lucide-icons.llms.txt
extension/node_modules/@babel/parser/lib/index.js
```

`@vscode/vsce` não está declarado no `package.json`/lockfile do plugin; foi obtido ad hoc por `npx --yes @vscode/vsce`. Isso não afeta runtime, mas reduz reprodutibilidade de packaging.

## Top-5 recomendações priorizadas

| # | Recomendação (impacto ÷ esforço) | Local exato | Bloqueia Fase B Ledger? |
|---:|---|---|---|
| 1 | Fechar os 5 P1 antes de chamar o Spine durável: single writer transacional, reducer como única projeção, lock que bloqueia/enfileira, ship sem bypass e separação buffer/ledger | `docs/strategy/PERFECT_HANDOFF_SPEC.md:23-31`; `host-extra.js::writeHandoffToSync`; `agent-sync-ledger.js::appendEvent/writeSnapshot`; `ledger-reduce.js` | **SIM** |
| 2 | Restaurar/produzir o gate versionado e atualizar a snapshot operacional no mesmo PR; o aceite de #249 não pode depender de ficheiro ausente nem de `SYNC.md` anterior a #248/#249 | `.planning/handoff-spine-v2/PHASE_A_GATE.md`; `SYNC.md:6-38,82-90` | **SIM** |
| 3 | Corrigir imediatamente a promessa pública do plugin para capacidades reais, trust/network/edição/commit/publish; alinhar com as 5 experiências | `packages/vscode-extension/package.json:3-4,191-212`; `README.md:1-34`; `walkthrough/*.md` | Não; bloqueia release honesto |
| 4 | Tornar o ratchet estrito ao base ref: comparar PR head com merge-base/base checkout ou exigir `COUNT == baseline` e atualizar baseline na mesma PR quando cair | `.github/workflows/no-frugal.yml:13-21`; `docs/rebrand/frugal-baseline.txt` | Não |
| 5 | Criar kill-switch específico, default-off e testado para Arbiter no friend-build; não depender da ausência acidental de uma API key nem do kill-switch v0.7 amplo | `tools/router/inject_context.js:801-826`; `tools/router/arbiter.js:274-280` | Não; bloqueia F0.5 honesto |

## Apêndice — outputs brutos e contagens

### Ambiente e SHA

```text
node --version
v24.14.0

npm --version
11.9.0

git rev-parse HEAD
71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7

git log --oneline origin/main -20
71340b2 Merge pull request #249 ...
9f263c6 Merge pull request #248 ...
```

### Instalações limpas

```text
root npm install:
added 102 packages, audited 103 packages, 0 vulnerabilities
elapsed 6.15 s

packages/vscode-extension npm install:
added 4 packages, audited 5 packages, 0 vulnerabilities
elapsed 1.82 s

packages/worktree-conductor npm install:
added 5 packages, audited 6 packages, 0 vulnerabilities
elapsed 2.60 s
```

### Suites

```text
tools/router npm test
tests 982
pass 979
fail 2
skipped 1
duration_ms ~24500
exit 1

packages/vscode-extension npm test
tests 1394
pass 1393
fail 0
skipped 1
duration_ms 65650
exit 0

node --test tools/docs-hygiene.test.js
tests 6
pass 6
fail 0

node --test tools/router/ledger-decision.test.js
tests 7
pass 7
fail 0

node --test packages/vscode-extension/src/handoff-accumulator.test.js
tests 9
pass 9
fail 0

node --test packages/vscode-extension/src/live-edit-packaging.test.js
tests 9
pass 9
fail 0
```

### C2 — fixture independente

```json
{
  "snapshot": { "baseAhead": 2, "mixedSessions": true },
  "checks": {
    "perfect": true,
    "sessionGit": true,
    "ledger": true,
    "expectedCwd": true,
    "recent": true
  }
}
```

### C5 — latência

```text
gsd-statusline-latency.test.js
runs: 15
passing runs: 15
subtests: 45/45
cold spawns: 75
failures: 0
```

### F — ratchet

```text
tracked live-code files containing "frugal": 175
docs/rebrand/frugal-baseline.txt: 176
workflow condition: fail only when COUNT > BASELINE
available regression margin: 1 file
```

### H — packaging/install/cold-start

```text
npx --yes @vscode/vsce package --out mooter-cockpit-0.16.78-audit.vsix
DONE Packaged: mooter-cockpit-0.16.78-audit.vsix
83 files, 1.05 MB
size=1099009
mtime=2026-07-15 23:54:19 -0300

code --list-extensions --show-versions [isolated dirs]
mooter.mooter-cockpit@0.16.78

exthost.log
2026-07-15 23:55:52.661 [info] ExtensionService#_doActivateExtension mooter.mooter-cockpit, startup: false, activationEvent: 'onStartupFinished'
2026-07-15 23:55:52.661 [trace] ExtensionService#loadModule [cjs] -> .../mooter.mooter-cockpit-0.16.78/src/extension.js
2026-07-15 23:55:52.712 [trace] ExtensionService#_callActivateOptional mooter.mooter-cockpit

activation errors matching error|failed|cannot find module|uncaught|crash:
(none)
```

### Estado read-only antes do descarte

```text
tracked source modifications: 0
tracked deletions: 0
untracked: only npm/install/package/extract/isolated-profile diagnostics
classify.js sha256: 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
```

## Fecho

Relatório escrito no checkout principal como único entregável persistente. `git worktree remove C:\tmp\frugal-postmerge-audit --force` removeu o registo e todos os artefactos, exceto o ficheiro diagnóstico vazio `nul` (nome reservado no Windows); ele foi removido pela camada WSL e o diretório descartável foi eliminado. A worktree já não consta de `git worktree list`.
