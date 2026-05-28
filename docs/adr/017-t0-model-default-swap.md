# ADR 017 — T0 default Ollama model: qwen3:30b → qwen2.5-coder:7b

**Date**: 2026-05-28 (Wave 2, Day 1)
**Status**: 🟡 Proposed
**Owner**: Paulo Loureiro
**Wave**: 2 (Bottleneck fixes)
**Reviewer**: final-reviewer (Opus + cache)
**Related**: Wave 1 REPORT §4 #3 + §3.5; `tools/router/ollama_call.sh`; `packages/router/scripts/wave1-benchmark/lib/models.ts`

---

## Contexto

O Wave 1 Pastor Benchmark (commit `1d8a0da`, tag `v0.1.0-pastor-wave1`) avaliou o tier T0 do router a invocar `qwen3:30b` localmente. Os resultados (REPORT §3.5 e §4 #3):

- **2 timeouts em 102 rows** (P005 GENERAL "Vercel edge functions", P012 animation-web "scrubbable timeline"). Ambos abortaram após 120s × 4 tentativas.
- **GENERAL latency 149 452 ms mean** (7× pior que Sonnet bare).
- **animation-web latency 93 424 ms mean** (mesmo excluindo timeouts).
- **Quality em GENERAL 0.695** vs 0.999 do Sonnet bare (−30pp).

A causa raiz é estrutural, não acidental: `qwen3:30b` é um reasoning model MoE (30B params) que emite long internal-thinking chains antes de responder. Para tarefas T0 (triviais, formatáveis, sem necessidade de cadeia de raciocínio profunda), é overkill — gasta tempo a "pensar" sobre coisas que outros modelos respondem em ≤ 5 s.

## Decisão

Trocar o default T0 de `qwen3:30b` para `qwen2.5-coder:7b` em duas localizações:

1. **`tools/router/ollama_call.sh`** — variável `MODEL`, default lido de `ROUTER_OLLAMA_MODEL` (env override canónica, mantida).
2. **`packages/router/scripts/wave1-benchmark/lib/models.ts`** — `TIER_TO_MODEL.T0`. Necessário para o Day 7 re-benchmark da Wave 2 validar o efeito.

`tools/router/classify.js` **não** é tocado (P11 doctrine — eixo 1 byte-identical). O seu registo `MODELS.ollama_reason = "qwen3:30b"` permanece intacto: é o specialist sub-tier para tasks com reasoning signal explícito, não o default geral.

## Alternativas consideradas

| # | Alternativa | Avaliação | Decisão |
|---|---|---|---|
| A | Manter `qwen3:30b` + aumentar timeout (120s → 240s) | Não resolve a latência mean; só esconde os 2 timeouts. Continua o quality cliff em GENERAL | ❌ Rejeitado |
| B | `qwen2.5:3b` | Mais rápido ainda, mas quality marginal em tasks de código. Está em uso como sub-tier `ollama_terse`/`ollama_general` | ❌ Rejeitado para T0 default (over-rotated to small) |
| C | `qwen3:14b` (general) | Boa cobertura geral, mas o benchmark identificou que o **uso real** do T0 actual era enviesado a tasks de código. 14b é maior que necessário para essa carga | ❌ Rejeitado |
| D | **`qwen2.5-coder:7b`** | Code-specialised, ~3× faster que qwen3:30b, já pulled no ambiente canónico (validado via `/api/tags` na Phase 0). >90% das capabilities de qwen3:30b em coding tasks | ✅ **Escolhido** |

## Consequências esperadas

- **Latency em T0**: −60% (de ~149s GENERAL / 93s animation-web para ~30-40 s).
- **Timeouts**: 0 esperados (qwen2.5-coder:7b responde dentro do timeout 120s para todos os prompts do test set).
- **Quality em T0**: estável a +marginal. Para GENERAL o impacto principal vem do Fix #1 (GENERAL fallback para T2), não deste swap.
- **Cost**: $0 (Ollama local, sem alteração).
- **Override**: qualquer caller pode forçar outro modelo via `ROUTER_OLLAMA_MODEL=qwen3:30b ./ollama_call.sh "..."` ou `./ollama_call.sh --model qwen3:30b "..."`.

## Validação

- ✅ `qwen2.5-coder:7b` confirmado disponível em `host.docker.internal:11434` (Phase 0 self-prep, `/api/tags`).
- ✅ Existing override path preservado (`ROUTER_OLLAMA_MODEL` env var + `--model` flag em ollama_call.sh).
- ✅ Sanity check 5 prompts (Wave 2 Day 1, Phase 4) inclui P005 (GENERAL post-fallback) e P020 (diagram T1 control) para confirmar zero regression no path Haiku.
- 🟡 Validação final no Day 7 re-benchmark (mesmo N=34 com fixes aplicados).

## Status

Proposed → será revisto pelo `final-reviewer` antes do PR. Marcado **Accepted** quando o Day 7 re-benchmark confirmar (a) zero timeouts em T0, (b) latency T0 < 40 s mean.
