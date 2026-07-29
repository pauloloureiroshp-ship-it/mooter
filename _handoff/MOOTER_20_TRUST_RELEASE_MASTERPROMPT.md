# ⇄ COWORK → CC · MOOTER 2.0 "TRUST RELEASE" — preparação (roda em paralelo ao Codex, SEM colisão)

> Cowork · 2026-07-16 · Origem: 7 dores do Paulo + advogado do diabo + mercado verificado hoje.
> Casa: `_handoff/` → arquivar quando shipar. CCA-F footer obrigatório em todo handoff deste ciclo.

🎯 GOAL   Preparar o Mooter 2.0 como TRUST RELEASE: a versão onde tudo que o produto diz é provado, o
          Cockpit é limpo e alinhado à tese v2, e o gate de lançamento é HUMANO EXTERNO (5 amigos
          instalam sozinhos em <10min e voltam no dia 2) — não um número de versão.
📍 WHERE  H0 = árvore principal, nativo. H1/H2 = read-only (qualquer lugar). H3 = worktree
          `../frugal-site-20` GATED. H4 = documento. NUNCA tocar worktrees/allowlists do Codex
          (F1/F2/F3, lingua-franca): `tools/router/{agent-sync-ledger,ledger-reduce,sync-hooks,
          arbiter,inject_context}.js` · `host-extra.js` · `no-frugal.yml` · package.json/README/
          walkthrough do plugin · SYNC.md · packages/{cli,synthesis,worktree-conductor}.
🔒 GUARD  classify.js FROZEN (sha `427d8c0b…`) · git add seletivo · push/merge/tag = gate Paulo ·
          honest-copy absoluta · ♻️ REUSE gate respondido por peça · ⛔ STOP em cada fase.
✅ GATE   por fase abaixo. Gate final do 2.0 (H4) NÃO é deste masterprompt — é o teste do amigo.
📋 BACK   handoff tipado por fase (STATE/WORKTREE/GATE/WORK/PENDING + rodapé `CCA: n/5`).

---

## H0 — Housekeeping nativo (P0-3 da fila · ÚNICO que escreve na árvore principal)
1. Aplicar `_handoff/MEMORY_LOOP_DRAFT_2026-07-16.md` em MEMORY.md e LOOP.md; apagar o draft.
2. `git add` do brief `_handoff/agent-sync/briefs/cd89b89c606a7a20-cowork.md`.
3. Arquivar masterprompts executados/superseded do topo de `_handoff/` → `_handoff/_archive/2026-07/`
   (lista conservadora: só o que está comprovadamente shipped/superseded; na dúvida, deixa).
4. **Quarentena do flaky:** `gsd-statusline-latency.test.js` sai do `npm test` default → script
   próprio `test:latency` + job CI separado não-bloqueante com mediana de N runs (política: falha só
   se mediana estourar). ⚠️ NÃO tocar nos ficheiros da allowlist F1 — se o patch exigir, PARA e reporta.
5. **Version sprawl:** landing exibe versão derivada de `version.json` (nunca hardcoded) + política de
   tags documentada em 1 parágrafo no INFRA.md.
⛔ STOP: diff completo antes do commit. 1 commit. Sem push até OK.

## H1 — Cockpit De-clutter — executar a DECISÃO de 13/07 que ninguém executou (read-only)
Contexto medido: manifest enxuto (5 comandos, 1 view, 2 configs) — a poluição é DENTRO do webview
(extension.js ~332KB, 5 superfícies: Cockpit/Mission Control/Project Command/Architecture/MEO;
Architecture redundante; controles mortos; densidade N/V na auditoria D1-h8).
1. Inventariar CADA elemento visível das 5 superfícies (screenshot + lista) e classificar:
   **KEEP** (serve 1 das 5 experiências: Resume·Plan·Route·Watch·Review — dizer qual) ·
   **MERGE** (duplica outra superfície) · **CUT** (não muda decisão do usuário — regra anti-vanity) ·
   **NATIVE** (a Agents window do VS Code já faz de graça — não competir com a plataforma).
2. Meta declarada da decisão god-mode: **~60% de corte**. Se o inventário disser outra coisa, refuta
   com evidência — não força o número.
3. Propor o layout-alvo: 1 superfície por experiência, Mission Control absorve Architecture,
   Moo Mission Control (blueprint §1.9) como aba futura — wireframe textual basta.
♻️ REUSE: vscode-elements (webview-ui-toolkit foi sunset) · Agents window nativa como host.
⛔ STOP: cut-list completa com evidência → decisão do Paulo elemento a elemento. ZERO código nesta fase.

## H2 — Live Preview TRUST HARNESS (read-only → spec)
A desconfiança do Paulo não se resolve com opinião — vira gate mecânico:
1. Ler os audits existentes (`LP_CODEX_AUDIT_REPORT.md`, `LP_COHERENCE_AUDIT_REPORT.md`, COH-01..19)
   e extrair o conjunto mínimo de provas E2E que, verdes, justificam confiança: lease de origem ·
   SHA-guard undo/revert · security-review fail-closed · publish só com aceite · zero write fora do
   preview path.
2. Especificar o harness repetível (roda local + CI) + o RECIBO na UI: chip "LP: último E2E verde
   <data> · N/N provas" — confiança visível, não lembrada.
3. ♻️ REUSE: os 68/68 testes COH já existentes são a base — o harness orquestra, não reescreve.
⛔ STOP: spec do harness → aprovação → só então vira wave de implementação (pós-F1).

## H3 — SITE 2.0 (⚠️ GATED: só depois da F2 MERGEADA em origin/main)
Executar `_handoff/SITE_REFRESH_BRIEF.md` na íntegra (voz = copy F2; tese v2; custo afundado;
blueprint como "where we're going" separado; métricas datadas; install cronometrado de verdade).
Adicional 2.0: seção de onboarding do site e walkthrough do plugin nascem do MESMO conteúdo
(setup-state/Radar como fonte única — o site mostra o que o Radar verifica).
⛔ STOP: copy exata lado a lado (antiga → nova) antes de qualquer commit.

## H4 — RC 2.0: o checklist de lançamento (documento, não código)
Compor `_handoff/MOOTER_20_RELEASE_GATE.md`:
| Gate | Prova exigida |
|---|---|
| Estado durável | F1 gates 1–5 merged + reauditoria F7 sem FAIL novo |
| Uma voz | F2 merged + site H3 no ar + F4 docs/tagline + roadmap unificado (1 taxonomia) |
| Protocolo vivo | Lingua Franca merged + 2 ciclos reais de handoff com `CCA: 5/5` |
| GPU visível | Mesh fase A rodando + effort dial + 1 semana de recibos reais |
| Cockpit limpo | cut-list H1 implementada + Radar MVP no plugin |
| LP confiável | harness H2 verde no CI + recibo na UI |
| **Gate humano (o único que importa)** | **5 amigos: install sozinho <10min · D2 retention · 1 recibo de valor citado por eles** |
Versão: `v2.0.0` = tag DEPOIS do gate humano, nunca antes. Changelog honesto (o que mudou de verdade).
⛔ STOP: Paulo aprova o gate doc — ele vira a definição oficial de "2.0 pronto".

## O que NUNCA fazer neste ciclo
❌ Tocar worktrees/allowlists do Codex · ❌ implementar cortes do H1 sem o STOP · ❌ publicar site antes
da F2 merged · ❌ tag 2.0 antes do gate humano · ❌ prometer mesh/dial/auto-setup como shipped ·
❌ "melhor e mais barato que todos" em qualquer copy (posicionamento = custo afundado, não guerra de preço).
