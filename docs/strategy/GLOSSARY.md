# Mooter Glossary — vocabulário canónico

> SSoT do vocabulário Mooter. Toda documentação, copy, output do CLI e statusline segue este glossário. Updates aqui são propagados a tudo via PR dedicado.

## Termos centrais

| Termo | Significado | Exemplos de uso |
|---|---|---|
| **Mooter** | A entidade que faz routing, decisão e gestão. THE pastor. Substantivo próprio. | "Mooter routes T2 to sonnet" · "Mooter saved $0.27" |
| **Moos** | Colectivo de models, agents e packs sob gestão do Mooter. Substantivo plural. | "Mooter pastors the Moos" · "last 10 Moos: T0×6 T1×2 T2×2" |
| **A Moo** | Worker individual (modelo específico, agent, ou pack). Singular. | "This Moo (🐄 qwen3:7b) handled the bash call" |
| **to pastor** | Verbo: rotear, distribuir, gerir Moos. | "Mooter pastors prompts to the right Moo" |
| **Moo card** | Card resumo per-turn emitido pelo Stop hook. | "Moo card shows model, tokens, cost, savings" |
| **Pack** | Especialização persistente (e.g., diagram-systems, code-audit). Cada Pack é uma Moo treinada para um domínio. | "Pack: diagram-systems activates T2 specialist" |

## Termos arquitecturais

| Termo | Significado |
|---|---|
| **Tier** | Classificação T0/T1/T2/T3 do prompt — define qual Moo executa. |
| **Provider** | Backend da Moo: local (Ollama 🏠), cloud (Anthropic ☁), max (subscription ⚡). |
| **Adapter** | LoRA/DoRA aplicado a uma Moo para especialização (Wave 5 Adapter Forge). |
| **Confidence** | Score 0-1 da classificação. Threshold actual: 0.6 para badge visível. |
| **Mood** | Estado visual do Mooter: 🐮 healthy · 🐂 warning · 🚨 critical · 🛠 setup · ⚪ degraded. |

## Termos a evitar (deprecated)

| ❌ Não usar | ✅ Usar em vez |
|---|---|
| Pastor (entity) | Mooter |
| Pastor (collective workers) | Moos |
| The herd / The flock | The Moos |
| The router | Mooter (in user-facing copy) |
| Workers / Agents (when referring to managed models) | Moos |

## Excepções permitidas

- `docs/archive/**` — preserva "Pastor" histórico (não reescrever)
- `docs/benchmarks/wave*-pastor/**` — relatórios históricos de benchmark; nomes de dir e conteúdo preservam "Pastor" (artefactos datados)
- Variable names em `.ts/.js` (e.g., `pastorClass`, componente `PastorCrook`) — refactor Wave 3+
- Subagent file names em `~/.claude/agents/` — internos, não vazam
- Event schema `landing/lib/mooter-event.ts` — congelado (Wave 2 D4)

## Versão

Versão actual: 1.0 (2026-05-31, criado Wave 2.6 Day 1)
