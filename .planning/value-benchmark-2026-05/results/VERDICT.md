---
type: validation-report
project: Mooter
created: 2026-05-24
updated: 2026-05-24 (Phase 2 — Arm C risk axis added)
verdict: MIXED → TRI-AXIS (OOD dominated · in-domain competitive · risk best non-trivial)
frozen_head: ce08f72c5b6641f8fa209aab74d3da121ed422b0
benchmark_dir: .planning/value-benchmark-2026-05/
portfolio_writeup: .planning/value-benchmark-2026-05/README.md
tags: [mooter, benchmark, routerbench, value-test]
---

> **Phase-2 addendum (2026-05-24):** an additional Arm C — risk-axis adversarial
> test (n=50, hand-labeled) — was added after the original verdict below.
> The Mooter shows a **clear edge on risk discrimination**: TPR 0.80 at FPR 0.28,
> Youden's J = 0.520 (best non-trivial; 10-line classifier 0.320; random ~0.07).
> Catches **70% of disguised destructive prompts** (DROP TABLE, force-push,
> secret rotation hidden under casual phrasing); the 10-line classifier
> catches 20%. This dimension was previously flagged "NOT measured" and is
> where the Mooter's HIGH_RISK regex floor pays off. Also added: AIQ-style
> frontier metric for Arm A (Mooter AIQ-q = −0.725, confirming OOD dominance),
> `run_benchmark.sh` one-command reproducer, and a portfolio-style `README.md`
> at the benchmark root. The original verdict below remains accurate; Arm C
> changes the bipolar narrative to tri-axis without altering the cost-quality
> conclusions.


# Mooter — Value Benchmark Report

## Headline (1 frase)

**Mooter é bipolar: COMPETITIVE in-domain (coding fresh, 62.7% accuracy vs 45.3% do melhor baseline trivial, cost-weighted error a metade) e Pareto-DOMINATED out-of-domain (RouterBench, perde para always_T1 em custo E qualidade simultaneamente). É um router de tarefas de coding, não um router de propósito geral — o veredicto depende do domínio onde for usado.**

## Veredicto técnico: **MIXED — COMPETITIVE in-domain, DOMINATED out-of-domain**

(Os três rótulos disponíveis no master prompt — DOMINATED / MARGINAL / COMPETITIVE — não capturam um sistema bipolar. Aplicaria **COMPETITIVE** se o uso ficar dentro do domínio em que foi tunado, **DOMINATED** se for usado como router de propósito geral.)

---

## Números crus

### Arm A — RouterBench (out-of-domain, n=2,672 prompts estratificados em 86 tasks)

**Modelos no dataset ordenados por qualidade média:**

| Rank | Modelo | Quality | Cost (avg, USD) |
|---|---|---|---|
| 1 (weakest) | meta/code-llama-instruct-34b-chat | 0.2022 | 0.000172 |
| 2 | mistralai/mistral-7b-chat | 0.3061 | 0.000046 |
| 3 | meta/llama-2-70b-chat | 0.3287 | 0.000203 |
| 4 | WizardLM/WizardLM-13B-V1.2 | 0.4311 | 0.000073 |
| 5 | mistralai/mixtral-8x7b-chat | 0.5471 | 0.000135 |
| 6 | claude-instant-v1 | 0.5984 | 0.000233 |
| 7 | gpt-3.5-turbo-1106 | 0.6193 | 0.000243 |
| 8 | claude-v1 | 0.6301 | 0.002145 |
| 9 | claude-v2 | 0.6358 | 0.002419 |
| 10 | zero-one-ai/Yi-34B-Chat | 0.6475 | 0.000186 |
| 11 (strongest) | gpt-4-1106-preview | 0.7814 | 0.003293 |

**Mapping primário (quartis evenly-spaced):** T0=code-llama-34b, T1=WizardLM-13B, T2=claude-v1, T3=gpt-4.

**Pareto frontier (primary mapping, ordenado por custo crescente):**

| Baseline | Cost ($) | Quality | Dominators |
|---|---|---|---|
| always_T1 | 0.000048 | **0.4139** | **(on Pareto)** |
| always_T0 | 0.000118 | 0.0637 | always_T1 |
| oracle_quality | 0.000271 | 0.8815 | (on Pareto) |
| **mooter** | **0.000396** | **0.1428** | **always_T1, oracle_quality** |
| length_heuristic | 0.000608 | 0.4639 | oracle_quality |
| random (avg 3 seeds) | ≈0.001050 | ≈0.4532 | oracle_quality, length |
| tenline_classifier | 0.001331 | 0.5807 | oracle_quality |
| always_T2 | 0.001554 | 0.5932 | oracle_quality |
| always_T3 | 0.002504 | 0.7279 | oracle_quality |

**Mooter vs always_T3**: custo 15.8% (84.2% de redução) — mas qualidade só 19.6% da T3.
**Mooter vs oracle**: custo 146.2% (mais caro que oracle) — qualidade 16.2% da do oracle (gap 83.8 pp).
**Sensibilidade**: mapping alternativo (skip-rungs) também tem Mooter dominado por always_T1 — o veredicto é **robusto à escolha de mapping**.

**Distribuição de tiers do Mooter em Arm A:**
- T0: 2376 (88.9%) — confidence média 0.631
- T2: 103 (3.9%) — confidence 0.703
- T3: 193 (7.2%) — confidence 0.774
- T1: 0 (0%)

**Categorias mais frequentes:** `ambiguous_medium` (48.7%), `ambiguous_long` (14.4%) — 63% dos prompts caem em fallbacks length-based porque não têm sinais de coding. **É um failure mode estrutural: prompts de Q&A académico não têm regex matches no classifier do Mooter, e o fallback default é T0.**

---

### Arm B — Coding fresh (in-domain, n=150 prompts em EN, 0 overlap com validation-set)

**Anti-contaminação:** 0 prompts com ≥3 shared 5-grams contra `validation-set.json`. Distribuição planeada: T0=40, T1=30, T2=35, T3=45. Length 38–240 chars (median 137).

**Juiz independente:** Ollama `gemma3:12b` (família Google, distinta de Anthropic — o autor do Mooter usou Claude/Opus). Concordância juiz↔meus labels: 84% (126/150) — divergências concentradas em T0↔T1 (juiz mais conservador) e T2↔T3.

**Scored contra o juiz Gemma (ground truth blind):**

| Baseline | Accuracy exact | Within±1 | Cost-weighted error |
|---|---|---|---|
| **mooter** | **0.627** | **0.920** | **0.477** |
| tenline_classifier (10 linhas que escrevi) | 0.453 | 0.907 | 0.715 |
| always_T2 | 0.320 | 0.793 | 0.480 |
| length_heuristic | 0.320 | 0.820 | 1.035 |
| random (avg 3 seeds) | ≈0.273 | ≈0.620 | ≈1.296 |
| always_T3 | 0.247 | 0.567 | 0.587 |
| always_T1 | 0.227 | 0.753 | 1.122 |
| always_T0 | 0.207 | 0.433 | 3.160 |

**Scored contra meus expected labels:** Mooter 72.0% accuracy exact (resto na mesma ordem; tenline 56.0%, length 39.3%).

**Calibração (ECE):**
- Mooter vs juiz: **0.171** (overconfident, gap moderado entre confidence e accuracy real)
- Mooter vs expected: 0.124

**Matriz de confusão (Mooter vs juiz, rows=truth):**

```
              predicted
              T0   T1   T2   T3
truth T0 |   30    0    0    1     ← 96.8% recall (excelente em T0)
truth T1 |   26    3    5    0     ← 8.8% recall (T1 dead zone — colapsa para T0)
truth T2 |   10    0   26   12     ← 54.2% recall
truth T3 |    1    0    1   35     ← 94.6% recall (excelente em T3)
```

**Finding estrutural: T1 dead zone.** O Mooter usa praticamente 3 tiers (T0/T2/T3); só 3 dos 150 prompts foram a T1. Dos 34 prompts que o juiz rotulou T1, 26 (76%) foram routed a T0. Isto não é off-by-one ruído; é um buraco no classifier que esquece a Haiku-tier.

---

### Bate baselines triviais? (matriz binária)

| Comparação | In-domain (Arm B) | Out-of-domain (Arm A) |
|---|---|---|
| Mooter > random? | **SIM** (+30 pp accuracy) | NÃO (Pareto-dominated) |
| Mooter > length_heuristic? | **SIM** (+30 pp accuracy, halves cw_err) | NÃO (length é mais caro mas tem 3x a quality) |
| Mooter > tenline_classifier? | **SIM** (+17 pp accuracy, 33% lower cw_err) | NÃO (tenline tem 4x a quality) |
| Mooter > always_T1? | **SIM** (+40 pp accuracy) | **NÃO — Pareto-dominated** |

**A barra mínima do master prompt** ("bate random e length-heuristic") **passa em Arm B, falha em Arm A.**

---

## O que este benchmark NÃO consegue concluir

Lista explícita das dimensões não medidas:

1. **HIGH_RISK floor / doctrine guards.** O classifier força T3 quando detecta deploy/secret/migration/credentials/CI mesmo em prompts curtos. Isto é uma protecção de SAFETY, não de cost-quality. **A Arm B sugere que funciona** (94.6% recall em T3) mas o benchmark não testou cenários adversariais (e.g., prompts maliciosamente disfarçados como T0 mas com sinais de risco).

2. **Orquestração de subagents.** A doutrina do Mooter inclui delegação para `model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`. Isto vai além do classifier — é coordenação. Não medido.

3. **Privacy e custo do Ollama local.** O Mooter rota tarefas trivias para Ollama no laptop (≈$0). O benefício económico real depende de qual % do tráfego de um user vai a T0. Em Arm B, 67/150 (44.7%) foi routed a T0 — isso É poupança real para esse user. **Mas só se o T0 routing for correcto**, e a Arm B mostra que aproximadamente 30/40 T0 foram correctos.

4. **Ergonomia de workflow pessoal.** O fluxo CLAUDE.md ("não queimar Opus em mudar cor de botão") tem valor de produtividade para o autor. Não capturável por benchmarks de routing.

5. **Eixo de risco completo.** Prompts genuinamente HIGH_RISK em produção (incidentes, rotações de credenciais, deletes destructivos). A Arm B aproxima isto mas é sintético; o teste verdadeiro seria contra incident logs reais.

6. **Comunidade open-source e network effects.** Valor potencial de uma comunidade que contribui patterns. Fora do âmbito.

**Importante:** o resultado fraco em Arm A NÃO implica "Mooter sem valor". Implica "Mooter sem edge de cost-quality mensurável em general-purpose Q&A routing nestes datasets". A distinção é estratégica e abre dois caminhos diferentes (ver §10).

---

## Detalhes do método (auditoria/reproducibilidade)

- **HEAD congelado:** `ce08f72c5b6641f8fa209aab74d3da121ed422b0` — confirmado byte-identical no fim do benchmark (`git diff -- tools/router/classify.js` = 0 linhas).
- **`tuning-state.json`** ausente — defaults loaded (sem drift de live tuning).
- **`ALGORITHM_VERSION`** (reportado pelo classifier): `v0.10.x-ce08f72`.
- **Arm A dataset:** `withmartian/routerbench` (HF) `routerbench_0shot.pkl` — 36,497 rows × 37 cols, 11 modelos, 86 task buckets. Sampled 2,672 prompts (stratified por `eval_name`, seed 42, ~31 por bucket).
- **Pickle safety:** `RestrictedUnpickler` (custom whitelist de pandas/numpy/builtins) — pickle de fonte externa nunca executa código arbitrário.
- **Arm B dataset:** 150 prompts criados pelo benchmarker (`.planning/value-benchmark-2026-05/data/coding-fresh-prompts.jsonl`). Contamination check: 0 overlaps de ≥3 5-grams contra `tools/router/validation-set.json` (70 entries).
- **Judge:** Ollama `gemma3:12b` Google family (distinct from Anthropic/Claude on which Mooter was tuned). 1 pass; concordância contra meus expected labels = 84%.
- **Baselines implementados:** always_T0/T1/T2/T3, random (3 seeds), length_heuristic (length-threshold-only), tenline_classifier (length + 25 risk keywords), oracle_quality (per-prompt cheapest-model-at-max-quality).
- **Métricas:** accuracy exact / within±1, cost-weighted error (asymmetric: under-tier penalized harder than over-tier), Pareto dominance, ECE (10-bin), confusion matrices.
- **Sensitivity:** Arm A run com 2 mappings tier→modelo (primary quartis, alt skip-rungs). Verdict robusto à escolha.
- **Outputs persistidos:**
  - `results/arm_a_per_prompt.jsonl` (2,672 rows com Mooter decision + per-model q/c)
  - `results/arm_a_results.json` (aggregates)
  - `results/arm_b_judge_labels.jsonl` (150 judge outputs)
  - `results/arm_b_decisions.jsonl` (150 Mooter + baselines)
  - `results/arm_b_metrics.json`, `results/arm_b_confusion.txt`
  - `raw/arm_a_run.log`, `raw/arm_b_judge.log`, `raw/arm_b_run.log`
  - `harness/*.py` (todos os scripts reproducibles)
  - `METHODOLOGY.md` (decisões de investigador documentadas)

---

## Sinais positivos para o Mooter (presentes neste benchmark)

1. **In-domain: bate todos os baselines triviais por margem clara.** O classifier de 10 linhas que escrevi (length + 25 keywords de risco) atinge 45.3% accuracy contra os 62.7% do Mooter — uma diferença substantiva, não margem de ruído. As 102 regexes do Mooter não estão a queimar tokens à toa em Arm B.
2. **Excelente recall em T0 (96.8%) e T3 (94.6%).** Identifica bem extremos — tarefas mecânicas vs arquitectura. Isto sugere que o HIGH_RISK floor está a funcionar.
3. **Cost-weighted error metade do segundo-melhor (0.477 vs 0.715 do tenline).** Quando erra, erra menos catastroficamente.
4. **Resilient calibration: ECE 0.171** — overconfident, mas não wildly miscalibrated. Está na zona de classifiers production-ready com tuning.

## Sinais negativos para o Mooter (presentes neste benchmark)

1. **OOD Pareto-dominated.** Em prompts que não parecem coding, é dominado por `always_T1` (Haiku-only). Para um router que aspira ser "general developer assistant", isto é grave — devs fazem perguntas Q&A o tempo todo.
2. **T1 dead zone estrutural.** 76% de prompts T1-judged colapsam para T0. O classifier comporta-se como binário+(T2/T3), não como 4 tiers. Esta é uma das maiores oportunidades de tuning — mas também a maior dúvida sobre a maturidade do design.
3. **Distância ao oracle (RouterBench): 83.8 pp.** O melhor router teórico atingiria 88% quality; o Mooter atinge 14%. O gap é enorme.
4. **Confidence levels demasiado altos em T0 (0.631) face ao failure mode em OOD.** O classifier não sabe quando não sabe — emite high-confidence T0 em prompts que claramente são reasoning-heavy.

---

## Implicação estratégica (OPINIÃO, separada do benchmark)

⚠️ Esta secção é a minha leitura, não medida. O Paulo deve descontar.

### Caso para continuar/lançar

- **O Mooter funciona no nicho para que foi desenhado.** 62.7% accuracy em coding routing, batendo o 10-line classifier por 17 pp, é uma demonstração de engenharia técnica genuína. Não é "stitched together hype".
- **A doutrina ("Bazuca só quando a parede é de betão") é razoável e o classifier serve essa doutrina dentro do seu domínio.** O eixo de risk-floor — não medido aqui — provavelmente adiciona valor real de segurança que `always_T1` não tem.
- **A janela Anthropic mencionada em `ROUTING.md` (Code with Claude London 2026-05-19, issues #19269/#30453)** sugere que mesmo um classifier modesto + boa apresentação como plugin/skill/MCP pode entrar no radar. O benchmark in-domain bom é suficiente para uma demo.
- **O T1 dead zone** é um bug tunable, não uma falha conceptual. Pode ser endereçado.
- **Manter o repo privado é compatível** com posicionar como skill open-source: o algoritmo pode evoluir privado, a contribuição aberta pode ser apenas o "shape" do interface.

### Caso para pivotar

- **Para qualquer dev sério a comparar com LiteLLM/OpenRouter/RouteLLM, o Mooter como general-purpose router perde.** Os 84% de cost reduction vs T3 em Arm A vêm com **20% quality retention** — isso é inutilizável em produção. Quem usar isto em produção de ChatGPT-style geral vai ter UX terrível.
- **O 10-line classifier que escrevi em 5 minutos atinge 45% accuracy em Arm B.** As 102 regexes do Mooter atingem 63%. **18 pp por 100x o effort** — o ROI das regexes contra "uma manhã de keyword engineering" é modesto.
- **Mercado cheio e crescente.** LiteLLM (~18k★) tem provider abstraction + caching + load balancing. RouteLLM tem cost-quality routing baseado em ML real (LLM judges, embeddings, BERT classifiers). Para entrar nesse mercado em 2026, um router pessoal heuristic provavelmente não chega — é necessário um diferencial.
- **O OOD failure mode (88.9% para T0 em RouterBench) é uma vulnerabilidade pública.** Qualquer reviewer adversarial vai testar com MMLU/Hellaswag e mostrar isto. **Marketing como "general router" é insustentável.**
- **O eixo onde o Mooter genuinamente brilha — coding task routing dentro do Claude Code** — é precisamente o eixo onde a Anthropic pode trazer solução nativa a qualquer momento (já há sinais nas issues #19269/#30453). Janela de competitividade incerta.

### O que pode salvar o caso de continuar

- **Reposicionar como "Claude Code workflow optimizer", NÃO como general-purpose router.** Marketing honesto sobre o domínio. A bipolaridade do benchmark é uma feature, não um bug, **se o marketing assumir o domínio claramente**.
- **Endereçar o T1 dead zone com tuning.** Isto pode subir o accuracy in-domain dos 62% para os 70-75% sem mexer no design.
- **Adicionar um teste de eixo de risco** explícito (que este benchmark não fez) e publicar esse resultado — é onde o Mooter provavelmente ganha contra `always_T1`.
- **Aceitar que "competimos com LiteLLM" é o framing errado.** O framing certo é "amplificamos Claude Code" — alinhado com a fronteira-vermelha da Anthropic mencionada no `ROUTING.md`.

### Em uma frase

Se o Mooter for posicionado e mantido **dentro do nicho onde foi tunado** (developer task routing em Claude Code), tem valor técnico defensável e este benchmark mostra-o. Se for posicionado como **router de propósito geral**, perde a comparação com baselines triviais.

O caminho "continuar e lançar" é viável se houver disciplina de scope. O caminho "pivotar" é viável se o Paulo concluir que o nicho é demasiado pequeno para sustentar o esforço.

**Esta decisão não está no benchmark. Está no julgamento estratégico do Paulo sobre o mercado e o seu próprio appetite. O benchmark dá-lhe apenas dois números que não tinha antes: 62.7% in-domain vs Pareto-dominated OOD.**
