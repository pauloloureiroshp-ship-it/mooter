# Model Mapping

Onde cada modelo está configurado e como trocar.

## Modelos atuais

| Tier | Modelo | Configurado em | Override por env var |
|---|---|---|---|
| T0 (local) | `qwen3:30b` | `tools/router/classify.js` (`MODELS.ollama`) | `ROUTER_OLLAMA_MODEL` |
| T1 (cheap Claude) | `claude-haiku-4-5-20251001` | `tools/router/classify.js` (`MODELS.haiku`), `anthropic_call.sh` | `ROUTER_ANTHROPIC_MODEL` |
| T2 (reasoning Claude) | `claude-sonnet-4-6` | `agents/model-reasoner.md` frontmatter `model: sonnet` | — (alias do harness) |
| T3 (premium Claude) | `claude-opus-4-6` | `agents/model-architect.md` + `agents/final-reviewer.md` `model: opus` | — (alias do harness) |

## Como o harness resolve `model: sonnet|opus|haiku`

O Claude Code resolve aliases `opus`/`sonnet`/`haiku` para o modelo mais recente da família **no momento da invocação**. Hoje (2026-04-06):

- `opus` → `claude-opus-4-6`
- `sonnet` → `claude-sonnet-4-6`
- `haiku` → `claude-haiku-4-5-20251001`

Quando a Anthropic lançar `claude-opus-4-7`, o alias `opus` no frontmatter dos subagents passa a apontar para o novo modelo automaticamente. Sem mudar nada.

## Como trocar o modelo Ollama

### Opção A — variável de ambiente (temporária)
```bash
export ROUTER_OLLAMA_MODEL=qwen2.5-coder:7b
```

### Opção B — editar `classify.js` (persistente)
```js
const MODELS = {
  ollama: 'qwen2.5-coder:7b',  // <— aqui
  ...
};
```

### Opção C — instalar mais modelos e deixar o router escolher
Recomendado: ter pelo menos 2 modelos locais para o router escolher.

```bash
# rápido para tarefas triviais
ollama pull qwen2.5:3b
# coder dedicado
ollama pull qwen2.5-coder:7b
# raciocínio (já tens)
ollama pull qwen3:30b
```

> Para o router escolher entre modelos locais, é preciso evoluir `classify.js` para mapear cada `task_category` a um modelo Ollama diferente. Hoje só usa um.

## Como trocar o modelo Anthropic barato (T1)

Editar `tools/router/classify.js`:
```js
const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',  // <— aqui
};
```

Ou via env var na sessão:
```bash
export ROUTER_ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

## Como trocar o modelo de um subagent

Edita o frontmatter do subagent. Ex.: `~/.claude/agents/model-architect.md`:

```yaml
---
name: model-architect
model: opus       # ← muda aqui
---
```

Valores válidos: `opus`, `sonnet`, `haiku`, ou um ID exato como `claude-opus-4-6`.

## Habilitar T1 (Haiku via API direta)

Hoje T1 está degradado para T0 porque `ANTHROPIC_API_KEY` não existe no env.

Para habilitar:
1. Adicionar a chave Anthropic ao ambiente (NÃO ao projeto):
   ```bash
   # ~/.bashrc ou ~/.profile
   export ANTHROPIC_API_KEY="sk-ant-..."
   ```
2. Reabrir o terminal.
3. Testar: `node ~/.claude/tools/router/classify.js "gera um commit message"` — agora deve mostrar `tier: T1, recommended_backend: anthropic_api`.

⚠ **Cuidado**: o Claude Code já usa OAuth via `~/.claude/.credentials.json`. Adicionar `ANTHROPIC_API_KEY` ao env **pode** mudar o comportamento de billing — testa primeiro num projeto descartável.
