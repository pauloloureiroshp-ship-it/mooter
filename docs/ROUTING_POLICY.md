# Routing Policy

Política conservadora: **qualidade primeiro em tarefas críticas, economia em tarefas triviais, e na dúvida triagem barata antes de escalar**.

## Tiers

| Tier | Backend | Modelo (default) | Custo relativo | Uso |
|---|---|---|---|---|
| **T0 — Local** | Ollama | `qwen3:30b` | ~0 (GPU casa) | triagem, sumarização curta, extração, snippet trivial |
| **T1 — Claude barato** | API Anthropic direta | `claude-haiku-4-5-20251001` | $ | commit msg, docstring, regex, explicar erro simples, classificação |
| **T2 — Claude reasoning** | Subagent Claude Code | `claude-sonnet-4-6` | $$ | bug hunt moderado, root cause, plano técnico, decomposição |
| **T3 — Claude premium** | Subagent Claude Code | `claude-opus-4-6` | $$$$ | arquitetura, refator multi-arquivo, decisão com tradeoffs, review final |

> Sem `ANTHROPIC_API_KEY` em env, **T1 cai para T0**. O router avisa.

## Categorias de tarefa → Tier default

| Categoria | Tier | Notas |
|---|---|---|
| `architecture` | T3 | sempre Opus |
| `cross_file_change` | T3 | mesmo se "pequeno" |
| `critical_refactor` | T3 | |
| `final_review` | T3 | antes de merge ou de mexer em produção |
| `bug_hunt` | T2 | escala p/ T3 se >3 hipóteses falsas |
| `root_cause` | T2 | |
| `tradeoff_analysis` | T2 | |
| `technical_plan` | T2 | |
| `task_decomposition` | T2 | |
| `summarize_file` | T1 → T0 fallback | |
| `explain_simple_error` | T1 → T0 | |
| `commit_message` | T1 → T0 | |
| `docstring` | T1 → T0 | |
| `regex` | T1 → T0 | |
| `format_transform` | T1 → T0 | |
| `trivial_tests` | T1 → T0 | |
| `request_classification` | T0 | sempre local |
| `quick_triage` | T0 | |
| `compare_snippets` | T0 | |
| `extract_structure` | T0 | |
| `local_summary` | T0 | |
| `brainstorm_simple` | T0 | |

## Sinais de risco que forçam escalada

Se **qualquer** sinal abaixo aparece, o classificador sobe pelo menos 1 tier:

- prompt menciona produção, deploy, migração de banco, segurança, credenciais, secrets
- `git push --force`, `rm -rf`, drop table, reset --hard
- mais de 3 arquivos a tocar
- prompt > 800 caracteres com múltiplas instruções
- pedido de "review", "audit", "decidir entre"
- arquivos `.env*`, `package.json`, CI, migrations
- palavras `arquitetura`, `refator`, `crítico`, `urgente em prod`

## Sinais de baixo risco que permitem rebaixar

- prompt < 120 caracteres
- pergunta única, output esperado < 1 parágrafo
- "explica", "resume", "o que é"
- nenhum file edit
- contexto puramente leitura

## Escalada explícita

```
T0 ──(prompt ambíguo OU resposta local insuficiente)──▶ T1
T1 ──(reasoning multi-step OU risco médio)────────────▶ T2
T2 ──(decisão arquitetural OU risco alto)─────────────▶ T3
```

Nunca pular tier para baixo de uma vez (T3→T0). Pode descer tier a tier após validação humana.

## Guardrails anti-economia-burra

1. **Nunca** rebaixar tarefas marcadas `critical_*` ou `architecture`.
2. **Nunca** usar T0 para gerar código que vai diretamente para um arquivo de produção sem revisão.
3. T0 para tarefas com side effects (Bash destrutivo, Edit em arquivo crítico) é proibido — escala para T2 mínimo.
4. Se confiança da classificação < 0.5, escala 1 tier acima do default.
5. Em modo `--ship`, `--merge`, `--release`: sempre T3 para o passo final.

## Como o router aplica isto

1. `tools/router/classify.js` analisa o prompt e devolve JSON `{task_category, risk_level, recommended_backend, recommended_model, confidence, escalation_rule}`.
2. Hook `UserPromptSubmit` injeta esse JSON como contexto adicional no início do turn.
3. Claude Code (que vê o JSON) decide se delega ao subagent apropriado (`model-architect`, `model-reasoner`, `local-summarizer`, etc.).
4. Skill `model-router` fornece a heurística em linguagem natural quando o user pede explicitamente "/skill model-router".
