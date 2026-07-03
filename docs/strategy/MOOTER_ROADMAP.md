# 🐮🗺️ MOOTER — Roadmap de Waves (v3, breakdown por Squad)

> O plano vivo. Todo o backlog organizado em waves priorizadas, **alinhadas com a tese** e o confronto
> SOTA 2026, com um **dono de squad** por wave (Team Topologies). Cada wave declara o **modo de execução**
> (CC / Loop / Schedule / dynamic-workflow), squad, worktree, effort e dependências. Fonte de verdade da
> arquitectura: `MOOTER_ARCHITECTURE.md`.

## A tese (a régua de toda a wave)
Decidir a $0, empurrar o máximo para local, **provar** cada poupança, e **melhorar sozinho**. O quarteto:
Cowork (design, raro) · CC (irreversível) · moos locais ($0, mão-de-obra) · Mooter (o maestro). Uma wave só
entra se avança isto. Veredito SOTA 2026: **no caminho certo, adiante em honestidade**.

## Princípios de priorização
1. **Performance/custo primeiro.** 2. **Alavanca** (fundações antes de folhas). 3. **Velocidade local $0**
(Loop/Schedule > CC). 4. **Prova > promessa.** 5. **Aterrar > começar** (baixar WIP — a régua nº1 agora).

## Modo de execução
| Modo | Quando | Custo |
|---|---|---|
| **CC-once** | coding não-trivial, merges, arquitectura, irreversível | 🧠 limite |
| **Loop** | trabalho iterativo autónomo ($0) | 🐮 $0 |
| **Schedule** | recorrente (treino, eval, digests) | 🐮 $0 |
| **dynamic-workflow** | multi-passo com deps/gates | misto |

## Squads (Team Topologies · cada squad = Paulo + moos + CC numa frente)
| Squad | Tipo | Frente |
|---|---|---|
| 🧭 Routing & Inference | stream-aligned | motor de decisão $0-first |
| 🧠 Auto-Evolution | stream-aligned | aprende sozinho |
| 🛩️ Cockpit & UX | stream-aligned | a cabine (plugin) |
| 📦 Site & Distribution | stream-aligned | chegar ao vibe coder |
| ⚙️ Platform & Data | platform | Ledger · hub · memória |
| 🔀 Agent Comms | enabling | protocolo · handoff · loops |
| 🛡️ Security & Privacy | complicated-subsystem | GDPR · DP · supply-chain |
| 📊 Observability & Sustentação | cross-cutting | savings · spans · housekeeping |

---

## FASE NOW — o foco actual (P0)
| # | Wave | Squad | Objectivo | Modo | Worktree | Effort | Dep | Estado |
|---|---|---|---|---|---|---|---|---|
| W1 | Aterrar polish + verdes | 🛩️ Cockpit & UX | F1+F3+Site+MP0+forecast em prod | dynamic-workflow | frugal-land | M | — | ✅ done (06aec7a) |
| W13 | 🛩️ Delivery Cockpit | 🛩️ Cockpit & UX | forecast (A) + Project Command (B) + adapters (C) | CC-once | frugal-cockpit-tab | L | W1 | 🟡 A✅ · B v1 salva · squad+WIP a fazer |
| W14 | 🔀 Comunicação | 🔀 Agent Comms | protocolo + P1+P2 + Níveis 2-4 | CC-once | frugal-comms | M | — | 🟡 protocolo✅ · P1+P2 |
| W2 | 🧹 Housekeeping | 📊 Obs & Sustentação | arquivar legacy + consolidar docs + podar worktrees | Loop $0 | frugal-housekeep | M | — | 🔜 |
| W3 | Distribuição + onboarding | 📦 Site & Distribution | republicar 0.16.45 + Install-Ready + onboarding educativo | CC-once | frugal-dist | S | W1 | 🔜 |

## FASE NEXT — fundações multiplicadoras (P1)
| # | Wave | Squad | Objectivo | Modo | Worktree | Effort | Dep | Estado |
|---|---|---|---|---|---|---|---|---|
| W5 | Moo Loop Sessions | 🔀 Agent Comms | botões New CC Loop/Schedule + pin + Fleet Console + Loop→CC escalation | CC-once | frugal-loop-sessions | M | — | 🔜 fundação |
| W4 | Evolution Fleet F1 | 🧠 Auto-Evolution | Fleet Commander + 3 loops (routing/budget/eval) | CC→Loop | frugal-fleet | L | W5 | 🔜 |
| W9 | 🧠 Gradient-free TTL | 🧠 Auto-Evolution | insight-distiller sobre o Ledger (ReasoningBank/JitRL, $0) | Loop $0 | frugal-ttl | M | W4 | 🔜 (subiu) |
| W7 | Adapter Forge F1 | 🧠 Auto-Evolution | 1 adapter real (O-LoRA/OPLoRA, anti-forgetting) | Schedule | frugal-forge | L | W4 | 🔜 (base: adapter/) |
| W6 | Budget Cockpit + obs | 📊 Obs & Sustentação | span-level + alerta + benchmarking contínuo | CC-once | frugal-budget | M | W5 | 🔜 (base: observability.ts) |

## FASE FRONTIER — apostas SOTA (P2)
| # | Wave | Squad | Objectivo | Modo | Worktree | Effort | Dep | Estado |
|---|---|---|---|---|---|---|---|---|
| W11 | Router bandit + AWQ | 🧭 Routing & Inference | promover bandit (W32) + dueling (FGTS/OrcaRouter) + AWQ | CC-once | frugal-router-v2 | M | W7 | 🔜 (base: validation) |
| W8 | ⚡ Edge-cloud speculative | 🧭 Routing & Inference | draft local $0 → verifica cloud (FlexSpec/PicoSpec) | CC-once | frugal-spec | L | W6 | 🔜 |
| W10 | Graph-temporal memory | ⚙️ Platform & Data | une graph-aware-decide + Ledger | CC-once | frugal-graphmem | L | W2 | 🔜 (base: graph-aware) |
| W12 | Differential privacy hub | 🛡️ Security & Privacy | garantia formal DP + incentivos + sharding | CC-once | frugal-dp-hub | S | — | 🔜 |

## VISÃO (pós-W12, parked)
Meta-learning (router que aprende o próprio router) · 3rd Brain como produto.

## Manutenção
Vivo. Cada wave que fecha → ✅ + regista o `measured` real. Nova frente SOTA → entra priorizada. A régua não muda.
Detalhe estratégico + masterprompt-specs + validação SOTA: vault `40-strategy/mooter-roadmap-v3-2026-07-03`.
