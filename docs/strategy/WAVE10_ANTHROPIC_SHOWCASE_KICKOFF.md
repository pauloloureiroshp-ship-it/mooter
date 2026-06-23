# Wave 10 — Anthropic Showcase Quality

> **Como usar**: cola no Claude Code. Self-contained. Estimado 8-12h CC repartidas em 3 phases.
>
> **Pré-requisitos**:
> - PR #42 (dev→main, 96 commits Waves 2-9) já mergeado em main
> - Vercel auto-redeployou `mooter.ai` com v1.1.1
> - Cowork re-auditou prod live e confirmou 6 fixes Wave 9 aplicados
>
> **Origem**: 8 considerações do Paulo (2026-06-01) para qualidade Anthropic showcase:
>
> 1. 🟡 statusline ainda não reflete esteticamente o melhor
> 2. 🟡 statusline não convence vibe coders sobre quantização e LoRA/DoRA
> 3. 🟡 statusline não mostra **onde** local LLM foi utilizado
> 4. 🟡 bash command/task no terminal não mostra modelo usado
> 5. 🟡 não há visualização Dynamic Workflow do local LLM (o grande trunfo)
> 6. 🟠 mooter.ai mapeia 100% setup? manda stats? mostra performance real? UX/UI end-to-end perfeita?
> 7. 🟠 métricas/performance alinhadas com pipeline?
> 8. 🔴 estrutura de código eficiente para o projecto?
>
> **⚠️ DOUTRINA NOVA**: phase A é primariamente DESIGN, não código. CC compõe **3 mockups visuais** primeiro, **pára**, Paulo escolhe via Cowork, CC implementa o escolhido. Phase B é AUDIT (Cowork faz em paralelo via Chrome MCP). Phase C é ARCHITECT AGENT em worktree isolado.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave10-anthropic-showcase`. `--permission-mode bypassPermissions`.

**Missão Wave 10**: elevar `mooter.ai` a qualidade Anthropic showcase. 3 phases:

- **Phase A** (5 sub-features) — Statusline polish + Visibility do local LLM + Dynamic Workflow viz
- **Phase B** (4 sub-features) — Site E2E truth + Metrics audit + UX consistency
- **Phase C** (3 sub-features) — Code architecture review + ADR + quick wins

**3 PRs separados** (não 1 mega) — phase A → PR + merge dev + tag · phase B → PR + merge dev + tag · phase C → PR + merge dev + tag. Cada phase fecha antes de começar a seguinte.

## 1. Princípios não-negociáveis

1. **Anti-bazuca**: cada sub-feature começa com recon. Reporta findings antes de codificar.
2. **Design before code (Phase A)**: NUNCA implementes visual sem mockups review. CC + Cowork iteram juntos.
3. **Audit before fix (Phase B)**: NUNCA "corrige" sem inventário do que está realmente errado em prod.
4. **Architect before refactor (Phase C)**: NUNCA mexes em estrutura sem ADR aprovado.
5. **Vibe coder lens**: cada decisão visual/copy passa pelo filtro "um vibe coder de 25 anos com 2 anos de programação entende isto em <10s?"
6. **Anthropic showcase lens**: cada feature precisa passar o teste "isto faria com que um engineer da Anthropic mostrasse o produto a um colega?"

## 2. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost + adapter_selection + schemas v1 INTACTOS**
- ❌ **migrations 006/007/008 já aplicadas — não re-aplicar**
- ❌ **hub/ produção INTACTO** (a menos que Phase C explicitamente proponha mudança, com ADR aprovado)
- ❌ **Sub-feature A.1 (statusline visual)**: NÃO implementa antes de Paulo escolher mockup
- ❌ **Sub-feature A.5 (Dynamic Workflow viz)**: idem
- ❌ **Phase C**: sub-agent architect em worktree isolado, NÃO toca em main worktree
- ❌ **Não `git add -A`** · **`--no-verify`** · merge `main` sem Paulo aprovar
- ✅ **Final-reviewer T3-gate por phase** (3 vezes)
- ✅ **Auto-merge dev por phase** (3 PRs separados, NUNCA main directamente)
- ✅ **Tags**: `v1.2.0-statusline-polish` (A) · `v1.3.0-site-audit` (B) · `v1.4.0-architecture-quickwins` (C)
- ✅ **Vocabulário GLOSSARY** (Mooter, Moos, packs)
- ✅ **Honesty**: "Demo data" badge quando aplicável; nunca inventar números

## 3. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3   # confirma v1.1.1 (Wave 9 fixes mergeados)
git checkout -b wave10-anthropic-showcase
```

## 4. Phase A — Statusline + Visibility (5 sub-features)

### 4.0 Recon Phase A

```bash
# Statusline actual
cat tools/router/statusline-multi.js 2>/dev/null | head -100
cat tools/router/inject_context.js 2>/dev/null | head -100

# Moo card / per-prompt UI
grep -rn 'moo_card\|MooCard\|moo card' tools/router/ 2>/dev/null | head -10

# Local model probing
grep -rn 'ollama\|local model\|qwen' tools/router/ 2>/dev/null | head -20

# Hooks instalados
cat ~/.claude/settings.json 2>/dev/null | grep -A 5 'PostToolUse\|UserPromptSubmit\|Stop'

# Landing /how — Section "Why local models work"?
grep -rn 'quantization\|LoRA\|qwen2\.5' landing/app/ 2>/dev/null | head -20
```

**Reporta findings ao Paulo via chat antes de prosseguir.** Em particular:
- Statusline v2 está completo (Wave 5 D3)? O que falta visualmente?
- O moo card per-prompt (Wave 2.6 D3) está activo? Que dados expõe?
- PostToolUse hook está wired?
- Landing já tem secção sobre quantization?

### 4.1 — Statusline visual polish (#1)

**DESIGN-FIRST**. Não código de raiz.

**Passo 1 — Compor 3 mockups visuais** em `docs/strategy/WAVE10_STATUSLINE_MOCKUPS.md`:

- **Variant A — Minimalist**: 1-line dense, monocromático cinzas + 1 accent rosa, ascii icons só
- **Variant B — Information-rich**: 2-line, gradient subtle, emoji icons, mostrar mais signals (ctx %, latency, savings $)
- **Variant C — Cinematic**: 2-line com sparkline mini gráfico das últimas 10 decisões, full color tier indicators

Cada variant: ASCII mockup + 5-7 bullets explicando hierarquia visual + decisões de design + trade-offs.

**Passo 2 — Pára.** Output ao Paulo via chat:
```
Phase A.1 — 3 mockups compostos em docs/strategy/WAVE10_STATUSLINE_MOCKUPS.md.
Cowork: por favor revê e apresenta ao Paulo. Aguardo decisão "Variant A/B/C" antes de implementar.
```

**Passo 3 (após Paulo escolher)**: implementa variant escolhido em `tools/router/statusline-multi.js`. Testes existentes mantidos, +3 testes para novo layout.

### 4.2 — Quantization + LoRA/DoRA explainer (#2)

**Vibe coder lens**: explica em <30s, sem jargão.

**Implementação**:

1. **Tooltip no statusline** ao lado de `qwen2.5:3b Q4_K_M`:
   - Trigger: hover icon `ⓘ` adjacente
   - Conteúdo (2-3 linhas, EN):
     ```
     Q4_K_M = 4-bit quantization.
     Same model, -72% size, ~99% quality.
     Runs free on your RTX 4090.
     ```

2. **Section nova na landing `/` ou nova `/why-local`**:
   - 3 cards horizontais:
     - **Card 1 — Quantization**: "Q4_K_M shrinks a 30GB model to 8GB. Quality stays. Speed doubles. Free."
     - **Card 2 — LoRA / DoRA**: "Adapter layers fine-tune the model for YOUR codebase. ~50MB each. Free when local."
     - **Card 3 — Hardware match**: "mooter probes your GPU/CPU and pulls models that fit your VRAM. No config."
   - Visual: each card has icon (Lucide React) + heading + 2-line description + link "Learn more" → `/methodology#quantization`

3. **Methodology page expansão** (`/methodology`): adicionar secção `### Quantization (Q4_K_M, Q5_K_M, Q8_0)` com:
   - 200-word explainer
   - Tabela comparison size/speed/quality across quant levels
   - Benchmark data se disponível (do REPORT.md)

### 4.3 — Local LLM utilization heatmap (#3)

**Onde foi usado local LLM?** Vibe coder precisa de saber concreto.

**Implementação**:

1. **Nova tab no dashboard**: `Local usage` (entre `Decisions` e nova tab)
2. **Conteúdo**:
   - Top stat: `"You used local models for X% of your prompts this week — saved $Y"`
   - Heatmap visual: matriz `task_type × tier` mostrando % local vs cloud:
     ```
                  T0    T1    T2    T3
     Renames     100%  —     —     —
     Commits      87%  13%   —     —
     Docstrings   62%  38%   —     —
     Explain      45%  55%   —     —
     Debug        12%  31%   57%   —
     Refactor     —    8%    72%   20%
     Critical     —    —     —     100%
     ```
   - "Tasks where local LLM handled the heavy lifting:" lista das 10 últimas tarefas onde local foi usado, com input prompt truncado + output stats

3. **Data source**: `mooter_event` schema v1 (Wave 3 D3). Se schema não tem `task_type` field, adiciona com migration `009_event_task_type.sql` (campo nullable, classify.js infere com regex novo). **PARÁ e CONFIRMA com Paulo antes de migrar** — schema change é T3.

### 4.4 — Per-bash command model badge (#4)

**Cada bash/tool call** mostra modelo + tier no statusline.

**Recon primeiro**: já existe parcialmente em statusline-v2 (Wave 5 D3)? Confirma e completa o que falta.

**Implementação**:

1. **Hook `PostToolUse`** em `~/.claude/settings.json` (não-destructivo merge)
2. **Script** `tools/router/post_tool_badge.js`:
   - Lê última decisão do `mooter_event` log
   - Output inline: `🐂 sonnet T2 · ☁ 0.91 · 14ms · $0.003`
3. **Format**: usa a chat de variant A/B/C escolhida em §4.1 para consistência
4. **Testes**: 3 testes (badge appears, badge format correcto, badge não polui output se disabled)

### 4.5 — Dynamic Workflow visualization (#5)

**O GRANDE TRUNFO**. Mostrar visualmente o que aconteceu na pipeline.

**DESIGN-FIRST**. Como §4.1, compor 2 mockups em `docs/strategy/WAVE10_DYNAMIC_WORKFLOW_MOCKUPS.md`:

- **Variant 1 — Terminal session digest**: ASCII após cada sessão CC, summarized flow
  ```
  ✓ Session digest — 42 prompts in 1h 23m
  
  ┌─ T0 local (qwen2.5:3b)        ████████████ 28 prompts · 66% · $0.000
  ├─ T1 claude-haiku              ████ 9 prompts · 21%      · $0.007
  ├─ T2 claude-sonnet             ██ 4 prompts · 10%        · $0.041
  └─ T3 claude-opus               █ 1 prompt · 3%           · $0.150
  
  Total spent: $0.198  ·  Without mooter: $0.832  ·  Saved $0.634 (76%)
  ```

- **Variant 2 — Visual flow grafo**: dashboard new tab "Workflow", grafo flow (Sankey diagram?) mostrando a passagem de prompts pelos tiers

**Pára.** Output ao Paulo. Variant 1 OU 2 OU ambos (terminal + dashboard).

**Implementação** (após escolha):
- Variant 1: Stop hook que injecta digest no fim de cada sessão
- Variant 2: dashboard new tab com SVG flow gráfico (sem libs pesadas — SVG inline ou usar shadcn pattern)

### 4.6 — Phase A closure

```bash
# Verification phase A
git diff dev tools/router/classify.js                # VAZIO (P11)
git diff dev tools/router/safety_boost.js            # VAZIO
git diff dev tools/router/adapter_selection.js       # VAZIO
git diff dev hub/                                    # VAZIO
npm test                                              # router + landing verdes

# Final-reviewer T3-gate Phase A
# (ver §8 template)

# PR Phase A
git push -u origin wave10-anthropic-showcase
gh pr create --base dev --title "Wave 10 Phase A: Statusline + Visibility (5 sub-features)" --body ...
sleep 30 && gh pr merge $PR --squash --delete-branch

# Tag
git tag -a v1.2.0-statusline-polish -m "Wave 10 Phase A"
git push origin v1.2.0-statusline-polish

# Notion + SYNC.md + memória
```

**PÁRA AQUI** após Phase A. **Cowork re-audita live**. Paulo confirma "Phase A ok, segue B". Só depois arranca Phase B.

## 5. Phase B — Site E2E + Metrics audit (4 sub-features)

### 5.0 Recon Phase B

Phase B é **maioritariamente Cowork** — Cowork audita via Chrome MCP, devolve backlog, CC implementa.

**CC só implementa após Cowork entregar `docs/strategy/WAVE10_PHASE_B_BACKLOG.md`** com lista de findings priorizados.

**Aguarda esse ficheiro existir antes de mexer.** Quando existir, lê-o e prossegue.

### 5.1 — Setup mapping audit (#6)

**Após Cowork audit**, implementa fixes do backlog em:
- `landing/app/dashboard/_components/SetupCard.tsx` (ou wherever exibe setup detectado)
- Garante cross-reference: o que `mooter init` detecta ↔ o que dashboard mostra

**Tabela cross-reference** em `docs/strategy/SETUP_MAPPING.md`:
| Campo detectado por CLI | Onde aparece em dashboard? | Status |
| GPU model              | Sidebar header           | ✅ |
| VRAM (GB)              | Sidebar header (chip)    | ✅ |
| OS                     | Sidebar header           | ✅ |
| Ollama models pulled   | Setup tab cards          | ❓ verificar |
| Anthropic plan         | AI stack section         | ✅ |
| OpenAI plan            | AI stack section         | ❓ |
| Gemini plan            | AI stack section         | ❌ ausente? |
| CLAUDE.md path         | (nenhum?)               | ⚠️ deveria? |

Backlog do Cowork dirá quais.

### 5.2 — Real telemetry validation (#6 cont.)

**Verifica integrity**:
- `mooter_event` rows realmente vêm de CLI phone-home? Ou são mocks?
- Adicionar indicator UI: "Live data · 663 events from 1 device" vs "Demo data — no phone-home yet"
- Endpoint `/api/community/pulse` deu 404 nos logs Paulo. Investigar.

### 5.3 — UX/UI consistency review (#6 cont.)

Backlog Cowork dirá quais inconsistências. Tipicamente:
- Botões com sizes diferentes em flows similares
- Microcopy inconsistente ("Sign in" vs "Sign In" vs "Login")
- Empty states sem icon/CTA
- Error states genéricos sem actionable next step
- Mobile responsiveness (Cowork testa em viewport 380px)

### 5.4 — Métricas alinhadas (#7)

**Single source of truth** para stats. Já parcial em Wave 9 (Overview/How it works alinhados via `aggregateDevices()`). Estender a:
- `/admin` panel (stats agregados)
- Landing community hub (current 0 prompts — devia ler de `mooter_event` aggregate)
- Per-device drilldown (se múltiplos devices)

### 5.5 — Phase B closure

PR Wave 10 Phase B → tag `v1.3.0-site-audit`. **Pára. Cowork re-audita. Paulo aprova B → arranca C.**

## 6. Phase C — Code Architecture (3 sub-features)

### 6.1 — Architect agent spawn (worktree isolado)

```
Task tool, subagent_type: "general-purpose"
isolation: "worktree"
Prompt: "Senior software architect audit do repo Mooter.

Objectivos:
1. Mapa de dependências entre módulos: tools/router/ ↔ packages/cli/ ↔ landing/ ↔ hub/
2. Identifica:
   - Duplicação (same logic em > 1 lugar)
   - Tech debt (TODO/FIXME/XXX comments outstanding)
   - Dead code (módulos não importados)
   - Naming inconsistencies (frugal vs mooter — após rebrand)
   - Anti-patterns (god functions, deep nesting, callback hell)
   - Test gaps (módulos críticos sem testes)
3. Hierarquia de risco: top 10 issues por impacto × esforço-para-corrigir.

Output: `docs/strategy/ARCHITECTURE_AUDIT_2026-06.md` com:
- Executive summary (3 paragraphs)
- Issue catalogue (tabela: ID · file:line · category · severity · effort · proposed fix)
- ADR rascunhos para top 3 issues
- Recommended quick wins (< 30 min cada)
- Não-quick wins recomendados (necessitam future waves)

Não toca em código. Só audit + output documento.
Não toca em classify.js (P11 invariante absoluta).

Reporta de volta a estimativa de issues encontrados + top 3."
```

**Pára.** Aguarda o agent terminar.

### 6.2 — ADR + migration plan

Após audit completo, **lê** `ARCHITECTURE_AUDIT_2026-06.md` e:
1. Compõe 3 ADRs em `docs/architecture/decisions/`:
   - `ADR-001-<top-issue-slug>.md`
   - `ADR-002-<2nd-issue-slug>.md`
   - `ADR-003-<3rd-issue-slug>.md`
2. Cada ADR: Context · Decision · Consequences · Migration plan · Rollback plan
3. Apresenta ao Paulo via chat para approval.

### 6.3 — Implementar quick wins

**APENAS** se Paulo approve ADRs E quick wins forem < 30 min cada. Implementa.

Exemplos de quick wins típicos:
- Rename de "frugal" remanescentes para "mooter" (já em parte feito Wave 9)
- Remover dead code
- Adicionar JSDoc em funções públicas sem documentation
- Consolidar duplicação trivial

### 6.4 — Phase C closure

PR Wave 10 Phase C → tag `v1.4.0-architecture-quickwins`. Cowork audita docs ADR + Paulo aprova.

## 7. Tests aggregate (por phase)

| Phase | Tests pre | Tests added | Tests post |
|---|---|---|---|
| Wave 9 baseline | router 118 · landing 53 | — | — |
| Phase A | — | router +6 (badge, statusline) · landing +8 (heatmap, tooltip, mockups) | router 124 · landing 61 |
| Phase B | — | landing +12 (setup, telemetry, UX) | router 124 · landing 73 |
| Phase C | — | minimal (architect output is docs not code; quick wins têm testes mínimos) | router ~127 · landing ~75 |

## 8. Final-reviewer T3-gate templates

### Phase A
```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave10-anthropic-showcase vs dev (Phase A subset).

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + schemas v1 INTACTOS
- hub/ + migrations/ NOT touched
- Statusline visual variant escolhido implementado
- Tooltip Q4_K_M explainer EN-only
- Local LLM utilization tab adicionada · uses real mooter_event data OR Demo data badge
- Per-bash command badge wired via PostToolUse
- Dynamic Workflow viz variant escolhida implementada
- Vocabulário GLOSSARY (Mooter, Moos, packs)
- ZERO PII em telemetry ou UI
- Tests: router 124 · landing 61 verdes
- Cost sanity: $0
Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES."
```

### Phase B
```
Prompt: "Review Phase B... [adapta para Phase B specifics]"
```

### Phase C
```
Prompt: "Review Phase C — focar em ADRs (documentos) + quick wins implementados..."
```

## 9. PRs + tags (3 PRs separados)

| Phase | PR title | Tag |
|---|---|---|
| A | `Wave 10 Phase A: Statusline + Visibility (5 sub-features, Anthropic showcase)` | `v1.2.0-statusline-polish` |
| B | `Wave 10 Phase B: Site E2E + Metrics audit (4 sub-features)` | `v1.3.0-site-audit` |
| C | `Wave 10 Phase C: Architecture audit + ADRs + quick wins (3 sub-features)` | `v1.4.0-architecture-quickwins` |

## 10. Closure W10 (3x — uma por phase)

Cada phase:
- `git checkout dev && git pull origin dev`
- `npm test && npm run lint && npm run typecheck`
- `git tag` + push
- **Notion**: sub-page no HQ (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) — `🎨 Sessão 2026-06-0X — Wave 10 Phase X — [headline]`
- **SYNC.md**: actualizar
- **Memória persistente**: `project_mooter_pastor_wave10_phase[a|b|c]_shipped.md`

## 11. Resumo final (output esperado ao Paulo)

```
✅ Wave 10 — Anthropic Showcase Quality COMPLETA (3 phases)

Phase A (statusline + visibility):
- v1.2.0-statusline-polish · 5 sub-features
- Statusline variant [A/B/C] · Q4_K_M explainer · local usage heatmap · per-bash badge · Dynamic Workflow viz

Phase B (site E2E + metrics):
- v1.3.0-site-audit · 4 sub-features  
- Setup mapping consistency · real telemetry validation · UX/UI fixes do backlog · single source of truth metrics

Phase C (architecture):
- v1.4.0-architecture-quickwins · 3 sub-features
- ARCHITECTURE_AUDIT_2026-06.md · 3 ADRs · N quick wins implementados

Tests: ~127 router · ~75 landing · todos verdes
Investido: ~10-12h CC · ~$30-45 Anthropic API

⏸ Para. Próximo passo:
1) Paulo verifica mooter.ai/dashboard em produção (3 fases visíveis)
2) Validation 5 vibe coders agora faz sentido (qualidade Anthropic showcase atingida)
3) Marketing push pode arrancar
```

=== END ===

---

## Notas para Paulo (Cowork)

- **Wave 10 NÃO é uma wave normal.** É um composite: design (A) + audit (B) + architecture (C). Total: 8-12h CC + 2-3h Cowork (auditorias + design reviews).

- **Pontos de paragem obrigatórios** (3):
  1. Após Phase A §4.0 recon — Paulo escolhe statusline variant
  2. Após Phase B §5.0 — Cowork audita prod e entrega backlog
  3. Após Phase C §6.1 — Paulo aprova ADRs antes de implementar quick wins

- **Phase B depende de Cowork** (eu) fazer o E2E audit via Chrome MCP. Vou fazê-lo enquanto CC executa Phase A. Entrego o `WAVE10_PHASE_B_BACKLOG.md` antes de CC ter terminado Phase A.

- **Phase C usa architect sub-agent em worktree isolado** — main worktree continua tua. Sem risco.

- **Custo estimado total**: ~$30-45 Anthropic API + 2-3h tua review (escolhas de design + ADR approval).

- **Quando arrancar**: APENAS quando PR #42 (Wave 9) estiver mergeado em main + Vercel redeploy + Cowork audit confirme prod ok.
