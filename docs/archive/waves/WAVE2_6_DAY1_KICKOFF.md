# Wave 2.6 Day 1 — Kickoff master prompt (Rebrand Pastor → Mooter+Moos)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ Wave 2.5 fechada (tag `v0.2.1-polish`, commit `3bb94b8` em dev)
- ✅ `docs/strategy/WAVE2_6_PLAN.md` existe (SSoT da Wave 2.6)
- ✅ Vocabulário decidido: "Mooter pastors the Moos" (Mooter=entity, Moos=workers, "to pastor"=verb)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.6-day1-rebrand-mooter-moos` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 1**: rebrand semântico Pastor → Mooter+Moos em todos os ficheiros vivos (excepto arquivos históricos e código TS/JS interno). Lê `docs/strategy/WAVE2_6_PLAN.md §1.1-1.3` para scope completo.

**Sub-features (4)**:
1. **Renames**: `PASTOR.md` → `MOOTER_PLAYBOOK.md` · `PASTOR_OPERATIONS.md` → `MOOTER_OPERATIONS.md` · memória persistente `project_mooter_pastor_*` → `project_mooter_*`
2. **Find-replace coerente** em `docs/strategy/**` (excl. archive), `SYNC.md`, `README.md`, `packages/**/README.md`
3. **Landing copy review** em `landing/` — qualquer "Pastor" visível ao user
4. **GLOSSARY.md (NEW)** — vocabulário canónico oficial

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar `docs/archive/**`** — histórico mantém "Pastor"
- ❌ **NÃO tocar `~/.claude/agents/*`** — names internos não vazam
- ❌ **NÃO renomear variable names em .ts/.js** (e.g., `pastorClass` se existir — Wave 3 backlog)
- ❌ **NÃO tocar event schema `mooter_event.ts`** (Wave 2 D4)
- ✅ **Final-reviewer T3-gate** antes do PR
- ✅ **Notion sub-page** ao fim
- ✅ **GLOSSARY.md** é SSoT do vocabulário daqui em diante

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma 3bb94b8 ou b59191a no topo
git checkout -b wave2.6-day1-rebrand-mooter-moos
```

Recon (antes de tocar):
```bash
# Inventário: onde "Pastor" aparece (excluir archive)
grep -rn "Pastor" docs/ --exclude-dir=archive | head -80
grep -rn "Pastor" landing/ 2>/dev/null | head -40
grep -rn "Pastor" packages/*/README.md 2>/dev/null
grep -rn "Pastor" *.md | head -40
grep -rn "pastor" tools/router/*.js | head -20  # JS — só vê o que está, NÃO renomear vars
```

## 3. Sub-feature 1 — Renames

```bash
# Renames principais
git mv docs/strategy/PASTOR.md docs/strategy/MOOTER_PLAYBOOK.md
git mv docs/strategy/PASTOR_OPERATIONS.md docs/strategy/MOOTER_OPERATIONS.md  # se existir

# Memória persistente (path ajusta consoante OS)
MEMORY_DIR="$HOME/AppData/Roaming/Claude/local-agent-mode-sessions/f1932767-20ef-4c22-ba16-9e1a08fabdb7/bc9421cf-bf57-4102-a2dd-11c6f501bdad/spaces/1acf54b6-e90f-4e59-a3fa-1c70d567b0ae/memory"
# Se existir esse path:
# mv "$MEMORY_DIR/project_mooter_pastor_wave1_shipped.md" "$MEMORY_DIR/project_mooter_wave1_shipped.md"
# mv "$MEMORY_DIR/project_mooter_pastor_eixo3.md" "$MEMORY_DIR/project_mooter_eixo3.md"
# Updates ao MEMORY.md index dentro de memory/
```

**Commit 1** (separado para clareza de history): `chore(rebrand): rename PASTOR.md → MOOTER_PLAYBOOK.md + memória files`

## 4. Sub-feature 2 — Find-replace coerente

### 4.1 Regras semânticas (decidir caso a caso)

| Padrão actual | Substituir por | Razão |
|---|---|---|
| `Pastor` (sujeito a fazer routing) | `Mooter` | É a entidade |
| `the Pastor` (entidade) | `the Mooter` ou `Mooter` (sem artigo) | Idem |
| `Pastor decides/routes/picks` | `Mooter pastors` ou `Mooter routes` | Verbo natural |
| `Pastor's job` | `Mooter's job` | Possessivo |
| `Pastor agents/workers/models` (colectivo) | `the Moos` | Colectivo workers |
| `Pastor protocol/contract` | `Mooter protocol` | Protocolo da entidade |
| `Pastor mood/state` | `Mooter mood` | Estado da entidade |

### 4.2 Heurística de substituição

NÃO uses `sed -i 's/Pastor/Mooter/g'` cego — vai partir contextos. Em vez disso, para cada ficheiro:

1. `grep -n "Pastor" <file>` para localizar cada match
2. Lê 3 linhas de contexto à volta
3. Decide entity vs colectivo com base no contexto
4. `Edit` tool com old_string + new_string (preserva precisão)

**Ficheiros target prioritários** (na ordem):
1. `docs/strategy/MOOTER_PLAYBOOK.md` (acabaste de renomear — agora actualizar conteúdo)
2. `docs/strategy/STRATEGY.md`
3. `docs/strategy/ARCHITECTURE_V4.md`
4. `docs/strategy/ROUTING.md`
5. `docs/strategy/MASTER_PROMPT.md`
6. `docs/strategy/FLOWCHART.md`
7. `docs/strategy/BRIEFING.md`
8. `docs/strategy/WAVE*_PLAN.md` (active — NÃO archive)
9. `docs/strategy/WAVE*_KICKOFF.md` (active — NÃO archive)
10. `docs/strategy/MOOTER_OPERATIONS.md` (se renomeado)
11. `SYNC.md`
12. `README.md` (root)
13. `packages/cli/README.md`, `packages/router/README.md` (se existirem)

**Commit 2**: `refactor(rebrand): replace "Pastor" with "Mooter"/"Moos" per GLOSSARY semantics`

## 5. Sub-feature 3 — Landing copy review

```bash
# Inventário do landing
grep -rn "Pastor\|pastor" landing/ --include="*.tsx" --include="*.ts" --include="*.md" --include="*.mdx" 2>/dev/null
```

Para cada match:
- Texto visível ao user (h1/h2/p/button label) → substitui pela formulação certa: `Mooter pastors the Moos` (verb usage) ou `the Moos` (collective)
- Comentário de código → manter ou substituir consoante context

Exemplos prováveis:
- `<h1>Mooter — the Pastor for Claude Code</h1>` → `<h1>Mooter — pastors your Moos</h1>`
- `<p>The Pastor watches your prompts and routes them...</p>` → `<p>Mooter watches your prompts and pastors them to the right Moo...</p>`

**Commit 3** (se houver mudanças landing): `refactor(rebrand): landing copy aligned with GLOSSARY`

## 6. Sub-feature 4 — GLOSSARY.md (NEW)

**Ficheiro**: `docs/strategy/GLOSSARY.md`

```markdown
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
- Variable names em `.ts/.js` (e.g., `pastorClass`) — refactor Wave 3+
- Subagent file names em `~/.claude/agents/` — internos, não vazam

## Versão

Versão actual: 1.0 (2026-05-31, criado Wave 2.6 Day 1)
```

**Commit 4**: `docs(glossary): add canonical Mooter vocabulary GLOSSARY.md`

## 7. README link

Adiciona linha no `README.md` (root, secção docs):
```markdown
- [GLOSSARY](docs/strategy/GLOSSARY.md) — vocabulário canónico Mooter
```

**Commit 5** (pode ser amend do anterior se trivial): `docs(readme): link to GLOSSARY`

## 8. Verificação final

```bash
# Zero "Pastor" fora de archive + GLOSSARY (que pode mencionar para deprecar)
grep -rn "Pastor" docs/ --exclude-dir=archive | grep -v "GLOSSARY.md" | grep -v "deprecated" | grep -v "ex-PASTOR"

# Deve retornar 0 lines (ou apenas occorrências contextualmente válidas, e.g., menções históricas dentro de tabelas de changelog)

# Memória index actualizada
ls -la "$MEMORY_DIR/" | grep mooter
cat "$MEMORY_DIR/MEMORY.md" | grep mooter
```

## 9. Tests

Não há tests automáticos para rebrand (é textual). Final-reviewer faz audit manual + grep.

## 10. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.6-day1-rebrand-mooter-moos vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- docs/archive/** UNTOUCHED
- ~/.claude/agents/* UNTOUCHED
- Renames feitos: PASTOR.md → MOOTER_PLAYBOOK.md (git history preserva)
- GLOSSARY.md existe + bem formatado + linked do README
- grep 'Pastor' docs/ (excl archive + GLOSSARY) → 0 occorrências indevidas
- Landing copy: zero 'Pastor' visível ao user
- Memória persistente renomeada se aplicável
- Commits coerentes (≥3 commits separados: rename, content, glossary)
- Sem git add -A, sem --no-verify
- mooter_event.ts schema INTACTO
- Variable names em .ts/.js NÃO alterados (out of scope Day 1)
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR

```bash
git push -u origin wave2.6-day1-rebrand-mooter-moos
gh pr create --base dev --title "Wave 2.6 Day 1: Rebrand Pastor → Mooter+Moos (semantic alignment)" --body-file - <<'EOF'
## Summary
Rebrand semântico: "Pastor" → "Mooter" (entity) + "Moos" (workers) em todos os ficheiros vivos. Coerência antes da Wave 3 activation+hub.

## Changes
- **Renames**: PASTOR.md → MOOTER_PLAYBOOK.md · memória `project_mooter_pastor_*` → `project_mooter_*`
- **Find-replace coerente** docs/strategy/ + SYNC + READMEs (per GLOSSARY semantics)
- **Landing copy review** — zero "Pastor" visível ao user
- **NEW**: docs/strategy/GLOSSARY.md — SSoT vocabulário canónico

## Vocabulary (canonical)
- Mooter = entity (THE pastor) · "Mooter routes T2 to sonnet"
- Moos = collective workers · "Mooter pastors the Moos"
- A Moo = individual worker · "This Moo handled the bash"
- to pastor = verb · "Mooter pastors prompts"

## Out of scope (declared)
- docs/archive/** (histórico preservado)
- Variable names .ts/.js (Wave 3 backlog)
- ~/.claude/agents/* (internos)
- Event schema mooter_event.ts (W2 D4)

## Verification
- grep 'Pastor' docs/ (excl archive + GLOSSARY) → 0 indevidas
- landing/ → 0 "Pastor" visíveis
- README links to GLOSSARY

## Tests
- N/A (rebrand textual). Final-reviewer audit manual + grep.

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog Day 2
- Statusline 2-line + mooter dashboard TUI (uses new vocab)
EOF
```

## 12. Notion + SYNC

### 12.1 Notion sub-page (Notion MCP)

Title: `🐮 Sessão YYYY-MM-DD — Wave 2.6 Day 1 (rebrand Pastor → Mooter+Moos)`

Body: vocabulário oficial · ficheiros tocados · landing review verdict · GLOSSARY.md highlights · Day 2 backlog.

### 12.2 SYNC.md update

- `## Estado Actual` → Wave 2.6 D1 ✅ shipped
- `## Notion HQ` → add link D1
- `📥 COWORK → CLAUDE CODE` → next: Day 2 (statusline 2-line + dashboard TUI)

## 13. Resumo final na chat

```
✅ Wave 2.6 Day 1 — Rebrand COMPLETO
- Branch: wave2.6-day1-rebrand-mooter-moos (pushed)
- PR: #<N> (link) → dev
- Sub-features (4): renames · find-replace · landing review · GLOSSARY.md
- Vocabulário: Mooter (entity) · Moos (collective) · "Mooter pastors the Moos"
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Cost sanity: $0

⏸ Aguardando merge para arrancar Day 2 (statusline 2-line + dashboard TUI).
```

=== END ===
