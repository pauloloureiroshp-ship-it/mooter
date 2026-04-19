# Mooter.ai — Performance Master Prompt

> **Âmbito:** só melhorias que aumentem a performance do Mooter.ai enquanto produto. Zero vault/Obsidian/Graphify no runtime. Zero alteração que quebre a filosofia "hint layer, não proxy".
>
> **Criado:** 2026-04-19 — Paulo + Claude (Opus, T3 arq.)
>
> **Pré-requisitos validados:** este prompt só arranca depois de passar a secção 0 (Context Validation).

---

## 0. CONTEXT VALIDATION — o que eu confirmei antes de escrever isto

Li o HQ Notion (`33d6f6e42bc4816b977afe84bbe912c9`), `SYNC.md`, `ROADMAP_MASTER_V2.md` (até linha 250), e inspeccionei `tools/router/` no disco. Resumo do que foi verificado:

**Já existe (não duplicar):**

- Arbiter Haiku semantic em `arbiter.js` (333 LOC) — ~17% dos prompts, ~$0.27/mês
- Backtest nocturno auto-learning em `backtest.js` (772 LOC) — patches `classify.js` idempotente
- Gold-labels (~60-72 entradas), validation-set.test.js (72/72 green)
- Shadow mode, per-user-profile.json, implicit signals (187), ground-truth oracle, KNN similarity com `nomic-embed-text` — **módulos separados**
- Prompt optimizer (Sprint 5-A)
- Adversarial generator (AI tests AI)
- Hub federated layer: `hub-push.js`, `hub-pull.js`, `aggregate-deltas.js`
- A/B tests, Sentry, Zod env validation, coverage 70%, CCA 87/100
- `anthropic_call.sh` como wrapper Bash para chamadas Anthropic (usado pelo arbiter)

**Lacunas confirmadas por grep/inspecção (onde o ganho está):**

| Lacuna | Evidência | Implicação |
|---|---|---|
| **Prompt caching zero** | `grep cache_control\|ephemeral` em `hub/` + `tools/router/` → 0 matches | Arbiter Haiku gasta ~$0.27/mês onde devia gastar $0.03 (90% discount em cached reads) |
| **Sprint B desconectado do classify** | `grep user_profile\|per_user\|implicit\|ground_truth\|shadow_mode` em `classify.js` → 0 matches | Os sinais Sprint B (que existem!) nunca chegam à decisão de tier — são visualizados mas não consumidos |
| **classify.js inchado** | 1029 LOC (era 700 na doc HQ) | Mudanças regridem cada vez mais lentas; cada nova regra add-cost cresce |
| **Backtest batch oportunidade** | `anthropic_call.sh` síncrono | Jobs nocturnos qualificam para **Batch API** (50% desconto) |
| **Confidence threshold único** | `classify.js` usa limiar 0.75 flat para arbiter | Categorias (debug, code, creative) têm ruído diferente — ganha-se accuracy com thresholds por categoria |
| **Implicit signals baixo peso** | Não há evidência de reweighting no backtest | Correcções do user (@opus override) valem 10× mais que sinais normais e devem ser tratados como tal |

**Filosofia inegociável** (do HQ):

> "**Hint layer, não proxy.** Todo o resto (RouteLLM, LiteLLM, Portkey, Martian, NotDiamond, OpenRouter) intercepta chamadas à API. Frugal nunca o faz. Zero blast radius · Fully explainable · Auditable · Composable · Anthropic-native."

Tudo o que segue respeita esta regra: **nenhuma optimização intercepta API calls**, **nenhuma adiciona runtime obrigatório que mate o produto se cair**, **nenhuma muda licença** (produto é MIT-privado).

---

## 1. PRINCÍPIOS DE EXECUÇÃO (ler antes de qualquer tarefa)

```
REGRAS FIXAS:
1. Zero regressão de validation (88.3% GATE PASS deve manter)
2. Zero regressão de latência (p50 113ms, p95 407ms)
3. Zero regressão de CI (130/130 green)
4. Toda a feature entra atrás de feature flag (default OFF)
5. Cada tarefa tem validation script que corre antes de commit
6. Nenhuma dependência nova AGPL/GPL (produto é MIT)
7. Nenhum proxy de API — mantém-se "hint layer"
```

**Regra anti-bazuca:** não spawnar `model-architect` para mudar 10 linhas. Lê, edita, valida.

---

## 2. OPTIMIZAÇÕES — priorizadas por ROI e risco

Codificação: **B1-B10** (track B = Mooter runtime, para contraste com a proposta track A anterior que foi rejeitada).

### Tier 1 — Quick wins (fazer primeiro)

---

### B1 · Prompt caching no arbiter — ❌ ABANDONADO (2026-04-19)

**Estado:** Abandonado após inspecção em execução. Mantido aqui como lição aprendida.

**Premissa original (errada):** cachar `ARBITER_SYSTEM_PROMPT` no arbiter daria ~90% de desconto em cached reads e serviria de template para outros callsites Anthropic.

**Por que não funciona:**

1. **Threshold mínimo de Haiku 4.5 = 2048 tokens.** Sonnet/Opus são 1024. O `ARBITER_SYSTEM_PROMPT` actual é ~320 tokens. Anthropic ignora `cache_control: ephemeral` abaixo do mínimo e cobra preço cheio.
2. **Opção "bloat to 2048" (few-shot examples) dá $0.045/mês** — abaixo do signal. Não cobre o esforço de curar exemplos + risco de alterar comportamento do arbiter.
3. **Não há outros callsites Anthropic no router** — verificado por inspecção:
   - `adversarial-gen.js` → usa Ollama local (zero custo API)
   - `prompt-optimizer.js` → pure regex, zero LLM
   - `ground-truth.js` → deterministic oracle (regex + JSON parse)
   - `arbiter.js` → **o único callsite Anthropic do sistema**
4. Consequência: o suposto "template value" do B1 é zero.

**Lição arquitectural:** para o Mooter, o regime actual não tem massa crítica de chamadas Anthropic server-side (o custo LLM real está no Claude Code do user, que o Mooter não intercepta por filosofia). Optimizações de caching só fazem sentido quando/se o Mooter adicionar back-end features que façam chamadas repetidas a prompts grandes (≥ 2048 tok para Haiku).

**Substituído por B11** (abaixo) — se vier a ser justificado por dados de accuracy do arbiter.

---

### B2 · Conectar Sprint B signals ao classifier

**Problema:** `shadow_mode`, `per_user_adaptation`, `implicit_signals`, `ground_truth_oracle` foram shipped em Sprint B com feature flags ON. Módulos existem (`user-profile.json`, `ground-truth.js`, `feedback-collector.js`). Mas `grep` em `classify.js` mostra que **nenhum desses sinais é lido na decisão de tier**. É a melhor janela desperdiçada.

**Solução (conservadora):**

1. Adicionar `loadUserProfile()` no top de `classify.js` (cache 1h). Devolve `{ prefers_local: bool, avg_correction_rate: number, hardware_tier: string, budget_remaining_ratio: number }`.
2. Pós-classificação, antes de emitir `<router-hint>`, aplicar *soft adjustments*:
   - Se `prefers_local && tier === 'T1'` e `complexity < 0.5` → demote para T0.
   - Se `avg_correction_rate > 0.15 && tier < 'T2'` → promote para T2 (o user é rigoroso, vale mais accuracy).
   - Se `budget_remaining_ratio < 0.10 && tier === 'T3'` e não HIGH_RISK → demote para T2.
3. Tudo log-visible: `reasoning` do output incluir `user_profile_adjusted: true` e delta.
4. Feature flag **por ajuste**: `MOOTER_PROFILE_ADJUST_LOCAL=1`, `MOOTER_PROFILE_ADJUST_RIGOR=1`, `MOOTER_PROFILE_ADJUST_BUDGET=1`. Assim ligas 1 a 1.

**Ficheiros:** `tools/router/classify.js`, `tools/router/user-profile.js` (novo wrapper se não existir), `tools/router/inject_context.js`.

**Ganho estimado:** personalização real dos thresholds. **+5-12% accuracy** em users com perfil bem caracterizado (após 2 semanas de uso). Reduz correction rate do user, o que por sua vez enriquece o sinal de backtest. É o circuito que já está desenhado no ROADMAP mas não fechado.

**Validação:** `node tools/router/replay.js --gold-labels --profile-adjust` → accuracy ≥ 96% (baseline actual) *com* adjustments ON. `node --test tools/router/classify.test.js` continua 130/130.

**Risco:** Médio. Cada flag foi desenhada para ser togglável isoladamente. Se uma regride accuracy no replay, desliga-a sem tocar nas outras.

---

### B3 · Confidence thresholds por categoria

**Problema:** arbiter é accionado quando `confidence < 0.75` independentemente da categoria. Prompts de categoria **debug** têm distribuição de confiança diferente dos prompts **refactor** ou **creative**. Treshold flat = arbiter accionado a mais em categorias onde o regex é preciso (desperdício Haiku) e **a menos** em categorias onde não é (decisão errada).

**Solução:**

1. Em `backtest.js`, computar accuracy do regex-only por categoria usando `gold-labels.json`.
2. Cada categoria ganha um threshold calibrado: categoria onde regex-only > 92% → threshold 0.85 (menos arbiter); onde regex-only < 80% → threshold 0.65 (mais arbiter).
3. `classify.js` lê `router-tuning.json` secção nova `thresholds_by_category`.
4. `update-router.js` patch inclui a secção.

**Ficheiros:** `tools/router/classify.js`, `tools/router/backtest.js`, `tools/router/update-router.js`, `tools/router/router-tuning.json`.

**Ganho estimado:** **-10% a -25% em chamadas de arbiter** (custo Haiku) e simultaneamente **+2-5% accuracy** em categorias onde o regex é menos fiável. ROI duplo.

**Validação:** `node tools/router/backtest.js --calibrate-thresholds --dry-run` imprime tabela categoria → threshold antigo vs novo + delta accuracy projectada. Commit só se nenhuma categoria regride > 1%.

**Risco:** Baixo. `router-tuning.json` já é idempotentemente patcháveis (`update-router.js` existe). Rollback: reverter para 0.75 flat.

---

### B4 · Peso elevado para implicit signals negativos

**Problema:** quando o user faz `@opus` override depois do router ter sugerido T1 ou T2, isso é um sinal de má decisão — **gold data**. Tratado como 1 sample igual aos outros 500 positive samples do dia, perde-se no ruído. Deveria pesar 10×.

**Solução:**

1. Em `backtest.js`, secção de agregação, adicionar `sample_weight`:
   - `correction`: 10
   - `acceptance`: 1
   - `no_signal`: 0.5
2. Weighted accuracy substitui accuracy flat para efeitos de decisão de patch.
3. `feedback-collector.js` já emite event `user_correction_detected` (verificar); se não, adicionar.
4. Dashboard v2 mostra "high-signal corrections this week: N" como KPI separado.

**Ficheiros:** `tools/router/backtest.js`, `tools/router/feedback-collector.js`, `dashboard/src/` (componente de KPI).

**Ganho estimado:** convergência do auto-learning **~3x mais rápida**. Ou seja, um misrouting novo identificado na 3ª vez em vez da 30ª.

**Validação:** corre `backtest.js --weighted --dry-run` em decisions.log dos últimos 30 dias. Imprime top-10 misroutings com peso agregado; comparar com top-10 sem pesagem. Deve emergir pelo menos 1 padrão "tardio" novo.

**Risco:** Baixo. O cálculo é reversível, está confinado ao backtest.

---

### Tier 2 — Ganhos significativos, complexidade média

---

### B5 · Speculative routing (T0 paralelo ao arbiter Haiku)

**Problema:** quando confidence < 0.75, arbiter é chamado (~$0.001, ~400ms, 17% dos prompts). Mas o próprio T0 (Ollama local) pode classificar bem em muitos desses casos — só não sabemos até tentar. Ir directo ao Haiku deixa dinheiro na mesa.

**Solução:** em prompts de confidence baixa:

1. Dispara T0 (Ollama `qwen2.5-coder:14b` ou `gemma-4`) + Haiku arbiter **em paralelo**.
2. Se T0 responder primeiro E a classificação coincidir com o regex coarse → usa T0 (cost = $0).
3. Se T0 discordar OU for lento, usa Haiku.
4. Se Haiku responder primeiro (~400ms) → usa Haiku e descarta T0 (cost baixo, não há desperdício real).

**Ficheiros:** `tools/router/arbiter.js`, `tools/router/classify.js` (para o dispatch paralelo), `tools/router/ollama_call.sh`.

**Ganho estimado:** **-30% a -50% das chamadas arbiter** em machines com GPU (onde T0 é rápido). Quase zero ganho em CPU-only (T0 lento não vence Haiku). Honesto: o ganho absoluto é pequeno porque arbiter já é barato; o valor real é **provar o padrão** e tê-lo pronto se no futuro Sonnet arbiter for considerado.

**Validação:** `MOOTER_SPECULATIVE=1 node tools/router/replay.js --ambiguous-only` → accuracy ≥ Haiku baseline, latência p95 ≤ 500ms.

**Risco:** Médio. Race conditions em Ollama (já houve bugs de timeout e stderr capture — session #25). Implementar ATRÁS da callOllama patch da sessão #25 que garante keepalive + warmup.

---

### B6 · Incremental backtest (em vez de batch nocturno)

**Problema:** backtest corre às 02:00 daily. Entre 03:00 e 01:59 do dia seguinte, o router opera com tuning potencialmente desactualizado. Num dia mau de padrão novo, são 24h de degradação.

**Solução:**

1. Adicionar modo `--incremental` ao `backtest.js`. Lê apenas decisions desde o último incremental-marker.
2. Corre a cada 50 decisions novas OU 4h (o que vier primeiro) via LaunchAgent (Mac) / Task Scheduler (Windows).
3. Só emite patch se delta accuracy > 0.5pp em pelo menos 3 samples novos (evita flapping).
4. Mantém batch nocturno como "truth run" que recalibra tudo.

**Ficheiros:** `tools/router/backtest.js`, `install.sh` (adicionar LaunchAgent hourly), `install-windows.ps1`.

**Ganho estimado:** tempo médio até patch aplicado passa de ~18h para ~4h. **Convergência do auto-learning ~4x mais rápida** (sobrepõe-se parcialmente a B4 — medir juntos).

**Validação:** correr incrementais forçados por 7 dias. Comparar N de patches / semana antes e depois. Número deve subir 3-5×.

**Risco:** Baixo se o guard-rail de 3 samples + 0.5pp estiver correcto. Sem esse guard, há risco de flapping de thresholds.

---

### B7 · Anthropic Batch API para backtest/overnight jobs

**Problema:** backtest nocturno e adversarial-gen fazem chamadas sequenciais à Anthropic (Haiku para re-etiquetar, Sonnet para gerar adversários). São non-interactive, tolerantes a latência → perfeito para Batch API (50% desconto).

**Solução:**

1. Identificar chamadas batch-eligible: `backtest.js --relabel`, `adversarial-gen.js --generate`, `ground-truth.js --validate`.
2. Wrapper em `tools/router/anthropic_batch.js` que recebe N messages, envia em job batch, faz poll a cada 30s.
3. Fallback síncrono se batch API falha (não bloquear o job).
4. Refactor das 3 callsites para usar o wrapper quando `--batch-mode` está ON.

**Ficheiros:** `tools/router/anthropic_batch.js` (novo), `tools/router/backtest.js`, `tools/router/adversarial-gen.js`, `tools/router/ground-truth.js`.

**Ganho estimado:** **-50% do custo de LLM em jobs offline**. Tipicamente arbiter+backtest+adversarial somam ~$1-3/mês em produção com alguns users; com batch cai para ~$0.50-1.50.

**Validação:** `node tools/router/anthropic_batch.js --test` roda 10 prompts, compara tokens/cost reportados vs. synchronous equivalent. Save de ~50% confirmado.

**Risco:** Baixo. Fallback síncrono garante que jobs não falham se a API batch tem problema.

---

### Tier 3 — Bigger bets (fazer só depois de T1+T2 shipped e estabilizados)

---

### B8 · DSPy como *pattern discovery* offline (nunca runtime)

**Problema:** gold-labels + decisions.log geram padrões que Paulo descobre manualmente (grep + visual inspection) e codifica como novos regex em classify.js. É lento. DSPy (Stanford) *compila* classifiers a partir de exemplos. Usar DSPy **offline** (não runtime!) para **sugerir** novos regex / thresholds a partir dos dados.

**Solução:**

1. Script `tools/router/dspy-miner.py` (Python, offline only).
2. Input: `gold-labels.json` + slice recente de `decisions.log` + outcomes.
3. Output: JSON com propostas — `{ category, proposed_regex, proposed_threshold, lift_vs_current }`.
4. **Paulo (ou subagent T3) revê cada proposta antes de commit**. DSPy nunca patch directo.
5. Corre weekly via cron / manual trigger.

**Ficheiros:** `tools/router/dspy-miner.py` (novo), `tools/router/requirements.txt` (novo), `docs/DSPY_MINING_PROTOCOL.md` (novo).

**Ganho estimado:** descoberta de padrões **3-5× mais rápida**. Traduz-se em accuracy do classifier que hoje melhora ~0.5pp/semana passar a ~2pp/semana (em dados suficientes). Zero runtime impact, zero dependency no runtime do produto.

**Validação:** rodar dspy-miner contra snapshot antigo de decisions.log; confirmar que sugere pelo menos 1-2 dos padrões que Paulo adicionou manualmente nos últimos 30 dias. Se sim, a ferramenta é útil.

**Risco:** Baixo — **tool offline, não toca runtime**. Python e DSPy podem ficar em dev-only requirements; utilizadores finais do Mooter nunca instalam nada disto.

---

### B9 · Refactor de classify.js (1029 LOC → 3-4 módulos)

**Problema:** classify.js está em 1029 linhas. Cresceu de ~700 LOC (Notion HQ) → 1029 LOC em ~2 semanas. Cada nova regra é mais lenta de adicionar; testes falham com conflitos contextuais; a mente mantém um overhead crescente para tocar no ficheiro.

**Solução (sem mudar comportamento externo):**

1. Dividir em:
   - `classify/patterns.js` — todas as regex (HIGH_RISK, MED_RISK, DEBUG_RE, etc)
   - `classify/features.js` — extracção de features (tokens count, entropy, path refs)
   - `classify/scoring.js` — scoring + threshold logic
   - `classify/index.js` — orquestração + API pública (mantém a mesma assinatura externa)
2. `classify.test.js` corre sem mudanças (zero alteração pública).
3. Fazer num único commit com diff grande mas comportamento 100% preservado.

**Ficheiros:** `tools/router/classify.js` → `tools/router/classify/*.js`.

**Ganho estimado:** tempo para adicionar nova regra cai ~50%. Velocity directa de Paulo nas próximas semanas. Não há ganho mensurável para o utilizador final imediato — é infra-ganho.

**Validação:** `node --test` passa 130/130 antes e depois. `node tools/router/replay.js --gold-labels` → accuracy idêntica (≤ 0.1pp delta — tolerância de flutuação float).

**Risco:** Médio-Alto (é refactor wide, e por definição força T3). Mitigação: commit único, branch dedicada, final-reviewer Opus ANTES de merge.

---

### B10 · LLM observability dedicada (Langfuse self-hosted)

**Problema:** Sentry captura errors + performance. Mas não é feito para LLM: não vê a distinção entre input/output tokens, não faz trace hierárquico de arbiter → classifier → backtest, não agrega custo por user/tier. Para um produto cuja promessa é "transparência de custos", dá jeito.

**Solução:**

1. Instalar Langfuse self-hosted em Cloudflare Worker ou Docker-on-VPS (não depender de cloud pago).
2. SDK no arbiter.js + anthropic_call.sh: cada chamada emite trace `{prompt_hash, model, input_tokens, output_tokens, cached_tokens, cost_usd, latency_ms, parent_trace_id}`.
3. Dashboards: cost-over-time por tier, cache-hit-rate, p95 latency por modelo, drift detection.
4. **Opt-in telemetry** do utilizador (privacy-first — padrão off, dashboard diz "ligar para partilhar dados com o Paulo, ver valor agregado community").

**Ficheiros:** `tools/router/langfuse-client.js` (novo), `tools/router/arbiter.js`, `tools/router/anthropic_call.sh`, `docs/TELEMETRY_OPTIN.md` (novo).

**Ganho estimado:** **visibilidade**, não redução directa de custo. Mas visibilidade habilita decisões informadas — as optimizações B1-B7 ficam mensuráveis em vez de acreditadas. É multiplier de todas as outras. Assume que Sentry fica para errors, Langfuse para LLM-ops.

**Validação:** após 7 dias de uso com telemetry ON, dashboard mostra: 10+ traces, p95 latency por tier, cache hit rate do B1.

**Risco:** Médio. Langfuse requer Postgres — overhead operacional. Alternativa mais leve: escrever JSONL append-only + mini dashboard em HTML que já existe (`dashboard/`). Decidir no início da fase.

---

### B11 · Arbiter few-shot calibration — ⏸️ CONDICIONAL (só se dados justificarem)

**Estado:** Não executar preemptivamente. Documentado para referência futura. Nasceu em 2026-04-19 como sub-ideia do abandonado B1 (a parte que era "accuracy" disfarçada de "caching"), mas separada para ser avaliada honestamente pelo que é: uma *melhoria de accuracy*, não uma optimização de custo.

**Trigger obrigatório para activar:** depois de B2+B3+B4 estarem em produção e com ≥ 7 dias de dados, correr análise no backtest:

```
node tools/router/analyze-arbiter-accuracy.js
  → se arbiter_accuracy < 90% em gold-labels → B11 justificado
  → se ≥ 90% → não executar, tempo dele vale mais em B5/B9
```

**Problema (se triggered):** Arbiter Haiku decide ~17% dos prompts (baixa confiança do classifier regex). O system prompt actual é instruções genéricas sem exemplos — Haiku pode estar a errar em categorias específicas (ex: "debug numérico vs math" ou "refactor grande vs pequeno") que poderiam ser corrigidas com 8-12 few-shot examples curados dos gold-labels.

**Solução (se triggered):**

1. Extrair do backtest os casos onde arbiter discordou do ground-truth (ou da decisão final pós-override do user).
2. Curar ~10 examples representativos em `tools/router/arbiter-fewshot.json` — cada um `{prompt, correct_tier, reasoning}`.
3. Injectar os examples no system prompt (não no user message — cacheable se vier a caber em 2048 tok futuramente, mas optimização é accuracy, não cache).
4. Feature flag `ARBITER_FEWSHOT_ENABLED=true` default OFF. A/B test: 50% arbiter clássico, 50% few-shot, 1 semana.
5. Critério de merge: few-shot accuracy ≥ clássico + 2pp, latency ≤ clássico + 100ms, custo ≤ clássico × 1.3.

**Ficheiros:** `tools/router/arbiter.js`, `tools/router/arbiter-fewshot.json` (novo), `tools/router/analyze-arbiter-accuracy.js` (novo).

**Ganho estimado:** se triggered e bem sucedido, +2 a +4pp accuracy no tier de 17% dos prompts → ~+0.5pp no overall. Custo extra: ~2× input tokens no arbiter (de ~320 → ~640-900 tok system prompt), mas ainda muito abaixo de 2048 então sem aliviar cache. Fica uma bet de accuracy contra custo.

**Validação:** accuracy-focused (gold-labels + adversarial), não cost-focused. Se não atingir +2pp, revert.

**Risco:** Baixo blast radius (feature flag), mas custo de tempo real (curar examples bem é trabalho humano). Só justifica se o gap de accuracy existir.

**Porque não faz parte da Sessão 1-6:** a doutrina do Mooter é "Não escales preventivamente." B11 só ganha vida se dados do backtest o pedirem. Até lá, fica em espera.

---

## 3. ORDEM DE EXECUÇÃO RECOMENDADA

```
SESSÃO 1 (T2 arq + T1 exec, ~2h)
  - B4 · Pesos em implicit signals (overrides @opus valem 10×)
  → deploy, observar 48h.
  → (B1 foi abandonado — ver secção B1. B11 só se dados justificarem.)

SESSÃO 2 (T3 arq + T2 exec, ~4h)
  - B2 · Sprint B signals no classifier (com 3 flags separadas)
  - B3 · Thresholds por categoria
  → deploy, observar 1 semana.
  → correr analyze-arbiter-accuracy.js para decidir se B11 activa.

SESSÃO 3 (T2 + T1, ~3h)
  - B6 · Incremental backtest
  - B7 · Batch API para overnight jobs
  → deploy, observar 1 semana.

SESSÃO 4 (T3, ~4h)
  - B5 · Speculative routing T0||Haiku
  → deploy cauteloso, só user-machines com GPU.

SESSÃO 5 (T3, ~6h)
  - B9 · Refactor classify.js em 4 módulos
  - (final-reviewer Opus obrigatório antes de merge)

SESSÃO 6+ (T3, quando houver folga)
  - B8 · DSPy miner offline
  - B10 · Langfuse (ou alternativa leve)
  - B11 · Arbiter few-shot (só se arbiter_accuracy < 90% nos gold-labels)
```

**Total estimado:** 6 sessões. Ganho agregado esperado:

| Eixo | Baseline | Alvo | Delta |
|---|---|---|---|
| Custo LLM-ops (arbiter + backtest + adversarial) | ~$2-3/mês | ~$0.50-1/mês | **-60% a -75%** |
| Accuracy do classifier | 88.3% overall | 92-94% | **+4-6pp** |
| Tempo para auto-learning integrar novo padrão | ~18h / manual descoberta ~dias | ~4h / descoberta ~1 dia | **~4× mais rápido** |
| p50 latency do hook | 113ms | ≤ 100ms | **-10ms** |
| LOC do classify.js | 1029 (monolito) | 4 módulos ~250 LOC cada | melhor manutenibilidade |

---

## 4. GUARDRAILS — o que NUNCA fazer neste track

1. **Nunca** interceptar chamadas API do Claude Code. Mooter continua a ser hint layer.
2. **Nunca** adicionar dependency AGPL/GPL (produto é MIT). Lista checklist: npm licence check em CI.
3. **Nunca** shippar uma feature sem feature flag default OFF.
4. **Nunca** degradar accuracy baseline (88.3%) sem rollback automático.
5. **Nunca** shippar sem `node --test tools/router/` a 130/130.
6. **Nunca** mexer no `decisions.log` schema sem migration (user data).
7. **Nunca** adicionar runtime obrigatório para utilizadores finais — tudo local, tudo opcional.

---

## 5. MASTER PROMPT PRONTO A COLAR NO CLAUDE CODE

Para cada sessão, usa este template (substitui `{BX}` pela optimização em causa):

```
Vais executar {BX} do plano em
docs/MASTER_PROMPTS/MOOTER_PERFORMANCE_MASTER_PROMPT.md

Protocolo:
1. Lê a secção 0 (Context Validation) do master prompt.
2. Confirma que as premissas ainda são verdadeiras (grep rápido).
   Se alguma falhou (ex: alguém já adicionou prompt caching), pára
   e pergunta ao Paulo.
3. Lê a entrada {BX} inteira (Problema, Solução, Ficheiros,
   Validação, Risco).
4. Tier recomendado: [T1 para B4 / T2 para B3,B6,B7 /
                     T3 para B2,B5,B8,B9,B10,B11]
5. Implementação atrás de feature flag default OFF.
6. Correr:
   - node --test tools/router/
   - node tools/router/replay.js --gold-labels
   Ambos têm de passar no mesmo estado que antes.
7. Se validation regride > 0.5pp: reverter, não commit.
8. Commit com mensagem: "perf(mooter): {BX} — <título>".
9. Actualizar SYNC.md secção "Pendentes" → {BX} shipped.
10. Criar sub-página Notion em Mooter HQ
    (33d6f6e42bc4816b977afe84bbe912c9) com log da sessão.

NÃO avances para {BX+1} na mesma sessão sem autorização.
```

---

## 6. REFERÊNCIAS INTERNAS

- `docs/MASTER_PROMPTS/ROADMAP_MASTER_V2.md` — visão estratégica, North Star, filosofia
- `docs/MASTER_PROMPTS/OVERNIGHT_AUTOTUNING_MASTER_PROMPT.md` — contexto do backtest nocturno
- `docs/MASTER_PROMPTS/PROMPT_OPTIMIZER_MASTER_PROMPT.md` — Sprint 5-A, para não duplicar
- `docs/MASTER_PROMPTS/SAVINGS_INTEGRITY_MASTER_PROMPT.md` — para manter integridade das métricas
- `docs/METHODOLOGY.md` — 730 linhas, source of truth da arquitectura
- `SYNC.md` — estado actual do projecto
- Notion HQ: https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9

## 7. REFERÊNCIAS EXTERNAS

- [Anthropic Prompt Caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — para B1
- [Anthropic Message Batches API](https://docs.claude.com/en/docs/build-with-claude/message-batches) — para B7
- [DSPy (Stanford)](https://github.com/stanfordnlp/dspy) — para B8, uso offline only
- [Langfuse](https://github.com/langfuse/langfuse) — para B10, alternativa self-hosted a Sentry para LLM-ops

---

## 8. O QUE NÃO ESTÁ NESTE PLANO (intencionalmente)

- ❌ Graphify, Obsidian vault, claude-mem, kepano/obsidian-skills — foram movidos para um *playbook pessoal* do Paulo (Track A), fora do runtime do produto.
- ❌ LLMLingua / prompt compression — overlaps com B1 (caching) e B3 (thresholds); avaliar só depois de B1+B3 estabilizados.
- ❌ Substituir o regex classifier por um LLM classifier ou pequeno modelo ONNX — viola a filosofia "Hint layer, zero blast radius, auditable". Considerado só em v3.0 segundo o ROADMAP.
- ❌ Fine-tuning próprio — referido como v3.0 Modelo Proprietário. Fora de âmbito aqui.
- ❌ Tools de terceiros que intercepta API (RouteLLM, LiteLLM, Portkey) — viola o key differentiator.
