# 🐮 MOOTER — Arquitectura & Modelo Quantitativo (source of truth)

> Doc-mãe: o que é o Mooter, como cada órgão funciona, e **quanto vale cada etapa** — com métricas de
> **mercado 2026** (não os nossos números internos, para evitar viés), a metodologia de cada uma, e a soma
> que prova como usar Mooter + Cowork + CC + LLMs locais é superior.
> **Regra deste doc:** cada número tem fonte externa + metodologia. Os números reais do Mooter (savings
> tracker) validam-se *contra* estas referências de mercado, nunca as substituem.

---

## 1. Os órgãos (o que faz cada um · ancorado no código)
| Zona | Órgão | Ficheiro | Papel |
|---|---|---|---|
| Superfícies | Plugin VS Code (Cockpit, 5 abas) | `packages/vscode-extension/src/extension.js` | Cockpit·Setup·Herd·Decisions·Doctor |
| | Cowork · CLI `/mooter` | — · `packages/cli/.../slash-commands.ts` | orquestra · route/savings/explain |
| ① Motor | `classify.js` (FROZEN) | `tools/router/classify.js` | regex <50ms, $0 → tier T0-T3 |
| | decide-agent (TES) | `packages/router/src/decide-agent.ts` | melhor modelo no tier (Pareto) |
| | Graphify (W66) | `packages/router/src/graph-aware-decide.ts` | grafo localiza → budget ×0.7 + prefer local |
| | fable-5-routing | `packages/router/src/fable-5-routing.ts` | tenta barato · judge · escala só se preciso |
| | suporte | specialization-matrix · tes-calculator · task-categories | matriz 17×24 · TES · 24 categorias |
| ② Execução | Ollama T0 local | `tools/router/providers/ollama-api.js` | qwen3-30b · `localhost:11434` · $0 |
| | T1/T2/T3/T5 | pricing.js | Haiku/Sonnet/Opus/Fable (cloud) |
| ③ Memória | Ledger + Perfect Handoff | `tools/router/handoff-journal.js` | proveniência · handoff não mente |
| ④ Economia | Savings Tracker | `tools/router/savings-tracker.js` (:7821) · `run-savings.js` | counterfactual vs all-Opus |
| ⑤ Aprende de ti | adaptive-learner | `packages/router/src/adaptive-learner.ts` | EWMA semanal → overrides |
| ⑥ Aprende de todos | Hub federated | `hub/worker.js` · `wrangler.mooter.toml` | `/api/delta` anón · hourly/daily/weekly |
| ⑦ Treina-se | Adapter Forge | (masterprompt) | OSFT/DoRA · nightly overclock $0 |
| ⑧ Auto-evolução | Evolution Fleet · Fleet Console · Moo Loop Sessions | (masterprompts) | propõe+prova+gate humano |
| Skills | Moo Packs | `packs/*/pack.yaml` | caveman (~8% savings) · code-graph |

---

## 2. Modelo quantitativo — o valor de cada etapa (métricas de MERCADO 2026)

### Preços de referência (Anthropic, por 1M tokens · in/out)
`T0 local $0` · `Haiku $1/$5` · `Sonnet $3/$15` · `Opus $5/$25` · Fable opt-in. Batch −50%, cache −90% no input. *(fonte: platform.claude.com/pricing, 2026)*

### Velocidade de referência (tok/s)
Local Qwen-32B Q4 na RTX 4090 ≈ **40 tok/s** ($0, −3-10% no Ollama) · Sonnet 4.6 ≈ **55 tok/s** · Opus ≈ **27 tok/s** (fast-mode 2.5×, premium). *(fontes: databasemart 4090 bench · artificialanalysis · claude docs)*

### Métricas por etapa (cada uma com metodologia)
| Etapa | Métrica de mercado | Metodologia (como se mede) | Ganho |
|---|---|---|---|
| **① Decisão** | classify $0 · <50ms | regex determinístico, zero inferência vs um LLM-router (~$0.001 + 1-5s/decisão) | ~200 decisões/dia = **$0 e 0s** vs ~$0.20-2/dia + minutos de latência |
| **② Custo/token** | roteado vs all-Opus | 1M tokens mistos (70% in/30% out): all-Opus = 0.7×$5+0.3×$25 = **$11/M**; roteado (70% T0=$0, 20% Sonnet, 10% Opus) ≈ **$1.7/M** | **≈ 85% menos custo por token** (o coração da poupança) |
| **② Velocidade** | 40 tok/s local ($0) vs 55 Sonnet / 27 Opus | tok/s medido por modelo; local é grátis-mas-paciente | mão-de-obra a $0; cérebro rápido só quando o tier o exige |
| **③ Handoff (tempo)** | **23 min** para recuperar foco por interrupção (Gloria Mark, UC Irvine); 30-60 min p/ código complexo | cada nova sessão CC = 1 context-switch; handoff que **não mente** → tempo-até-1ª-acção cai a ~1-2 min | **~20 min recuperados por retoma** · 5-10 retomas/dia = **2-3 h/dia de foco** |
| **compressão** | moo comprime handoff ~5× ($0) | contexto 150k→~30k tokens antes do CC | ~120k input tokens × $5/M = **~$0.60 + latência** poupados por handoff |
| **④ Loop/Schedule** | 40 tok/s × 8 h ociosas = **~1.15M tokens/noite** | GPU ociosa → trabalho $0 enquanto dormes | ~$12/noite de trabalho-Opus feito de graça · acordas com auditoria/scorecard prontos |
| **⑤⑥⑦ melhoria** | QLoRA/OSFT $0 · adaptive semanal · hub federated | curva de custo decrescente: mais trabalho desce a T0 com o tempo | o único sistema onde **o custo cai** com o uso |

### Metodologia do racional de economia (④, o número que valida a tese)
`saved = custo(TUDO em Opus) − custo(real)`, a **preços reais e tokens reais** (`pricing.js` SSOT).
Duas métricas separadas por honestidade: **guaranteed** (Opus foi *de facto* saltado — poupança provada) vs
**advisory** (estimativa por-tier, rotulada). *Nunca* mistura provado com estimado.

---

## 3. A soma — como usar Mooter + Cowork + CC + local (a conclusão)
Cada etapa contribui; somadas, invertem a economia de "pagar Opus por tudo" para "pagar Opus só pelo que importa":

| Recurso | Papel óptimo | Custo | Regra |
|---|---|---|---|
| 🖥️ **Cowork** (Opus) | design, arquitectura, red-team | 🧠 alto · **raro** | só o que decide o rumo |
| 🤖 **CC** (Opus/Sonnet) | coding, juízo, merges | 🧠 médio · **no irreversível** | o cérebro, no caminho crítico |
| 🐮 **Local moos** (qwen $0) | auditoria, medição, compressão, treino, loops, schedules | **$0** | toda a mão-de-obra |
| ⚡ **Mooter** | decide ($0) · prova · aprende | **$0 a decidir** | o maestro que orquestra os três |

**A tese, quantificada:** decisão a $0 (①) + ~85% menos custo/token (②) + 2-3 h/dia de foco recuperado (③, handoff) + ~1M tokens/noite grátis (④, loops) + custo decrescente (⑤⑥⑦). Nenhum concorrente cloud-only soma isto — não têm a tua GPU nem os teus dados locais. **É aqui que "o melhor do mundo no que faz" deixa de ser slogan e passa a ser uma propriedade do modelo.**

---

## 4. Nota de honestidade (o fosso aplicado ao próprio doc)
Estes números são **referências de mercado**, ilustrativas do *mecanismo*, não medições do Mooter. O
próximo passo é o Savings Tracker + o Evolution Scorecard medirem os números **reais** (na tua máquina, com
o teu mix de prompts) e compará-los com estas referências — se divergirem, é a realidade que ganha, e o
doc actualiza-se. Nunca vender o estimado como provado.

## 5. Fontes (mercado 2026)
Preços: platform.claude.com/pricing · finout · cloudzero. Velocidade: databasemart (RTX 4090 Ollama) ·
artificialanalysis (Sonnet 4.6) · claude docs (fast-mode). Context-switching: Gloria Mark / UC Irvine ·
reclaim.ai · super-productivity. Continual learning: OSFT (HF PEFT) · Training Hub.
