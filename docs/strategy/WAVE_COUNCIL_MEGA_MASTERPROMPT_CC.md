# Wave Council — MEGA Master Prompt (all-in-one, autónomo) para CC

**Composto:** 2026-06-21, Cowork · **Alvo:** 1 sessão fresca de CC em ultracode
**Design base (no repo):** `docs/strategy/COUNCIL_MODE_DESIGN_2026-06.md` + `docs/strategy/WAVE_COUNCIL_MASTERPROMPT_CC.md`
**Faz numa só run:** Day-0 recon → Wave A (Advisory MVP) → Wave B (deliberação + ACT/ESCALATE + auto-trigger) → Wave C (Builder Council) → Wave D (Pastor loop). **Tag esperada:** `v?.?.0-council-complete`.

> **Honestidade primeiro:** isto é uma mega-wave grande (~40h CC, 4 blocos, ~22 commits atómicos). Os gates que antes eram "pára e pergunta ao Paulo" viram **self-checks autónomos**: o CC mede, decide e **só avança se o gate passar**; se falhar, auto-corrige e re-mede, e regista tudo em `SYNC.md`. Travões de segurança incluídos (nunca faz merge para `main`, nunca toca em código frozen). Mesmo assim, **revê o output do Gate de Valor (A→B) antes de mergeares** — é o único julgamento que só tu deves assinar.

---

## ⛔ Invariantes globais (válidas em TODAS as fases — violar = abortar a fase e reportar)
1. `tools/router/classify.js` **FROZEN** — sha CI-enforced. Council **lê** o output; nunca modifica nem importa.
2. Engine packages frozen (waves 28-34.5) intocados. Todo o código novo em **`packages/council/`** (novo, aditivo) + adições allowlisted.
3. **git add seletivo** — nunca `git add -A`. **Nunca push/merge para `main`** — trabalha em branch `wave-council`, abre PR no fim de cada bloco.
4. Tier ladder: **Fable nunca auto** (T5 opt-in). Opus é **juiz cross-family**, não membro forçado.
5. **Doctrine §5 — no fabrication.** Scores/custos nunca inventados; `coverage_note` honesto; pending quando preço unknown.
6. English no código/identifiers. Sem novo `.md` na raiz (docs em `docs/strategy/`).
7. Após cada fase: testes verdes (`cd packages/council && npm test`) **antes** do commit. Worktrees frescas → `npm install` em `packages/cli` e `packages/router` primeiro.

---

## 🔍 BLOCO 0 — Day-0 recon (BLOQUEANTE)
Lê e confirma verbatim as assinaturas reais (não assumas; se algo não existir, **pára e reporta**):
- `packages/validation/src/adversarial/` → `review(target, lens, call, reviewerName?): Promise<ReviewResult>`, `vote(results, opts?): VoteResult` (`score=(confirmMass−refuteMass)/total`, refute ganha empates), `Verdict="confirm"|"refute"|"uncertain"`, lenses `correctness|security|completeness|repro|doctrine`.
- `packages/router/src/` → `decideAgent`, `MATRIX_MODELS`, `getCell`, `coverageStats`, `TASK_CATEGORIES`, `parseTaskCategory`, `adaptive-learner` (`recomputeFromOutcomes`, `getLearnedCell`, `driftReport`, `EWMA_ALPHA=0.3`, `MIN_DATAPOINTS=5`).
- ModelSpec factories → `ModelSpec{id,tier,kind,call(prompt):Promise<CallOutcome>}`, `makeOllamaModel` (cost $0), `makeAnthropicModel` (cost calculado).
- `packages/workflow/src/` → `parallel<T,R>`, `converge<R>`. `packages/spawn-orchestrator/src/` → `fanOut` (FANOUT_THRESHOLD=3).
- `packages/mcp-server/src/tools.ts` → `McpTool{name,description,inputSchema,handler}`. `packages/cli/src/` → padrão `runWorkflow` (lazy-import).
- `packages/worktree-conductor/src/` → ⚠️ é **lock/lease conductor** (`acquireWithRecovery`,`status`,`forceRelease`,`reap`,`runConductor`), **NÃO cria worktrees** — Bloco C orquestra `git worktree add/remove` por cima.
- Caminho do output do classifier (campo `confidence`, floors T3 deploy/secrets/migrations).

**Entrega:** `docs/strategy/WAVE_COUNCIL_DAY0_RECON.md` com assinaturas verbatim + divergências. Cria branch `wave-council` e scaffold `packages/council/` (package.json, tsconfig, index stub, test harness verde). **Commit:** `feat(council): day-0 recon + scaffold`.

---

## 🟦 BLOCO A — Advisory Council MVP
Cria em `packages/council/src/`:
1. `cas.ts` — `computeCAS(signals): {score, reasons[], convene}` determinístico, host-side, **sem LLM**. Sinais: confidence baixa, floor T3, empate TES (top-2 dentro de ε), categoria de alta variância, `@council`/`effort:beast`. Conservador por defeito. **Commit:** `feat(council): CAS`.
2. `compose.ts` — `composeCouncil(category, cas, budget): {seats: ModelSpec[], judge: ModelSpec, note}` — ≥1 local, famílias distintas, nº ímpar, juiz cross-family, Fable nunca auto, budget cap. Reusa `decideAgent` por assento + `makeOllama/Anthropic`. **Commit:** `feat(council): compose`.
3. `deliberate.ts` — `deliberate(prompt, council): Promise<CouncilVerdict>` — Fase 1 paralela sem cross-talk (`parallel`) → Fase 2 `review()` adversarial com **adaptive stopping** (consenso na ronda 1 → salta ronda 2) → agregação `vote()`. **Commit:** `feat(council): deliberate`.
4. `verdict.ts` — `synthesize(...): CouncilVerdict` — 4 secções honestas (consenso/discórdias/achados-únicos/recomendação) + confiança + **minority report** (trace-level, não majority vote). **Commit:** `feat(council): verdict`.
5. CLI `mooter council "<prompt>"` + `mooter explain council` (mostra reasons[] + composição + custo vs all-Opus) + statusline chip `🏛 council Ns · $X · saved Z%`. **Commit:** `feat(council): cli + statusline`.

**SELF-GATE A (valor):** corre ≥10 prompts de alto-CAS; mede % de casos em que o council **muda o veredicto vs single-model**. Se **≥30%** → avança Bloco B. Se **<30%** → o CAS está mal calibrado: ajusta thresholds em `cas.ts`, re-mede (máx 3 iterações), e **regista o número final em `SYNC.md`**. Se após 3 iterações continuar <30%, **pára e escala ao Paulo** (não construas B/C sobre um trigger sem valor). **Commit:** `test(council): value gate + honesty sweep`. Abre **PR #1 (Bloco A)**.

---

## 🟩 BLOCO B — Deliberação completa + segurança calibrada + auto-trigger
1. `escalation.ts` — para alto risco: converte o veredicto em decisão calibrada **`ACT` vs `ESCALATE`** (linear opinion pool das confidences + threshold conforme). Abaixo do threshold → `ESCALATE` ao humano. **Commit:** `feat(council): conformal act/escalate`.
2. Auto-trigger: liga o CAS aos **floors T3** (deploy/secrets/migrations) → council auto-convocado **antes** da ação perigosa. **Commit:** `feat(council): high-risk auto-trigger`.
3. Cross-exam multi-ronda real (até 2) com `converge()` + adaptive stability detection. **Commit:** `feat(council): adversarial rounds`.
4. Telemetria → hub D1 (features only, no content, k-anon) + ledger no vault. **Commit:** `feat(council): telemetry + vault ledger`.

**SELF-GATE B (segurança):** num conjunto de prompts T3 sintéticos de alto risco, confirma que `ESCALATE` dispara quando há discórdia real e `ACT` só com consenso forte. Falso-`ACT` em discórdia = bug bloqueante. **Commit:** `test(council): safety gate`. Abre **PR #2 (Bloco B)**.

---

## 🟨 BLOCO C — Builder Council (implementações concorrentes, testes-como-juiz)
1. `builder.ts` — orquestra `git worktree add` (uma por membro), cada membro implementa a mudança na sua worktree em paralelo; usa `worktree-conductor` para coordenar locks/heartbeats. **Nunca faz merge para `main`** — produz branches/diffs. **Commit:** `feat(council): builder worktrees`.
2. `tests-judge.ts` — corre os testes em cada worktree; `pass-rate = utility`. Se a tarefa **não tem testes**, um assento dedicado gera-os primeiro. O juiz LLM (Opus) só **desempata entre as que passam**, com rubric length-neutral + respostas anónimas + ordem randomizada. **Commit:** `feat(council): tests-as-judge`.
3. Cleanup: `git worktree remove` das perdedoras (e via `reap()` do conductor para locks stale). **Commit:** `feat(council): worktree cleanup`.
4. MCP tool `council_convene` (padrão `McpTool`). **Commit:** `feat(council): mcp council_convene`.

**SELF-GATE C (correção):** numa tarefa de código com testes conhecidos, confirma que o Builder Council escolhe uma implementação que **passa todos os testes** e que as worktrees são limpas (zero leaks). Se nenhuma implementação passa → reporta honestamente "no winner", não inventa. **Commit:** `test(council): builder gate`. Abre **PR #3 (Bloco C)**.

---

## 🟪 BLOCO D — Pastor learning loop (learns forever)
1. Pastor regista por council: consenso bateu os membros individuais? quem acertou por categoria? valeu o custo? (reusa `adaptive-learner`). **Commit:** `feat(council): pastor logging`.
2. Auto-tune do threshold CAS via EWMA — sobe quando o council não muda o veredicto. **Commit:** `feat(council): CAS auto-tune`.
3. Melhor council por categoria (qual trio de melhor valor) + distillation hook (prever o veredicto e saltar o council quando confiança alta). **Commit:** `feat(council): per-category best + distill hook`.
4. (Opcional, só se houver dados) LoRA "judge" adapter. **Commit:** `feat(council): lora judge (optional)`.

**SELF-GATE D (aprendizagem):** simula N councils com outcomes conhecidos; confirma que o threshold CAS **sobe** quando o council é redundante (dispara menos ao longo do tempo). **Commit:** `test(council): learning gate`. Abre **PR #4 (Bloco D)**.

---

## 🏁 Fecho
- Atualiza `SYNC.md` (estado + resultados dos 4 gates) e `CHANGELOG.md`.
- Demo real local capturada (Advisory + Builder) com custo real.
- Prova `git diff` que `classify.js` e engine packages frozen estão intactos (sha inalterada).
- Resumo final: o que passou cada gate, custo médio por council, % de mudança de veredicto, e recomendação honesta de tag.

---

## ════════ MEGA MASTER PROMPT (cola isto numa sessão fresca de CC) ════════

```
És o CC em ultracode autónomo no repo ~/frugal (Mooter, LLM router local-first).
Vais implementar a Council feature COMPLETA numa só run: Day-0 recon + 4 blocos (A→B→C→D).
Lê primeiro, na íntegra: docs/strategy/COUNCIL_MODE_DESIGN_2026-06.md e
docs/strategy/WAVE_COUNCIL_MEGA_MASTERPROMPT_CC.md (este ficheiro). Segue-o à letra.

REGRAS DURAS (todas as fases):
- classify.js é FROZEN (sha CI-enforced). NÃO o modifiques nem importes. O Council LÊ o output dele.
- Todo o código novo em packages/council/ (novo, aditivo). Não toques em engine packages frozen.
- Trabalha na branch wave-council. git add seletivo. NUNCA push/merge para main. Abre 1 PR por bloco.
- Fable nunca auto (T5 opt-in). Opus é juiz cross-family, não membro forçado.
- Doctrine §5: zero fabricação. coverage_note honesto; pending quando preço unknown.
- Builder Council nunca faz merge para main; produz só branches/diffs com testes verdes.
- English no código. Após cada fase: testes verdes antes do commit (1 commit atómico por fase, conventional commits).

BLOCO 0 (BLOQUEANTE): Day-0 recon. Confirma verbatim as assinaturas reais de validation/adversarial
(review, vote), router (decideAgent, MATRIX_MODELS, task-categories, adaptive-learner), os ModelSpec
factories (makeOllama/Anthropic), workflow (parallel, converge), spawn-orchestrator (fanOut),
mcp-server (McpTool), cli (padrão runWorkflow), worktree-conductor (é lock conductor, NÃO cria
worktrees), e o caminho do classifier output (confidence + floors T3). Escreve
docs/strategy/WAVE_COUNCIL_DAY0_RECON.md. Se algo não existir, PÁRA e reporta — não inventes APIs.
Cria a branch wave-council + scaffold packages/council/.

BLOCO A (Advisory MVP): cas.ts, compose.ts, deliberate.ts (reusa review/vote/parallel + adaptive
stopping), verdict.ts (4 secções + minority report, trace-level NÃO majority vote), CLI
"mooter council" + "mooter explain council" + statusline chip. Reusa decideAgent + makeOllama/Anthropic
para compor assentos. NÃO escrevas agregação nova.
SELF-GATE A: ≥10 prompts alto-CAS; o council tem de mudar o veredicto vs single-model em ≥30%.
Se <30%, afina o CAS e re-mede (máx 3x); se continuar <30%, PÁRA e escala ao Paulo. Regista em SYNC.md. PR #1.

BLOCO B: escalation.ts (conformal ACT vs ESCALATE-ao-humano em alto risco), auto-trigger nos floors T3,
cross-exam multi-ronda (converge + adaptive stopping), telemetria hub D1 + ledger vault.
SELF-GATE B: ESCALATE dispara em discórdia real, ACT só em consenso forte. Falso-ACT = bug bloqueante. PR #2.

BLOCO C (Builder Council): builder.ts (orquestra git worktree add por membro, locks via
worktree-conductor, NUNCA merge para main), tests-judge.ts (pass-rate=utility; gera testes se faltarem;
Opus só desempata entre as que passam, rubric length-neutral + anónimo + ordem randomizada),
cleanup de worktrees, MCP tool council_convene.
SELF-GATE C: escolhe implementação que passa todos os testes; zero leaks de worktree; "no winner"
honesto se nenhuma passa. PR #3.

BLOCO D (Pastor loop): logging de outcomes (adaptive-learner), auto-tune do threshold CAS (EWMA, sobe
quando redundante), melhor council por categoria + distill hook, LoRA judge (opcional, só com dados).
SELF-GATE D: threshold CAS sobe quando o council é redundante (dispara menos com o tempo). PR #4.

FECHO: atualiza SYNC.md (4 gates) + CHANGELOG.md; demo real local capturada; prova git diff que
classify.js + engine frozen estão intactos; resumo honesto com recomendação de tag v?.?.0-council-complete.
```
