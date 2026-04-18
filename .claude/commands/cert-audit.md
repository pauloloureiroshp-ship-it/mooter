# /cert-audit — Claude Certified Architect Foundations Audit

> **Lê TUDO antes de qualquer tool call:**
> ```
> Read /frugal/prompts/CLAUDE_ARCHITECT_CERT_AUDIT_MASTER.md   ← brief completo (obrigatório)
> Read /frugal/CLAUDE.md · Read /frugal/SYNC.md · Read /frugal/INFRA.md
> ```

**Domínios a auditar (por peso):**
D1 Agentic Architecture 27% · D2 Tool Design & MCP 18% · D3 CC Config 20% · D4 Prompt Eng 20% · D5 Context Mgmt 15%

---

## PASSO 0 — Estado baseline

```bash
# Subagent definitions
ls ~/.claude/agents/ 2>/dev/null || echo "GAP: no agent definitions"

# Hooks
cat ~/.claude/settings.json 2>/dev/null | grep -A10 "hooks"

# Rules
ls /frugal/.claude/rules/ 2>/dev/null || echo "GAP: no path-scoped rules"

# Structured error responses no hub
grep -rn "isError\|errorCategory\|isRetryable" /frugal/hub/src/ 2>/dev/null | wc -l

# CI com claude -p
ls /frugal/.github/workflows/ 2>/dev/null && grep -l "claude" /frugal/.github/workflows/*.yml 2>/dev/null
```

---

## SPRINT CERT-1 — Prioridade máxima (D1, 27%)

**1. AgentDefinition files** — criar `~/.claude/agents/` com os 6 subagents:
```
model-architect.md  · model-reasoner.md  · cheap-triage.md
local-summarizer.md · local-transformer.md · final-reviewer.md
```
Cada ficheiro: frontmatter com `allowed-tools` + `model` + secção de error reporting format.

**2. PostToolUse hook** — `~/.claude/tools/router/post_tool_guard.js`
Bloqueia: `git push --force` sem final-reviewer, `rm -rf`, `DROP TABLE` sem approval.
Registar no `~/.claude/settings.json` → `hooks.PostToolUse`.

**3. stop_reason loop** — verificar que qualquer agentic loop custom usa:
```javascript
while (response.stop_reason === "tool_use") { /* process */ }
// end_turn → present response
```

---

## SPRINT CERT-2 — D3 (20%) + D2 (18%)

**4. `.claude/rules/` path-scoped**
```bash
mkdir -p /frugal/.claude/rules/
# api-conventions.md · router-logic.md · test-conventions.md · migration-safety.md
# Cada um com YAML frontmatter: paths: ["landing/app/api/**/*.ts"]
```

**5. Skill SKILL.md frontmatter** — adicionar a todos os skills existentes:
```yaml
context: fork
allowed-tools: [lista restrita]
argument-hint: "[argumento esperado]"
```

**6. GitHub Actions** — `.github/workflows/claude-review.yml` com `claude -p` + `--output-format json`

**7. Tool descriptions ricas no hub** — auditar `/frugal/hub/src/`
Cada tool: exemplo de query, edge cases, quando NÃO usar, formato de input.

**8. Structured errors** — hub Workers retornam `{ isError, errorCategory, isRetryable, content }`

---

## SPRINT CERT-3 — D4 (20%) + D5 (15%)

**9. Multi-pass final-reviewer** — actualizar agent definition com 3 passes explícitos.

**10. Validation-retry em classify.js** — retry se confidence < 0.4.

**11. tool_use + JSON schema** — structured output para análises automáticas no hub.

**12. Message Batches API** — overnight quality audits (50% cheaper).

**13. Scratchpad protocol** — adicionar à CLAUDE.md para sessões > 20 turns.

**14. /compact + lost-in-the-middle** — adicionar guidance à CLAUDE.md.

**15. Information provenance** — format `claim + source + confidence + date` nos subagent outputs.

---

## CHECKLIST FINAL

```
SPRINT CERT-1
[ ] 6 AgentDefinition files criados com allowedTools
[ ] PostToolUse hook implementado e registado
[ ] stop_reason loop verificado

SPRINT CERT-2
[ ] .claude/rules/ criado com ≥3 ficheiros path-scoped
[ ] Skills actualizados com context:fork + allowed-tools
[ ] GitHub Actions claude -p workflow criado
[ ] Tool descriptions ricas no hub (≥3 melhoradas)
[ ] Hub errors estruturados (isError/errorCategory/isRetryable)

SPRINT CERT-3
[ ] final-reviewer com 3 passes documentados
[ ] classify.js validation-retry para confidence < 0.4
[ ] tool_use JSON schema em ≥1 análise automática
[ ] Message Batches API para overnight job
[ ] Scratchpad protocol na CLAUDE.md
[ ] /compact guidance na CLAUDE.md
[ ] Provenance format nos subagent outputs

BUILD + DEPLOY
[ ] npm run build → exit 0
[ ] CI 66/66 verde
[ ] git push + Vercel READY
[ ] Página Notion criada para sessão de certificação
[ ] SYNC.md actualizado com estado de certificação
```

**Nota estimada actual: ~716 (4pt abaixo do pass de 720)**
**Nota pós-sprints: ~900+ (PASS ✅)**

```
INFRA IDs rápidos:
Vercel prj_2aZMQagzjYOtLyvofeWPnEA0mM1b · Supabase eymtobwinevywmmlmxqa
CF b1093c8a6e663afd02f98a1e87d0fa34 · Hub mooter-hub.frugal-hub.workers.dev
Notion HQ 33d6f6e4-2bc4-816b-977a-fe84bbe912c9
```
