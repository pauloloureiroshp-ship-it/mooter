# Mooter Council — design doc (RFC)

**Composto:** 2026-06-21, Cowork
**Status:** Design proposal · candidate Wave 67+
**Autor do pedido:** Paulo — "como faria o conceito de *council* de forma automática no Mooter, que a Anthropic ficaria impressionada"
**Ponto de partida:** Mooter já tem tier routing (classify.js FROZEN), `decideAgent` (TES), spawn-orchestrator (`fanOut`), worktree-conductor, workflow runtime (`agent/parallel/vote/converge/checkpoint`), validation/adversarial (`voter.ts`/`reviewer.ts`), Pastor learning loop, hub D1.

---

## TL;DR (4 linhas)

**Council = um novo *eixo de routing*: o Mooter já roteia por _custo_ (TES) — o Council roteia por _confiança_.** Quando uma única resposta não é confiável (classifier inseguro, ação de alto risco, ou dois modelos empatam), o Mooter convoca automaticamente um **conselho heterogéneo** (quórum local grátis + cloud barato), corre uma deliberação adversarial com *adaptive stopping*, e devolve um veredicto que **expõe a discórdia em vez de a esconder**. Para código, os membros constroem **implementações concorrentes em worktrees isoladas** e os **testes** escolhem o vencedor. Custo: cêntimos, não o N×frontier do paper. E o Pastor aprende quando vale a pena — para o council disparar *menos* vezes ao longo do tempo, não mais.

> **A tese:** Mooter é o único router que já tem **todas** as peças do Council Mode da literatura. Falta só a *decisão* que as compõe. Este doc é essa decisão.

---

## Parte 1 — O que a literatura diz (estado-da-arte, Junho 2026)

| Achado | Fonte | Implicação para o Mooter |
|---|---|---|
| **Council Mode**: triage → geração paralela de N modelos *diversos* → síntese de consenso em 4 secções (consenso / discórdia / achados únicos / análise). −35,9% alucinação (HaluEval), +10,2 pts qualidade (MDR-500). Latência 2–3×. | [Council Mode, arXiv 2604.02923](https://arxiv.org/abs/2604.02923) | É **exatamente** o pipeline que o Mooter pode montar com peças que já tem. Inversão local-first: os "N frontier APIs" do paper viram quórum local grátis + cloud barato. |
| **Mixture-of-Models / NSED**: ensembles de modelos pequenos (<20B) igualam ou batem modelos de 100B+. | [MoM/NSED, arXiv 2601.16863](https://arxiv.org/pdf/2601.16863) | Valida o coração do Mooter: um conselho de Ollama locais pode rivalizar com 1 chamada Opus. "Learns forever" via Pastor. |
| **Multi-agent debate ajuda em 19/21 settings, +7,05% média**, mas **só em tarefas complexas de alta variância**; modelos-base mais fortes beneficiam mais. | [Multi-Agent Debate / Adaptive Stability, arXiv 2510.12697](https://arxiv.org/html/2510.12697v1) | O trigger tem de ser **seletivo**. Council nunca em tarefa fácil — bate certo com a doctrine "earn its cost". |
| **Adaptive stopping** > rondas fixas de debate; para cedo quando há consenso. | [iMAD, arXiv 2511.11306](https://arxiv.org/pdf/2511.11306) | Se os membros já concordam na ronda 1, não pagas a ronda 2. |
| **"Talk Isn't Always Cheap"**: debate falha por *groupthink*, agentes preguiçosos e agregação ingénua (majority vote) que erra mesmo quando há membros certos. | [Failure Modes, arXiv 2509.05396](https://arxiv.org/pdf/2509.05396) | Ronda 1 sem cross-talk (preserva diversidade); juiz estruturado ≠ majority vote; juiz fora do conselho (evita self-preference bias). |
| **Anthropic multi-agent**: orchestrator-worker, 3–5 subagents paralelos em contexto isolado; +90,2% vs single-agent, **~15× tokens**. | [Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system) | O custo é o calcanhar. Mooter resolve com quórum local (grátis) + adaptive stopping + quota guard. |

**Síntese:** o council *funciona*, mas só vale a pena seletivamente e o custo mata-o em cloud puro. Os dois problemas (quando disparar / como pagar) são **exatamente** os dois problemas que o Mooter já resolve para routing normal. Council é a generalização natural.

---

## Parte 2 — Onde encaixa: um terceiro eixo, não um motor novo

O Mooter já tem dois eixos ortogonais. O Council é o terceiro:

```
classify.js (FROZEN)   →  TIER          (eixo complexidade)   "quão difícil é?"
decideAgent (TES)      →  MODELO         (eixo custo)          "qual o melhor valor?"
decideCouncil (NOVO)   →  SINGLE | COUNCIL  (eixo confiança)   "uma cabeça chega?"
```

`decideCouncil` **não reclassifica nada e não toca em classify.js**. Lê o output do classifier + o output do `decideAgent` + sinais do Pastor, e responde uma pergunta nova: *isto merece um conselho, e se sim, com que membros e que protocolo?* A execução reusa o que já existe:

| Fase do Council | Peça do Mooter que já existe | Path |
|---|---|---|
| Triage / decisão de convocar | `classify.js` + `decideAgent` + novo `decideCouncil` | `tools/router/classify.js`, `packages/router/src/decide-agent.ts` |
| Geração paralela dos membros | `fanOut()` (spawn sandboxado paralelo) | `packages/spawn-orchestrator` |
| Implementações concorrentes (Builder) | worktrees git isoladas | `packages/worktree-conductor` |
| Cross-exam adversarial | `reviewer.ts` / `voter.ts` | `packages/validation/src/adversarial/` |
| Consenso / convergência | `vote()` / `converge()` primitives | `packages/workflow` |
| Síntese honesta final | synthesis layer + Doctrine V4 §5 | `packages/synthesis` |
| Quota / custo guard | quota guard multi-sessão | `packages/sessions-orchestrator` |
| Persistência + aprendizagem | hub D1 + Pastor | `hub/`, `docs/strategy/PASTOR.md` |

**Invariante respeitada:** Council é um **package aditivo** (`packages/council/`), igual ao padrão dos *additions* allowlisted da Wave 58. Zero modificação em `classify.js` (sha CI-enforced) ou nos engine packages frozen.

---

## Parte 3 — O gatilho automático: Council Activation Score (CAS)

A literatura é unânime: **debate só ajuda em tarefas complexas de alta variância e alto risco; em tarefas fáceis é desperdício.** Logo o Council dispara **só** quando sinais que o Mooter *já calcula* cruzam um limiar. O CAS é **determinístico, host-side, custo ~zero** (sem chamada LLM extra — fiel ao espírito do classify.js).

| Sinal (já existe no Mooter) | O que indica | Peso |
|---|---|---|
| `confidence` baixa no output do classify.js | incerteza do classificador | alto |
| **High-risk floor** atingido (deploy / secrets / migrations forçam T3) | stakes altos | alto |
| **Empate de TES** no `decideAgent` (top-2 candidatos dentro de ε) | ambiguidade genuína de qual modelo é melhor | médio |
| `task_category` ∈ {architecture, security-audit, hard-debugging, large-refactor} | categorias de alta variância inicial | médio |
| Prior do Pastor: prompts assim cuja resposta single-model foi depois corrigida/revertida | histórico de falha | médio (sobe c/ dados) |
| Explícito: `@council` / `/moo-council` / `effort: beast` | intenção do user | override |

**Regra:** `CAS ≥ limiar` **E** `budget permite (quota guard)` → convoca. Senão, single model normal. O limiar é **adaptativo via Pastor**. Transparência obrigatória: `mooter explain` e a statusline mostram *porquê* o council disparou (ex.: `🏛 council: T3 deploy floor + low confidence`).

> ⚠️ **Anti-overfire:** por defeito o CAS é conservador. Disparar council de mais é o pior fracasso de produto (custo + latência sem ganho). O Pastor é treinado para *subir* o limiar quando o council não muda o veredicto vs o single-model.

---

## Parte 4 — Composição: diversidade > redundância

Council Mode + MoM dizem o mesmo: a **heterogeneidade** (modelos de famílias/treinos diferentes) é o que mata erros correlacionados. Logo o Mooter **nunca** monta 3× o mesmo modelo — monta 3–5 *assentos* de famílias distintas:

| Assento | Modelo típico | Papel | Custo |
|---|---|---|---|
| 1 (âncora) | **qwen3:30b local** | membro + privacidade + diversidade | grátis |
| 2 | **Haiku** | membro rápido, treino diferente | baixo |
| 3 | **Sonnet** | membro forte | médio |
| (4–5, só CAS alto) | 2º local distinto / Sonnet | mais variância cognitiva | grátis/médio |
| **Juiz / sintetizador** | **Opus** (fora do conselho) | adjudica, **não vota** | ~$0,30 |

Regras de composição (novo `decideCouncil`, que reusa `decideAgent` por assento com restrição de diversidade + cap de budget):

- **Juiz fora do conselho** → evita o *self-preference bias* que o paper avisa (um modelo a julgar-se a si próprio).
- **Nº ímpar de membros** → desempate limpo no protocolo de voto.
- **Tamanho escala com o CAS** (3 moderado, 5 alto risco).
- **Fable NUNCA automático** — invariante T5 opt-in; só entra com `@fable` explícito.
- **≥1 assento local sempre** → council de alto risco continua possível **100% offline** (mercado NDA/HIPAA/SOC2, igual à tese do dynamic-workflow local).

---

## Parte 5 — Dois modos: opiniões vs implementações

### 5a. Advisory Council (respostas / análise)
Para Q&A, audits, decisões de arquitetura. Membros respondem em paralelo (`fanOut`), depois síntese de consenso. Veredicto = **output em 4 secções** (Parte 6).

### 5b. Builder Council (código que tem de correr) — *o diferencial que só o Mooter consegue*
Cada membro implementa a mudança na **sua própria worktree git isolada** (`worktree-conductor`), em paralelo. Depois o juiz **corre os testes em cada worktree**, compara diffs, e ou escolhe o vencedor ou faz merge das melhores partes. As worktrees perdedoras são limpas (cleanup do conductor).

> **Isto é "implementações concorrentes adjudicadas por testes" — ground truth objetivo (testes passam/falham), não vibes.** Ninguém mais tem isolamento por worktree ligado a um router. É a feature que faz a Anthropic levantar a sobrancelha.

---

## Parte 6 — Protocolo de deliberação

```
Fase 0 — Triage         classify.js + decideCouncil (host-side, ~0 custo)
            │            CAS ≥ limiar & budget OK? ───── não ──► single model (fim)
            ▼ sim
Fase 1 — Geração         membros respondem/implementam EM PARALELO, sem cross-talk
            │            (preserva diversidade; evita anchoring/groupthink)
            ▼
Fase 2 — Cross-exam      reviewer.ts: cada membro vê as respostas anónimas dos
            │            outros e pode rever ou refutar.
            │            ADAPTIVE STOPPING: já há consenso na ronda 1? salta ──┐
            ▼            (máx. 2 rondas)                                        │
Fase 3 — Veredicto  ◄─────────────────────────────────────────────────────────┘
            │   Advisory → Opus sintetiza em 4 secções honestas:
            │        ① Consenso   ② Discórdias   ③ Achados únicos   ④ Recomendação
            │        + confiança + minority report (quem discordou e porquê)
            │   Builder  → os TESTES são o juiz; vencedor = passa testes + melhor
            │              diff (rubric Opus desempata entre os que passam)
            ▼
Fase 4 — Persistir       hub D1 (features only, no content, k-anon) + vault ledger
                         → Pastor aprende quem acertou, se o council mudou o veredicto
```

A estrutura de 4 secções **é** a Doctrine V4 §5 (no fabrication): o council **expõe a discórdia em vez de fabricar concordância**. É incerteza calibrada, não falsa confiança — exatamente a propriedade que o `coverage_note` do `decideAgent` já tem, agora elevada à camada de raciocínio.

---

## Parte 7 — Custo e guardrails (founder-honest)

| Item | Mecanismo | Resultado |
|---|---|---|
| Assentos locais | Ollama RTX 4090 | **$0** |
| Assentos cloud | contam na quota da subscrição | quota guard recusa convocar se estoura |
| Adaptive stopping | para na ronda 1 se há consenso | pagas 1 ronda, não 2 |
| TES por assento | `decideAgent` governa cada cadeira | sem fabricação; melhor valor por cadeira |
| Latência 2–3× | só dispara no prompt raro de alto risco; Builder corre em background (worktrees, resume cross-session) | não bloqueia o fluxo normal |
| Transparência | statusline + `mooter explain` | `🏛 council 5-seat · $0,31 · vs all-Opus $2,40 (saved 87%)` |

Custo típico de um Advisory Council 5-seat: **~$0,30–0,45** (Haiku + Sonnet + síntese Opus; 2 assentos locais grátis) vs **$2–4** num council all-frontier do paper. Redução ~85–90%.

---

## Parte 8 — Por que a Anthropic fica impressionada (o ângulo honesto)

1. **Honestidade / calibração**: o veredicto separa estruturalmente consenso de discórdia, com minority report. Bate direto no rubric de honesty/calibration do showcase (`docs/strategy/ANTHROPIC_SHOWCASE_RUBRIC_V2.md`).
2. **Segurança em ações de risco**: deploy/secrets/migrations **auto-convocam** um conselho diverso antes da ação perigosa. Uma migration revista por 5 modelos diversos com dissidência exposta é um agente **genuinamente mais seguro** — defesa em profundidade.
3. **Custo transparente**: council local-first faz a deliberação de alto risco custar cêntimos, e o statusline prova-o. Inverte o "15× tokens" da própria Anthropic.
4. **Aprende (não decora)**: Pastor fecha o loop — ao longo do tempo dispara *menos* vezes, escolhe o council de melhor valor por categoria, e eventualmente **destila** o veredicto (NSED: pequenos igualam grandes). "Local-first. Learns forever" — literalmente.
5. **Privacy market**: deliberação de alto risco 100% offline (quórum local) para codebases NDA/HIPAA/SOC2/legal.

**One-liner showcase:** *"Mooter já roteia por custo. O Council roteia por confiança. Quando um modelo não chega, convoca um conselho heterogéneo local-first, delibera com adaptive stopping, e devolve um veredicto que mostra a discórdia. Para código, os membros competem em worktrees isoladas e os testes escolhem o vencedor. Cêntimos, não o N×frontier. E o Pastor aprende a convocá-lo cada vez menos."*

---

## Parte 9 — Fit com invariantes (checklist)

- ✅ `classify.js` intocado (council lê o output; sha CI-enforced preservada).
- ✅ Novo `packages/council/` — **aditivo**, padrão das additions allowlisted da Wave 58.
- ✅ Selective git adds.
- ✅ Tier ladder respeitado: **Fable nunca auto** (T5 opt-in); Opus como juiz, não membro forçado.
- ✅ Builder council usa `worktree-conductor` existente (sem nova primitiva de isolamento).
- ✅ Sem novo `.md` na raiz (este vive em `docs/strategy/`).
- ⚠️ Verificar antes de codar: nomes/exports reais de `vote()`/`converge()` em `packages/workflow` e a assinatura de `reviewer.ts` — o recon confirmou que existem, mas a assinatura exata tem de ser lida no Day 0.

---

## Parte 10 — Roadmap (em waves, na tua cadência)

| Wave | Âmbito | Esforço CC |
|---|---|---|
| **A — Council MVP** | `decideCouncil` + Advisory Council no workflow runtime; CAS a partir de `confidence` + `@council` explícito; veredicto 4-secções; chip statusline; CLI `mooter council "<prompt>"` + `/moo-council` | ~12h |
| **B — Deliberação + auto-trigger** | ronda de cross-exam adversarial + adaptive stopping; auto-trigger nos high-risk floors (T3); telemetria hub D1 + ledger no vault | ~10h |
| **C — Builder Council** | implementações concorrentes em worktrees (`worktree-conductor`), testes-como-juiz; MCP tool `council_convene` | ~12h |
| **D — Pastor learning loop** | auto-tune do limiar CAS + melhor council por categoria + destilação do veredicto; LoRA "judge" adapter | ~10h |

**Gate honesto entre A e B:** se no MVP o council **não mudar** o veredicto vs single-model em ≥30% dos casos de alto-CAS, o CAS está mal calibrado — afinar antes de continuar (não construir B/C sobre um trigger que não ganha nada).

---

## Parte 11 — Refinamentos do 2º deep dive (design "perfeito") + correções de premissa

### 11a. Correção de premissa (do recon de assinaturas reais)
- ⚠️ **`worktree-conductor` NÃO cria worktrees.** É um *lock/lease conductor* sobre worktrees partilhadas: `acquireWithRecovery()`, `status()`, `forceRelease()`, `reap()`, `runConductor(args, opts): CmdResult`. O **Builder Council** precisa de orquestrar `git worktree add/remove` ele próprio, **usando o conductor para coordenar locks/heartbeats** (não reinventa isolamento, mas a criação da worktree é trabalho novo). Ajuste no roadmap da Wave C.
- ✅ **Descoberta que encurta tudo:** `packages/validation/src/adversarial/` **já é** o motor de deliberação. `review(target, lens, call, reviewerName?): Promise<ReviewResult>` (lenses `correctness|security|completeness|repro|doctrine`, verdict `confirm|refute|uncertain`, `confidence 0..1`) + `vote(results, opts?): VoteResult` com `score = (confirmMass − refuteMass)/total ∈ [-1,1]`, **refute ganha empates (viés adversarial)**, `convergence: CONFIRMED|REJECTED|UNCERTAIN`. O Council **reusa isto literalmente** — não escreve agregação nova.
- ✅ **Assento = `ModelSpec`** (`{ id, tier, kind:"local"|"cloud", call(prompt):Promise<CallOutcome> }`) via `makeOllamaModel(id,tier,opts)` (custo $0) e `makeAnthropicModel(id,tier,opts)` (custo calculado). `parallel(items, fn, {concurrency})` corre os assentos; `decideAgent` escolhe cada um.

### 11b. Agregação: NÃO é majority vote (a literatura é dura nisto)
"Auditing Multi-Agent Reasoning Trees" mostra que o majority vote **colapsa o raciocínio em tallies** e descarta a minoria que às vezes tem a evidência mais forte. Logo:
- **Confidence-weighted consensus** (o `vote()` do Mooter já é) + **trace-level synthesis** (sintetizar o *raciocínio*, não só a resposta) + **minority report sempre preservado** (a secção ④ não é decorativa — é onde vive a branch minoritária com evidência).

### 11c. Conformal "act vs escalate" — a killer feature de segurança
Para ações de alto risco (deploy/secrets/migrations), o veredicto não é uma resposta — é uma **decisão calibrada**: `ACT` se a confiança agregada ≥ limiar conforme, senão **`ESCALATE` ao humano**. Baseado em *Conformal Social Choice for Safe Multi-Agent Deliberation* (linear opinion pool + split conformal). Isto transforma o Council numa **válvula de segurança calibrada** antes de ações perigosas — o ângulo que mais impressiona a Anthropic.

### 11d. Higiene do juiz (mitigação de viés, padrão de produção 2026)
- **Cross-family**: o juiz nunca julga a sua própria família (Opus não adjudica respostas Opus). Se Opus for membro, usa-se outro juiz ou rubric determinística.
- **Anonimizar + randomizar a ordem** das respostas dadas ao juiz (mata *position bias* e *self-preference*).
- **Rubric length-neutral explícita** ("conciso ≥ verboso a igual correção") — senão o juiz otimiza para comprimento.

### 11e. Builder Council: testes-como-juiz, determinístico > vibes
LLM-generated unit tests usados como juiz em Best-of-N **batem reward models treinados de 8B**. Protocolo: se a tarefa tem testes, corre-os em cada worktree (`pass-rate = utility`); se **não tem**, gera testes primeiro (um assento dedicado), depois corre. O juiz LLM (Opus) só desempata entre implementações que **já passam** os testes, com a rubric de 11d. Ground truth objetivo primeiro, vibes só no desempate.

## Apêndice — Fontes

- [Council Mode: Heterogeneous Multi-Agent Consensus, arXiv 2604.02923](https://arxiv.org/abs/2604.02923)
- [Mixture-of-Models / N-Way Self-Evaluating Deliberation, arXiv 2601.16863](https://arxiv.org/pdf/2601.16863)
- [Multi-Agent Debate for LLM Judges w/ Adaptive Stability, arXiv 2510.12697](https://arxiv.org/html/2510.12697v1)
- [iMAD: Intelligent Multi-Agent Debate, arXiv 2511.11306](https://arxiv.org/pdf/2511.11306)
- [Talk Isn't Always Cheap: Failure Modes in Multi-Agent Debate, arXiv 2509.05396](https://arxiv.org/pdf/2509.05396)
- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- **2º deep dive:** [Auditing Multi-Agent Reasoning Trees > Majority Vote (2602.09341)](https://arxiv.org/html/2602.09341v1) · [Conformal Social Choice for Safe Deliberation (2604.07667)](https://arxiv.org/html/2604.07667) · [Roundtable Policy: Confidence-Weighted Consensus (2509.16839)](https://arxiv.org/pdf/2509.16839) · [Beyond Consensus: Trace-Level Synthesis in MoA (2605.29116)](https://arxiv.org/html/2605.29116v1) · [LLM-gen unit tests as judge / Best-of-N (2502.01619)](https://arxiv.org/pdf/2502.01619) · [Assistant-Guided Mitigation of Judge Bias (2505.19176)](https://arxiv.org/pdf/2505.19176)
- Internos: `docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md`, `packages/router/src/decide-agent.ts`, `packages/validation/src/adversarial/`, `docs/strategy/PASTOR.md`, `CLAUDE.md` (invariantes)

*Pre-decision draft. A assinatura exata das primitivas (`vote`/`converge`/`reviewer`) deve ser confirmada no Day 0 antes de codar.*
