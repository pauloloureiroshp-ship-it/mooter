---
type: HANDOFF
handoff_schema: 1.1
id: e2e-integracao-codex-20260720
from: codex
to: cowork
status: blocked
state: awaiting-you
severity: high
generated_at: 2026-07-20T12:37:12Z
socio_pack: v1@manual
worktree: ../frugal-e2e (efemera, removida)
branch: detached origin/main
base: d108a40066a89aba434e969e41937587edf491ef
head: n/d (a arvore candidata total nao existe)
uncommitted: 1 (este relatorio; 1643 entradas pre-existentes preservadas)
tests: baseline executado; candidato total n/d por conflito
decisions_pending: ["Paulo escolhe quando reconciliar branches; nova auditoria depois de tips fixos e conflitos resolvidos."]
ledger_ref: n/d (guard autorizou somente este relatorio)
---

# ⇄ CODEX → COWORK · HANDOFF — E2E-INTEGRAÇÃO

## SEVERITY / TL;DR

**HIGH · NO-SHIP.** Os seis objetos pedidos existem e conservam o SHA frozen, mas o conjunto não mergeia na ordem pedida: `receipts` e `vs-w1` entraram limpos; `mesh` conflitou em `tools/router/package.json`. Há **6 pares conflitantes / 4 ficheiros**, além de três desconexões semânticas E2E. Não existiu árvore candidata para suite integral; regressão pós-merge = **n/d**, nunca “zero”. Revisão independente: **NO-SHIP — 6 HIGH, 2 MED, 1 LOW, 0 NIT**.

## SNAPSHOT / TIPS

Base após `git fetch origin --prune`: `origin/main@d108a40`.

| branch | objeto auditado | origin no snapshot |
|---|---|---|
| ledger-receipts | `9ff1735139b982e490fe41efcd9dfd3dd03bd695` | `a2ff16b` (local +1) |
| vs-w1-semaforo | `5599b55ed33e2552b1746effa8ac3ed2dfde9ed9` | `1603652` (local +2) |
| mesh-phase-a | `7d408f5c48de6681e4a84513a002c4c45cdd65ea` | igual |
| fleet-landing | `d454b1df08a21ce0a9d0d5f5aabd1c5015bb7d7a` | igual (#257) |
| fleet-metrics | `5ddbb1646933eb096e1071cdcadd29a95b38d0da` | **ref remota ausente** |
| moo-dispatch | `41b3ae26615665367a513cc0a6fa1138daf39650` | igual; tip nasce 190 commits atrás de main |

Todos são commits no object DB; `classify.js` nos seis = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Durante a corrida, outro agente moveu a branch local `vs-w1` de `5599b55` para `b01f73f` (commit E2E/demo, 6 ficheiros novos); este relatório audita **o SHA solicitado**, não o novo tip. Logo o estado corrente exige nova simulação.

## MERGE-SIM TOTAL

Worktree detached `../frugal-e2e@d108a40`; sequência exata `receipts → vs-w1 → mesh → landing → metrics → dispatch`, sempre com `git merge --no-commit --no-ff`:

1. receipts: limpo; merge temporário efémero `af3c7a5`.
2. vs-w1: limpo; merge temporário efémero `6835929`.
3. mesh: **CONFLICT** em `tools/router/package.json` (receipts e mesh alteram o mesmo script monolítico `test`).
4. landing/metrics/dispatch: **n/d no conjunto**, porque corrigir conflito era proibido.

O conflito foi abortado; os commits temporários detached tornaram-se inalcançáveis ao remover a worktree. Simulações par-a-par abaixo foram isoladas por abort/reset e nenhum conflito foi resolvido.

## MATRIZ DE COLISÃO — 15/15

`—` = nenhum path partilhado; `C` = conflito textual reproduzido.

| A | B | path(s) partilhado(s) / resultado |
|---|---|---|
| receipts | vs-w1 | — (afirmação do brain aceita; não reexecutada) |
| receipts | mesh | `tools/router/package.json` **C** |
| receipts | metrics | `tools/router/package.json` **C** |
| receipts | dispatch | — |
| receipts | landing | — |
| vs-w1 | mesh | — |
| vs-w1 | metrics | — |
| vs-w1 | dispatch | `packages/vscode-extension/src/extension.js` **C**; dispatch também conflita sozinho com main em `src/webview-syntax.test.js` |
| vs-w1 | landing | — |
| mesh | metrics | `_handoff/fleet/fleet-orchestrator.mjs`, `tools/router/package.json` — ambos **C** |
| mesh | dispatch | — |
| mesh | landing | `_handoff/fleet/fleet-orchestrator.mjs` **C** |
| metrics | dispatch | — |
| metrics | landing | `_handoff/fleet/fleet-orchestrator.mjs` **C** |
| dispatch | landing | — |

Nenhuma permutação elimina conflitos de mesmo hunk. Os quatro ficheiros que exigem reconciliação são `tools/router/package.json`, `_handoff/fleet/fleet-orchestrator.mjs`, `packages/vscode-extension/src/extension.js` e `packages/vscode-extension/src/webview-syntax.test.js`.

## GATE / REDS DELIMITADOS

| gate em `origin/main` | baseline real | candidato total | delta |
|---|---:|---:|---:|
| router typecheck | 107 erros / 17 ficheiros; `tier-mix` é só um deles | n/d | n/d |
| router `npm test` | 979 pass / 2 fail / 1 skip; os 2 são `gsd-statusline`; isolado 3/3 pass | n/d | n/d |
| CLI `npm test` | 494 pass markers / 33 failures / 1 skip; runner sem resumo final | n/d | n/d |
| VS Code extension | 482 pass markers / 0 fail / 1 skip; runner sem resumo final | n/d | n/d |

Portanto não há base para dizer “zero RED novo”: o novo RED provado é o próprio bloqueio de integração; testes do candidato inexistente ficam `n/d`.

## ACHADOS E2E ALÉM DO MERGE

1. **Fleet attribution não chega ao escritor real.** Metrics passa `attribution` ao pilar (`5ddbb16:_handoff/fleet/fleet-orchestrator.mjs:191,257-261`), mas landing aceita só `{now}` e grava ledger sem wave/session/tok/s (`d454b1d:_handoff/fleet/local-pillar.mjs:265,363-376`). O teste mascara o gap com produtor fake (`5ddbb16:_handoff/fleet/fleet-orchestrator-metrics.test.mjs:27-33`).
2. **Semáforo e dispatch usam buses incompatíveis.** VS-W1 lê `agent-sync/dispatch-queue.json` (`5599b55:packages/vscode-extension/src/semaforo-decorations.js:241-260`); dispatch lê `_handoff/dispatch/*.md` e escreve `dispatch/dispatch.jsonl` (`41b3ae2:packages/vscode-extension/src/extension.js:507-541,795-807`), cuja row não tem destination/session/wave (`src/dispatch.js:260-272`).
3. **Cockpit continua `fleet:null`.** `5599b55:packages/vscode-extension/src/semaforo-decorations.js:122-154`; nenhuma das seis branches liga `fleet-contrib` à strip.
4. **Métrica fabricada bloqueia honest-copy.** Landing chama tokens locais de “cloud tokens avoided” (`d454b1d:_handoff/fleet/local-pillar.mjs:129-135,343-368`) e o Cronista soma/publica o contador (`cronista-pillar.mjs:62-64,130-145`) sem pricing/counterfactual demonstrado.

## ORDEM RECOMENDADA (RECONCILIAÇÃO, NÃO MERGE CEGO)

`receipts → fleet-landing → mesh → fleet-metrics → vs-w1 → moo-dispatch`.

- receipts e landing entram disjuntos.
- mesh resolve `package.json` + orchestrator contra os dois anteriores.
- metrics resolve os mesmos dois ficheiros e liga attribution ao produtor real.
- vs-w1 entra depois e deve consumir a projeção fleet.
- dispatch por último resolve `extension.js` + seu conflito de base em `webview-syntax.test.js` e unifica o bus com `agent-sync`.

Essa ordem organiza o trabalho; **não evita resolução manual**. Repetir merge-sim total e suites com SHAs novos/fixos é gate obrigatório antes de qualquer merge real.

## ZERO-RESÍDUO / PROVENANCE

- `git merge --abort` no conflito: sucesso; chamada final devolveu “no merge to abort”, confirmando `MERGE_HEAD` ausente.
- `git worktree remove C:\Users\Paulo Loureiro\frugal-e2e`: sucesso; path e registo ausentes.
- Principal: `chore/mooter-20-h0@27e4298` inalterada. Fingerprint de status excluindo este relatório: antes/depois `9d46169588e30cc6ea9ed7f5e97526cf7d06ba302313c5f7de0d215883967f03`.
- A lista global mudou somente porque `frugal-vs-w1` avançou concorrentemente para `b01f73f`; não é resíduo E2E. Única escrita própria: este ficheiro; sem commit/push/merge/deploy.

## PRE-DISPATCH RED-TEAM / PENDING

| chave | resposta |
|---|---|
| fonte de verdade | Git object DB/refs + outputs das suites; este relatório é projeção |
| escritor único | escritores existentes; auditor escreveu somente este HANDOFF |
| reversível vs irreversível | simulação abortada/removida; merge/push continuam gate do Paulo |
| script-first | merge e testes reais, não julgamento narrativo |
| projeção vs 2ª verdade | cockpit/relatório projetam ledgers; bus paralelo do dispatch é achado |
| degradação graciosa | árvore/tip/métrica não provados = `n/d` |
| frozen/allowlist/n-d | SHA 6/6; produção intocada; candidato = `n/d` |
| custo de reverter | já pago na efémera; mega-merge seria alto, reconciliação por branch menor |

Objeção mais forte: mesmo um merge textual verde ainda deixaria attribution, dispatch→Semáforo e fleet→strip desconectados. **Não refutada.** PENDING: reconciliar HIGHs; publicar tips exatos; rerodar matriz + suite candidata; `moo-handoff-check` neste relatório; Paulo autoriza cada operação irreversível. O final-reviewer independente usou o modelo herdado porque Opus não estava disponível.

DO-NOT sobrevivente: não fazer merge/push/fix; não chamar baseline RED de regressão; não tratar `b01f73f` como auditado; não publicar tokens locais como cloud evitado.

🤝 SOCIO: receita? n/d · despesa↓? S ($0) · risco↓? S · reversível? S · escopo? S

🔍 council-mini: 8/8 chaves respondidas · objeção real não resolvida · CCA n/d

⇄ END
