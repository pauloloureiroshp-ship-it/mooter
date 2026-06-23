# DECISIONS — digest do irreversível (não-bloqueante)

> Banda **DIGEST** da `STANDING_POLICY.md`. Cada item aqui **espera pelo Paulo**
> mas **NÃO bloqueia o loop** — o loop segue a melhorar outras waves entretanto.
> O Paulo lê isto quando volta e dá (ou não) o OK. O reversível **não** aparece
> aqui — esse é decidido pela rubrica e executado em AUTO.

Formato por item: data · wave · tipo · o que precisa · estado (`pendente`/`aprovado`/`recusado`).

---

## 2026-06-22 — W2 (Council length-neutral + ACT recalibration)

**AUTO (já decidido pela rubrica — informativo, não precisa de ti):**
Reverter a winner-selection *length-neutral* no council. Regressão provada
seeded (seed=42): verificável council **75.0% < barra 84.4%** (Δ −6.3pp);
A/B controlado mostra OLD 9/11 → NEW 7/11 (regrediu r04/r07, melhorou 0).
Mecanismo: neste council **comprimento ∝ capacidade do modelo**, logo "preferir
a mais curta" favorece o modelo fraco. CHANGE ≠ IMPROVEMENT → reverte; o
resultado negativo **é** o produto. ACT recalib: manter só se neutra/positiva no
eval seeded; caso contrário reverter também. (Ver `HUMAN_OK`.)

**DIGEST (pendente — espera o teu OK, não bloqueia):**
- `tipo: push + PR` · push da branch `wave-council-w2` + abrir PR. **Estado: pendente.**
  Nada mergeado/pushed para `main`. `classify.js` sha intacta. O loop pode avançar
  para a próxima wave da `QUEUE` (WN1) sem isto.

## 2026-06-23 — WF (Mooter Autopilot Fleet F1) — DONE, push/PR pendente

**AUTO (já decidido pela rubrica — informativo):**
WF F1 verificada e marcada DONE na QUEUE. Artefactos confirmados em disco:
`fleet.json` (12 pilares), `fleet-orchestrator.mjs` (SPOQ scheduler + GPU/cloud caps),
12 charters, 12 bus dirs, smoke DRY_RUN green (council/seguranca rounds 4-6 ok=true,
GPU-heavy alternado — nunca concorrente). `classify.js` sha `427d8c0b…364bc48f` INTACTA.
Notion subpage + vault alimentados pelo worker. Loop avança para **WN1** (P3: eval
honesto pipeline nicho — brief `_handoff/fleet/WN1_NICHE_EVAL_BRIEF.md`).

**DIGEST (pendente — espera o teu OK, NÃO bloqueia):**
- `tipo: push + PR` · `git push fleet-f1` + abrir PR (NUNCA merge/main). **Estado: pendente.**
  **Recomendação:** OK para push da branch `fleet-f1` + PR de review — é aditivo
  (packages/* frozen, só ficheiros novos em `_handoff/fleet/`), sha intacta, e dá-te
  diff revisível. Não mergear para main sem o teu sign-off. O loop já seguiu p/ WN1.

## 2026-06-23 — WN1 (Eval honesto pipeline nicho) — DONE, push/PR pendente

**AUTO (já decidido pela rubrica — informativo, não precisa de ti):**
WN1 R2 verificada read-only e marcada DONE na QUEUE. T1 additive override
(`packages/mooter-bench/src/niche-t1-override.ts`, ficheiro novo) subiu o pipeline
de 67.9% → 80.4% (+12.5pp) no sealed OOD holdout (56 prompts): 7 fires, 7 lifts,
0 flips → CHANGE=IMPROVEMENT → KEEP. Latência re-medida in-process p50=0.00ms
(o MISS 75.4pm da R1 era artefacto de subprocess, não do `classify.js`). nh-008 FP
documentado. 62/62 tests verdes. `classify.js` sha `427d8c0b…364bc48f` INTACTA
(gravada dentro de `NICHE_RESULTS_R2.json`). Notion 3886f6e4 + vault alimentados
pelo worker. Loop avança para **WFV** (Cockpit Fleet view; depende do F1=done).

**DIGEST (pendente — espera o teu OK, NÃO bloqueia):**
- `tipo: push + PR` · `git push` da branch WN1 + abrir PR (NUNCA merge/main).
  **Estado: pendente. Recomendação:** OK para push da branch + PR de review — é
  100% aditivo (engine `packages/*` frozen intacto, só ficheiros novos em
  `packages/mooter-bench/src/`), sha intacta, dá-te diff revisível. Não mergear
  para main sem o teu sign-off. O loop já seguiu p/ WFV.

## 2026-06-23 — W5 (Council length-neutral REVERT) — DONE, push/PR + branch-fix pendentes

**AUTO (já decidido pela rubrica — informativo, não precisa de ti):**
W5 verificada read-only e marcada **DONE** na QUEUE. Veredicto **NEUTRAL e honesto**,
robusto entre dois métodos independentes:
- **A/B 43/43** (`quality-eval-ab-results.json`): verifiable n=32 → LN ajudou 2 / prejudicou 4,
  McNemar **p=0.6875**, Δ=**−6.3pp** (NÃO significativo); open n=11 → direcção oposta (p=0.7266);
  combined 7-7 **p=1.0**.
- **One-pass paired** (`quality-eval-paired-results.json`) — construído para **cancelar o decode
  noise** (single-A idêntico, mesma seed) que viciava o A/B: confirmou **NEUTRAL** + recert
  **REVERT_FAILS_BAR** (0.688 < 0.844) + ACT recalib (arm_off act_precision 0.591).
- A barra 84.4% é **inválida** (unseeded/temp0.2 vs seeded/temp0 — comparação inter-temperatura).
- `CHANGE ≠ IMPROVEMENT` confirmado → o revert mantém-se como decisão precaucionária; **o finding
  neutral/negativo É o produto** e já está registado: `SYNC.md` (L7-15) + ledger
  `~/.mooter/council-ledger.jsonl` (entrada W5) + Notion `3886f6e42bc4818f80b0cb7ae17f99c6`.
- `classify.js` sha `427d8c0b…364bc48f` **INTACTA** (re-provada). Critérios CRITERIA.md 1-5 cumpridos;
  `RESULTS.md` (10 linhas) presente.
- **Groundhog encerrado:** o item 16 (c03) matou o loop **5× seguidas** — era um **re-run
  REDUNDANTE** de um eval já completo (o `quality-eval-paired-results.json` de 06:05Z já tinha o
  veredicto). c03 **quarantined** honestamente no `progress.jsonl`. Não há nada a re-correr.
- `STATE.json` estava **truncado** (sem chaveta de fecho) — reescrito válido. **QUEUE 8/8 done.**

**DIGEST (pendente — espera o teu OK, NÃO bloqueia):**
- `tipo: push + PR` · `git push` da branch W5 + abrir PR (NUNCA merge/main). **Estado: pendente.
  Recomendação:** o conteúdo do eval é aditivo (scripts/resultados em `packages/council/scripts/`,
  engine frozen intacto), sha intacta. Mas **ver o ponto seguinte antes de pushar.**
- `tipo: git estrutural` · a branch `wave-W5-council-revert` está em estado **ORPHAN/unborn**
  (0 commits, **1848 ficheiros staged** como `A`). Um commit aqui criaria um initial-commit gigante
  e órfão — **errado**. **Recomendação:** recriar a branch limpa a partir de `main` (que está
  intacta em `380d41c`) e re-aplicar só os ficheiros do eval W5 antes de qualquer push/PR. **NÃO
  auto-corrigido** (recriar branches pode perder trabalho não-commitado → decisão tua). O loop não
  fica bloqueado por isto — QUEUE já está esgotada.

---

## 2026-06-23 — WCOCKPIT round 1 (gov verdict: DONE, destrutivos deferidos)

**Contexto:** Teste em produção da ponte seamless Cowork⇄CC correu a wave WCOCKPIT
(auto-pilot por sessão: modos+modelo+auto, agrupamento por projeto, brain link, animações)
ponta-a-ponta via `sdk-runner.mjs` (Sonnet, canUseTool determinista). Voltou com status block
completo e bem-formado — **a própria ponte funcionou**.

**Verificado read-only pelo governador (~10:55Z):**
- `classify.js` sha `427d8c0b…364bc48f` **INTACTA**.
- Artefactos presentes: `packages/vscode-extension/src/mode-registry.js` +
  `cowork-waiting.js` (criados 10:40). Edits em `host-extra.js`, `extension.js`, `sdk-runner.mjs`.
- Tests reportados: `node --test data.test.js` → **59 pass / 0 fail** (+20 unit novos).
  CLI 15 fail = env/Windows pré-existentes (sem regressão introduzida).
- Commit `b3a327f` existe. **QUEUE 9/9 done** (WCOCKPIT marcada done). Sem próxima queued → stand down.
- Reversíveis CRITERIA cumpridos → wave **DONE**. (Feature wave, não revert-experiment;
  validação de "improvement" real é o smoke humano abaixo.)

**DEFERIDO ao Paulo (destrutivo — NÃO auto-executado, loop não bloqueia):**
1. `tipo: merge+tag` — merge `wave-WCOCKPIT` → `main` + tag `v1.x.x-wcockpit`.
   **Recomendação:** abrir **PR** (gate da QUEUE = "PR; nunca merge/main"); NÃO merge directo.
   Conteúdo é aditivo (2 ficheiros novos em src/ + edits de host/extension/runner), sha intacta.
   ⚠️ Confirmar que o ref de branch `wave-WCOCKPIT` existe remotamente — localmente só vi o
   commit `b3a327f`, não o ref nomeado (HEAD detached). Recriar/empurrar a branch antes do PR.
2. `tipo: runtime sync` — `/mooter-update` para sincronizar runtime após merge.
   **Recomendação:** só **depois** do merge; é idempotente (CLAUDE.md §"After every release").
3. `tipo: smoke live` — validar na UI: modos animam (lazy=balanço lento, crazy=tremido),
   badge 🔵 quando `.cowork-pending.json` activo, sdk-runner usa haiku em modo lazy.
   **Recomendação:** este é o **verdadeiro gate de qualidade** (change≠improvement) — só taggear
   `v1.x.x-wcockpit` se o smoke passar. Exige clique na UI → não executável a partir daqui.

## 2026-06-23T11:01:56.000Z - PRONTO P/ PROD (autorizado pelo Paulo)
Cockpit auto-pilot por sessao (v3) + refinamento (v4) DONE na branch wave-WCOCKPIT. 71 testes verdes, classify.js intacta. Commits b3a327f (WCOCKPIT) + c9115ad (WCOCKPIT-2).
Passos do Paulo (PROD_RUNBOOK.md): F5 verificar -> merge wave-WCOCKPIT->main -> tag -> /mooter-update -> vsce package -> instalar .vsix -> smoke.
Recomendacao: verificar via F5 antes do merge. O loop NAO faz merge/deploy (gate).

## 2026-06-23 — WCOCKPIT-5 (FIX cockpit em branco) — DONE, merge+install pendente ⚠️ PROD PARTIDO AGORA

**Contexto:** A build `0.16.4` (que trouxe o estágio-git da WCOCKPIT-4) deixou o painel do
cockpit **EM BRANCO** em produção ao recarregar — regressão de runtime no render do webview que
os testes string-assert não apanharam. Brief `_handoff/fleet/WCOCKPIT5_BRIEF.md` pediu correcção
+ teste que **executa** o render.

**AUTO (decidido pela rubrica — corretivo reversível, informativo):**
WCOCKPIT-5 marcada **DONE** na QUEUE. Reportado no OUTBOX/round-6:
- Root causes eliminadas: `gitStage()` → **async** (`execTool`, event-loop nunca bloqueado);
  `gsCache` (sem chamadas git redundantes por CWD); `rowFor` → **try/catch** (erro num card
  já não apaga o painel inteiro).
- Commit `5f0ccc9` na branch `wave-WCOCKPIT` (topo de 5: 5f0ccc9·71dda1f·4cce4ae·c9115ad·b3a327f).
- Testes: **119 pass / 0 fail** — **+13 testes que IMPORTAM e EXECUTAM** `renderRow`/`renderGroupHeader`
  com rows variadas (com/sem gitStage, worktree, brain) confirmando que **não lançam** e devolvem
  HTML não-vazio = exactamente o deliverable do brief; **106 baseline verdes**.
- `classify.js` sha `427d8c0b…364bc48f` reportada **INTACTA**.
- Notion `3886f6e42bc48167a261ec23c2d776f8`.

**⚠️ CAVEAT HONESTO DO GOVERNADOR:** os testes e o sha são **auto-reportados pela sessão** — **NÃO
foram re-verificados read-only** porque o working-tree está truncado e o git index está corrupto no
sandbox do evaluator (não consegui correr `npm test` nem `sha256sum` no ficheiro de trabalho). A
prova definitiva é o **smoke do Paulo** após instalar. Como nada faz ship sem a tua mão (gate
humano), aceitar a wave como DONE no loop é de baixo risco e não auto-executa nada irreversível.

**DEFERIDO ao Paulo (destrutivo — NÃO auto-executado; prod está partido, isto é o desbloqueio):**
1. `tipo: merge` — `wave-WCOCKPIT` → `main` (5 commits, aditivo/corretivo, sha intacta).
   **Recomendação:** PR conforme gate da QUEUE; o fix `5f0ccc9` é o que tira o painel do branco.
2. `tipo: runtime sync` — `/mooter-update` (idempotente, só depois do merge).
3. `tipo: build+install` — `vsce package` → instalar o `.vsix` via UI "Install from VSIX".
4. `tipo: smoke live` (**gate de qualidade real**) — abrir o cockpit e **confirmar que NÃO fica
   em branco**; chip git visível + safety tip "não fechar" em work dirty. Exige clique na UI →
   não executável daqui. Só considerar a regressão fechada se este smoke passar.

**Estado: pendente.** O loop fica em stand-down (QUEUE esgotada, sem próxima wave queued) — não
inventa trabalho novo; pega waves novas que a Fleet gere no próximo tick.
