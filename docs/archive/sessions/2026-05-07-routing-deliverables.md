# Sessão 2026-05-07 — Routing strategy: PDF visual + Master Prompt V2 + /how-it-works

**Owner**: Paulo Loureiro · **Local**: Cowork (Claude Desktop) · **Duração**: ~1 sessão
**Contexto**: continuação da sessão estratégica anterior (Notion HQ + canónicos V1/V2/V3 já em git)

## Entregáveis

| # | Ficheiro | Localização | Tamanho |
|---|---|---|---|
| 1 | `MOOTER_ROUTING_FLOWCHART_2026-05-07.pdf` | `~/frugal/` | 462 KB · 5 páginas A4 |
| 2 | `MOOTER_MASTER_PROMPT_V2_2026-05-07.md` | `~/frugal/` | 22.7 KB · 9 phases |
| 3 | `landing/app/how-it-works/page.tsx` | `~/frugal/landing/app/how-it-works/` | 16 KB · 441 linhas |

## Decisões de design

| Decisão | Escolha | Razão |
|---|---|---|
| PDF scope | Fluxograma + 1 página explicativa (recommended) | Foco visual, leitura em 5 min, Anthropic-friendly |
| PDF estilo | Anthropic docs minimalist (recommended) | Tipografia serif (Times-Roman), warm parchment bg, 1 accent rose, paleta tier coerente com landing |
| PDF stack | matplotlib (PNG fluxograma 300dpi) + reportlab (typography + tables) | Vector tables + raster diagram em vez de svg2rlg que tem fragilidade conhecida |
| Master prompt target | Repo `mooter` (recommended) | V1 do master prompt assumia `~/frugal/`. V2 instrui Claude Code a portar para `mooter/` como triple-stack |
| Phases | 9 (vs 6 do V1) | Cobre as 5 features V2 §3 que impressionam Anthropic (RDTR, MCP server público, Honest Cost Report, Safety Gate, Eval Harness) |
| /how-it-works visualidade | Página dedicada (recommended) | Diagrama 5-layer simplificado vs 7-layer real, tier table sem percentagens internas |
| O que esconder | Thresholds exactos · seed count · Thompson/LinUCB · specialists exactos · número savings preciso por tier | Comercial: dial tuning é vantagem competitiva; específicos mudam semanalmente |
| O que mostrar | Pipeline shape · 4 tiers · subscription-aware · range honesto 65-82% · "Honest about what we don't show" section | Transparência sobre o que escondemos é sinal de credibilidade |

## Conteúdo do PDF (5 páginas)

| Pág | Secção | Conteúdo principal |
|---|---|---|
| 1 | Cover | Título serif "Routing, made honest." · meta block (version · date · author · status) · descrição 4 linhas |
| 2 | TL;DR | 4 honest conclusions (cost reduction 65-82% não 95% · latency assimétrica · task shape > diff size · ~10k decisions to converge) |
| 3 | Pipeline | Fluxograma 7-layer + cascade + feedback loop (full page) |
| 4 | Tier mapping | T0/T1/T2/T3 cards com models · shape · examples · latency · cost + subscription-aware section |
| 5 | Honest savings | Cost table + "where bazooka isn't worth it" + uncertainties + sources |

## Master Prompt V2 — estrutura

| Phase | Objectivo | Files-chave |
|---|---|---|
| 0 | Audit estado actual `~/mooter/` | `AUDIT_2026-05-07.md`, top-15 gaps |
| 1 | Router core (Layers 0-3) | `cache/`, `guardrails/`, `features/`, `router/knn.ts` |
| 2 | Tier dispatch + cascade (Layers 4-6) | `confidence.ts`, `judge.ts`, `dispatch/`, `cascade.ts` |
| 3 | Routing Decision Transparency Report (RDTR) | Schema · `mooter explain` CLI · landing `/decisions/[id]` |
| 4 | Triple-stack publish | Plugin Claude Code + Skill portable + MCP server `@mooter/router` + cookbook PR |
| 5 | Codebase-aware language harmonisation | `detectCodebaseLang()` · `mooter.lang.json` · 6 línguas |
| 6 | Honest Cost Report | Dashboard local · advisory vs guaranteed savings · opt-in Mooter Economic Pulse |
| 7 | Pre-deploy Safety Gate | git pre-push hook · RSP-aligned checklist · `mooter approve` |
| 8 | Open Routing Eval Harness | 500 prompts sintéticos · CI badge accuracy · Petri-style |
| 9 | /how-it-works + launch comms | Landing deploy · demo video · blog · HN · Anthropic Startup Program |

**Princípios non-negotiable**: 16 (P1-P16) cobrindo idioma, anti-bazuca, ADRs, security guardrails, Authority hierarchy.

## Conteúdo da /how-it-works (comercial)

| Secção | O que revela | O que esconde |
|---|---|---|
| Hero | Pipeline existe, 5 layers, "task shape > diff size" | — |
| Pipeline diagram | 5 caixas (Cache → Guardrails → Classify → Pick tier → Cascade) | Os 7 layers reais (omitido feature extraction explícito + LLM-as-judge fallback) |
| Tiers | T0-T3 com label, use case textual, examples, cost qualitativo | Modelos exactos, latency p50, custos $/MTok, thresholds |
| Subscription-aware | Existe, é killer angle, sabe Pro vs Max vs PAYG | Como decide |
| Honest about what we don't show | 3 bullets (thresholds · specialists · exact savings) | Os números em si |
| CTA | install.sh oneliner | — |

## Verificações executadas

| Check | Resultado |
|---|---|
| PDF gera 5 páginas A4 sem erros | ✅ 462 KB |
| PDF text extract — todas as páginas têm conteúdo | ✅ 533 / 1453 / 238 / 1119 / 1906 chars |
| PDF render visual page 1 (cover) | ✅ Tipografia serif clean, accent rose, meta block |
| PDF render visual page 3 (fluxograma) | ✅ 7 layers + cascade + feedback loop legíveis |
| PDF render visual page 4 (tier table) | ✅ Badges coloridos, alinhamento OK |
| PDF render visual page 5 (cost) | ✅ Tabela + uncertainties claros |
| TSX JSX balance | ✅ 53 open = 51 close + 2 self-closing |
| TSX braces balance | ✅ 133/133 |
| TSX lines | 441 |
| Master prompt links V1/V2/V3 referenciados | ✅ Todas as referências existem em `~/frugal/MOOTER_*.md` |

## Pendências para Claude Code (próxima sessão)

| 🔜 | Tarefa | Onde |
|---|---|---|
| 1 | Ler V3 + V2 + flowchart PDF + master prompt V2 nos primeiros 5 min | `~/frugal/MOOTER_*` |
| 2 | Correr Phase 0 — audit `~/mooter/` | `~/mooter/AUDIT_2026-05-07.md` |
| 3 | Validar TSX em contexto Next.js (`pnpm dev` em `landing/`) e ajustar imports/styling | `~/frugal/landing/` |
| 4 | Decidir: a /how-it-works fica em `~/frugal/landing/` (router base) ou portar para `~/mooter/landing/`? | Ambiguidade real — perguntar Paulo |

## Notas honestas

- **PDF é vectorial mais raster (PNG do fluxograma)**: para máxima qualidade Anthropic-tier o ideal seria SVG vectorial puro. O resultado actual é 300dpi que imprime bem em A4; para apresentação on-screen ou impressão A3+ pode ser preciso re-render.
- **Master prompt V2 substitui V1**: o V1 (`MOOTER_MASTER_PROMPT_2026-05-07.md`) fica como referência histórica, mas Claude Code deve usar V2 daqui em diante. Considera apagar V1 ou renomear para `_v1_archive`.
- **/how-it-works está em `landing/` do repo `frugal`**: se a estratégia é separar `frugal` (router base) de `mooter` (produto), esta página devia ficar no repo `mooter`. Decisão pendente — está em `frugal/landing/` por agora porque é onde o landing actual existe.
- **Não criei demo video Loom**: requer captura de ecrã que não posso fazer aqui. Phase 9.5 do master prompt cobre.

## Próxima missão (sugerida)

**Hoje/amanhã**: validar visualmente o PDF a abrir no Mac/Windows; abrir TSX em `pnpm dev` para conferir layout responsive. Se estiver tudo OK:

1. Commit selectivo: `git add MOOTER_ROUTING_FLOWCHART_2026-05-07.pdf MOOTER_MASTER_PROMPT_V2_2026-05-07.md SESSION_REPORT_2026-05-07_*.md landing/app/how-it-works/`
2. PR `feat/routing-strategy-deliverables` → `dev`
3. Notion sub-HQ page criada: `🔥 Sessão 2026-05-07 — Routing strategy deliverables (PDF + master prompt v2 + /how-it-works)`
4. Update `SYNC.md` secção `📥 COWORK → CLAUDE CODE` com pendências

**Dia seguinte**: arrancar Phase 0 do master prompt V2 — Claude Code a fazer audit completo do `~/mooter/`.

---

🔥 **Foco**: 19 dias até gate (2026-05-26). PR ao `anthropics/claude-cookbooks` antes do **Code with Claude London 2026-05-19** (12 dias).
