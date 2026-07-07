# Wave 59 — Q7 Coherence Audit + Pastor v2 vs RouteLLM mini-benchmark

> Composto no Cowork 2026-06-14. Estimate **5-7h CC** (wave grande, 2 deliverables). Doctrine V4:
> `classify.js` sha `427d8c0b…` INTACTA, selective adds, **não fabricar números — web_search/medições reais**.
> ⚠️ Provável **split em 59A (coherence) + 59B (benchmark)** — são concerns distintos; decidir no Day-0.

---

## PARTE A — Q7 Coherence Audit ✅ SHIPPED v1.39.0 (PR #178, 2026-06-14)
> **Day-0 corrigiu este brief:** `savings_calc.json` NÃO existe — savings vivem no daemon `savings-tracker.js` (127.0.0.1:7821/metrics). `mooter doctor` já reconciliava calls (Wave 33.8) → foi *augment*. Entregue: `mooter doctor --coherence` (cruza calls+savings local↔hub, nomeia a causa da divergência, nunca muda exit code).

### Problema (do `STATUSLINE_AUDIT_AND_2_0_PROPOSAL.md` Q7)
Discrepância real detectada: a **statusline** mostrava `$0.00 all-time · 269 calls` enquanto a **landing prod** mostrava `$25.95 · 658 calls · 47%`. Causas prováveis: (1) sessão fresh não-synced; (2) **multi-source desalinhamento** — statusline lê `~/.mooter/savings_calc.json`, landing lê `mooter-hub` D1 `transparency_events`; (3) `MOOTER_HOME` diferente entre terminais.

### Day-0 recon (obrigatório — o mount pode estar stale)
- O que `mooter doctor` **já cobre**? A Wave 33.8 adicionou `stats-reconcile.ts` + `mooter sync --rebuild-stats` (local↔hub). **Confirmar o que já existe antes de construir** — provável que seja *augment*, não net-new.
- Mapear as **fontes de verdade** por número: savings $ / calls / % / decisions / coverage / packs → cada uma (statusline `savings_calc.json`? · CLI `decisions.log`? · dashboard hub D1? · landing ISR fetch?).
- Confirmar se a landing é a fonte all-time canónica (D1) e a statusline é per-session/local.

### Objectivo A
Um **coherence check** (estender `mooter doctor`) que cruza os números das 4 superfícies (statusline · CLI · dashboard/hub · landing) e **sinaliza divergência com a causa provável** (fresh session vs MOOTER_HOME vs source drift) — em vez de o user ver $0.00 vs $25.95 sem explicação. Honest-by-design: se divergem, dizer *porquê*.

### Entregáveis A (candidatos)
- `mooter doctor --coherence` (ou estender o doctor actual): tabela número × fonte × valor × match?/drift, com hint accionável.
- Opcional: chip/aviso na statusline quando local diverge do hub all-time (sem poluir o default byte-idêntico — opt-in).

---

## PARTE B — Pastor v2 vs RouteLLM mini-benchmark

### Day-0 recon
- **Pastor v2** vive em `packages/router/src/adaptive-learner.ts`: EWMA (`alpha 0.3`) sobre outcomes por `(model,category)`, `MIN_DATAPOINTS=5`, learned overrides, `driftReport()`. Determinístico, **zero LLM cost** (classify.js regex + matriz + EWMA). Online learner (aprende dos outcomes reais).
- Harness existente: `tools/router/backtest.js` (+ `benchmark.yml` CI, `backtest.test.js`). **Reusar, não reinventar.** Memory: Wave 30 já correu "Benchmark v2 72 calls $0.13".

### RouteLLM — o que é (web, 2026-06-14, VERIFICAR de novo antes de citar números)
- `lm-sys/RouteLLM`: framework para servir+avaliar routers; rota **binária** strong (GPT-4 Turbo) vs weak (Mixtral 8x7B). Routers: BERT classifier, matrix factorization, similarity-weighted, LLM-judge — treinados em **preference data** (Chatbot Arena). Avaliado em **MT Bench, MMLU, GSM8K**.
- `LLMRouterBench` (arXiv 2601.07206, Jan 2026): benchmark massivo (400K instâncias, 21 datasets, 33 modelos, 10 baselines). Módulos Collector/Evaluator/Adaptor. Baselines-âncora: **Oracle / BestSingle / Random**.

### ⚠️ O problema honesto da comparação (tem de estar no relatório)
**Não é apples-to-apples.** RouteLLM = binário strong/weak otimizado para qualidade-vs-custo em chat-preference. Pastor v2 = **N-tier (T0–T3+T5) × N-modelo × categoria-especializada**, local-first, otimiza minimização de tier + custo. Objectivos diferentes. Uma comparação justa **declara isto** e não finge que o Mooter "ganha" num jogo que não é o dele.

### Metodologia proposta (feasível, honesta)
1. **Dataset partilhado:** subset público de MT Bench / MMLU / GSM8K (os de RouteLLM) — fixed-split como LLMRouterBench.
2. **Correr o Pastor v2** (via `backtest.js`) nesses prompts → medir custo real + qualidade (Pass@1 onde aplicável; LLM-judge onde aberto).
3. **Âncoras (LLMRouterBench):** Oracle (upper bound), BestSingle, Random — para situar o Pastor.
4. **RouteLLM:** comparar contra os **números publicados** nos mesmos benchmarks (não reproduzir o treino — fora de scope/custo), OU correr o router deles se trivial. Citar fonte de cada número (Doctrine V4 #1 — zero fabricação).
5. **Eixo extra do Mooter:** custo $0 local (T0 Ollama) — RouteLLM não tem tier local-free; mostrar onde o Pastor poupa por rotear local.

### Entregáveis B
- `docs/strategy/PASTOR_VS_ROUTELLM_BENCH.md` — metodologia + resultados + caveats honestos + âncoras Oracle/Random.
- Dados crus (custos/scores) versionados (ex. `data/bench-59/`).
- ⚠️ **Gate humano** antes de publicar quaisquer números (revisão Paulo).

---

## Gates (ambas as partes)
- `classify.js` sha `427d8c0b…` INTACTA · engine FROZEN exceto ficheiros allowlisted no Day-0.
- Selective add. Nenhum número fabricado — cada cell com fonte/medição + `as_of`.
- final-reviewer Opus SHIP por PR.
- Custo do benchmark **medido e reportado** (como Wave 30: $0.13/72 calls) — cap antes de correr.

## Open questions (Day-0 do CC)
- Q7: `mooter doctor` actual já cobre quanto disto? (augment vs net-new).
- B: corremos o RouteLLM real ou comparamos números publicados? (recomendo publicados + âncoras — mais barato, honesto).
- Split 59A/59B? (recomendo: A é shippável sozinha e rápida; B é research-heavy).

---
**Fontes (web, 2026-06-14):**
- RouteLLM — github.com/lm-sys/routellm · lmsys.org/blog/2024-07-01-routellm
- LLMRouterBench — arxiv.org/abs/2601.07206 (Jan 2026)
- Recon local: `STATUSLINE_AUDIT_AND_2_0_PROPOSAL.md` Q7 · `packages/router/src/adaptive-learner.ts` · `tools/router/backtest.js`
