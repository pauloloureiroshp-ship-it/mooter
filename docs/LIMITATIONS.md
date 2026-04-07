# Limitations — be honest

O que **não** ficou automático e por quê.

## 1. O modelo principal da sessão Claude Code não é trocado pelo router

Claude Code (CLI) escolhe o modelo da sessão no startup (ex.: `--model opus`). **Não há API pública estável** para o hook `UserPromptSubmit` ou qualquer outro mecanismo trocar o modelo principal a meio de uma sessão.

**O que o router faz em vez disso**: injeta um `<router-hint>` para que a sessão atual decida delegar a um subagent com `model:` apropriado. O subagent corre no modelo certo. A sessão pai continua no modelo que foi iniciado.

**Implicação prática**: se iniciaste a sessão em Opus e fazes uma pergunta trivial, a sessão pai (Opus) ainda lê o prompt e decide delegar — isso já consome alguns tokens em Opus. Mas a **maior parte** do trabalho (a resposta longa) acontece no subagent T0/T1.

**Mitigação**: começar sessões em Sonnet por default e escalar para Opus só quando necessário (`/model opus`).

## 2. T1 (Haiku via API direta) está degradado para T0 hoje

`ANTHROPIC_API_KEY` não está no env do shell. Sem essa key, `anthropic_call.sh` falha e o classificador degrada T1→T0.

**Mitigação**: ver `MODEL_MAPPING.md` § "Habilitar T1".

**Alternativa**: configurar um subagent `cheap-triage` com `model: haiku` — esse spawn-via-Task usa a mesma autenticação OAuth do Claude Code (não precisa de env var). Já está implementado.

## 3. Classificador é heurístico, não semântico

Regex sobre o prompt. Acerta a maioria, mas **falha** em casos como:
- Prompts em linguagem ambígua sem palavras-chave técnicas
- Pedidos curtos com contexto profundo necessário
- Prompts com sarcasmo, negações ("não é só refator")

**Mitigação**: confidence < 0.6 → não emite hint. A sessão pai decide normalmente.

**Evolução possível**: se houver budget, trocar `classify.js` por uma chamada Haiku de 50 tokens. ~$0.0001 por turn. Sub-segundo. Documentado mas não implementado para manter custo zero por default.

## 4. Spawn de subagent é decisão do model, não automática

O hook injeta a sugestão. **Eu** (a sessão pai) tenho que decidir spawnar o subagent. Se eu ignorar o hint, nada acontece. Não há forçamento estrutural.

**Mitigação**: `CLAUDE.md` global instrui explicitamente a ler e respeitar o `<router-hint>`. Mas é uma soft rule — confia na disciplina do model.

## 5. Apenas 1 modelo Ollama instalado

`qwen3:30b` é grande (18 GB, 30B params). Para tarefas verdadeiramente triviais, um modelo de 3B seria mais rápido. O router não tem como escolher entre vários modelos locais hoje.

**Mitigação**: instalar `qwen2.5:3b` e evoluir `classify.js` para mapear category→model. Trabalho de 30min.

## 6. Hooks GSD podem entrar em conflito com este router

Os hooks GSD (`gsd-*`) já existem em `PreToolUse`/`PostToolUse`/`SessionStart`. O router só adicionou `UserPromptSubmit` que não estava em uso, então **não há conflito hoje**. Mas se algum dia o GSD adicionar o seu próprio `UserPromptSubmit`, vão coexistir como entries separadas e ambos correm — atenção ao timeout total.

## 7. Não há plugin local reutilizável (ainda)

A Fase 1 é tudo `~/.claude/` flat. Para distribuir noutra máquina seria preciso copiar manualmente `tools/router/`, `agents/model-*.md`, `agents/local-*.md`, `agents/cheap-*.md`, `agents/final-*.md`, `skills/model-router/`, `docs/`, e merge manual de `settings.json`/`CLAUDE.md`.

**Evolução possível**: empacotar tudo isto como plugin Claude Code (`~/.claude/plugins/local/model-router/`) com manifest JSON. Documentado mas não feito porque o user pediu "se fizer sentido" e em v1 não faz — 1 máquina, 1 user.

## 8. Sem telemetria de poupança real

Não há contagem de tokens economizados. O ROI é estimado, não medido.

**Evolução possível**: adicionar log JSONL em `~/.claude/tools/router/decisions.log` que registe cada decisão de roteamento + tier final usado. Análise posterior.
