# Wave Council — Master Prompt para Claude Code (ultracode)

**Composto:** 2026-06-21, Cowork · **Alvo:** CC ultracode autónomo
**Design base:** `docs/strategy/COUNCIL_MODE_DESIGN_2026-06.md` (lê primeiro — este prompt assume-o)
**Tag esperada Wave A:** `v?.?.0-council-mvp`

> **Como usar:** cola o bloco "MASTER PROMPT" abaixo numa sessão fresca de CC dentro de `~/frugal`. O Day-0 recon é obrigatório e bloqueante — não escrevas código antes de o completar.

---

## Contexto de uma linha
Adicionar um **terceiro eixo de routing** ao Mooter: `decideCouncil` decide se um prompt merece um **conselho heterogéneo** (quórum local grátis + cloud barato) que delibera e devolve um veredicto honesto (consenso/discórdia/minoria) — ou, em alto risco, uma decisão calibrada **ACT vs ESCALATE**. Tudo num package **aditivo** `packages/council/`, reusando primitivas que já existem.

---

## ⛔ Invariantes (CI-enforced — violar = PR rejeitado)
1. **`tools/router/classify.js` é FROZEN.** Sha CI-enforced. Council **lê** o output do classifier; **nunca** o modifica nem o importa.
2. **Engine packages frozen** (waves 28-34.5) intocados. Trabalho novo vive em **`packages/council/` (novo)** + adições allowlisted.
3. **Selective git adds** — `git add` exatamente os ficheiros que mudaste. Nunca `git add -A`.
4. **Sem novo `.md` na raiz.** Docs em `docs/strategy/`.
5. **Tier ladder:** Fable (T5) **nunca auto** — só com `@fable` explícito. Opus entra como **juiz**, não membro forçado.
6. **PT-PT em conversa, English em código e identifiers.** (Confirmar idioma de conversa com o estado do vault.)
7. **Doctrine V4 §5 — no fabrication.** Scores/custos nunca inventados; `coverage_note` honesto; pending quando preço unknown.

---

## 🔍 Day-0 recon (BLOQUEANTE — produz `docs/strategy/WAVE_COUNCIL_DAY0_RECON.md`)
Confirma, lendo o código (não assumas), as assinaturas exatas. Esperado (do recon prévio — verifica se mudou):

```ts
// packages/validation/src/adversarial/  ← o motor de deliberação JÁ EXISTE
export type Verdict = "confirm" | "refute" | "uncertain";
export interface ReviewResult { reviewer: string; lens: Lens; verdict: Verdict; confidence: number /*0..1*/; rationale: string; }
export async function review(target: ReviewTarget, lens: Lens, call: LlmCaller, reviewerName?: string): Promise<ReviewResult>;
export interface VoteResult { convergence: "CONFIRMED"|"REJECTED"|"UNCERTAIN"; confirmMass: number; refuteMass: number; uncertainMass: number; score: number /*(confirm−refute)/total ∈[-1,1]*/; threshold: number; }
export function vote(results: ReviewResult[], opts?: VoteOptions): VoteResult; // refute ganha empates

// packages/router/src/  ← seleção de assentos
import { decideAgent } from "./decide-agent.ts";            // já conhecido: (category, min_score, max_cost, prefer_local, force_model)
export const MATRIX_MODELS; export function getCell(model, category); export function coverageStats();
export const TASK_CATEGORIES; export function parseTaskCategory(text): TaskCategory | null;
// adaptive-learner.ts: recomputeFromOutcomes(opts), getLearnedCell(model,cat,opts), driftReport(opts); EWMA_ALPHA=0.3, MIN_DATAPOINTS=5

// LLM backends  ← "assento" = ModelSpec
export interface ModelSpec { id: string; tier: Tier; kind: "local"|"cloud"; call: (prompt: string) => Promise<CallOutcome>; }
export function makeOllamaModel(id, tier, opts?): ModelSpec;     // costUsd:0
export function makeAnthropicModel(id, tier, opts?): ModelSpec;  // costUsd calculado

// packages/workflow/src/  ← orquestração
export async function parallel<T,R>(items: T[], fn: (i:T)=>Promise<R>, opts?: {concurrency?:number}): Promise<R[]>;
export async function converge<R>(initial: R[], refineFn: (r:R)=>Promise<R|null>, maxIterations?: number): Promise<R[]>;

// packages/spawn-orchestrator/src/  ← fan-out background (≥3 = FANOUT_THRESHOLD)
export async function fanOut(tasks: FanoutTask[], options?: FanoutOptions): Promise<FanoutReport>;

// packages/mcp-server/src/tools.ts  ← padrão de tool
export interface McpTool { name: string; description: string; inputSchema: {type:"object"; properties:Record<string,unknown>; required?:string[]}; handler: (args, ctx)=>Promise<string>; }

// packages/cli/src/  ← padrão de comando
export async function runWorkflow(rest: string[]): Promise<CmdResult>; // lazy-import do engine; replicar p/ runCouncil

// packages/worktree-conductor/src/  ← ⚠️ é lock/lease conductor, NÃO cria worktrees
acquireWithRecovery(); status(); forceRelease(); reap(); runConductor(args, opts): CmdResult;
```

No recon, **anota qualquer divergência** entre o esperado acima e o real, e o caminho do classifier output (campo `confidence`, floors T3). Se algo não existir, **pára e reporta** — não inventes.

---

## 🎯 Escopo Wave A (Council MVP — Advisory only, ~12h)
**Builder Council (worktrees) e Pastor learning loop ficam para Waves C/D — não os faças agora.**

### Componentes a criar (todos em `packages/council/`)
| # | Ficheiro | Responsabilidade | Reusa |
|---|---|---|---|
| 1 | `src/cas.ts` | `computeCAS(signals): { score:number; reasons:string[]; convene:boolean }` — determinístico, host-side, **sem chamada LLM** | classifier output (confidence, T3 floor), `decideAgent` (empate TES), `parseTaskCategory` |
| 2 | `src/compose.ts` | `composeCouncil(category, cas, budget): { seats: ModelSpec[]; judge: ModelSpec; note: string }` — diversidade (≥1 local, famílias distintas, nº ímpar, juiz cross-family, Fable nunca auto) | `decideAgent` por assento, `makeOllamaModel`/`makeAnthropicModel`, `MATRIX_MODELS` |
| 3 | `src/deliberate.ts` | `deliberate(prompt, council): Promise<CouncilVerdict>` — Fase 1 paralela (sem cross-talk) → Fase 2 `review()` adversarial c/ **adaptive stopping** (consenso na ronda 1 → salta) → agregação `vote()` | `parallel`, `review`, `vote`, `converge` |
| 4 | `src/verdict.ts` | `synthesize(results, vote): CouncilVerdict` — 4 secções honestas (consenso/discórdias/achados-únicos/recomendação) + confiança + **minority report**; Opus sintetiza o *trace*, não só a resposta | juiz `ModelSpec` |
| 5 | `src/index.ts` | exports públicos + versão/phase | — |
| 6 | `src/council.test.ts` | testes: CAS thresholds, composição (diversidade/Fable-never/odd), adaptive-stop, agregação confidence-weighted, verdict 4-secções, **honesty (sem fabricação quando preço pending)** | — |

### Superfície de utilizador
- **CLI:** `mooter council "<prompt>"` (replica o padrão `runWorkflow`: lazy-import). Flags: `--seats N`, `--explain`, `--local-only`, `@council`/`@fable` reconhecidos no prompt.
- **`mooter explain council`** — mostra porque o CAS disparou/não disparou (reasons[]) + composição escolhida + custo estimado vs all-Opus.
- **Statusline chip:** `🏛 council Ns · $X · vs all-Opus $Y (saved Z%)` (segue o padrão do chip `🐮 saved`).

### Honestidade obrigatória no output
Todo veredicto reporta: membros (id + measured/heuristic via `coverage_note`), quem confirmou/refutou (confidence), `score` do `vote()`, custo real por assento (local=$0), e a **minoria preservada**. Nada inventado.

---

## 🧱 Fases atómicas (1 commit por fase, mensagens convencionais)
1. **`feat(council): Day-0 recon`** — `WAVE_COUNCIL_DAY0_RECON.md` + scaffold vazio `packages/council/` (package.json, tsconfig, index stub) + test harness a correr.
2. **`feat(council): CAS`** — `cas.ts` + testes. Determinístico, conservador por defeito.
3. **`feat(council): compose`** — `compose.ts` + testes (diversidade, Fable-never, juiz cross-family, budget cap via quota).
4. **`feat(council): deliberate`** — `deliberate.ts` reusando `review`/`vote`/`parallel` + adaptive stopping + testes.
5. **`feat(council): verdict`** — `verdict.ts` 4-secções + minority report + testes.
6. **`feat(council): cli`** — `mooter council` + `mooter explain council` + statusline chip.
7. **`test(council): e2e + honesty sweep`** — demo real local (prompt de alto-CAS), captura custo real, confirma sem fabricação. Atualiza `SYNC.md`.

Após cada fase: `cd packages/council && npm test` verde antes do commit. Worktrees frescas → `npm install` em `packages/cli` **e** `packages/router` primeiro.

---

## ✅ Gates honestos (não os contornes)
- **Gate de valor (fim da Wave A):** numa amostra de ≥10 prompts de alto-CAS, o council tem de **mudar o veredicto vs single-model em ≥30%** dos casos. Se não, o **CAS está mal calibrado** — afina-o **antes** de propor Wave B/C. Documenta o resultado em `SYNC.md`.
- **Gate de custo:** custo médio de um council 5-seat ≤ ~$0,50 (2 locais grátis + Haiku + Sonnet + síntese Opus). Se acima, revê composição.
- **Gate de honestidade:** zero scores/custos fabricados; `coverage_note` presente em cada assento; preço pending → assento não rankeável, dito explicitamente.
- **Gate de invariante:** `git diff --stat` não toca `classify.js` nem engine packages frozen; sha de `classify.js` inalterada.

---

## 🚫 Fora de escopo (NÃO fazer na Wave A)
- Builder Council / worktrees (Wave C — lembra: `worktree-conductor` não cria worktrees, precisa de `git worktree add` orquestrado).
- Conformal ACT/ESCALATE (Wave B, junto com auto-trigger nos floors T3).
- Pastor learning loop / LoRA judge (Wave D).
- MCP tool `council_convene` (Wave C).

---

## 📋 Entregáveis Wave A
1. `packages/council/` funcional, testes verdes.
2. `mooter council "<prompt>"` + `mooter explain council` + statusline chip a correr.
3. Demo real local (output capturado) num prompt de alto-CAS, com custo real e veredicto 4-secções.
4. `WAVE_COUNCIL_DAY0_RECON.md` + resultado do gate de valor em `SYNC.md`.
5. PR com selective adds, sha de `classify.js` provada inalterada.

---

## ════════ MASTER PROMPT (cola isto no CC) ════════

```
És o CC em ultracode autónomo no repo ~/frugal (Mooter, LLM router local-first).
Lê primeiro, na íntegra: docs/strategy/COUNCIL_MODE_DESIGN_2026-06.md e
docs/strategy/WAVE_COUNCIL_MASTERPROMPT_CC.md (este ficheiro). Depois executa a Wave A
(Council MVP, Advisory only) seguindo-o à letra.

REGRAS DURAS:
- classify.js é FROZEN (sha CI-enforced). NÃO o modifiques nem o importes. O Council LÊ o output dele.
- Todo o código novo vive em packages/council/ (novo, aditivo). Não toques em engine packages frozen.
- git add seletivo (só os ficheiros que mudaste). Nunca git add -A.
- Fable nunca auto (T5 opt-in). Opus é juiz, não membro forçado.
- Doctrine §5: zero fabricação. Sem scores/custos inventados; coverage_note honesto; pending quando preço unknown.
- English no código/identifiers.

PASSO 1 (BLOQUEANTE): Day-0 recon. Lê e CONFIRMA as assinaturas reais de:
packages/validation/src/adversarial/ (review, vote, ReviewResult, VoteResult),
packages/router/src/{decide-agent,specialization-matrix,task-categories,adaptive-learner}.ts,
os ModelSpec factories (makeOllamaModel/makeAnthropicModel),
packages/workflow/src/ (parallel, converge), packages/spawn-orchestrator/src/ (fanOut),
packages/mcp-server/src/tools.ts (McpTool), packages/cli/src/ (padrão runWorkflow),
e o caminho do output do classifier (campo confidence + floors T3).
Escreve docs/strategy/WAVE_COUNCIL_DAY0_RECON.md com as assinaturas verbatim e QUALQUER
divergência face ao esperado no master prompt. Se algo não existir, PÁRA e reporta — não inventes APIs.

PASSO 2: implementa as fases atómicas 1→7 (uma commit por fase, conventional commits),
reusando review()/vote() como motor de deliberação, decideAgent + makeOllama/Anthropic para
compor assentos, parallel() para correr. NÃO escrevas agregação nova nem isolamento novo.

PASSO 3: corre os gates (valor ≥30% de mudança vs single-model em alto-CAS; custo ≤$0,50;
honestidade; invariante classify.js intacta). Documenta o gate de valor em SYNC.md.
Se o gate de valor falhar, afina o CAS e re-corre — não avances para Wave B/C.

NÃO faças (fora de escopo Wave A): Builder Council/worktrees, conformal ACT/ESCALATE,
Pastor learning loop, MCP tool council_convene.

Entrega: packages/council/ com testes verdes, mooter council + explain council + statusline chip,
demo real local capturada, e PR com selective adds + prova de que a sha de classify.js não mudou.
```
