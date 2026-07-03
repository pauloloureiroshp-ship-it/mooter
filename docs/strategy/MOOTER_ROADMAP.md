# 🐮🗺️ MOOTER — Roadmap de Waves (backlog confrontado com a arquitetura)

> O plano vivo. Todo o backlog organizado em waves priorizadas, **alinhadas com a tese** e o confronto
> SOTA 2026. Cada wave declara o **modo de execução** (CC / Loop / Schedule / dynamic-workflow), worktree,
> effort e dependências. Fonte de verdade da arquitectura: `MOOTER_ARCHITECTURE.md`.

## A tese (a régua de toda a wave)
Decidir a $0, empurrar o máximo para local, **provar** cada poupança, e **melhorar sozinho** (aprende de
ti · de todos · treina-se). O quarteto: Cowork (design, raro) · CC (irreversível) · moos locais ($0,
mão-de-obra) · Mooter (o maestro). Uma wave só entra se avança isto. Veredito do confronto SOTA: **estamos
no caminho certo (alinhados 5/6, adiante em honestidade)** — ver `MOOTER_ARCHITECTURE.md` §evolução.

## Princípios de priorização (porque uma wave sobe)
1. **Performance/custo primeiro** — o que baixa custo ou latência para o vibe coder.
2. **Alavanca** — o que desbloqueia outras waves sobe (fundações antes de folhas).
3. **Velocidade de entrega** — preferir o que corre **local $0 em Loop/Schedule** (não gasta limite, corre
   em paralelo) ao que exige sessão CC (cérebro, limite). Máxima velocidade = máxima delegação ao local.
4. **Prova > promessa** — waves com métrica medível e gate honesto sobem; as difusas descem.
5. **Aterrar > começar** — fechar o verde antes de abrir o novo (baixar WIP).

## Como escolher o modo de execução (a régua)
| Modo | Quando | Custo |
|---|---|---|
| **CC-once** (sessão) | coding não-trivial, merges, arquitectura, o irreversível | 🧠 limite |
| **Loop** (Moo Loop Session) | trabalho iterativo autónomo: auditar, medir, limpar, destilar insights | 🐮 $0 |
| **Schedule** | recorrente: treino nightly, eval semanal, digests | 🐮 $0 |
| **dynamic-workflow** | multi-passo com dependências/gates (ex.: aterragem ordenada) | misto |
| Sempre: **worktree dedicado** · gate humano no irreversível · classify.js frozen |

---

## FASE NOW — aterrar valor + limpar a base (P0)
| # | Wave | Objectivo (tese) | Modo | Worktree | Effort | Dep |
|---|---|---|---|---|---|---|
| **W1** | Aterrar polish + frentes verdes | F1+F3→Site→MP0 em prod (valor já construído) | **dynamic-workflow** (fundir F1+F3 · merge ordenado) | `frugal-land-polish` | M | — |
| **W2** | 🧹 Housekeeping da base | arquivar ~40 masterprompts legacy · consolidar `docs/strategy` + MD · rever skills/context/goal — **ganhar eficiência** | **Loop $0** (mão-de-obra: audita, propõe moves, nunca deleta sozinho) | `frugal-housekeep` | M | — |
| **W3** | Distribuição p/ o amigo | republicar `0.16.45` no Marketplace + Site Install-Ready (Windows) | **CC-once** | `frugal-dist` | S | W1 |

## FASE NEXT — as fundações multiplicadoras (P1)
| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |
|---|---|---|---|---|---|---|
| **W4** | Evolution Fleet · F1 | Fleet Commander + 3 loops (routing/budget/eval) que fecham medir→propor→medir | **CC-once** p/ construir → depois **Loop** | `frugal-fleet` | L | W2 |
| **W5** | Moo Loop Sessions | os botões `New CC Moo Loop/Schedule Session` + pin + Fleet Console | **CC-once** | `frugal-loop-sessions` | M | — |
| **W6** | Budget Cockpit + observability | usage breakdown span-level (SOTA: MLflow/Langfuse-style) · alerta proactivo · liga aos modos Moo | **CC-once** + moo local | `frugal-budget` | M | W5 |
| **W7** | Adapter Forge · F1 | 1 adapter (moo de mão-de-obra) · OSFT/DoRA · prova ganho sem regressão | **Schedule nightly** (treino) + CC p/ construir | `frugal-forge` | L | W4 |

## FASE FRONTIER — as apostas SOTA de alta alavanca (P2)
| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |
|---|---|---|---|---|---|---|
| **W8** | ⚡ Edge-cloud speculative | draft local $0 → verifica no cloud: velocidade local + qualidade cloud a custo mínimo (nova via de poupança ao nível do token) | **CC-once** (experimental) + benchmark local | `frugal-spec` | L | W6 |
| **W9** | 🧠 Gradient-free TTL | insight-distiller sobre o Ledger: aprende de trajectórias (sucesso+falha) **sem re-treino**, $0, instantâneo — via leve que complementa o Forge | **Loop $0** | `frugal-ttl` | M | W4 |
| **W10** | Graph-temporal memory | unir Graphify (grafo de código) + Ledger → memória temporal/tiered | **CC-once** | `frugal-graphmem` | L | W2 |
| **W11** | Router upgrade | bandit/Thompson (substitui EWMA estático) + speculative+AWQ no T0 local | **CC-once** | `frugal-router-v2` | M | W7 |
| **W12** | Differential privacy no hub | garantia formal nos deltas federados (não só anonimização) | **CC-once** | `frugal-dp-hub` | S | — |

---

## As 6 frentes SOTA → mapeadas às waves (rastreabilidade)
① routing → W11 · ② local inference → W8, W11 · ③ memória → W10 · ④ auto-evolução → W4, W7, W9 ·
⑤ economia/obs → W6 · ⑥ federated → W12. **Cada frente tem dono.** Adiante em honestidade (③) = manter, não copiar.

## 🧹 W2 detalhada (a base defasada — o Paulo pediu)
- **Arquivar legacy:** os masterprompts já superados (COCKPIT_HANDOFF_V1/V2/V3, waves antigas do cockpit)
  movem para `_handoff/_archive/` — **mover, nunca apagar** (regra do vault).
- **Consolidar docs/strategy:** um índice (`_INDEX.md`) que aponta os vivos (ARCHITECTURE, ROADMAP,
  EVOLUTION_FLEET, ADAPTER_FORGE, LEDGER, PERFECT_HANDOFF_SPEC) e marca os históricos.
- **Rever skills/context/goal:** os `/moo-*` e os packs — o que ainda serve, o que duplica, o que falta um rótulo.
- **Régua "cada ficheiro é uma feature ou vai para archive"** — a mesma que aplicamos ao cockpit, aplicada aos MD.
- Modo Loop $0: um moo audita, produz o plano de moves com proveniência, e **pára para o teu OK** (nunca move sozinho).

## Manutenção deste roadmap
Vivo. Cada wave que fecha → marca ✅ + regista o `measured` real. Nova frente SOTA (o radar de LLMs/ecossistema
da Fleet) → entra aqui priorizada. Se uma wave não avança a tese, sai. Ordem pode mudar; a régua não.
