# Mooter v2 — Pastor Alemão (Skill-Pack Router)

> **Documento canónico** do segundo eixo de routing do Mooter. Companhia a `STRATEGY.md` (visão), `ROUTING.md` (eixo complexidade T0–T3), `MASTER_PROMPT.md` (Phases 0–14 do V3). **Não substitui** nenhum — adiciona o eixo *domínio → Moo Pack*.
>
> **Criado**: 2026-05-27 · **Autor**: Paulo Loureiro · **Owner**: Paulo · **Status**: 🟡 proposta, pronta a executar (Wave 1 = 7 dias)
>
> Research factual de suporte: [`research_best_in_class_2026.md`](./research_best_in_class_2026.md) (14 domínios, Maio 2026, fontes citadas).

---

## TL;DR

O Mooter v1 rotea **modelos** por complexidade (T0–T3). O Mooter v2 — Pastor Alemão — rotea **rebanhos** (Moo Packs) por intenção de domínio, escolhendo simultaneamente o modelo *e* o conjunto óptimo de skills, MCPs, sub-agentes, repos canónicos e prompt scaffolds. O modelo deixa de ser o output principal do classificador e passa a ser **uma das vaquinhas do rebanho**.

A tese cabe numa frase:

> *"O único router que escolhe o modelo certo, as ferramentas certas e os exemplos certos — antes de escrever um único token."*

Esta wave é **backward-compatible** com tudo o que já existe (`classify.js`, hooks, subagents, frugal-hub). Adiciona um classificador de domínio (camada regex → embedding → Haiku fallback) e um Pack Registry local + sindicado.

---

## 1. Tese

| Dimensão | v1 (existe) | v2 Pastor (esta wave) | v2.1 Pastor + Adapter Forge (Wave 5) |
|---|---|---|---|
| Eixo de routing | Complexidade | Complexidade **+** domínio | Complexidade + domínio **+ especialização** |
| Output do classifier | Tier T0–T3 | Tier + Pack ID | Tier + Pack ID + Adapter ID |
| Decisão sobre tools | Estática | Dinâmica (Pack diz quais) | Idem v2 |
| Decisão sobre skills | Manual | Pack invoca skills | Idem v2 |
| Decisão sobre MCPs | Tudo ligado sempre | Pack recomenda só necessários | Idem v2 |
| Decisão sobre pesos | Modelo base sempre | Modelo base sempre | **Adapter LoRA local quando disponível e validado em eval** |
| Onboarding de tools novos | User descobre manualmente | Pastor sugere instalar | Idem v2 + sugere treino de Project LoRA após N decisões |
| Diferencial competitivo | Router de modelo (saturado) | **Curador automático de stacks** (vazio) | **Switching cost biológico — adapter aprende o teu projecto** |

**Porquê agora**: a research 2026-05-27 confirma três coisas que abrem a janela:

1. Anthropic Skills tem **17 skills oficiais** mas a comunidade já produziu **>66 000** — não há *Skills Registry* canónico. ([SkillsMP](https://skillsmp.com/), [claudemarketplaces.com](https://claudemarketplaces.com/))
2. MCP Registry oficial Anthropic cobre **~20% dos servers existentes** — há 10k+ em PulseMCP/Smithery sem signal de qualidade unificado.
3. Frameworks de orquestração consolidaram para 6 dominantes (Claude Agent SDK, Strands, LangGraph, OpenAI Agents SDK, CrewAI, AG2) — espaço para um **router agnóstico** que escolhe *qual* usar por intenção, não que os substitui.

A research mostra ainda que **Smithery + Composio + PulseMCP estão a evoluir de catálogos para semi-routers** (one-click install, hosted runtime). Se algum deles adicionar classificação por intent, são competidor directo. Janela estimada: **<12 meses**.

---

## 2. Estado actual (auditado 2026-05-27)

Já existe no `~/frugal/`:

| Componente | Path | Estado | Reaproveita-se no Pastor? |
|---|---|---|---|
| `classify.js` (complexity router) | `tools/router/classify.js` | ✅ produção, v3 fast-paths + cache | ✅ sim — eixo 1 mantém-se |
| `inject_context.js` (hook) | `tools/router/inject_context.js` | ✅ produção | ✅ sim — passa a emitir `<pack-hint>` |
| `patterns.js` (risk/intent patterns) | `tools/router/patterns.js` | ✅ produção | ✅ extende-se com domain signals |
| 6 subagents | `agents/*.md` | ✅ produção | ✅ continuam — Packs invocam-nos |
| `frugal-hub` (Cloudflare Workers) | `frugal-hub.workers.dev` | ✅ live (D1 + R2 + trust_score) | ✅ sindica Pack Registry |
| `signals.js`, `similarity.js` | `tools/router/` | ✅ produção | ✅ ferramentas para domain classifier |
| `~/frugal/packs/` | — | ❌ não existe | 🔜 criar |
| `pack.schema.yaml` | — | ❌ não existe | 🔜 criar Dia 1 |
| `classify_domain()` | — | ❌ não existe | 🔜 criar Dia 3 |
| `<pack-hint>` no contexto | — | ❌ não existe | 🔜 criar Dia 4 |

Skills/MCPs activos *nesta máquina* (snapshot do system reminder, 2026-05-27):
- 47 skills disponíveis via Skill tool (Anthropic core + design + product-management + outras)
- ~20 MCP servers ligados (Canva, Gmail, Microsoft Docs, Notion, Spotify, Box, Linear, Calendar, Context7, Vercel, Figma, Supabase, Atlassian, Intercom, Slack, Asana, etc.)
- Plugin marketplace (`mcp__plugins__*`) + MCP Registry (`mcp__mcp-registry__*`)

**Conclusão**: a base existe. Pastor é **uma camada adicional**, não um rewrite.

---

## 3. Two-Axis Routing

```
UserPromptSubmit "preciso de animar este hero section"
   │
   ├─► classify_complexity()    ──► T2 (Sonnet) ◄── EIXO 1 (já existe)
   │
   └─► classify_domain()        ──► pack="animation-web" ◄── EIXO 2 (NOVO)
        ├─ regex layer     (0 cost, <5ms, fast-path)
        ├─ embedding layer (50ms, opcional)
        └─ Haiku fallback  (se confidence < 0.6, ~$0.0005)
                │
                ▼
        pack_resolve()
          ├─ skills disponíveis vs requeridas
          ├─ MCPs ligados vs recomendados
          └─ gaps → suggest install
                │
                ▼
        emit <router-hint> + <pack-hint>
```

Os dois eixos são **ortogonais e independentes**:
- "Faz uma animação trivial em CSS" → T1 + `animation-web`
- "Faz uma animação complexa com timeline GSAP + scroll trigger" → T3 + `animation-web`
- "Resume este log de erros" → T0 + `code-debug`
- "Audita arquitectura deste repo" → T3 + `code-audit`

O `classify.js` v1 nunca conheceu `animation-web`. Por isso falha o caso 1 (over-routes para T0 por falta de coding signals) e o caso 4 (não distingue audit de coding). **Pastor resolve isto.**

---

## 4. Anatomia de um Moo Pack

Um pack é um ficheiro declarativo YAML em `~/frugal/packs/<name>/pack.yaml`. Sem código. Manifesto + scaffolds.

### Schema (`packs/pack.schema.yaml`)

```yaml
# Schema canónico — todos os packs devem validar contra isto
name: string                          # kebab-case, unique
version: semver                       # 0.1.0+
description: string                   # ≤ 100 chars
domain_signals:
  keywords: [string]                  # match exact-word (boundaries)
  intent_phrases: [string]            # match substring (lower-case)
  file_extensions: [string]           # signal opcional, boost score
  negative_keywords: [string]         # match → reject pack
model_floor: T0|T1|T2|T3              # tier mínimo recomendado
model_ceiling: T0|T1|T2|T3            # tier máximo (cost guard)
skills:
  required: [string]                  # Skill names (Anthropic registry)
  recommended: [string]
mcps:
  required: [string]                  # MCP server identifiers
  recommended: [string]
subagents:
  primary: string                     # agent name de ~/frugal/agents/
  reviewer: string                    # opcional, para gate final
repos_canonical:                      # repos de referência conhecidos
  - { name: string, url: string, license: string, note: string }
tools_cli: [string]                   # CLI tools (npx, pipx, brew)
prompt_scaffold: string               # system prompt especializado, multiline
validation:
  smoke_test: string                  # frase descritiva do teste
  acceptance_criteria: [string]
metadata:
  author: string
  created: ISO8601
  validated_against:                  # snapshot de skills/MCPs no momento de validação
    skills_version: string
    mcp_registry_snapshot: ISO8601
  ttl_days: integer                   # após este prazo, requer re-validação
  trust_score: float                  # 0–1, calculado pelo hub (default 0.5)
  usage_count: integer                # quantas vezes activado (telemetria opt-in)
```

### Resolução em runtime

```
1. classify_domain(prompt) → pack_id, confidence
2. pack_resolve(pack_id):
   a. load packs/<pack_id>/pack.yaml
   b. check ttl_days expirou? → re-validar contra registries
   c. for skill in required: verifica disponibilidade no Skill tool
   d. for mcp in required: verifica server ligado
   e. produce: { available_skills, available_mcps, missing, suggest_install_cmd }
3. emit <pack-hint> com tudo o acima
4. Claude lê hint e age:
   - se ! missing: invoca skills, usa MCPs, segue scaffold
   - se missing: pede confirmação ao user para instalar ou prosseguir sem
```

---

## 5. Os 7 Packs Sementinha

Cobertura: **~80% dos pedidos de um vibe coder solo** (validado contra a research). Cada um cita fontes da [research 2026-05-27](./research_best_in_class_2026.md).

### 5.1 `animation-web` 🔥

```yaml
name: animation-web
version: 0.1.0
description: Web animations (React, CSS, scroll-triggered, motion graphics)
domain_signals:
  keywords: [animation, animar, animate, motion, transition, transição, scroll-trigger, lottie, parallax, easing, keyframe]
  intent_phrases: ["fazer animar", "transição suave", "scroll driven", "hero animation", "micro-interaction"]
  file_extensions: [.tsx, .jsx, .css, .svg, .json]
  negative_keywords: [server animation, gif compression]
model_floor: T2
model_ceiling: T3
skills:
  required: [anthropic-skills:web-artifacts-builder]
  recommended: [anthropic-skills:algorithmic-art]
mcps:
  recommended: [vercel]
subagents:
  primary: model-reasoner
  reviewer: final-reviewer        # só se for hero do site
repos_canonical:
  - { name: motion, url: https://motion.dev, license: MIT, note: "Default React 2026 — sponsors top-tier" }
  - { name: gsap, url: https://gsap.com, license: "Proprietary free (Webflow)", note: "Imperativo, melhor para timelines complexos; restrição anti-Webflow-competitor" }
  - { name: tailwindcss-motion, url: https://github.com/romboHQ/tailwindcss-motion, license: MIT, note: "5KB CSS-only, simple cases" }
  - { name: theatre-js, url: https://www.theatrejs.com/, license: Apache-2.0, note: "Editor visual para sequências 3D/2D" }
tools_cli: []
prompt_scaffold: |
  Tu és um animation engineer. Prioridades, por esta ordem:
  1. CSS scroll-driven nativo quando suficiente (View Transitions, animation-timeline)
  2. Motion (motion.dev) para React quando precisas de declarative state-driven
  3. GSAP só quando timeline complexo / sequencing imperativo (atenção à licença Webflow)
  4. Tailwindcss-motion para casos triviais (5KB CSS)
  60fps non-negotiable. Mede com Chrome DevTools Performance se houver dúvida.
  Respeita `prefers-reduced-motion` SEMPRE — adiciona o media query, não negociável.
  Sem `animation: none !important` global hacks.
validation:
  smoke_test: "Verifica prefers-reduced-motion honrado; verifica que não há layout thrashing (only transform/opacity)"
  acceptance_criteria:
    - "Animação 60fps medida em DevTools"
    - "prefers-reduced-motion respeitado"
    - "Bundle delta ≤ 40KB se não estava previamente"
metadata:
  author: paulo-loureiro
  created: 2026-05-27
  validated_against:
    skills_version: "2026-05"
    mcp_registry_snapshot: 2026-05-27
  ttl_days: 90
  trust_score: 0.5
  usage_count: 0
```

### 5.2 `diagram-systems`

```yaml
name: diagram-systems
domain_signals:
  keywords: [diagram, diagrama, flowchart, fluxograma, sequence, sequência, architecture, arquitectura, c4, ER, entity-relationship, mindmap, mermaid, d2]
  intent_phrases: ["desenha o", "visualiza a arquitectura", "diagrama de", "fluxo de"]
model_floor: T1                       # Mermaid é trivial
model_ceiling: T3                     # C4 complexos podem requerer Opus
skills:
  recommended: [anthropic-skills:canvas-design]
repos_canonical:
  - { name: mermaid, url: https://mermaid.js.org/, license: MIT, note: "Default LLM-friendly; GitHub render nativo" }
  - { name: d2, url: https://d2lang.com/, license: MPL-2.0, note: "Estética superior; menos familiar a LLMs (mais erros syntax)" }
  - { name: excalidraw, url: https://excalidraw.com, license: MIT, note: "Hand-drawn aesthetic; whiteboard" }
prompt_scaffold: |
  Default: Mermaid (familiarity LLM + GitHub render nativo).
  Alternativas: D2 quando estética importa e o user pediu explicitamente; Excalidraw para whiteboarding.
  Para C4: usa Mermaid C4Context/C4Container/C4Component (não tentes ASCII).
  Output SEMPRE em fenced code block com linguagem (` ```mermaid `).
  Nunca inventes shapes/notation que não está no spec actual da linguagem escolhida.
validation:
  smoke_test: "Renderiza no GitHub preview sem erro syntax"
  acceptance_criteria: ["Mermaid v10+ syntax", "Sem nodes órfãos", "Layout legível < 30 nodes"]
```

### 5.3 `data-spreadsheet`

```yaml
name: data-spreadsheet
domain_signals:
  keywords: [xlsx, planilha, spreadsheet, excel, csv, pivot, vlookup, sumif, cross-reference, dataframe]
  intent_phrases: ["cruza dados", "tabela dinâmica", "consolida planilha", "valida planilha"]
  file_extensions: [.xlsx, .xls, .csv, .tsv, .ods]
model_floor: T2
model_ceiling: T3
skills:
  required: [anthropic-skills:xlsx]
mcps:
  recommended: [excel-mcp]              # community Excel MCP servers (vários forks)
repos_canonical:
  - { name: openpyxl, url: https://openpyxl.readthedocs.io, license: MIT, note: "Python standard; skill xlsx usa" }
  - { name: SheetJS, url: https://sheetjs.com, license: "Apache-2.0 community", note: "JS lib XLSX read/write browser+node" }
  - { name: polars, url: https://pola.rs, license: MIT, note: "Para >100k rows, openpyxl é lento" }
prompt_scaffold: |
  Para ficheiros <50k rows: openpyxl é suficiente.
  Para 50k–500k rows: muda para Polars/Pandas. openpyxl write é O(n²) em alguns paths.
  Cross-references: usa nome de range + Tables (não cell refs absolutas).
  Validação: corre smoke test sempre (open + close + reopen sem corrupção).
  Citation clickable (formato Claude for Excel) quando aplicável.
validation:
  smoke_test: "Abre o ficheiro gerado em Excel desktop sem warnings"
  acceptance_criteria: ["Formulas calculadas, não strings", "Sheets/ranges nomeados", "Sem células corrupted"]
```

Nota da research: Claude for Excel GA desde 7 Mai 2026 com MCP connectors para S&P/FactSet/Moody's/PitchBook — se este pack for usado num contexto finance, override para usar Excel-native + financial MCPs.

### 5.4 `code-audit` 🔥

```yaml
name: code-audit
domain_signals:
  keywords: [audit, auditoria, review, security, segurança, vulnerability, lint, coerência, dependency check, secret scan]
  intent_phrases: ["audita este", "review completo", "verifica segurança", "dependency check", "antes de fazer push"]
model_floor: T3                       # decisões críticas, Opus default
model_ceiling: T3
skills:
  recommended: [design:accessibility-review, design:design-critique]
mcps:
  recommended: [github, sentry]
subagents:
  primary: final-reviewer             # Opus + cache
  reviewer: final-reviewer
repos_canonical:
  - { name: semgrep, url: https://semgrep.dev, license: "LGPL-2.1 + SaaS", note: "Best SAST 2026 — 35+ langs GA; outperforms Snyk SAST" }
  - { name: codeql, url: https://codeql.github.com, license: "Proprietary (free OSS)", note: "Unmatched depth; QL curve alta" }
  - { name: snyk, url: https://snyk.io, license: SaaS, note: "Best SCA/deps/container/IaC (Forrester Wave Leader Q4 2024)" }
  - { name: gitguardian, url: https://www.gitguardian.com, license: "SaaS (free tier)", note: "Secrets standard, pre-commit + CI" }
tools_cli: [semgrep, snyk, ggshield]
prompt_scaffold: |
  Combina TRÊS lentes em sequência:
    1. Semgrep (SAST) — code patterns, OWASP, custom rules
    2. Snyk (SCA) — dependency CVEs, container/IaC se aplicável
    3. GitGuardian (secrets) — pre-commit + git history scan
  Para acessibilidade: design:accessibility-review skill em paralelo.
  Output: tabela severity × component × line × fix recommendation. Sem prosa.
  Se severity ≥ HIGH: bloqueia push, requer fix antes.
  Cita CWE/CVE IDs onde aplicável.
validation:
  smoke_test: "Corre os 3 scanners em modo CI, falha se algum HIGH/CRITICAL"
  acceptance_criteria: ["Zero secrets in git history", "Zero CRITICAL Snyk", "Zero HIGH Semgrep custom rules"]
```

### 5.5 `prd-strategy`

```yaml
name: prd-strategy
domain_signals:
  keywords: [PRD, spec, requirements, OKR, roadmap, feature spec, user story, acceptance criteria, RICE, MoSCoW]
  intent_phrases: ["escreve PRD", "feature spec", "atualiza roadmap", "stakeholder update"]
model_floor: T2
skills:
  required: [product-management:feature-spec]
  recommended:
    - product-management:roadmap-management
    - product-management:stakeholder-comms
    - product-management:competitive-analysis
mcps:
  recommended: [notion, linear, asana]
subagents:
  primary: model-reasoner
prompt_scaffold: |
  Estrutura PRD: Problem → User → Success Metrics → Requirements → Acceptance Criteria → Risks → Open Questions.
  Priorização: RICE para roadmap, MoSCoW para release scope.
  Não inventes números (TAM, conversion, etc.) — marca "[A confirmar]".
  Stakeholder updates: tom = audiência (executive=outcome+risk; eng=tradeoff+ETA; customer=value+date).
validation:
  smoke_test: "PRD tem todas as 7 secções; cada requirement tem acceptance criteria"
```

### 5.6 `voice-tts`

```yaml
name: voice-tts
domain_signals:
  keywords: [voice, TTS, text-to-speech, speak, narrate, audio, sonic, ElevenLabs, Cartesia, Whisper]
  intent_phrases: ["gera voz", "narração", "voice agent", "audiobook"]
model_floor: T1
mcps:
  recommended: [cartesia-mcp, elevenlabs-mcp]    # se existirem; senão API directa
repos_canonical:
  - { name: cartesia, url: https://cartesia.ai, license: SaaS, note: "Sonic 3: TTFA 75-90ms; default low-latency 2026" }
  - { name: elevenlabs, url: https://elevenlabs.io, license: SaaS, note: "v3 Flash 75ms; best realism + cloning" }
  - { name: hume-octave, url: https://hume.ai, license: SaaS, note: "Best emotion; 150ms TTFA" }
  - { name: groq-whisper, url: https://groq.com, license: SaaS, note: "STT side; ~$0.04/h" }
prompt_scaffold: |
  Decisão por use case:
    - Realtime conversational (call agent, live UI): Cartesia Sonic 3 (~$35/M tokens, TTFA 75-90ms)
    - Audiobook / narração polida: ElevenLabs v3 Flash v2.5 (realism)
    - Emoção / character voice: Hume Octave 2 ($50-150/M)
    - STT (input): Groq Whisper API
  Cost guard: avisa user se >1M tokens estimados num só ficheiro.
  Multilingual: ElevenLabs lidera; Cartesia limitado a EN/PT/ES/FR primariamente.
validation:
  smoke_test: "TTFA < 150ms para sample de 100 tokens"
```

### 5.7 `knowledge-third-brain`

```yaml
name: knowledge-third-brain
domain_signals:
  keywords: [notion, obsidian, vault, knowledge, second brain, third brain, PKM, zettelkasten, atomic note]
  intent_phrases: ["adiciona ao vault", "regista no Notion", "atualiza HQ", "captura insight"]
model_floor: T1
mcps:
  required: [notion]                    # MCP oficial Anthropic
  recommended: [megamem]                # Obsidian MCP comunitário (C-Bjorn/MegaMem)
repos_canonical:
  - { name: notion-mcp, url: https://github.com/makenotion/notion-mcp-server, license: MIT, note: "MCP oficial; default para teams" }
  - { name: megamem, url: https://github.com/C-Bjorn/MegaMem, license: MIT, note: "Obsidian MCP local-first" }
  - { name: tana-local-api, url: https://tana.inc, license: "SaaS Pro", note: "Supertags + nodes estruturados" }
prompt_scaffold: |
  Two-tier:
    1. Captura crua → Obsidian vault local (markdown, Johnny-Decimal)
    2. Síntese curada → Notion HQ (sub-pages, com tags + links)
  Para o Paulo: Notion HQ ID = 33d6f6e4-2bc4-816b-977a-fe84bbe912c9 (canónico).
  Cada sessão relevante = sub-página Notion + actualização SYNC.md (Protocolo Notion no CLAUDE.md).
  Atomic notes: 1 ideia = 1 ficheiro. Links bidirectional sempre que aplicável.
validation:
  smoke_test: "Sub-página criada no HQ; SYNC.md updated; commit message refere"
```

---

## 6. Mecânica do Pastor

### 6.1 Hint v2 (`<router-hint>` + `<pack-hint>`)

Hoje o hook emite:

```xml
<router-hint>
tier=T2 model=sonnet confidence=0.82 reason="..."
</router-hint>
```

Wave 1 estende para:

```xml
<router-hint>
tier=T2 model=sonnet confidence=0.82 reason="..."
</router-hint>

<pack-hint>
pack=animation-web confidence=0.91 reason="signals: animation, motion, scroll-trigger"
model_floor=T2 (respected)
skills_invoke=[anthropic-skills:web-artifacts-builder]
mcps_recommended=[vercel]
mcps_missing=[]
subagent_primary=model-reasoner
scaffold_url=packs/animation-web/scaffold.md
suggest_install=[]
</pack-hint>
```

A doutrina em `CLAUDE.md` ganha uma linha:

> Se `<pack-hint>` está presente, lê o scaffold antes de planear. Invoca as skills listadas em `skills_invoke` *no início* da resposta, não no fim.

### 6.2 Statusline + dashboard local

Já existe `savings-tracker.js` HTTP :7821. Wave 1 adiciona:

```
GET  /pack/last          → pack_id activado no último turn
GET  /pack/stats         → distribuição packs nos últimos 7d
POST /pack/feedback      → {pack_id, useful: bool, reason: str}
```

Statusline ganha um símbolo: `🐑 animation-web · T2 (Sonnet) · $0.012`

### 6.3 CLI surface

```bash
mooter pack list                    # lista packs instalados
mooter pack show <name>             # mostra pack.yaml
mooter pack install <name>          # instala (skills + MCPs + tools_cli)
mooter pack diff <name>             # mostra gap (missing skills/MCPs vs requirido)
mooter pack run "<prompt>"          # classifica domínio e mostra pack sugerido sem executar
mooter pack validate <name>         # corre smoke_test + acceptance_criteria
mooter pack create <name>           # scaffold de novo pack
mooter pack publish <name>          # push para frugal-hub (community packs)
mooter pack search <query>          # search no hub (registry)
mooter pack rate <name> <0-5>       # signal de qualidade
```

### 6.4 Performance budget

| Etapa | Budget | Estratégia |
|---|---|---|
| Regex layer (`classify_domain`) | ≤ 5ms p99 | Igual ao `classify.js` v1 — patterns pré-compilados |
| Embedding layer (opcional) | ≤ 50ms p99 | Local Ollama nomic-embed-text + faiss in-memory; só se regex confidence < 0.7 |
| Haiku fallback (semantic) | ≤ 800ms p99 | Só se confidence final < 0.6; cache SHA-256 30min |
| `pack_resolve` | ≤ 20ms p99 | Skills/MCPs disponíveis em `~/.mooter/cache/inventory.json` (refresh 5min) |
| Total hint emit | ≤ 60ms p99 sem Haiku | Mantém o budget do `inject_context.js` actual (<100ms p50) |

**Cache strategy**: prompt hash → (tier, pack_id, confidence). TTL 30min. Cache hit em <1ms.

### 6.5 Pack Registry sync (frugal-hub estendido)

Hub Cloudflare Workers já tem D1 + R2 + trust_score. Adiciona:

```
POST /api/pack/publish    {pack.yaml + metadata}
GET  /api/pack/search?q=  → ranking by trust_score × usage_count × recency
GET  /api/pack/<name>/latest
GET  /api/pack/digest      → semanal: 5 packs novos, 3 packs em risco (TTL expirou)
```

**Trust score** (mesma fórmula que hoje usa para router-tuning):
- +0.1 por usage com feedback positivo
- −0.2 por usage com feedback negativo
- +0.3 se passes `mooter pack validate` em 5 ambientes independentes
- TTL → trust × 0.5 após expiração

### 6.6 Notion como Third Brain (knowledge per pack)

Cada pack tem opcionalmente uma `notion_kb_url` — sub-página Notion canónica do HQ do Paulo onde se acumula:

- Best practices descobertas em uso real
- Pitfalls encontrados
- Snippets reutilizáveis
- Links para PRs reais que usaram este pack

```yaml
metadata:
  notion_kb_url: "https://notion.so/HQ/animation-web-knowledge-base-..."
```

O Pastor, ao activar um pack, pode opcionalmente puxar as últimas 3 entries da KB e injectar como contexto (cost ~50 tokens). Isto fecha o ciclo: **research → execução → reflection → research** num único ciclo de produto.

Implementação: usa o MCP oficial Notion (já ligado nesta máquina) com tool `notion-fetch`.

### 6.7 Onboarding budget-first + pack discovery

Hoje o onboarding (`onboarding.js`) pergunta budget → hardware → subscriptions. Adiciona 4ª pergunta:

```
4. Que tipos de tarefas dominas?
   ☐ Animação / UI motion
   ☐ Diagramas / arquitectura
   ☐ Dados / spreadsheets
   ☐ Code audit / security
   ☐ PRDs / strategy docs
   ☐ Voice / audio agents
   ☐ Knowledge management (Notion/Obsidian)
   ☐ Browser automation
   ☐ Outro: _____
```

Output: pre-instala os packs correspondentes (3-5 typically). "Aha moment" estende-se: *"Com este perfil, projecto $X/mês + 4 Moo Packs activos: animation-web, code-audit, prd-strategy, knowledge-third-brain. Próxima sessão já vai usá-los automaticamente."*

---

## 7. UX walkthrough (5 cenários reais)

### Cenário A — "preciso de animar este hero"
```
User: preciso de animar este hero section com scroll trigger

<router-hint> tier=T2 model=sonnet
<pack-hint> pack=animation-web confidence=0.93
  skills_invoke=[web-artifacts-builder]
  scaffold: "default Motion (motion.dev); 60fps; prefers-reduced-motion sempre"

🐑 animation-web activated. Lendo scaffold + Motion docs (Context7 MCP)...

[resposta usa Motion, gera componente, valida prefers-reduced-motion]
```

### Cenário B — "audita este repo antes de push"
```
User: audita este repo antes de fazer push

<router-hint> tier=T3 model=opus (T3-gate)
<pack-hint> pack=code-audit confidence=0.97
  subagent_primary=final-reviewer
  mcps_missing=[snyk-mcp]
  suggest_install="mooter pack install code-audit"

⚠️ Pack code-audit requer Snyk MCP (não instalado).
   Continuar com Semgrep + GitGuardian apenas? [y/N]
   Ou: mooter pack install code-audit (instala Snyk MCP)
```

### Cenário C — "cruza estas planilhas de receita"
```
User: cruza estas duas planilhas de receita e identifica discrepâncias

<router-hint> tier=T2 model=sonnet
<pack-hint> pack=data-spreadsheet confidence=0.88
  skills_invoke=[anthropic-skills:xlsx]
  scaffold: "openpyxl <50k; Polars >50k; named ranges"

🐑 data-spreadsheet activated. Loading xlsx skill...
[lê ambas, identifica formato, escolhe openpyxl, cross-reference por SKU]
```

### Cenário D — "intent ambíguo"
```
User: preciso de fazer algo com dados de vendas

<router-hint> tier=T2 model=sonnet
<pack-hint> pack=AMBIGUOUS confidence=0.42
  candidates=[data-spreadsheet, prd-strategy, knowledge-third-brain]

🐑 Não consigo escolher um Pack confiável. Pediste algo com dados de vendas — 
   qual destes encaixa melhor?
   1. Análise / planilha (data-spreadsheet)
   2. PRD / proposta de feature (prd-strategy)
   3. Capturar para o vault (knowledge-third-brain)
```

### Cenário E — "tarefa fora dos packs"
```
User: configura um deploy Vercel com edge functions custom

<router-hint> tier=T2 model=sonnet
<pack-hint> pack=GENERAL confidence=0.31
  reason="No pack matched signals; routing without pack scaffold"
  suggest_search="mooter pack search vercel edge"

🐑 Nenhum pack específico para isto. A correr em modo geral.
   No hub há 2 packs comunitários relevantes: deploy-vercel, edge-functions.
   `mooter pack search vercel` para ver.
```

---

## 8. Roadmap longo — 4 waves × 7 dias

### Wave 1 — Foundations (2026-05-28 → 2026-06-03) 🔥

| Dia | Entrega | Definition of Done |
|---|---|---|
| 1 | `packs/pack.schema.yaml` + spec `<pack-hint>` | YAML schema validado; ADR `docs/adr/015-pastor-eixo-dominio.md` |
| 2 | 3 packs sementinha: `animation-web`, `code-audit`, `diagram-systems` | Cada pack passa `mooter pack validate` (vai existir Dia 5) |
| 3 | `classify_domain()` regex layer em `classify.js` | Test suite 50 prompts; recall ≥ 0.85 packs definidos |
| 4 | `inject_context.js` emite `<pack-hint>` ao lado de `<router-hint>` | Teste e2e: prompt → hint duplo no contexto |
| 5 | CLI: `mooter pack list/show/diff/validate` | Comandos funcionais, output JSON e human |
| 6 | `pack_resolve()` — gap analysis + suggest_install | 5 cenários teste (missing skill, missing MCP, all-present, ambíguo, geral) |
| 7 | Validação manual: 20 prompts reais + PR público | Repo `mooter-ai/mooter` deixa de ser privado |

### Wave 2 — Registry + embeddings (2026-06-04 → 2026-06-10)

| Dia | Entrega |
|---|---|
| 1 | Embedding layer (nomic-embed-text local + faiss in-memory) |
| 2 | 4 packs adicionais: `data-spreadsheet`, `prd-strategy`, `voice-tts`, `knowledge-third-brain` |
| 3 | Hub endpoints: `POST /api/pack/publish`, `GET /api/pack/search` |
| 4 | CLI: `mooter pack install/publish/search` |
| 5 | Statusline + dashboard updates (`/pack/last`, `/pack/stats`) |
| 6 | Haiku semantic fallback para confidence < 0.6 |
| 7 | Demo público: vídeo 3min + thread X |

### Wave 3 — Onboarding + Notion KB (2026-06-11 → 2026-06-17)

| Dia | Entrega |
|---|---|
| 1 | Onboarding budget-first ganha 4ª pergunta (tipos de tarefa) |
| 2 | Auto-install packs no fim do onboarding |
| 3 | `notion_kb_url` integrado — pull last 3 KB entries por pack activado |
| 4 | `mooter pack rate <name> <0-5>` + feedback loop ao hub |
| 5 | Pack TTL re-validation: cron semanal verifica skills/MCPs/repos ainda vivos |
| 6 | Trust score em ranking de search |
| 7 | Stakeholder update: blog post + Notion HQ + LinkedIn |

### Wave 4 — Launch público + community packs (2026-06-18 → 2026-06-24)

| Dia | Entrega |
|---|---|
| 1 | `mooter pack create` scaffold para community contributions |
| 2 | Pack template repo: `mooter-ai/pack-template` (GitHub) |
| 3 | Cookbook PR no `anthropics/claude-cookbooks` ("Skill-Pack Router") |
| 4 | HN submission ("Show HN: Mooter — the AI router that picks tools, not just models") |
| 5 | Anthropic Startup Program application com Pastor angle |
| 6 | 10 packs community-sourced no hub (target soft) |
| 7 | Quarterly Transparency Report Q2 + Notion HQ + close de Wave |

### Wave 5 — Adapter Forge (Eixo 3 — Especialização, 2026-06-25 → 2026-07-02) 🛠

⚠️ **Gate de entrada**: Wave 4 closed + ≥ 50 utilizadores opt-in para telemetria. Sem isto, dataset é fé religiosa — pausa.

| Dia | Entrega | DoD |
|---|---|---|
| 1 | Telemetry collector: extender `decisions.log` com (prompt_hash, output_excerpt, feedback_signal, latency, tokens, repo_fingerprint_hash) | Schema `decision_record.json` + opt-in flow obrigatório |
| 2 | Curation pipeline: `forge-curate.js` filtros (length, syntax, feedback ≥ neutro, MinHash dedup) | Dataset alvo ≥ 5k records/projecto |
| 3 | Self-distillation dataset (caminho A): extrai pares (code_context, completion) do repo via `git log` + scope-aware sampling | HF dataset format, sem outputs Claude |
| 4 | Unsloth setup: Qwen3-14B base + QLoRA (r=32, target=all-linear); fallback path Qwen3-30B-A3B se VRAM cooperar | Dockerfile + train.py + reproducible |
| 5 | Training run: 3 epochs, ~3-6h em RTX 4090; loss curve + sanity check generation | `.mooter/project.lora` produzido |
| 6 | Eval harness: 200 hold-out prompts × {local+LoRA, base local, Sonnet 4.6}; judge Sonnet (Opus só em amostra cara) + testes determinísticos (compile/test/lint) | `eval-report.json`; win-rate ≥ Sonnet em ≥ 60% prompts para activação |
| 7 | Deploy paths: (A) Ollama merged-model sem hot-swap; (B) vLLM com hot-swap nativo. CLI `mooter adapter activate/deactivate/diff` | Adapter on/off em < 5s vLLM, restart Ollama |
| 8 | Telemetry-driven retrain cron: drift detection (win-rate cai > 10pp em 7d → retrain); Notion KB entry + SYNC.md | Cron live, dashboard mostra `last_retrained` |

**Gate de saída Wave 5**: pelo menos 1 Project LoRA do Paulo treinado em `~/mooter/` próprio repo + validated em eval + activado por default + economiza ≥ 30% de calls T2 cloud para T1 local **medido** ao longo de 14 dias.

---

## 9. Master Prompt Orquestrador (Wave 1 completa, 7 dias)

> **Como usar**: cola tudo abaixo de `=== START ===` na primeira sessão Claude Code no repo `~/mooter/`. Self-contained.

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, com `--permission-mode auto` (NUNCA `--dangerously-skip-permissions` no host). Acesso a:
- `~/mooter/` (produto, target principal)
- `~/frugal/` (router base — leitura)
- Ollama RTX 4090 (qwen3:30b, devstral-small-2:24b, gemma3:12b, nomic-embed-text)
- Anthropic Pro/Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

Missão: shippar **Wave 1 do Pastor** em 7 dias úteis (2026-05-28 → 2026-06-03). O objectivo é provar two-axis routing (complexidade × domínio) com 3 packs sementinha e o repo `mooter-ai/mooter` público no fim da semana.

## 1. Inputs canónicos — leitura nos primeiros 10 min

| Ordem | Ficheiro | Porquê |
|---|---|---|
| 1 | `~/frugal/CLAUDE.md` | Doutrina T0–T3, anti-bazuca, delegação |
| 2 | `~/frugal/docs/strategy/PASTOR.md` | **Este documento** — SSoT Pastor |
| 3 | `~/frugal/docs/strategy/research_best_in_class_2026.md` | Research factual 2026-05-27 |
| 4 | `~/frugal/docs/strategy/STRATEGY.md` | Visão consolidada V1+V2+V3 |
| 5 | `~/frugal/docs/strategy/ROUTING.md` | Eixo 1 (complexidade) — mantém-se |
| 6 | `~/mooter/README.md` + `package.json` | Estado actual |
| 7 | `~/mooter/SYNC.md` | Estado da sessão (criar se não existir) |

**Authority hierarchy**: vault > PASTOR.md > STRATEGY.md > MASTER_PROMPT.md (V3) > este prompt > conversa.

Conflito real entre PASTOR e MASTER_PROMPT V3: pergunta ao Paulo. PASTOR é eixo 2 *adicional*, não substituto.

## 2. Princípios non-negotiable

Mantém todos os 17 do `MASTER_PROMPT.md` V3 (§2). Adicionais para esta wave:

| # | Princípio | Razão |
|---|---|---|
| P18 | Backward-compat: `<router-hint>` continua a sair. `<pack-hint>` é **adicional**. | Não partir nada que o V3 já validou |
| P19 | Pack sem `validation.smoke_test` não merge | Qualidade dos packs > quantidade |
| P20 | `notion_kb_url` é opcional. Sem ele, pack funciona; com ele, pack auto-aprende | Third Brain integration |
| P21 | Pack regex layer pré-compilado (não compilar por prompt) | Performance budget ≤5ms |

## 3. Phase plan — 7 dias

### Day 1 (2026-05-28) — Schema + ADR

- 1.1 Criar `~/mooter/packs/pack.schema.yaml` (copiar §4 do PASTOR.md)
- 1.2 ADR `~/mooter/docs/adr/015-pastor-eixo-dominio.md` (contexto + decisão + alternativas + consequências)
- 1.3 Spec do `<pack-hint>` em `~/mooter/docs/spec/pack-hint.md`
- 1.4 Test: yaml-schema-validator passa sobre schema vazio + sobre 1 pack mock

DoD: PR `feat/pastor-schema-day1` → `dev`, com ADR linkado.

### Day 2 (2026-05-29) — 3 packs sementinha

- 2.1 `~/mooter/packs/animation-web/pack.yaml` (copiar §5.1 do PASTOR.md)
- 2.2 `~/mooter/packs/animation-web/scaffold.md` (extrair `prompt_scaffold` para ficheiro próprio)
- 2.3 Idem para `code-audit` (§5.4) e `diagram-systems` (§5.2)
- 2.4 Test: schema-validator passa em todos 3

DoD: PR `feat/pastor-packs-day2` → `dev`. Cada pack tem `pack.yaml` + `scaffold.md` + (opcional) `examples/`.

### Day 3 (2026-05-30) — `classify_domain()` regex layer

- 3.1 `~/mooter/packages/router/src/classify_domain.ts` (TypeScript, mas referência implementação JS de `~/frugal/tools/router/classify.js`)
- 3.2 Loader: `loadPacks(packs_dir)` que compila regex de todos os packs ao boot
- 3.3 `classify(prompt) → { pack_id, confidence, reason }`
  - Soma weighted score por pack: keyword match × 1.0, phrase match × 1.5, ext match × 0.5, negative match × -2.0
  - Confidence = max_score / sum_top_3
  - Threshold: confidence ≥ 0.6 → pack único; < 0.6 → AMBIGUOUS com top-3 candidates
- 3.4 Test suite: `tests/classify_domain.test.ts` com 50 prompts (10 por pack × 3 packs + 20 negative/ambiguous)

DoD: Recall ≥ 0.85 para os 3 packs definidos. Test suite passa. Performance p99 ≤ 5ms.

### Day 4 (2026-05-31) — Hook emite `<pack-hint>`

- 4.1 `~/mooter/packages/router/src/hooks/inject_context.ts` (adapta `~/frugal/tools/router/inject_context.js`)
- 4.2 Após `classifyComplexity` → chama `classifyDomain` em paralelo
- 4.3 `pack_resolve()` — verifica skills disponíveis (parse Skill tool list do context) e MCPs ligados (parse MCP server list)
- 4.4 Emite `<pack-hint>` com formato spec (§6.1 do PASTOR.md)
- 4.5 Test e2e: prompt → hook → context tem ambos `<router-hint>` e `<pack-hint>`

DoD: Hook funciona em sessão real. `<pack-hint>` aparece. Performance combinada ≤ 60ms p99.

### Day 5 (2026-06-01) — CLI commands

- 5.1 `~/mooter/packages/cli/src/commands/pack.ts` com subcomandos:
  - `list`, `show <name>`, `diff <name>`, `validate <name>`
- 5.2 `mooter pack validate <name>`:
  - schema check
  - smoke_test descritivo presente
  - acceptance_criteria não vazio
  - repos_canonical têm URL e licença
- 5.3 Output formats: `--json` e human-readable default

DoD: `mooter pack list`, `show`, `diff`, `validate` todos funcionais. `mooter pack validate animation-web code-audit diagram-systems` todos PASS.

### Day 6 (2026-06-02) — `pack_resolve` + cenários

- 6.1 `pack_resolve(pack_id, env) → { available, missing, suggest_install_cmd }`
- 6.2 5 cenários integração:
  - all skills + MCPs present (animation-web)
  - missing MCP (code-audit, sem Snyk MCP)
  - missing skill (data-spreadsheet sem xlsx — teste sintético)
  - ambíguo (3 candidates competing)
  - general (no pack match)
- 6.3 Suggest_install_cmd output:
  ```
  mooter pack install code-audit
    └─ Will install:
       ✓ skill design:accessibility-review (already available)
       ⬇ MCP snyk-mcp (npm install -g @snyk/mcp-server)
       ⬇ CLI semgrep (pipx install semgrep)
  ```

DoD: 5 cenários passam tests. Mensagem de install é clara, não invade.

### Day 7 (2026-06-03) — Validação real + repo público

- 7.1 Sessão real: 20 prompts reais usando Pastor. Mede:
  - tempo médio de hint emission
  - cobertura de packs (quantos prompts caíram em pack específico vs general)
  - qualidade subjectiva (notas Paulo: 1-5 por resposta)
- 7.2 Relatório `~/mooter/docs/wave1-validation.md` com métricas
- 7.3 Repo `mooter-ai/mooter` muda de privado para público
- 7.4 README do repo destaca Pastor (não só router de modelo)
- 7.5 Sub-página Notion HQ: "🐑 Wave 1 — Pastor shipped (2026-05-28 → 2026-06-03)"
- 7.6 SYNC.md actualizado com pendentes para Wave 2

DoD:
- ≥ 17/20 prompts roteados para pack correcto (recall ≥ 85% live)
- Repo público
- Notion HQ updated
- SYNC.md updated com Wave 2 pendentes
- Sessão de demo gravada (opcional mas recomendado)

## 4. Subagents — uso esperado

| Subagent | Quando, nesta wave |
|---|---|
| `model-architect` | ADR Day 1, design `classify_domain` Day 3 |
| `model-reasoner` | Implementação Day 2-6 (Sonnet) |
| `cheap-triage` | Commit messages, docstrings (Haiku) |
| `local-summarizer` | Resumir research, parse logs (Ollama) |
| `final-reviewer` | **OBRIGATÓRIO** antes de cada PR para `dev` |

⚠️ Se `<router-hint>` recomenda T0/T1, **delega via Agent tool**. Não inlinear em Opus por preguiça (regra `CLAUDE.md` §"Delegar vs inline v2").

## 5. Definition of Done global Wave 1

- [ ] Schema `pack.schema.yaml` publicado em `~/mooter/packs/`
- [ ] 3 packs sementinha shipped e validados (`animation-web`, `code-audit`, `diagram-systems`)
- [ ] `classify_domain()` recall ≥ 0.85 em test suite + ≥ 0.85 live
- [ ] `<pack-hint>` emitido em paralelo com `<router-hint>`
- [ ] CLI `mooter pack {list,show,diff,validate}` funcional
- [ ] `pack_resolve()` lida com 5 cenários (all/missing-mcp/missing-skill/ambiguous/general)
- [ ] Repo `mooter-ai/mooter` público
- [ ] Notion HQ sub-página criada
- [ ] SYNC.md updated com Wave 2 pendentes
- [ ] ADR `015-pastor-eixo-dominio.md` merged
- [ ] 7 PRs merged em `dev`, 1 PR merged em `main` (final reviewer aprovou)

## 6. Anti-patterns desta wave

| ❌ Não fazer | Razão |
|---|---|
| Misturar Wave 1 com Wave 2 (embedding layer Day 7) | Foco perdido; Wave 1 prova two-axis sem embeddings |
| Mais de 3 packs nesta wave | Cada pack requer ~3h validação real; mais que 3 não cabe |
| `<pack-hint>` substituir `<router-hint>` | Backward-compat violado |
| Activar packs sem validation.smoke_test | Qualidade dos packs > quantidade |
| Skill bloat: invocar skill em todos os turns mesmo quando não precisa | Pack diz `skills_invoke` no início; turns subsequentes herdam contexto |
| `git add -A` | Commits selectivos sempre |
| Push to `main` sem `final-reviewer` | T3-gate sempre |

## 7. Token budget

7 dias × 6-8h efectivos = ~50h de sessão.
- ~30% Opus (Day 1 ADR + Day 3 design + Day 7 review): ~15h
- ~50% Sonnet (implementação Day 2-6): ~25h
- ~20% Haiku/Ollama (triagem, commit msgs, summaries): ~10h

Claude Max $200 cobre confortavelmente. Usa o próprio `<router-hint>` para forçar Haiku/Ollama em tarefas T0/T1.

## 8. Starter command

```
Olá. Sou Claude Code dentro de ~/mooter/, a iniciar Wave 1 do Pastor (2026-05-28 → 2026-06-03).

Passos iniciais:
1. Leio ~/frugal/CLAUDE.md, depois ~/frugal/docs/strategy/PASTOR.md, depois research_best_in_class_2026.md.
2. Confirmo que estou em devcontainer com --permission-mode auto.
3. Confirmo git remote `origin` aponta para mooter-ai/mooter.
4. Confirmo Ollama warm + nomic-embed-text disponível.
5. Crio ~/mooter/SYNC.md se não existir.

Antes de tocar em código:
- Pergunto ao Paulo se há contexto adicional da sessão Cowork de 2026-05-27.
- Confirmo branch base: criar `wave1-pastor` a partir de `dev`.

Plano dia-a-dia já listado no §3 do master prompt. Cada dia termina com PR + Notion update + SYNC.md update.

Ready. Começo agora pela leitura?
```

=== END ===

---

## 10. Master Prompt Dia 1 (kickoff zoom-in, pronto a colar)

> **Como usar**: cola directamente no Claude Code. Não precisas do orquestrador para o Dia 1.

=== START ===

És Claude Code em `~/mooter/`. Hoje é Dia 1 da Wave 1 do Pastor. Objectivo único do dia: **publicar o schema dos Moo Packs + ADR**.

## Tarefas

1. Lê `~/frugal/docs/strategy/PASTOR.md` §4 (Anatomia de um Moo Pack — schema completo)
2. Cria `~/mooter/packs/pack.schema.yaml` copiando o schema de §4 (formato YAML válido, com comentários)
3. Cria `~/mooter/docs/adr/015-pastor-eixo-dominio.md` com:
   - **Contexto**: estado actual do Mooter (router por complexidade); research 2026-05-27 mostra gap em skill orchestration; janela competitiva <12 meses
   - **Decisão**: adicionar segundo eixo (domínio → Moo Pack) ortogonal ao eixo complexidade existente
   - **Alternativas consideradas**:
     - A. Adicionar packs como sub-tier no `classify.js` actual (rejeitado: violaria separation of concerns)
     - B. Pack registry externo SaaS (rejeitado: Mooter é local-first)
     - C. Substituir `classify.js` por classifier único multi-eixo (rejeitado: backward-compat)
     - D. **(escolhido)** Two-axis routing com `classify_domain()` independente
   - **Consequências**:
     - + Backward-compat total
     - + Pack discovery vira diferencial competitivo
     - + Cada pack pode ter `notion_kb_url` para auto-aprender
     - − Mais um classifier para manter (mitigação: regex layer simples, embedding opcional)
     - − Pack quality control torna-se eixo de produto
   - **Status**: Proposed
4. Cria `~/mooter/docs/spec/pack-hint.md` com schema do `<pack-hint>` (copiar §6.1 do PASTOR.md)
5. Adiciona test:
   - `~/mooter/packs/tests/schema.test.ts` — valida que `pack.schema.yaml` é YAML válido
   - Cria mock `~/mooter/packs/__mock__/example-pack.yaml` e valida que passa o schema
6. Commit:
   - 1 commit para schema: `feat(packs): add pack.schema.yaml — Pastor Day 1`
   - 1 commit para ADR: `docs(adr): 015 Pastor — eixo domínio (Two-Axis Routing)`
   - 1 commit para spec: `docs(spec): pack-hint format`
   - 1 commit para tests: `test(packs): schema validation`
7. PR `wave1-pastor-day1` → `dev` com descrição:
   ```
   Wave 1 Day 1 — Pastor schema + ADR

   What: pack.schema.yaml + ADR 015 + spec pack-hint
   Why: foundation Day 1 of Wave 1 Pastor (see PASTOR.md §8)
   Evidence: schema test passes; mock pack validates
   Tests: packs/tests/schema.test.ts
   Refs: PASTOR.md §4, §6.1, §8 Day 1
   ```
8. `final-reviewer` corre antes do PR
9. Sub-página Notion HQ: "🐑 Pastor Day 1 — Schema + ADR (2026-05-28)"
10. SYNC.md update na secção "📥 COWORK → CLAUDE CODE": marca Day 1 ✅, próxima missão = Day 2 (3 packs sementinha)

## Constraints

- ❌ Não criares `classify_domain.ts` hoje (Day 3)
- ❌ Não criares packs hoje (Day 2)
- ❌ Não tocares `inject_context.js` hoje (Day 4)
- ❌ Não tocares `classify.js` (eixo 1, está estável)
- ❌ Não commitas `--no-verify`
- ❌ Não fazes `git add -A`

## Validação final do dia

```bash
cd ~/mooter
yamllint packs/pack.schema.yaml
node --test packs/tests/schema.test.ts
ls docs/adr/015-pastor-eixo-dominio.md   # exists
ls docs/spec/pack-hint.md                # exists
git log --oneline | head -4              # 4 commits descriptivos
gh pr view                               # PR aberto contra dev
```

Se tudo verde + final-reviewer aprovou + Notion HQ updated + SYNC.md updated → Dia 1 ✅.

## Quando parar e perguntar ao Paulo

- Discrepância entre PASTOR.md e algo no MASTER_PROMPT.md V3
- Alguma dependência do schema que não está clara (ex.: `trust_score` valor inicial)
- Decisão sobre se `notion_kb_url` é opcional ou obrigatório para os 7 packs (PASTOR diz opcional; confirma)

Ready. Começo agora?

=== END ===

---

## 10.2 Master Prompt Day 2 — 3 packs sementinha (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. Hoje é Dia 2 da Wave 1 do Pastor. Day 1 fechou (schema + ADR + spec). Objectivo único do dia: **criar 3 packs sementinha** (animation-web, code-audit, diagram-systems) seguindo o schema do Day 1.

## Leitura obrigatória (primeiros 5 min)

1. `~/mooter/SYNC.md` (estado actual + Day 1 closure)
2. `~/mooter/packs/pack.schema.yaml` (schema que tens de respeitar)
3. `~/frugal/docs/strategy/PASTOR.md` §5 (especificação completa dos 7 packs sementinha — vais usar §5.1, §5.4, §5.2)

## Tarefas

1. Criar `~/mooter/packs/animation-web/pack.yaml` — copiar **literalmente** o conteúdo YAML de PASTOR.md §5.1. Mantém todos os campos.
2. Criar `~/mooter/packs/animation-web/scaffold.md` — extrair o valor de `prompt_scaffold` do pack.yaml para ficheiro próprio (markdown). No `pack.yaml`, substituir o multiline por `prompt_scaffold_path: ./scaffold.md`.
3. Idem para `code-audit` (PASTOR.md §5.4) — criar `~/mooter/packs/code-audit/{pack.yaml, scaffold.md}`.
4. Idem para `diagram-systems` (PASTOR.md §5.2) — criar `~/mooter/packs/diagram-systems/{pack.yaml, scaffold.md}`.
5. Validação programática: cada `pack.yaml` deve passar contra `packs/pack.schema.yaml`. Estende `packs/tests/schema.test.ts` (criado Day 1) para iterar sobre todos os packs em `packs/*/pack.yaml`.
6. Commit selectivo, 1 commit por pack:
   - `feat(packs): add animation-web seed pack`
   - `feat(packs): add code-audit seed pack`
   - `feat(packs): add diagram-systems seed pack`
   - `test(packs): iterate schema validation over all packs`
7. PR `wave1-pastor-day2` → `dev` com descrição:
   ```
   Wave 1 Day 2 — 3 packs sementinha
   What: animation-web, code-audit, diagram-systems
   Why: foundation Day 2 of Wave 1 Pastor (see PASTOR.md §8 Day 2)
   Evidence: all packs validate against schema; test suite passes
   Refs: PASTOR.md §5.1, §5.2, §5.4
   ```
8. `final-reviewer` antes do PR.
9. Sub-página Notion HQ: `🐑 Pastor Day 2 — 3 packs sementinha (2026-05-29)` com tabela dos 3 packs.
10. SYNC.md update: Day 2 ✅, próxima missão Day 3.

## Constraints

- ❌ Não criar packs além destes 3 (foco)
- ❌ Não tocar `classify.js` ou `classify_domain.ts` (eixo 1 + Day 3)
- ❌ Não tocar `inject_context.js` (Day 4)
- ❌ Não criar CLI (Day 5)
- ❌ `git add -A` proibido — file by file
- ❌ Não inventar URLs em `repos_canonical` — copia exactamente o que está em PASTOR.md §5

## Validação final do dia

```bash
cd ~/mooter
ls packs/animation-web/{pack.yaml,scaffold.md}
ls packs/code-audit/{pack.yaml,scaffold.md}
ls packs/diagram-systems/{pack.yaml,scaffold.md}
node --test packs/tests/schema.test.ts
git log --oneline | head -5
gh pr view
```

## Quando parar e perguntar

- Algum pack tem `model_ceiling` ambíguo (T2 ou T3?) → PASTOR.md decide; conflito real → pergunta
- Schema do Day 1 tem gap que impede um campo de §5 — propor schema patch como Day-2.5 antes de avançar
- `repos_canonical` de algum pack tem URL morta (não responde HTTP 200) — sinaliza, não inventes alternativa

Ready. Começo agora pela leitura?

=== END ===

---

## 10.3 Master Prompt Day 3 — `classify_domain()` regex layer (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. Hoje é Dia 3 da Wave 1 do Pastor. Days 1-2 fecharam (schema + 3 packs). Objectivo único: **implementar o classifier de domínio em regex layer**, com test suite ≥ 50 prompts e recall ≥ 0.85.

## Leitura obrigatória (primeiros 10 min)

1. `~/mooter/SYNC.md`
2. `~/frugal/docs/strategy/PASTOR.md` §3 (Two-Axis Routing) + §6.4 (Performance budget)
3. `~/frugal/tools/router/classify.js` — referência de como fast-path regex + weighted scoring funciona no eixo 1 (estuda, não copies cego)
4. `~/mooter/packs/{animation-web,code-audit,diagram-systems}/pack.yaml` — fonte dos domain_signals

## Tarefas

1. Criar `~/mooter/packages/router/src/classify_domain.ts`:
   - `loadPacks(packs_dir): Pack[]` — lê todos `packs/*/pack.yaml` ao boot, compila regex de domain_signals (com word boundaries para keywords)
   - `classifyDomain(prompt: string, packs: Pack[]): DomainClassification` retorna `{ pack_id, confidence, reason, candidates }`
   - Weighted scoring por pack:
     - keyword match (word boundary) → +1.0
     - intent_phrase match (substring, lowercase) → +1.5
     - file_extension match → +0.5
     - negative_keyword match → −2.0
   - Confidence = `top_score / sum_top_3_scores`. Se top_score == 0 → pack_id = "GENERAL", confidence = 0.
   - Threshold: confidence ≥ 0.6 → pack único; entre 0.4 e 0.6 → AMBIGUOUS com top-3 candidates; < 0.4 → GENERAL
2. Performance: regex pré-compiladas em cache ao boot. p99 ≤ 5ms por classificação.
3. Test suite `~/mooter/packages/router/tests/classify_domain.test.ts`:
   - 30 prompts positivos (10 por pack, variando vocabulário e estrutura)
   - 10 prompts negativos (genéricos sem signal claro → devem cair em GENERAL)
   - 10 prompts ambíguos (signals de 2 packs → devem ir para AMBIGUOUS com candidates correctos)
   - Métricas calculadas no fim: recall por pack, precision, F1, latência p50/p99
4. Documentar no `~/mooter/docs/spec/classify-domain.md` o algoritmo + scoring.
5. Commits selectivos:
   - `feat(router): add classify_domain regex layer`
   - `test(router): classify_domain test suite (50 prompts)`
   - `docs(spec): classify-domain algorithm`
6. PR `wave1-pastor-day3` → `dev` com métricas no description (recall, precision, p99 latency).
7. `final-reviewer`.
8. Notion HQ sub-page + SYNC.md.

## DoD

- Recall ≥ 0.85 nos 30 prompts positivos
- p99 latency ≤ 5ms em benchmark de 1000 chamadas warm
- 0 false positives em prompts negativos (GENERAL acertou)
- Ambíguos correctamente sinalizados com top-3

## Constraints

- ❌ Não tocar `classify.js` original (eixo 1)
- ❌ Não invocar Ollama nem Haiku ainda (Day 6+ adiciona fallback semantic; hoje é puro regex)
- ❌ Não emitir `<pack-hint>` ainda (Day 4)
- ❌ Não criar embeddings (Wave 2 Day 1)
- ⚠️ Sem hardcode dos 3 packs — `loadPacks()` é genérico, lê de filesystem

## Validação final

```bash
cd ~/mooter
node --test packages/router/tests/classify_domain.test.ts
# Output esperado: relatório com recall ≥ 0.85, p99 ≤ 5ms
```

## Quando parar e perguntar

- Recall fica abaixo de 0.75 mesmo após tuning de pesos → diagnostica e pergunta (pode requerer ajuste aos `domain_signals` dos packs Day 2)
- Conflito entre 2 packs em > 30% dos prompts ambíguos → pode indicar packs mal-definidos, pergunta

Ready?

=== END ===

---

## 10.4 Master Prompt Day 4 — Hook emite `<pack-hint>` (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. Dia 4 da Wave 1. Days 1-3 fecharam. Objectivo único: **estender o hook UserPromptSubmit para emitir `<pack-hint>` em paralelo com `<router-hint>`**.

## Leitura obrigatória

1. `~/mooter/SYNC.md`
2. `~/frugal/docs/strategy/PASTOR.md` §6.1 (formato exacto do `<pack-hint>`)
3. `~/frugal/tools/router/inject_context.js` — referência do hook actual (eixo 1)
4. `~/mooter/packages/router/src/classify_domain.ts` (Day 3)

## Tarefas

1. Criar/adaptar `~/mooter/packages/router/src/hooks/inject_context.ts`:
   - Se já existe (eixo 1 do Mooter), **estende** sem partir nada
   - Chama `classifyComplexity` E `classifyDomain` em paralelo (`Promise.all`)
   - Cria função `packResolve(pack_id, env)`:
     - `env` parsing: lê lista de skills disponíveis do contexto Claude Code; lê MCP servers ligados (de `~/.claude/settings.json` ou `mcp.json`)
     - Retorna `{ available_skills, available_mcps, missing_skills, missing_mcps, suggest_install_cmd }`
   - Emite ambos os blocos:
     ```
     <router-hint>
     ...
     </router-hint>
     
     <pack-hint>
     pack=<id> confidence=<0-1> reason="..."
     model_floor=<tier>
     skills_invoke=[...]
     mcps_recommended=[...]
     mcps_missing=[...]
     subagent_primary=<name>
     scaffold_path=packs/<id>/scaffold.md
     suggest_install=<cmd or empty>
     </pack-hint>
     ```
2. Performance: ambos os hints emitidos em ≤ 60ms p99 (regex-only, sem semantic fallback ainda).
3. Test e2e `~/mooter/packages/router/tests/hook-integration.test.ts`:
   - Mock prompts → verifica ambos os hints emitidos com formato correcto
   - 5 cenários: pack único confidence alta / ambíguo / GENERAL / missing MCP / missing skill
4. Documentar em `~/mooter/docs/spec/pack-hint.md` (criado Day 1) — actualiza com exemplos reais.
5. Commits:
   - `feat(router): pack-hint emission alongside router-hint`
   - `feat(router): packResolve — skills+MCPs gap analysis`
   - `test(router): hook integration tests (5 scenarios)`
   - `docs(spec): pack-hint examples`
6. PR `wave1-pastor-day4` → `dev`.
7. `final-reviewer`.
8. Notion + SYNC.md.

## DoD

- `<router-hint>` continua a sair (backward-compat — Princípio P18 do orquestrador)
- `<pack-hint>` sai em paralelo, formato correcto, com confidence numérico
- p99 latency combinada ≤ 60ms
- Test e2e passa em 5 cenários

## Constraints

- ❌ Não substituir `<router-hint>` — coexistem
- ❌ Não invocar Ollama/Haiku ainda
- ❌ Não inventar formato de `suggest_install` — usa o do PASTOR.md §6.1
- ⚠️ Cuidado com input parsing — se MCP config não existe, packResolve deve degradar graciosamente (não crash)

## Validação final

```bash
cd ~/mooter
node --test packages/router/tests/hook-integration.test.ts
# Simulação de sessão real:
echo "preciso de animar este hero section" | node packages/router/src/hooks/inject_context.ts
# Expected: 2 blocos XML no stdout
```

## Quando parar e perguntar

- Formato exacto de `mcps_missing` ambíguo (lista de strings ou objects?) → segue PASTOR.md §6.1; conflito → pergunta
- p99 > 60ms — diagnostica (provável: regex compilation a acontecer por prompt em vez de boot)

Ready?

=== END ===

---

## 10.5 Master Prompt Day 5 — CLI `mooter pack ...` (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. Dia 5. Objectivo único: **CLI `mooter pack` com 4 subcomandos** (list, show, diff, validate).

## Leitura obrigatória

1. `~/mooter/SYNC.md`
2. `~/frugal/docs/strategy/PASTOR.md` §6.3 (CLI surface — note que tens só 4 dos 9 hoje)
3. Código actual do CLI mooter — `~/mooter/packages/cli/src/` (estrutura existente, não inventes)

## Tarefas

1. Criar `~/mooter/packages/cli/src/commands/pack.ts` com 4 subcomandos:

   **`mooter pack list`**
   - Lista todos os packs em `packs/*/pack.yaml`
   - Output: tabela human-readable (name, version, model_floor, last_validated) OU `--json`
   - Exit 0

   **`mooter pack show <name>`**
   - Lê `packs/<name>/pack.yaml` + `scaffold.md`
   - Output: pretty-print do YAML + scaffold inline; ou `--json` com tudo
   - Exit 1 se pack não existe

   **`mooter pack diff <name>`**
   - Corre `packResolve(name, env)` (do Day 4)
   - Output:
     ```
     Pack: animation-web
     ✓ Skills (1/1): web-artifacts-builder
     ✗ MCPs (1/2): vercel ✓, motion-canvas ✗
     
     Install missing:
       mooter pack install animation-web
       (or manually: npm install -g @motion-canvas/mcp)
     ```
   - Exit 0 se all available; exit 2 se missing

   **`mooter pack validate <name>`**
   - Schema check (pack.yaml against packs/pack.schema.yaml)
   - smoke_test presente (string não vazia)
   - acceptance_criteria não vazio (lista com ≥ 1)
   - repos_canonical: cada entry tem `name`, `url` (válido), `license`
   - scaffold.md existe se referenciado
   - Output: lista de checks PASS/FAIL
   - Exit 0 se tudo PASS; exit 1 senão

2. Registar `pack` como command no `~/mooter/packages/cli/src/index.ts` (CLI principal).
3. Output formats: human (default, tabular com emojis ✓ ✗) e `--json` em todos.
4. Test suite `~/mooter/packages/cli/tests/pack.test.ts`:
   - `list` retorna ≥ 3 packs (os de Day 2)
   - `show animation-web` retorna conteúdo correcto
   - `validate animation-web` PASS
   - `validate <pack-with-broken-schema>` FAIL (cria mock pack quebrado)
   - `diff` retorna correctamente para cenário com missing MCP

5. Commits:
   - `feat(cli): mooter pack list`
   - `feat(cli): mooter pack show`
   - `feat(cli): mooter pack diff`
   - `feat(cli): mooter pack validate`
   - `test(cli): pack command suite`

6. PR `wave1-pastor-day5` → `dev`. `final-reviewer`. Notion + SYNC.md.

## DoD

- `mooter pack {list,show,diff,validate}` todos funcionais via CLI
- `mooter pack validate animation-web code-audit diagram-systems` → todos PASS
- `--json` flag funciona em todos
- Test suite passa

## Constraints

- ❌ Não criar `install`, `publish`, `search`, `rate`, `run`, `create` (Wave 2 Day 4)
- ❌ Não tocar `inject_context` (Day 4 está estável)
- ❌ Não criar Pack Registry (Wave 2 Day 3)
- ⚠️ `validate` é deterministic — não invoca LLM. Usa só schema check + presence check

## Validação final

```bash
cd ~/mooter
npm run build
./bin/mooter pack list
./bin/mooter pack show animation-web
./bin/mooter pack validate animation-web
./bin/mooter pack diff code-audit
node --test packages/cli/tests/pack.test.ts
```

Ready?

=== END ===

---

## 10.6 Master Prompt Day 6 — `pack_resolve` integration + 5 cenários (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. Dia 6. Objectivo: **endurecer `packResolve()` com 5 cenários integration tests** e mensagens de install claras.

## Leitura obrigatória

1. `~/mooter/SYNC.md`
2. `~/frugal/docs/strategy/PASTOR.md` §6.1 (formato de hint), §6.4 (performance budget), §7 (5 cenários UX)
3. `~/mooter/packages/router/src/hooks/inject_context.ts` (Day 4)
4. `~/mooter/packages/cli/src/commands/pack.ts` (Day 5)

## Tarefas

1. Refactorar `packResolve()` para módulo dedicado: `~/mooter/packages/router/src/pack_resolve.ts`. Usado tanto pelo hook (Day 4) quanto pelo CLI `mooter pack diff/install` (Day 5).
2. Implementar `suggestInstallCmd(missing_skills, missing_mcps)`:
   - Para skills: `claude skill install <name>` (ou caminho actual da Anthropic Skills install)
   - Para MCPs: lookup em `~/.mooter/cache/mcp_install_registry.json` (criar este registry estático com top 50 MCPs e respectivo install command — npm/pipx/etc.)
   - Output composto: `mooter pack install <pack-name>` (preferido) OU comandos individuais (fallback)
3. **5 cenários integration tests** em `~/mooter/packages/router/tests/pack-resolve.test.ts`:

   | Cenário | Setup | Expectativa |
   |---|---|---|
   | A — all present | animation-web, skills+MCPs disponíveis | `missing=[]`, `suggest_install=""` |
   | B — missing MCP | code-audit, sem Snyk MCP | `missing_mcps=["snyk-mcp"]`, suggest com install command claro |
   | C — missing skill (sintético) | pack que pede skill inexistente "foo:bar" | `missing_skills=["foo:bar"]`, suggest com fallback "skill not in registry — manual install" |
   | D — ambíguo | prompt activa 3 packs em AMBIGUOUS | hook emite candidates list, não escolhe |
   | E — GENERAL | prompt sem signal | pack_id="GENERAL", hint informativo, suggest = "mooter pack search <keyword>" |

4. Criar `~/.mooter/cache/mcp_install_registry.json` populado com os top MCPs da research 2026: github, playwright, filesystem, postgres, supabase, notion, linear, slack, vercel, figma, sentry, stripe, plus os usados pelos 3 packs sementinha (snyk-mcp, motion-canvas-mcp, excel-mcp, etc.).
5. Mensagem de install no `<pack-hint>` quando há missing:
   ```
   <pack-hint>
   ...
   suggest_install=mooter pack install code-audit
     └─ npm install -g @snyk/mcp-server
   ...
   </pack-hint>
   ```
6. Commits:
   - `refactor(router): extract packResolve to dedicated module`
   - `feat(router): suggestInstallCmd with mcp registry`
   - `feat(packs): mcp_install_registry.json seeded`
   - `test(router): packResolve 5-scenario suite`
7. PR `wave1-pastor-day6` → `dev`. `final-reviewer`. Notion + SYNC.md.

## DoD

- 5 cenários todos passam
- `mcp_install_registry.json` cobre ≥ 20 MCPs principais
- Mensagem de install é actionable (user copia-cola e funciona)
- packResolve compartilhado entre hook e CLI (DRY)

## Constraints

- ❌ Não inventar comandos `npm install` sem verificar nomes reais dos pacotes (use research 2026-05-27)
- ❌ Não auto-instalar MCPs — apenas SUGERE
- ❌ Não inventar URLs no registry — usa os do PASTOR.md §5 e research

## Validação final

```bash
cd ~/mooter
node --test packages/router/tests/pack-resolve.test.ts
./bin/mooter pack diff code-audit   # deve mostrar suggest_install claro
./bin/mooter pack diff animation-web # deve mostrar tudo green ou com motion-canvas pendente
```

Ready?

=== END ===

---

## 10.7 Master Prompt Day 7 — Validação real + repo público 🟢 (pronto a colar)

=== START ===

És Claude Code em `~/mooter/`. **Dia 7 — FINAL Wave 1**. Days 1-6 fecharam. Hoje: **validação live + tornar o repo público**.

Este dia tem 2 deliverables interligados:
- Validation report com métricas reais
- Repo `mooter-ai/mooter` deixa de ser privado

⚠️ **Sem ambos, Wave 1 não fecha**. Padrão de risco do Paulo accionado se repo continuar privado.

## Leitura obrigatória

1. `~/mooter/SYNC.md`
2. `~/frugal/docs/strategy/PASTOR.md` §8 Day 7 (gate de saída) + §11 (riscos)
3. `~/mooter/README.md` (vai ser editado — destacar Pastor)

## Tarefas

### Bloco A — Validation report (manhã)

1. Preparar lista de **20 prompts reais** (não sintéticos — usa pedidos plausíveis de vibe coder). Distribuição alvo:
   - 6 prompts claramente animation-web
   - 5 prompts claramente code-audit
   - 4 prompts claramente diagram-systems
   - 3 prompts ambíguos
   - 2 prompts GENERAL
2. Para cada prompt, corre `classify_domain` + hook simulation. Captura:
   - pack_id escolhido
   - confidence
   - reason
   - latência (ms)
   - **subjective rating (1-5)** — pede ao Paulo durante a sessão; se ausente, marca "pending review"
3. Compila `~/mooter/docs/wave1-validation.md`:
   ```markdown
   # Wave 1 Validation Report
   
   ## Métricas
   - Recall: X/20 (target ≥ 17/20 = 85%)
   - p99 latency: Xms (target ≤ 60ms)
   - p50 latency: Xms
   - Cobertura: X/20 caíram em pack específico, Y/20 em GENERAL (target: ≥ 14 em pack específico)
   
   ## Detalhe por prompt
   | # | Prompt | Pack escolhido | Confidence | Latency | Rating | Notes |
   |---|--------|----------------|------------|---------|--------|-------|
   | 1 | ... | animation-web | 0.93 | 4ms | 5 | OK |
   ...
   
   ## Sinais para Wave 2
   ...
   ```

### Bloco B — Repo público (tarde)

4. Editar `~/mooter/README.md`:
   - Hero: "Mooter — the AI router that picks tools, not just models" (ou similar, em PT-PT se preferes)
   - Secção "Two-Axis Routing" com diagrama (Mermaid)
   - Secção "Moo Packs" com link para os 3 sementinha
   - Link para PASTOR.md como SSoT
   - Badge "Wave 1 shipped 2026-06-03"
5. `gh repo edit mooter-ai/mooter --visibility public --accept-visibility-change-consequences`
6. Confirmar: `gh repo view mooter-ai/mooter | grep -i visibility` → "Public"
7. Anuncia no X/Twitter (draft, não publicar sem review do Paulo):
   ```
   Shipped Wave 1 of Mooter — an AI router that picks not just models, 
   but the right *tools* for the task (Moo Packs).
   
   Two-axis routing: complexity × domain.
   3 packs to start: animation-web, code-audit, diagram-systems.
   
   Repo public: github.com/mooter-ai/mooter
   Strategy: <link to PASTOR.md>
   
   Built in 7 days. Wave 2 starts Monday.
   ```
   Guardar em `~/mooter/docs/launch/wave1-tweet-draft.md`

### Bloco C — Closure (fim do dia)

8. Sub-página Notion HQ: **`🐑 Wave 1 — SHIPPED (2026-05-28 → 2026-06-03)`**
   - Sumário dos 7 dias
   - Tabela de PRs merged
   - Métricas do validation report
   - Link para tweet draft
   - Pendentes Wave 2 (referenciar PASTOR.md §8 Wave 2)
9. SYNC.md update profundo:
   - Move tudo de Day 1-7 para "✅ Done"
   - Nova secção `📥 COWORK → CLAUDE CODE`: Wave 2 Day 1 (Embedding layer + Qwen3 + faiss)
10. Final commit `feat: Wave 1 shipped — Pastor MVP public` no `dev`, merge para `main` (com `final-reviewer`).
11. Tag git: `git tag v0.1.0-pastor-wave1 && git push --tags`

## DoD (HARD GATES)

- [ ] Recall ≥ 17/20 (85%) — sem isto, Wave 2 não arranca
- [ ] p99 latency hint emit ≤ 60ms
- [ ] `~/mooter/docs/wave1-validation.md` mergeado
- [ ] `gh repo view` mostra **Public** (não Private)
- [ ] README.md actualizado e destaca Pastor
- [ ] Tweet draft em `docs/launch/`
- [ ] Notion HQ sub-página criada
- [ ] SYNC.md updated com Wave 2
- [ ] Tag git v0.1.0-pastor-wave1

## Constraints

- ❌ Não publicar tweet ainda — só draft
- ❌ Não anunciar em HN ainda (Wave 4)
- ❌ Não criar cookbook PR ainda (Wave 4)
- ❌ Não auto-merge para `main` — sempre `final-reviewer` + manual merge
- ⚠️ Se recall < 85%: **PARAR**. Não mergear para `main`. Cowork session para tuning.

## Validação final do dia

```bash
cd ~/mooter
ls docs/wave1-validation.md docs/launch/wave1-tweet-draft.md
gh repo view mooter-ai/mooter | grep -iE "visibility|description"
# Expected: Public
git tag --list | grep wave1
# Expected: v0.1.0-pastor-wave1
```

## Quando parar e perguntar

- Recall < 85% — STOP, não mergear, pedir review humano
- Algum prompt do validation set tem nota subjective ≤ 2 — analisar root cause antes de avançar
- Repo edit falha por permissões GH → pergunta caminho alternativo
- README hero text — pede review ao Paulo antes de mergear

🟢 **Quando o `gh repo view` mostrar `Public` pela primeira vez, Wave 1 está concluída.** Notifica-me.

Ready?

=== END ===

---

## 11. Riscos, anti-patterns, definition of done

### Riscos top-5

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Pastor vira "more bloat" — utilizadores ignoram pack-hints | Média | Alto | Statusline + sticky hint só se confidence ≥ 0.6; user pode `mooter pack run` sem executar |
| Sobre-engenharia — 50 packs vazios | Média | Médio | Cada pack só entra no registry após validação em ≥10 prompts reais; trust_score visível |
| Domain classifier vira "regex hell" | Baixa | Médio | Mesma escada que complexity classifier: regex → embedding → Haiku; cada camada testada |
| Packs ficam desactualizados (skills/MCPs mudam mensalmente) | Alta | Médio | TTL_days no metadata; cron semanal verifica liveness; hub avisa `mooter pack digest` |
| Construir 3 meses em privado outra vez (padrão Paulo) | **Alta** | **Crítico** | ⚠️ Gate explícito Dia 7: repo público + Notion HQ + 3 packs validados ou pivot |
| Smithery/Composio lança classificação por intent primeiro | Média | Alto | Velocidade. Wave 1 = 7 dias. Cookbook PR + HN = Wave 4 = 4 semanas total |

### Anti-patterns documentados

- ❌ Pack sem `validation.smoke_test`: não merge
- ❌ Pack com >50 keywords: simplificar (signal-to-noise baixo)
- ❌ Pack que activa em >10% dos prompts: provavelmente demasiado genérico, refazer signals
- ❌ Pack `notion_kb_url` privado a Paulo: KB pública ou nenhuma KB (community trust)
- ❌ Mais de 3 packs por Wave 1 (foco)
- ❌ Pack-hint sem `confidence` numérica: black box mata audit

### Definition of Done — Wave Pastor completa (4 semanas)

- [ ] Schema `pack.schema.yaml` v1.0 publicado
- [ ] 7 packs oficiais validados e shipped (5 sementinha + 2 community batch 1)
- [ ] `classify_domain()` recall ≥ 0.85 em validation set ≥ 200 prompts
- [ ] `<pack-hint>` emitido por `inject_context.js` com performance p99 ≤ 60ms
- [ ] CLI completo (`list`, `show`, `install`, `diff`, `validate`, `run`, `search`, `rate`, `publish`)
- [ ] Hub endpoints `/api/pack/{publish,search,latest,digest}` live
- [ ] Onboarding 4ª pergunta (tipos de tarefa) → auto-install packs
- [ ] Notion KB integration funcional para ≥ 3 packs
- [ ] Trust score em ranking de search
- [ ] Cookbook PR aberto em `anthropics/claude-cookbooks`
- [ ] HN submission feita
- [ ] Notion HQ + SYNC.md actualizados semanalmente
- [ ] Sessão de demo gravada (≤ 5min, público)

---

## 12. Eixo 3 — Especialização (Project LoRA + Pack LoRA)

> Esta secção descreve o terceiro eixo de routing, materializado na Wave 5. Mantém o produto fiel ao princípio "local quando suficiente, cloud quando preciso", mas estende a fronteira do "suficiente" via adapters treinados no contexto específico do user/pack.

### 12.1 Conceito

Adiciona ao classifier:

```
classify_complexity()    ──► T0–T3
classify_domain()        ──► pack_id
classify_specialization() ──► adapter_id | null
```

Onde `adapter_id` aponta para um LoRA / DoRA adapter pequeno (10–200MB) que, *quando carregado sobre o modelo base local*, eleva a qualidade dessa classe específica de tarefas para próximo do tier cloud — sem mover-se do local.

### 12.2 Dois sabores

| Adapter | Onde mora | Quem treina | Quando activa |
|---|---|---|---|
| **Project LoRA** | `<repo>/.mooter/project.lora` | Pipeline local em cron, após N=2000 decisões com feedback | `pack_id × repo_fingerprint` match (Layer 8 do V3) |
| **Pack LoRA** | `packs/<name>/adapter.lora` (sindicado via hub) | Maintainer do pack (oficial ou comunitário) | `pack_id` match + opt-in do user |

### 12.3 Anatomia do adapter no `pack.yaml` (extensão opcional ao §4)

```yaml
adapter:                              # opcional — pack funciona sem
  name: string                        # ex: animation-web-lora-v1
  base_model: string                  # ex: qwen3:14b
  format: "lora" | "dora" | "qlora"
  rank: integer                       # default 32 para coding tasks
  size_mb: integer                    # peso do ficheiro
  trained_on: ISO8601
  trained_against:                    # snapshot
    dataset_records: integer
    eval_winrate_vs_sonnet: float     # 0-1
    eval_winrate_vs_base: float       # 0-1
  hot_swap: boolean                   # vLLM hot-swap supported?
  download_url: string                # hub URL
  sha256: string
  license: string                     # MIT default; obriga clean dataset
```

### 12.4 Pipeline de treino (caminhos legais)

Quatro estratégias, ordenadas por risco legal (de menor para maior):

| Caminho | Dataset source | Risco ToS Anthropic | Recomendação |
|---|---|---|---|
| **A — Self-distillation no codebase** | Próprio repo do user (code, commits, docs) | ✅ Zero — dados do user | **MVP. Wave 5 implementa só isto.** |
| **B — Adapter comunitário pre-treinado** | HuggingFace já existentes (Qwen3.5-Claude-distilled) | ⚠️ Cinza — risco do uploader, não nosso | Permitido com aviso explícito + opt-in |
| **C — Distillation de modelos open-license** | DeepSeek-R1, Llama 3.x, Qwen3-Coder traces | ✅ Permitido pela licença dos teachers | Wave 6+, opcional |
| **D — User-owned Opus outputs** | Outputs Claude que o user já gerou em sessões pessoais | ⚠️ Zona cinza — cláusula "compete with Claude". Legal review obrigatório antes | Não Wave 5. Considerar pós-Series-A |

**Wave 5 só implementa A.** B é flag opt-in com warning. C/D ficam fora.

### 12.5 Eval harness — non-negotiable

Adapter sem eval **nunca** é activado. O eval roda em três níveis:

1. **Deterministic checks** (custo zero): código compila? testes passam? lint clean? Para cada generation.
2. **Sonnet-as-judge** (custo médio): win-rate adapter vs base vs Sonnet 4.6 em hold-out 200 prompts. Pega da run de Sonnet uma vez, reusa.
3. **Opus-as-judge sample** (custo alto, opcional): 20 prompts críticos avaliados por Opus offline, mensal. Calibração contra Sonnet judge.

**Threshold de activação**: win-rate vs Sonnet ≥ 60% **E** deterministic pass rate ≥ 80%. Senão: adapter fica em `staging`, nunca routed em produção.

### 12.6 Performance budget (adapter loading)

| Etapa | Budget | Estratégia |
|---|---|---|
| Adapter resolve (qual carregar?) | ≤ 5ms | Lookup em `~/.mooter/adapters/index.json` |
| Adapter swap (vLLM) | ≤ 200ms p99 | LoRA hot-swap nativo |
| Adapter swap (Ollama) | N/A | Merged-model only; restart ~3-5s |
| Cold start (modelo base) | ≤ 2s | `ollama-warmup.js` já existe; estende para vLLM |

### 12.7 Anti-patterns — Adapter Forge

| ❌ Não fazer | Razão |
|---|---|
| Distillation directa de outputs Opus 4.7 para criar adapter público | Anthropic ToS — risco de takedown |
| Adapter activado em produção sem eval ≥ 60% win-rate | Degradação de qualidade silenciosa |
| Adapter de Project LoRA partilhado entre projectos | Anti-pattern de privacidade — vaza padrões do repo |
| Re-train automático sem cap de custo | Custos GPU descontrolados |
| Adapter "fundido" no modelo base sem versioning | Impossível reverter, switching cost vira lock-in tóxico |
| Esconder do user que adapter está activo | Transparency over magic. RDTR deve listar `adapter_id` activo |

### 12.8 Quando o Adapter Forge NÃO faz sentido (sê honesto)

- ⚠️ Projecto com < 50 ficheiros / < 1000 commits — dataset insuficiente; Pack LoRA comunitário é melhor opção
- ⚠️ Tarefas T3 (arquitectura, audit, debugging não-trivial) — adapter não substitui reasoning ceiling do modelo base; cloud Opus continua certo
- ⚠️ Project muito polyglot (5+ stacks ao mesmo tempo) — adapter dilui-se, qualidade não justifica custo de treino
- ⚠️ User sem RTX 4090+ ou equivalente cloud budget — treino fora do hardware tier

Nesses casos: o Pastor continua a routar para cloud sem adapter. Não há shame em isso.

---

## 13. Anexos

### A. Sinais fortes do research 2026-05-27 (resumo)

1. **Skills Registry oficial Anthropic não existe** — só 17 skills oficiais vs >66k comunitárias. Pastor pode posicionar-se como o ranker canónico Pack→Skill→MCP.
2. **MCP Registry cobre só ~20%** dos 10k+ servers existentes. Espaço para "qual MCP usar para X em 2026" — função literal do Pastor.
3. **6 frameworks de orquestração consolidados** (Claude Agent SDK + Strands + LangGraph + OpenAI Agents SDK + CrewAI + AG2). Pastor é **agnóstico** — não substitui, escolhe qual usar.
4. **Churn alto** (Roo Code morreu 15-Mai-2026, AutoGen em maintenance, OpenAI Swarm substituído). Pastor precisa de health-check semanal — diferenciação clara.
5. **Browser e sandbox são domínios maduros mas fragmentados** por trade-off claro. Tabela de decisão por intent já mapeada; implementação directa.
6. **Voice TTS tem default claro em 2026** (Cartesia Sonic 3 latency / ElevenLabs Flash realism / Hume Octave emoção). Diferencial 3-5x pricing torna escolha relevante.
7. **Anthropic publicou skills financeiras Excel + MCP connectors enterprise em Mai-2026** → vertical-specific packs são o futuro. Estruturar por vertical (finance/design/devops/research/content), não só horizontal.
8. **Ameaça competitiva**: Smithery + Composio + PulseMCP evoluem de catálogos para semi-routers. Janela < 12 meses.
9. **Padrão "core + extensions"**: 17 skills oficiais + 66k comunitárias. Mooter adopta o mesmo — "Moo Packs oficiais" (10-20 curados) + comunitários (livres, trust signals).
10. **Mermaid continua default LLM-friendly diagram-as-code** — Pastor gera Mermaid by default; D2 só quando explicit.

Fontes completas: [`research_best_in_class_2026.md`](./research_best_in_class_2026.md).

### B. Repos públicos seed para Packs

Selecção crítica da research (por domínio):

| Domínio | Repos seed |
|---|---|
| Animation | [motion.dev](https://motion.dev), [gsap](https://gsap.com), [tailwindcss-motion](https://github.com/romboHQ/tailwindcss-motion) |
| Diagram | [mermaid](https://mermaid.js.org), [d2lang](https://d2lang.com), [excalidraw](https://excalidraw.com) |
| Spreadsheet | [openpyxl](https://openpyxl.readthedocs.io), [SheetJS](https://sheetjs.com), [polars](https://pola.rs) |
| Audit | [semgrep](https://semgrep.dev), [codeql](https://codeql.github.com), [gitguardian](https://www.gitguardian.com) |
| Knowledge | [notion-mcp](https://github.com/makenotion/notion-mcp-server), [MegaMem](https://github.com/C-Bjorn/MegaMem) |
| Voice | [cartesia](https://cartesia.ai), [elevenlabs](https://elevenlabs.io), [hume](https://hume.ai) |
| MCP catalogs | [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers), [PulseMCP](https://www.pulsemcp.com) |
| Orchestration | [LangGraph](https://github.com/langchain-ai/langgraph), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python), [Inngest AgentKit](https://github.com/inngest/agent-kit) |

### C. Glossário

- **Pastor (Alemão)**: o classificador two-axis que orquestra Moo Packs.
- **Moo Pack** (ou "pack"): ficheiro declarativo YAML que define stack (skills + MCPs + agents + repos + scaffold) para uma classe de tarefas.
- **Pack Manifest**: o ficheiro `pack.yaml` em si.
- **Pack Hint**: o bloco `<pack-hint>` emitido pelo hook UserPromptSubmit em paralelo com `<router-hint>`.
- **Pack Registry**: catálogo (local + sindicado via frugal-hub) de packs publicados.
- **Pack Resolve**: processo de verificar disponibilidade de skills/MCPs requeridas e produzir gap analysis.
- **Trust Score**: número 0–1 calculado pelo hub via usage_count, feedback signals, validation passes.
- **Notion KB (per pack)**: sub-página Notion ligada ao pack que acumula best practices, pitfalls, snippets.

---

*Documento criado 2026-05-27 no Cowork. Próxima sessão: Claude Code em `~/mooter/` arranca Wave 1 Day 1 com o Master Prompt §10.*
