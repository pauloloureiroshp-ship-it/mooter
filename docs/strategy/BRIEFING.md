---
title: "Mooter — Executive Briefing"
subtitle: "O sistema operativo do vibe coder"
author: "Paulo Loureiro"
date: "2026-05-07"
documentclass: article
geometry: "margin=1.8cm"
fontsize: 11pt
linkcolor: "blue"
urlcolor: "blue"
colorlinks: true
---

# Mooter

**Routing inteligente para vibe coders. Open-source. Doctrine-first. Determinístico.**

> Mooter classifica cada prompt em <50ms (regex puro, zero LLM) e decide o tier mínimo viável: T0 local · T1 Haiku · T2 Sonnet · T3 Opus. Coabita com Claude Code via hook `UserPromptSubmit` — não é proxy.

## O problema

Vibe coder em 2026 paga Claude Max + Copilot + ChatGPT Plus e usa-os mal. Sem visibilidade de custo. Opus em "muda a cor do botão" queima ★0.15 por call trivial. **A barreira ao impacto AI-coding hoje é ruído, paralisia e medo de custo — não talento.**

## A resposta

| Capacidade | Implementação |
|---|---|
| Classifica prompt em <50ms | Regex puro, zero LLM cost na classificação |
| Emite `<router-hint>` que Claude Code honra via hook | `tools/router/inject_context.js` |
| Reduz custo 65-82% sem degradar qualidade | Doctrine dual-enforced (regex guardrail + sub-agent gating) |
| Aprende com cada decisão | Auto-learning loop + savings-tracker token-anchored |
| Cresce com a comunidade | Federated learning roadmap |

## 3 moats defensáveis (12-18 meses)

1. **Subscription-Aware Routing** — único no mercado. Detecta sub Anthropic/OpenAI/Google. Max ($200/mês) → marginal cost = 0 → bias frontier+cache. PAYG → bias local-first. Mostra "★X saved this month vs PAYG".
2. **Codebase-Aware Language Harmonisation** — auto-detect lingua da codebase (PT-PT/PT-BR/EN/ZH); roteia coerente; AMALIA + Sabiá-3 como cidadãos de primeira. Cursor/Continue/Aider forçam EN.
3. **Triple-stack Anthropic alignment** — publicar como **plugin Claude Code + skill portable + MCP server `@mooter/router`** simultâneos. Sinal mais forte de composição correcta da stack Anthropic.

## Estado actual (Maio 2026, v0.11)

| Métrica | Valor | Target |
|---|---|---|
| Tier accuracy validation | **87.5%** (35/40) | ≥85% ✓ |
| Hook latency p50 | **113ms** | <200ms ✓ |
| Tests passing | **295/296** (1 skip esperado) | green ✓ |
| Cost reduction realista | 65-82% vs all-Opus baseline | ≥60% target |
| Wave-2 (advisor → executor) | LANDED 2026-05-07 | Final-reviewer Opus APPROVED ✓ |
| Subagents implementados | 6 (cheap-triage · model-architect · model-reasoner · local-summarizer · local-transformer · final-reviewer) | — |

## Roadmap para gate (2026-05-26 · 19 dias)

| Wave | Estado | Tema |
|---|---|---|
| Wave-1 (classifier) | ✓ LANDED | hook 113ms p50, doctrine, subagents |
| Wave-2 (advisor → executor) | ✓ LANDED 2026-05-07 | router-execute.js, ollama-api, telemetry executions |
| Wave-3 (calibration) | → 2026-05-08-13 | Async decisions-log, Gemini provider, Thompson sampling Phase 1 |
| Wave-4 (specialist routing) | → 2026-05-14-20 | Subscription-Aware + Codebase-Aware + RDTR + Honest Cost Report |
| Wave-5 (Anthropic alignment) | → 2026-05-21-25 | Triple-stack publish + PR claude-cookbooks + Code with Claude London 2026-05-19 |
| **GATE** | ◎ 2026-05-26 | ≥250 stars + ≥3 contributors externos |

## Diferenciadores vs concorrentes

| Eixo | Mooter | OpenRouter | LiteLLM | Cursor |
|---|---|---|---|---|
| Subscription-aware | ✓ Único | ✗ | ✗ | ✗ |
| Codebase-aware lang | ✓ Único | ✗ | ✗ | ✗ (força EN) |
| Local-first nativo | ✓ Ollama integrado | ✗ cloud-only | △ via config | △ |
| Doctrine dual-enforced | ✓ | ✗ | ✗ | ✗ |
| Coabita Claude Code (não substitui) | ✓ | n/a | △ | ✗ (banned 2026-04) |
| Zero-LLM classification | ✓ regex <50ms | ✗ | △ | n/a |
| PT-PT/PT-BR cidadão de 1ª | ✓ AMALIA + Sabiá-3 | ✗ | ✗ | ✗ |
| Triple-stack (plugin+skill+MCP) | ★ Phase 6 | ✗ | △ gateway-only | ✗ |

## Eventos críticos

- **2026-05-19** — Code with Claude London (livestream grátis). Demo submission deadline.
- 2026-05-20 — Show HN.
- **2026-05-26** — GATE.
- 2026-06-10 — Code with Claude Tokyo (backup).

## Para quem

- **Vibe coders** — solos / small teams com Claude Max ou hybrid stacks que querem custo previsível.
- **Devs BR/PT** — primeiro router que respeita PT-PT e PT-BR como cidadãos de primeira.
- **OSS contributors** — código MIT, doctrine clara, 295/296 testes, PRs welcome.

## Apoio

- **Anthropic DevRel** — alinhamento técnico via triple-stack publish; coabitação com Claude Code; PR a `anthropics/claude-cookbooks`.
- **Anthropic Startup Program** — application 2026-05-25.
- **VC Partner Program** — long-game se gate hit.

## Contacto

| Canal | Endereço |
|---|---|
| GitHub | github.com/paulo-loureiro/mooter (verificar) |
| Web | mooter.ai |
| Email | paulo.loureiro.shp@gmail.com |
| Twitter/X | @pauloloureiro (verificar) |

---

*Documento gerado a partir do single-source-of-truth canónico `MOOTER_STRATEGY_CANONICAL_2026-05-07.pdf` (30 páginas). Para profundidade técnica, ler o documento completo.*
