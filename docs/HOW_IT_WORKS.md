# How It Works

End-to-end fluxo do orquestrador pessoal de modelos.

## Diagrama

```
                     ┌──────────────────────────────────────────┐
                     │  User escreve no Claude Code             │
                     └──────────────────┬───────────────────────┘
                                        │
                                        ▼
           ┌────────────────────────────────────────────┐
           │ Hook: UserPromptSubmit                     │
           │ → node tools/router/inject_context.js      │
           │   → spawn classify.js (heuristic, <50ms)   │
           │   → emite <router-hint> se confiança ≥ 0.6 │
           └──────────────────┬─────────────────────────┘
                              │
                              ▼
           ┌────────────────────────────────────────────┐
           │ Claude Code session (sessão atual)         │
           │ Lê o <router-hint> + CLAUDE.md global      │
           │ Decide:                                    │
           │  • respondo aqui mesmo? (default)          │
           │  • spawn model-architect (Opus)?           │
           │  • spawn model-reasoner (Sonnet)?          │
           │  • spawn cheap-triage (Haiku)?             │
           │  • spawn local-summarizer (Ollama)?        │
           └──────────────────┬─────────────────────────┘
                              │
            ┌─────────────────┼──────────────────┬─────────────────┐
            ▼                 ▼                  ▼                 ▼
     ┌─────────────┐   ┌─────────────┐   ┌──────────────┐  ┌──────────────┐
     │ T3: Opus    │   │ T2: Sonnet  │   │ T1: Haiku    │  │ T0: Ollama   │
     │ subagent    │   │ subagent    │   │ via API key  │  │ via HTTP     │
     │ via Task    │   │ via Task    │   │ (curl)       │  │ qwen3:30b    │
     └─────────────┘   └─────────────┘   └──────────────┘  └──────────────┘
```

## Ficheiros chave

| Ficheiro | Função |
|---|---|
| `~/.claude/CLAUDE.md` | Instruções globais que aparecem em toda sessão |
| `~/.claude/settings.json` | Hook `UserPromptSubmit` registado (preserva GSD hooks) |
| `~/.claude/tools/router/classify.js` | Heurísticas puras, retorna JSON de roteamento |
| `~/.claude/tools/router/inject_context.js` | Wrapper que o hook chama; emite `<router-hint>` |
| `~/.claude/tools/router/ollama_call.sh` | curl para `/api/generate` do Ollama local |
| `~/.claude/tools/router/anthropic_call.sh` | curl para Anthropic Messages API (Haiku/Sonnet) |
| `~/.claude/skills/model-router/SKILL.md` | Skill explícito para `/router` |
| `~/.claude/agents/model-architect.md` | Subagent Opus — arquitetura, refator crítico |
| `~/.claude/agents/model-reasoner.md` | Subagent Sonnet — bug hunt, plano técnico |
| `~/.claude/agents/cheap-triage.md` | Subagent Haiku — commit msg, docstring, regex |
| `~/.claude/agents/local-summarizer.md` | Delega Ollama — sumarização, comparação |
| `~/.claude/agents/local-transformer.md` | Delega Ollama — format transforms |
| `~/.claude/agents/final-reviewer.md` | Subagent Opus — review pré-merge/deploy |

## Ciclo de vida de um turn

1. **User digita prompt**.
2. **Hook `UserPromptSubmit`** chama `inject_context.js`. Stdin = JSON do harness com o prompt.
3. `inject_context.js` extrai o prompt e chama `classify.js` em subprocesso (timeout 1.5s).
4. `classify.js` aplica heurísticas (regex sobre o prompt), produz JSON com tier/backend/model/confidence.
5. Se `confidence ≥ 0.6`, `inject_context.js` imprime um bloco `<router-hint>` em stdout. Senão, sai 0 silenciosamente.
6. Claude Code injeta esse stdout como contexto adicional do turn.
7. **Eu (Claude Code session) leio o hint** e decido se executo localmente, spawno subagent, ou ignoro a sugestão (justificando).
8. Se spawno subagent → ele tem o `model:` correto no frontmatter → o harness invoca o modelo certo.
9. Se for tarefa T0 e eu spawno `local-summarizer`, ele chama `bash ~/.claude/tools/router/ollama_call.sh --text "..."` e retorna o output do qwen3:30b.

## Por que UserPromptSubmit e não PreToolUse?

`UserPromptSubmit` corre **antes** do model decidir o que fazer no turn. Isso permite injetar a sugestão ANTES da decisão. `PreToolUse` corre depois — tarde demais para guiar o roteamento.

Importante: `UserPromptSubmit` é não-destrutivo. Se o hook falhar ou não emitir nada, o turn segue normal. Zero risco de quebrar nada.

## Por que classificador heurístico e não LLM?

- **Latência**: <50ms vs 500-2000ms para um LLM call.
- **Custo**: zero. Um classificador LLM gastaria tokens em **todos** os turns.
- **Determinismo**: fácil debugar e ajustar regex.
- **Suficiente**: o objetivo é uma sugestão, não decisão final. Quando heurística falha, eu (a sessão) corrijo.

## Como isto reduz o custo na prática

| Cenário | Antes | Depois |
|---|---|---|
| "explica este erro" | Opus ($$$$) | Ollama (zero) ou Haiku ($) |
| "gera commit message" | Opus ($$$$) | Haiku ($) ou Ollama (zero) |
| "resume este ficheiro" | Opus ($$$$) | Ollama (zero) |
| "refator a arquitetura" | Opus ($$$$) | Opus ($$$$) — mantém qualidade |
| "investiga este bug" | Opus ($$$$) | Sonnet ($$) |

Estimativa: **~50–70% redução em tokens cobráveis** assumindo distribuição típica de pedidos triviais/médios/críticos.
