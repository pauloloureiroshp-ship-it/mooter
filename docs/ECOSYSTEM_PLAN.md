# Frugal — Plano de Ecosistema de Terceiros
> Criado em Cowork, 2026-04-14. Avaliação completa + plano de implementação faseado.

---

## TL;DR

| Repo | Decisão | Prioridade | Risco |
|---|---|---|---|
| `affaan-m/everything-claude-code` | ✅ Cherry-pick skills seleccionadas | Alta | Nenhum |
| `thedotmack/claude-mem` | ✅ Instalar como plugin | Alta | ⚠️ AGPL-3.0 (ler abaixo) |
| `safishamsi/graphify` | ✅ Instalar para frugal codebase | Média | Nenhum |
| `anthropics/skills` | ✅ Já instalado via plugin system | — | Nenhum |
| `hesreallyhim/awesome-claude-code` | 📖 Referência/discovery | — | Nenhum |
| `rohitg00/awesome-claude-code-toolkit` | 📖 Referência | — | Nenhum |
| `ccxray` | 🔍 Avaliar antes de instalar | Média | ⚠️ Proxy de API (ver abaixo) |
| `ccflare` | ✅ Instalar para dashboard de custos | Baixa | Nenhum |

---

## Avaliação de Segurança Detalhada

### 1. `everything-claude-code` (affaan-m)
- **Licença:** MIT
- **Risco:** Nenhum — são ficheiros SKILL.md (texto puro, sem código executável malicioso)
- **O que é:** 183 skills para Claude Code. Sistema de harness de performance com agents especializados, hooks, continuous learning.
- **Veredicto:** ✅ Seguro. Lê-se antes de instalar, é só Markdown com instruções.

### 2. `claude-mem` (thedotmack)
- **Licença:** AGPL-3.0 ⚠️
- **O que isto significa para ti:** Podes usar e modificar localmente sem restrições. A AGPL só obriga à partilha de código se *modificares e implementares num servidor de rede público*. Como o Frugal é um tool local/privado, não há problema.
- **Token $CMEM:** Um token Solana criado por terceiros, abraçado pelo autor. Não afecta o código. Informação apenas.
- **Código:** TypeScript, open e auditável. Hooks standard do Claude Code (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd). SQLite + Chroma vector DB.
- **Veredicto:** ✅ Seguro para uso local. Instalar via `npx claude-mem install`.

### 3. `graphify` (safishamsi)
- **Licença:** MIT (verificar ARCHITECTURE.md para detalhes)
- **Nota PyPI:** O package correcto é `graphifyy` (dois y). `pip install graphify` instala um package não-relacionado.
- **Privacidade:** Ficheiros de código são processados localmente via tree-sitter AST — nada sai da máquina. Docs/imagens/vídeos são enviados para a API do Claude com a tua API key (por design, esperado). Sem telemetria.
- **Veredicto:** ✅ Seguro. Instalar via `pip install graphifyy && graphify install`.

### 4. `anthropics/skills` (Anthropic)
- **Licença:** Apache 2.0 (exemplos) / source-available (docx, pdf, pptx, xlsx)
- **Veredicto:** ✅ Totalmente seguro. Já tens as skills instaladas via plugin system do Claude Code.

### 5. `ccxray` — ⚠️ Avaliar com cuidado
- **O que é:** Proxy HTTP transparente entre o Claude Code e a API Anthropic. Captura todos os tokens/custos em tempo real.
- **Risco:** Um proxy que fica no meio da tua comunicação com a API. Potencialmente expõe todo o teu contexto se não for código confiável.
- **Decisão:** Auditar o código antes de instalar. Não instalar sem revisão.

### 6. `ccflare` — Usage dashboard
- **O que é:** Dashboard de custos e métricas do Claude Code. Lê logs locais.
- **Risco:** Baixo — lê logs, não intercepta tráfego.
- **Veredicto:** ✅ Seguro. Instalar após avaliação do código.

---

## Skills a Cherry-Pick do ECC (everything-claude-code)

De 183 skills disponíveis, estas são as directamente relevantes para o Frugal:

### Tier 1 — Instalar imediatamente

| Skill | Porquê é relevante para Frugal |
|---|---|
| `context-budget` | Gestão de limites de tokens/contexto — core do Frugal |
| `cost-aware-llm-pipeline` | Pipeline LLM budget-conscious — directamente alinhado com a missão |
| `token-budget-advisor` | Optimização de uso de tokens — complementa o router |
| `continuous-learning-v2` | Knowledge acquisition — alimenta o auto-learning loop do Frugal |
| `prompt-optimizer` | Tuning de prompts — melhora o classifier |
| `mcp-server-patterns` | Desenvolvimento de MCP servers — T3 feature |

### Tier 2 — Instalar na sessão Claude Code

| Skill | Porquê |
|---|---|
| `deep-research` | Para sessões de investigação de arquitectura |
| `security-review` | Auditoria antes de tornar o Frugal público |
| `agent-eval` | Evaluation frameworks — para melhorar o backtest |
| `repo-scan` | Análise do repositório |
| `git-workflow` | Padrões de git workflow |
| `benchmark` | Performance measurement — para o stress-test |

### Não instalar (demasiado genérico ou irrelevante)
- Skills de frameworks específicos (Laravel, Spring, Android, etc.)
- Skills de saúde/healthcare
- Skills de DeFi/blockchain

---

## Repos Adicionais Encontrados (além dos 4 originais)

### Alta prioridade

**`hesreallyhim/awesome-claude-code`**
- Lista curada de skills, hooks, slash-commands, agent orchestrators
- Usar como *discovery resource* quando precisares de algo específico
- Não instalar — é um índice

**`rohitg00/awesome-claude-code-toolkit`**
- 135 agents, 35 skills, 176+ plugins, 20 hooks, 14 MCP configs
- Contém `reporecall` — tree-sitter indexing híbrido keyword+vector em ~5ms
- Avaliar `reporecall` para integrar no Frugal como alternativa/complemento ao claude-mem

**`reporecall` (dentro do toolkit acima)**
- Tree-sitter indexing (22 linguagens), hybrid keyword+vector search em ~5ms
- Compara bem com claude-mem para pesquisa de código
- Sem os contras da licença AGPL

### Média prioridade

**`ccflare`** — Dashboard de custos do Claude Code
- Métricas detalhadas, interface polida
- Complementar ao frugal-dashboard existente

**`jeremylongshore/claude-code-plugins-plus-skills`**
- 340 plugins + 1367 skills com CCPI package manager
- Usar como marketplace quando precisares de algo muito específico

---

## Plano de Implementação Faseado

### Fase 1 — Cowork session (hoje, ~30 min)
> Não requer Claude Code. Tudo via terminal ou npx.

```bash
# 1. Instalar claude-mem
npx claude-mem install
# Reiniciar Claude Code depois

# 2. Cherry-pick Tier 1 skills do ECC
mkdir -p ~/.claude/skills/context-budget
curl -fsSL https://raw.githubusercontent.com/affaan-m/everything-claude-code/main/skills/context-budget/SKILL.md \
  > ~/.claude/skills/context-budget/SKILL.md

# Repetir para: cost-aware-llm-pipeline, token-budget-advisor,
#               continuous-learning-v2, prompt-optimizer, mcp-server-patterns
```

### Fase 2 — Claude Code session (próxima sessão, ~1h)
> Requer Claude Code para integrar com o repo do Frugal.

```bash
# 1. Instalar graphify para o repo frugal
pip install graphifyy --break-system-packages
cd ~/frugal && graphify install
graphify .  # primeira execução — gera graphify-out/

# 2. Cherry-pick Tier 2 skills do ECC
# (deep-research, security-review, agent-eval, repo-scan, git-workflow, benchmark)

# 3. Avaliar reporecall como complemento ao claude-mem
# 4. Instalar ccflare dashboard

# 5. Auditar código do ccxray antes de decidir
```

### Fase 3 — T3 (quando Friends Beta tiver ≥3 users)
> Pré-requisito: T3 desbloqueado.

- Usar `mcp-server-patterns` skill como referência para implementar o MCP Server do Frugal
- Usar `continuous-learning-v2` para upgrade do auto-learning loop
- Avaliar integração completa do graphify com o classifier (mapa semântico do projecto)

---

## Impacto Esperado por Integração

| Integração | O que muda no Frugal | Ganho estimado |
|---|---|---|
| **claude-mem** | Memória vectorial automática entre sessões | Sessões 40-60% mais contextualizadas |
| **ECC skills Tier 1** | Melhores instruções para cost-awareness e optimização de prompts | Classifier mais preciso |
| **graphify** | Mapa semântico do codebase antes de cada sessão | Menos Grep/Read desnecessários |
| **reporecall** | Pesquisa de código em 5ms (vs Grep actual) | Menos tokens em tool calls |
| **ccflare** | Dashboard de custos unificado | Visibilidade de savings em tempo real |

---

## Notas para o Claude Code

Quando executares a Fase 2, o fluxo deve ser:

1. Ler este ficheiro primeiro
2. Cherry-pick skills ECC via curl (não clonar o repo inteiro — são 183 skills, pesa muito)
3. Instalar graphify e fazer primeira execução em `~/frugal/`
4. Verificar se o `graphify claude install` escreve no CLAUDE.md correcto (pode colidir com as tuas regras — rever antes)
5. Reportar no Notion + actualizar SYNC.md

---

*Última actualização: 2026-04-14 — Cowork session*
