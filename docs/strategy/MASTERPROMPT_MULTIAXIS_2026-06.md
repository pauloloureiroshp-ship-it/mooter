# MASTER PROMPT — Mooter Multi-Axis Token Economy (arco Waves 60.5 → 64) · **v2**

> **Para:** Claude Code (ultracode, dangerous-autonomous, **worktree isolado**).
> **De:** Paulo (composto no Cowork 2026-06-14). **Estado do mundo:** v1.39.0 / Wave 59A SHIPPED.
> **v2 (2026-06-14):** + Wave 62.5 (Local-First Confidence Cascade) + Wave 64 (Compaction Advisor).
> **Fonte da verdade desta missão:** `docs/strategy/TOKEN_ECONOMY_SOTA_GAP_2026-06.md` (gaps),
> `WAVE61_GRAPHIFY_ARCHITECTURE.md` (eixo contexto), `TRENDS_2026-06_ROADMAP_FIT.md`.
> **Como usar:** lê tudo, faz **Day-0 recon** de cada wave ANTES de codar, refuta as minhas
> premissas se o repo discordar (honest > brief), e shipa **uma wave de cada vez** com gate.

---

## 0. Missão (porque isto existe)

O Mooter é hoje um router de **1 eixo** (tier/modelo). O deep research SOTA (2025-2026) mostrou
que o token economy tem **4 eixos** e nós só dominamos 1:

| Eixo | Mooter | Esta missão |
|---|---|---|
| 1. Tier/modelo | ✅ core | manter intacto |
| 2. **Reasoning/output** | ❌ | **Wave 60.5 (GAP 1)** — maior ROI |
| 3. Contexto/input | 🟡 | **Wave 61 (GAP 3+4)** |
| 4. **Cache/continuidade** | ❌ | **Wave 60 (GAP 2)** |
| 5. **Execução (cascata de confiança)** | ❌ | **Wave 62.5** — local grátis tria, escala só o difícil |
| 6. **Ciclo de vida do contexto** | ❌ | **Wave 64 (Compaction Advisor)** — diferenciador |

**Objectivo:** tornar o Mooter um router **multi-eixo** — tier × reasoning-effort ×
context-budget × cache-affinity — **tudo do mesmo classificador determinístico zero-LLM**, para
que o vibe coder tenha sempre o estado-da-arte sem estudar nada. **Sem quebrar nada.**

---

## 1. INVARIANTES DUROS — quebrar qualquer um destes = FALHA da wave

1. **`tools/router/classify.js` é FROZEN.** sha256 CI-enforced =
   `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
   Verifica a sha **antes da 1ª linha e depois da última** de cada wave. Nunca editar.
2. **Engine packages `packages/*` (waves 28-34.5) FROZEN.** Só são permitidas **ADIÇÕES de
   ficheiros NOVOS** a `packages/router/src/`. Nenhum ficheiro engine existente é modificado.
   Confirma o allowlist da wave no `CLAUDE.md` antes de criar ficheiros.
3. **NO-PROXY.** O Mooter nunca se senta no caminho do pedido. Tudo o que esta missão adiciona é
   **anotação host-side ao `router-hint`** + **ficheiros novos** + **packs**. Zero leitura de
   KV-cache de engine, zero interceptação de request.
4. **Zero LLM na decisão.** A classificação continua regex determinística <50ms. O reasoning-effort
   **deriva** de sinais já calculados (`task_category`, complexity, risk) — não chama modelo.
5. **Doctrine > optimizador.** Alto risco (deploy/secrets/migrations/architecture) escala SEMPRE.
   O reasoning-effort desses é `high`; o context-budget desses nunca é cortado em HIGH_RISK.
6. **Statusline default byte-idêntica.** Qualquer chip novo é opt-in self-gating. Teste de
   não-regressão obrigatório: sem opt-in → output idêntico ao actual.
7. **Selective git add only** — nunca `git add -A`. Stage exactamente os ficheiros que mudaste.
8. **No new root `.md`.** Docs novos vão para `docs/strategy/` ou `docs/`.
9. **PT-PT em conversa, English em código/identificadores.**

---

## 2. PROTOCOLO DE SEGURANÇA (executar em cada wave)

**Day-0 recon (antes de codar):**
- Lê os ficheiros-âncora reais da wave. **Refuta** premissas deste prompt que o repo contradiga e
  regista em `docs/strategy/REFUTATIONS_LOG.md`. Escreve `docs/strategy/WAVE<N>_DAY0_RECON.md`.
- Confirma a sha do `classify.js`. Confirma que os ficheiros que vais criar são adições.

**Durante:**
- Commits **atómicos**, um por bloco, mensagem clara. `npm install` em `packages/cli` **e**
  `packages/router` num worktree fresco antes de testar.
- Cada bloco com teste (≥1). Gate de não-regressão: suite verde + statusline default intacta.

**Gate de fim de wave:**
- Subagente **final-reviewer (Opus)** revê o diff. Só shipa com **0-HIGH**. Corrige HIGH/MED in-wave.
- Re-verifica sha do `classify.js`. Diff confinado ao allowlist.
- **Tag e merge gated em Paulo** (eu crio beta tag, Paulo aplica a final). Atualiza handoff (§6).

---

## 3. PROTOCOLO WORKTREE (isolamento físico)

```
# 1. worktree dedicado por wave (NUNCA trabalhar no working-tree principal de ~/frugal)
git worktree add ../mooter-wave60_5 -b wave60_5-reasoning-axis
cd ../mooter-wave60_5
npm --prefix packages/cli install && npm --prefix packages/router install

# 2. lock conductor (evita corrida com outras sessões/máquinas)
mooter conductor lock packages/router --intent "wave60_5 reasoning axis"

# 3. ... trabalho + commits atómicos ...

# 4. fim: unlock, push branch, abrir PR (gated Paulo merge+tag)
mooter conductor unlock packages/router
```
- Uma wave = um worktree = uma branch. Waves independentes podem correr em worktrees paralelos
  (4090/Mac), mas **cada uma com o seu lock**. ⚠️ o sandbox de spawn rebenta no Windows (sem bwrap)
  — corre os worktrees no Mac/WSL2 se quiseres paralelismo real.
- No fim, `git worktree remove` só depois do merge.

---

## 4. ARCO DE EXECUÇÃO — uma wave de cada vez, gate entre cada

### 🔥 WAVE 60.5 — Reasoning-Effort Axis (GAP 1) · **PRIMEIRO, maior ROI**

**Tese:** os reasoning/thinking tokens dominam o custo e variam 5–25× **dentro do mesmo tier**.
Emitir um `reasoning_effort` por tarefa é o 2º output natural do classificador. 30–55% de poupança
medida na literatura (Route-to-Reason/Ares/SynapseRoute). **Não viola nada.**

**Âncoras (Day-0, ler primeiro):** `packages/router/src/classify_complexity.ts`,
`task-categories.ts`, `tools/router/inject_context.js` (pipeline de mutação de `decision`, camada
`adapter_selection` ≈L1056-1067 = template; `lines.push` antes de `stdout.write` ≈L1432).

**Blocos:**
- **A** `tools/router/reasoning-effort.js` (NOVO, host-side): função pura
  `reasoningEffort(decision) → 'none'|'low'|'medium'|'high'`. Deriva de `task_category` + complexity
  + risk. HIGH_RISK/deploy/secrets/architecture → `high`; trivial/T0 → `none|low`; default `medium`.
  Etiquetas **semânticas** (estáveis Anthropic/OpenAI/Gemini), não contagens de tokens.
- **B** `inject_context.js`: anexa `<reasoning-effort>LEVEL</reasoning-effort>` ao `router-hint`
  (mesmo padrão do `adapter_selection`). Best-effort try/catch: se o módulo falhar, **omite** →
  hint byte-idêntico ao actual. ⚠️ **NUNCA** apertar `max_tokens` (trunca reasoning models e paga
  o thinking na mesma) — o knob é só o effort.
- **C** `mooter explain reasoning` (CLI) + chip opt-in `🧠eff` self-gating (default off).
- **D** docs: `docs/ux/REASONING_EFFORT.md` (mapa categoria→effort + porquê).

**DoD:** mapping testado (HIGH_RISK→high; trivial→low); hint default byte-idêntico sem o módulo;
sha classify.js intacta; final-reviewer 0-HIGH. **Tag β:** `v1.40.0-reasoning-axis`.

---

### 🔥 WAVE 60 — Cache-Aware Cost + Roster + HW-aware T0 (GAP 2 + trends 3/4)

**Tese:** trocar de tier/provider mid-sessão **quebra o prefixo cacheado** (cache read 0.10× →
write 1.25×). O `decide-agent` sobrestima hoje a poupança de saltar de tier. + roster local stale.

**Âncoras:** `packages/router/src/decide-agent.ts` (FROZEN — envolver, não editar),
`tools/router/savings-tracker.js`, `model-manager.js`, `gpu-probe.js`/`hw-capability.json`.

**Blocos:**
- **A** `packages/router/src/cache-aware-cost.ts` (NOVO): wrapper que ajusta o custo estimado com
  o **switching cost** (perder cache quente + write 1.25× no novo backend). Nunca edita decide-agent.
- **B** session affinity host-side em `inject_context.js`: regista o moo escolhido por sessão;
  prefere-o salvo razão forte. Determinístico, **zero leitura de KV do engine**.
- **C** roster: `qwen2.5:*` → `qwen3-coder-next` / `qwen3-30b` no `model-manager.js`.
  ⚠️ confirmar disponibilidade no Ollama no Day-0 antes de hardcodar.
- **D** HW-aware T0: módulo host-side lê `hw-capability.json` e enviesa T0 ao melhor modelo que
  cabe na VRAM (dentro do guardrail de tier). Expõe `mooter models`.

**DoD:** cost function testada com cenário de switch; roster confirmado live; sha intacta;
final-reviewer 0-HIGH. **Tag β:** `v1.41.0-cache-aware-hw`.

---

### 🔥 WAVE 61 — Graph-Aware + Repomap + Context-Budget (GAP 3 + 4)

**Tese:** eixo contexto. Concretiza o brief `WAVE61_GRAPHIFY_ARCHITECTURE.md` com o padrão **aider
repomap** (tree-sitter + PageRank + budget binary-search, host-side zero-LLM) + context-budget por
tier. Context rot: ~300 tokens focados batem 113k (≈375× menos, melhor accuracy).

**Execução:** seguir os 7 blocos do brief Graphify (pack `code-graph`, `graph-context-bridge.js`,
camada `graph-context.js`, `graph-aware-decide.ts` NOVO, savings `advisory`, chip 🕸, MCP coexist).
**+ GAP 4:** o `graph-context.js` define o **orçamento de contexto por tier** (T0 cru / T3
destilado). MVP de valor = 61.0 Day-0 → 61.A → 61.B. Ver brief para detalhe completo.

**DoD:** schema real do `graph.json` fixado no Day-0; poupança classificada `advisory` (nunca
guaranteed); "71×" nunca usado como típico; sha intacta. **Tag β:** `v1.42.0-graph-aware`.

---

### 🔥 WAVE 62.5 — Local-First Confidence Cascade · **nova estratégia (v2), grande ROI**

**Tese:** o padrão dominante de 2026 é correr **60–80% local** e escalar só os **20–40% difíceis**
para cloud — decidido pela **confiança do modelo local**, não por classificação estática. O moo
local (grátis) serve de **rascunho/triagem**: gera um draft + sinal de confiança; alta confiança →
fica local; baixa → escala. Medido: UCCI **−31% custo** a F1 0.91; confidence routing **−48%**
chamadas ao modelo forte; OpenClaw **69–86%** poupança. [MEDIDO]

**Doutrina (importante):** **NÃO toca no `classify.js`** — o classificador continua determinístico
zero-LLM para o *tier*. Isto é um **modo de EXECUÇÃO opt-in** por cima: para tarefas T0/T1-borderline,
o moo local produz um draft + **confiança** (mean log-prob normalizado para [0,1] / self-consistency
leve), e o Mooter emite hint *"fica local"* ou *"escala T2/T3"*. **No-proxy:** a confiança local é
**sinal de routing**, não proxy de cloud (o CC continua a fazer a chamada). Para os loops agênticos
do Mooter (`spawn-orchestrator`/workflow) pode fazer **cascata completa** (controlamos o loop).

**Âncoras (Day-0):** Option-A (Ollama precompute — já existe), `router-execute.js`,
`decide-agent.ts` (FROZEN — envolver). Reusa o eixo reasoning (Wave 60.5): confiança baixa pode
emparelhar com `reasoning_effort: high` na escalada.

**Blocos:** **A** probe de confiança local (`confidence-probe.js` host-side: mean-logprob /
consistência leve → score). **B** hint de escalada no `router-hint`. **C** `savings-tracker`:
medir **escaladas evitadas** (local resolveu) vs justificadas. **D** opt-in + calibração via
auto-learning. ⚠️ **Nunca** em HIGH_RISK (já são T3 forçado); confiança mal-calibrada escala a mais
ou a menos → threshold por percentil + auto-learning.

**DoD:** probe testado; escalada nunca em HIGH_RISK; sha intacta; final-reviewer 0-HIGH.
**Tag β:** `v1.43.0-confidence-cascade`.

---

### 🟡 WAVE 63 — Guardrails baratos (GAP 5 + 6) · quando houver folga

- **GAP 5** guardrail anti-compressão para `code_generation` denso no `prompt-optimizer.js`
  (a literatura diz que código é o caso sensível; hoje cobre architecture/cross-file, não code-gen).
- **GAP 6** política determinística de tool-result compression (classify-style: que results são
  descartáveis por categoria) a informar o `/compact` do host.

---

### 🔥 WAVE 64 — Compaction Advisor (eixo: ciclo de vida do contexto) · **diferenciador**

**Tese:** compactar o contexto no **momento óptimo** (fronteira de tarefa, cache-aware), não esperar
o auto-compact de emergência. Ninguém junta detecção de fronteira semântica + timing cache-aware +
decisão local determinística. **Spec completa:** `docs/strategy/COMPACTION_ADVISOR_DESIGN_2026-06.md`.

**⚠️ Realidade de plataforma:** disparar `/compact` por hook é **impossível hoje** (issue #58538
fechada). Logo, Fases 0–3 entregam valor **sem** auto-trigger; a Fase 4 é "pronto-a-ligar".

**Faseamento:**
- **Fase 0 (quick-win, pode correr JÁ, em paralelo com tudo):** `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
  mais baixo (ex.: 70 — ⚠️ confirmar a env var no Day-0) + `PreCompact` hook que faz snapshot
  priorizado ("previously on"). Zero build de motor.
- **Fase 1:** advisor determinístico — gate Estágio 1 (transição de categoria `classify.js` + ficheiros
  em foco + commit/test-pass/PR + gap temporal) + escada de pressão (tokens da API) + chip 🪶 + nudge.
- **Fase 2:** detector local — embedding drift (Ollama, threshold por **percentil da sessão**) +
  qwen3 árbitro SAME/NEW só na zona cinzenta.
- **Fase 3:** gate cache-aware (TTL 5min / user-away).
- **Fase 4:** auto-trigger (quando #58538 shipar). **Paralelo:** tool `compact_context` nos
  subagentes do `spawn-orchestrator` (já possível).

**DoD (Fase 1):** advisor não regride statusline default; snapshot restaurável; sha intacta.
**Tag β:** `v1.44.0-compaction-advisor`.

---

## 5. NÃO FAZER (anti-padrões com razão)

- ❌ Mecanismos de cache (RadixAttention, vLLM APC, prefix-aware routers, KV stores) — são proxy.
  Adoptamos só a **ideia de custo** (Wave 60), nunca o mecanismo.
- ❌ Compaction própria — o host já faz; replicar = proxy. Só **antecipar** a compaction.
- ❌ Semantic **response** cache por default — risco de proxy + false positives caros em código.
  Se entrar, opt-in/local/por-prompt. (≠ Pastor, que cacheia decisões.)
- ❌ Vender EAGLE-3/TurboQuant/spec-decode como "poupança de tokens" — operam em compute/latência,
  e em consumer single-user MoE A3B **não dão net speedup** (medido). Rebaixar a experimental.
- ❌ `git add -A` · editar ficheiros frozen · apertar `max_tokens` em reasoning models · chips on-by-default.

---

## 6. HANDOFF (no fim de cada wave — handoff perfeito)

1. **`SYNC.md`** — nova entrada no topo, formato das existentes:
   `### 🐮 Sessão — <data> (Wave <N> — <tema> · **SHIPPED/PR**)` com: Estado, Entregue, Day-0
   refutações, Doutrina (sha intacta + allowlist), Gates (testes), Tag, Próxima missão (Paulo).
2. **Notion** — sub-página sob o backlog
   [🔮 Backlog Futuro 2026-06-14](https://app.notion.com/p/37f6f6e42bc48146a7ddeae3d3aa996e):
   resumo + tag + link do PR.
3. **Tag** — eu (CC) crio a β tag; **Paulo aplica a final** + merge.
4. **`/mooter-update`** se tocaste em `tools/router/` (sincroniza runtime para `~/.claude/`).
5. **Report** — `docs/strategy/WAVE<N>_REPORT.md` com DoD checklist.

---

## 7. KICKOFF — primeiras acções (Wave 60.5)

```
1. git worktree add ../mooter-wave60_5 -b wave60_5-reasoning-axis && cd ../mooter-wave60_5
2. npm --prefix packages/cli install && npm --prefix packages/router install
3. shasum -a 256 tools/router/classify.js   # == 427d8c0b…364bc48f ?
4. Ler: classify_complexity.ts · task-categories.ts · inject_context.js (camada adapter_selection)
5. Escrever docs/strategy/WAVE60_5_DAY0_RECON.md (refutar premissas se o repo discordar)
6. Bloco A → teste → commit atómico. Repetir B, C, D.
7. final-reviewer (Opus) → 0-HIGH → re-check sha → handoff §6 → tag β v1.40.0-reasoning-axis (gated Paulo)
```

**Quick-win em paralelo (sem worktree, zero risco):** aplica já a **Fase 0 da Wave 64** —
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` mais baixo + `PreCompact` snapshot. Não bloqueia nada e dá ganho
imediato enquanto a Wave 60.5 corre.

**Sequência recomendada:** 60.5 → 60 → 61 → 62.5 → 63 → 64 (Fase 0 de 64 pode ir já). Cada wave é
shippável e gated isoladamente; nunca encadear duas sem o gate final-reviewer entre elas.

**Lembra-te:** honest > brief. Se o Day-0 mostrar que uma premissa minha está errada, **refuta e
regista** — é exactamente assim que as waves anteriores ganharam qualidade. Faz um trabalho
incrível, e seguro. 🐮
