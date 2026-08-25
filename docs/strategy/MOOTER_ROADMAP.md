# 🐮🗺️ MOOTER — Roadmap de Waves (v3, breakdown por Squad)

> **🎯 NOW = `_handoff/_archive/2026-07/FOUNDATION_SUPER_MASTERPROMPT.md` → North Star F0–F5** (Notion 2026-07-13, por pilar: Resume · Plan · Route · Watch · Review). As waves W1–W16 abaixo **aguardam re-triagem (F5)** — não iniciar wave desta lista sem re-triagem.

> O plano vivo. Todo o backlog organizado em waves priorizadas, **alinhadas com a tese** e o confronto
> SOTA 2026, com um **dono de squad** por wave (Team Topologies). Cada wave declara o **modo de execução**
> (CC / Loop / Schedule / dynamic-workflow), squad, worktree, effort e dependências. Fonte de verdade da
> arquitectura: `MOOTER_ARCHITECTURE.md`.

## A tese (a régua de toda a wave)
O Mooter existe para o vibe coder ganhar tempo operando como um mestre sem estudar todos os dias:
melhores práticas automáticas, visibilidade total, alertas de gaps de fundação, e a magia visível —
pilotado do plugin VS Code. Por baixo, o motor-fosso: roteamento determinístico local-first ($0,
<50ms) sobre multi-subscriptions + GPU do usuário. **Uma wave só entra se melhorar uma das 5
experiências: Resume · Plan · Route (invisível) · Watch · Review.** "$0 primeiro" continua como
princípio de execução (como trabalhar), não como tese (porquê existir). Prova > promessa.

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
| W15 | 🛰️ CTO Command Deck | 🛩️ Cockpit & UX | redesign plugin: inbox por exceção + 4 lentes + hardware strip + deep-link click→aba CC + link front↔back honesto | CC faseado (6 fases) | frugal-deck-* | L | W13 | 🔜 super masterprompt pronto (`_handoff/_archive/2026-06/CTO_COMMAND_DECK_SPEC.md`) |
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
| W16 | 🎬 Live Preview build-cinema | 🛩️ Cockpit & UX | App Stage (iframe dev server local, sem WebContainers) + Director's Cut + click-to-edit (`code-inspector-plugin`) + Build Receipt · dogfood no mooter.ai | CC faseado (MP0-MP4) | frugal-lp-* | L | W15 | 🔜 super masterprompt pronto (`_handoff/_archive/2026-07/LIVE_PREVIEW_SUPER_MASTERPROMPT.md`) · BL-64 |

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
