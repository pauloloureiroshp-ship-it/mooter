# Friends-launch DMs — v7 (Pastor v2 LORAUTER)

> Pitch refresh for Wave 31. Adds **per-task LoRA adapter routing** + **knowledge
> distillation** + **Obsidian bridge** on top of the Wave 30 numbers. Keep it honest:
> routing is live + deterministic; adapter *training* is the user's overnight job.

---

## Short DM (warm intro)

> Lembras-te do Mooter (o router local-first p/ Claude Code que decide Opus vs
> Sonnet vs Haiku vs Ollama por ti)? Acabei de shippar **Pastor v2**: agora faz
> *per-task LoRA adapter routing* — olha para o teu prompt e escolhe um adaptador
> especializado (frontend / backend / data / PT-PT / EN) **dentro** do tier, de forma
> 100% determinística (TF-IDF + cosine, zero chamadas a LLM para decidir). E dá para
> destilar o que ele aprendeu (`mooter pastor distill`) num skill instalável. Queres
> 5 min para experimentar?

## Medium DM (technical friend)

> Wave 31 do Mooter está out. Três coisas novas:
>
> 1. **LORAUTER** (per-task adapter routing): o prompt é representado por TF-IDF,
>    matched por cosine contra 6 perfis de adaptador, e roteado por *relative
>    confidence* (threshold 0.7). Determinístico — não uso LLM para escolher o
>    adaptador. E o tier do classify.js é guardrail duro: o LORAUTER só enviesa
>    *qual adaptador* corre dentro do tier, nunca o tier.
> 2. **Distillation**: `mooter pastor distill` lê o teu log de decisões e gera um
>    `.skill.md` instalável com as tuas regras de routing aprendidas. No meu: 656
>    decisões → T3 48% / T1 32% / T0 18% / T2 2%.
> 3. **Obsidian bridge**: pack bidireccional — learnings → vault/Mooter/, e
>    preferences.md do vault → priors do Pastor. Local-only, features-only.
>
> Continua tudo privacy-first: opt-in, k-anonymity ≥50 nos agregados do hub, e o
> sha do classify.js é gated em CI.

## Proof points (Wave 30 carry, still true)

- Showcase Benchmark v2: **72 calls · $0.13 · MLWR 100%** (objective-floor caveat —
  the local tier handled everything it was eligible for).
- 2 new MCP tools (`mooter_pastor_adapter_suggest`, `mooter_obsidian_sync`) — 8 total.
- New hub route `/v1/pastor-adapters` (opt-in adapter telemetry, features-only).

## Links

- mooter.ai · GitHub (Wave 31 tag `v1.19.0-pastor-v2`)
- Try: `mooter pastor route "<your task>"` · `mooter pastor distill` · `mooter pack install obsidian-vault-sync`
