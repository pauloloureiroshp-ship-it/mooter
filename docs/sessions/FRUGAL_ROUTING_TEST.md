# Frugal Router — Live Visibility Test

> Teste prático end-to-end para confirmar visualmente que o routing entre LLMs
> está a funcionar, que cada Bash mostra o modelo real, e que a statusline
> reflecte a economia genuína (não advisory).
>
> **Como correr**: abre um **terminal novo** (não este) com Claude Code ligado
> no directório `~/frugal`. Cola este ficheiro inteiro no prompt (ou diz "executa
> o ficheiro FRUGAL_ROUTING_TEST.md" e Claude segue os passos um a um).

---

## Antes de começar — linha de base

Corre isto primeiro para snapshot do ponto de partida:

```bash
echo "=== session models BEFORE ===" && \
grep "session=$(claude --print-session-id 2>/dev/null || echo $FRUGAL_SESSION_ID)" \
  ~/.claude/hooks/execution.log 2>/dev/null | grep -oP "model=\S+" | sort | uniq -c || \
echo "(nothing yet — expected on a fresh session)"
```

Repara: deve estar vazio. Isto é uma sessão nova.

---

## Tarefa 1 — T0 esperado → `local-summarizer` (Ollama qwen3:30b)

**Prompt literal**:
> Resume-me em PT-PT, sob 80 palavras, o propósito do ficheiro
> `~/.claude/tools/router/classify.js`. Explica em termos simples o que o
> classifier faz a cada prompt.

**O que deves ver**:
- Header: `frugal recommends → 🌱 T0 · 🦙 qwen3:30b · via ollama · conf ~85%`
- Claude spawns `Agent(subagent_type="local-summarizer")` — NÃO faz Read inline
- Após o Agent call: emoji visual `🦙 qwen3:30b · local · agent:local-summarizer`
- Footer: `frugal turn end → 🦙 qwen3:30b ×1 · actual ~$0.00 · saved ~$0.25 vs all-Opus`
- Statusline refresca com segmento 🦙 Local visível na barra

---

## Tarefa 2 — T0/T1 esperado → `cheap-triage` (Haiku) ou `local-summarizer` (se sem API key)

**Prompt literal**:
> Gera uma commit message (imperativo, máx 72 caracteres, em inglês) para esta
> mudança hipotética: "corrigir off-by-one em paginação quando page size é 1".

**O que deves ver**:
- Header: `frugal recommends → ⚡ T1 · ⚡ claude-haiku-4-5 · via claude_subagent`
  OU (se Haiku indisponível) `→ 🌱 T0 · 🦙 qwen3:30b · escalation: haiku_unavailable`
- Agent tool call para `cheap-triage` (ou `local-summarizer` em fallback)
- Emoji após: `⚡ claude-haiku-4-5 · reflex · agent:cheap-triage` OU `🦙 qwen3:30b · local`
- Footer mostra mais um segmento não-Opus
- Statusline: hero sobe para 5-10% saved

---

## Tarefa 3 — T2 esperado → `model-reasoner` (Claude Sonnet)

**Prompt literal**:
> Investiga o ficheiro `~/.claude/hooks/gsd-turn-end.js` e explica: como é que
> decide entre emitir um systemMessage de footer com sucesso vs fazer exit
> silencioso? Caminha pelas branches e diz quando cada uma dispara.

**O que deves ver**:
- Header: `frugal recommends → 🧠 T2 · 🟡 claude-sonnet-4-6 · via claude_subagent`
- Agent tool call para `model-reasoner`
- Emoji após: `🟡 claude-sonnet-4-6 · reasoning · agent:model-reasoner`
- Resposta do subagent com análise de branches e condições
- Footer mostra distribuição mista
- Statusline: hero agora deve rondar 15-25% saved e bar tem 🔴 🟡 🦙

---

## Tarefa 4 — T3 esperado → Opus inline (tu mesmo)

**Prompt literal**:
> Desenha a interface mínima de um novo hook chamado
> `frugal-compliance-report.js` que produz um digest diário da compliance de
> delegação por sessão, escrito para um ficheiro local. Quais são os tradeoffs
> de design chave? Responde com a arquitectura proposta, não implementação.

**O que deves ver**:
- Header: `frugal recommends → 🏛️ T3 · 🔴 claude-opus-4-6 · est. $0.012`
- Claude responde INLINE em Opus (legítimo — é arquitectura)
- Apenas emojis 🔴 Opus após tool calls se fizer algum
- Footer: `frugal turn end → 🔴 claude-opus-4-6 ×N · actual ~$X · no savings vs all-Opus`
- Statusline: hero desce ligeiramente (algum Opus adicionado à conta), mas o bar ainda mantém o mix anterior

---

## Verificação final

Depois das 4 tarefas, corre:

```bash
echo "=== session models AFTER ===" && \
tail -100 ~/.claude/hooks/execution.log | grep -oP "model=\S+" | sort | uniq -c
```

**Critério de sucesso**:
- ✅ Pelo menos **3 modelos distintos** aparecem (ex: qwen3:30b, claude-haiku-4-5 ou claude-sonnet-4-6, claude-opus-4-6)
- ✅ Statusline mostra `exec` badge (não `adv`) e distribuição com múltiplas cores
- ✅ Hero mostra `saved $X` real com percentagem > 0
- ✅ Cada turn do teste teve um header diferente antes de começar

Se **qualquer** destes falhar, há um bug no pipeline — reporta com:
1. Screenshot do terminal
2. Output de `cat ~/.claude/hooks/execution.log | tail -50`
3. Output de `cat ~/.claude/tools/router/decisions.log | tail -20`

---

## Anatomia visual esperada (para referência)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ > Tarefa 1 ...                                                          │
│                                                                         │
│ frugal recommends → 🌱 T0 · 🦙 qwen3:30b · conf 85% · est. save $0.25   │ ← turn header
│                                                                         │
│ [main Claude decides to delegate]                                       │
│ ⎿ Agent(subagent_type: "local-summarizer")                              │
│                                                                         │
│ [subagent runs in Ollama]                                               │
│ ⎿ 🦙 qwen3:30b · local · agent:local-summarizer                         │ ← post-tool emoji
│                                                                         │
│ [subagent response]                                                     │
│ "O classifier lê o prompt e mapeia para..."                             │
│                                                                         │
│ frugal turn end → 🦙 qwen3:30b ×1 · actual ~$0.00 · saved ~$0.25        │ ← turn footer
└─────────────────────────────────────────────────────────────────────────┘

Statusline (rodapé):
Claude Opus 4.6 │ frugal │ 🐕 💰 ↓87% saved ~$0.25 · spent ~$0.00 │ 
  ░░░░░░░░░░ exec 🔴 Opus 0% · 🦙 Local 100% 3k · ⚡RTX 4090
```

---

## Por que este teste existe

Antes de 2026-04-11, a statusline mostrava `pct_by_tier` advisory — números
que o router _recomendou_, não o que _correu_. Resultado: sessões 100% Opus
mostravam "40% saved" quando a poupança real era $0. O utilizador pedia para
fazer magia e o que via era uma mentira.

Após a sessão `👁️ Visibility stack + delegação real` (commits `08a6609` →
`e0efe95`), o pipeline tem 4 camadas de verdade, todas lendo a mesma fonte
(`execution.log` tagged por `PostToolUse` hooks com matcher `Bash|Agent|Task`):

1. **Doutrina** (CLAUDE.md v2) — obriga delegação em T0/T1
2. **Runtime directive** (inject_context.js) — injecta `<delegation_directive>` quando sessão 100% Opus
3. **Visual** (turn header + footer + per-tool emoji + statusline bar/hero) — tudo lê a mesma fonte
4. **Registo** (exec-logger.js + PostToolUse.js) — subagent spawns tagged com modelo efectivo

Este ficheiro é o teste de aceitação. Corre-o numa sessão nova, vê os 4
turns com 4 modelos diferentes, confirma que a statusline acompanha. Se
passar, o sistema está fiável. Se falhar, há um bug real a caçar.
