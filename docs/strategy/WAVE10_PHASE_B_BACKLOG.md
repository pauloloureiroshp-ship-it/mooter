# Wave 10 Phase B — Site E2E + Metrics Audit Backlog

> **Auditor**: Cowork (Chrome MCP + Vercel MCP) · 2026-06-01 · pós-deploy Wave 10 Phase A v1.2.0 (`b31e436`).
> **Estado prod auditado**: `mooter.ai` a servir `main` v1.2.0 desde `dpl_92Ctj9ky` (target production, READY).
> **Cobertura**: homepage · /under-the-hood · /install · /dashboard (signed-out) · statusline Variant C live no terminal Paulo. **NÃO auditado** (signed-in needed): /dashboard tabs · /onboarding · /admin · /settings · mobile 380px.
>
> **Recomendação CC para Phase B**: implementa este backlog em **2 sub-phases sequenciais**:
> - **Phase B.1 — Telemetry pipeline + A.3 + A.5-V2** (sub-features #1-#5 abaixo): desbloqueia A.3 heatmap + A.5-V2 Sankey
> - **Phase B.2 — UX/UI polish + signed-in audit** (sub-features #6-#15): completar audit + fixes

---

## 1. Sumário executivo

### ✅ Já em produção (confirmado live 2026-06-01)
- Statusline Variant C com sparkline last-10 + barra % local (`tools/router/sparkline.js`)
- Homepage WhyLocalCards (3 cards: Quantization · LoRA/DoRA · Hardware match) com `Learn more →` para `/under-the-hood`
- `/under-the-hood` com explainer completo (Q4_K_M 120→18GB · quality delta -1.2pp a -2.4pp · LoRA r=32 ~80MB · Adapter Forge teaser)
- /install com 3 cards setup automático (Hardware probe · Subscription mapping · Pack recommendations)
- mooter digest end-of-session (Stop hook · `packages/cli/digest.ts`)
- Per-bash badge PostToolUse hook (`post_tool_badge.js`)
- PATTERN_COUNT=173 canónico
- EN-only dashboard
- Stats Overview/How it works labels honest

### 🔴 Críticos para Anthropic showcase quality
| # | Sub-feature | Severidade | Effort |
|---|---|---|---|
| #1 | Telemetry pipeline: `mooter_event` (hub) → dashboard Vercel exposure | 🔴 critical | T3 · ~3h |
| #2 | A.3 Local usage heatmap (task_type × tier) — depende #1 | 🔴 critical | T2 · ~1.5h |
| #3 | A.5-V2 Dashboard flow grafo (Sankey-lite) — depende #1 | 🔴 critical | T2 · ~2h |
| #4 | Real telemetry validation: "Live · N events" vs "Demo data" badges em todos sítios com stats | 🔴 critical | T2 · ~1h |

### 🟠 Importantes
| # | Sub-feature | Severidade | Effort |
|---|---|---|---|
| #5 | `/install` page: estado "Waiting for mooter to phone home..." infinito → ✓ Connected após phone-home | 🟠 important | T2 · ~45min |
| #6 | Setup mapping cross-reference doc + UI fix (campos detectados vs apresentados) | 🟠 important | T2 · ~1h |
| #7 | Hero homepage statusline mock — números aspiracionais ($0.31, 89%, 14,231 prompts) precisam de "illustrative" disclaimer ou serem números reais | 🟠 important | T1 · ~30min |
| #8 | Signed-in dashboard tabs audit (Devices · Setup · Metrics · Decisions) | 🟠 important | T2 · ~2h (precisa Paulo logged-in via Chrome) |
| #9 | Mobile responsiveness 380px: homepage hero "Got Moo?" 168px H1 + WhyLocalCards grid | 🟠 important | T2 · ~1.5h |
| #10 | /admin panel audit (RBAC + email mask + audit log + feedback view) | 🟠 important | T2 · ~1h |

### 🟡 Polish
| # | Sub-feature | Severidade | Effort |
|---|---|---|---|
| #11 | Footer "Pack browser" vs nav header "Packs" — name consistency | 🟡 polish | T0 · ~10min |
| #12 | `/methodology` page audit (benchmark data freshness, citation) | 🟡 polish | T1 · ~30min |
| #13 | /compare page audit (table vs LiteLLM/OpenRouter/Cursor/Plain CC) | 🟡 polish | T1 · ~30min |
| #14 | /packs page audit (7 packs sementinha — display + recommendation logic) | 🟡 polish | T1 · ~45min |
| #15 | Footer signing "Made with ❤️ for vibe coders by Paulo Loureiro & contributors" — confirma contributor count se publicar nomes | 🟡 polish | T0 · ~10min |
| #16 | /onboarding wizard flow audit (signed-in) | 🟡 polish | T2 · ~1h |
| #17 | /settings audit (profile · subscriptions · devices) | 🟡 polish | T2 · ~45min |

---

## 2. Detalhe por sub-feature

### #1 — Telemetry pipeline: hub→dashboard exposure 🔴

**Problema actual**: dashboard (Supabase + Vercel) tem apenas `decisions_log` agregado (decisions count, savings_usd, device_id). O breakdown por `tier × task_category` existe no `mooter_event` (CF Workers hub-side) mas não é exposto.

**Impacto**: bloqueia A.3 heatmap e A.5-V2 grafo. Sem isto, qualquer visualização "onde foi usado o local LLM" é Demo data.

**Recon obrigatório**:
```bash
# Hub schema actual
grep -rn 'mooter_event\|task_category\|decided_tier' hub/ tools/router/ 2>/dev/null
# Dashboard endpoints
grep -rn '/api/decisions\|/api/community/pulse' landing/app/ 2>/dev/null | head
# Hub→landing wire (existe?)
grep -rn 'CF_WORKERS_URL\|MOOTER_HUB_URL' landing/ 2>/dev/null | head
```

**Decisão de design (Paulo aprova antes de implementar)**:
- **Opção A**: Endpoint novo `/api/dashboard/aggregates` no landing que faz fetch de hub `/aggregates?user_id_hash=X` (server-side, anon-safe)
- **Opção B**: Hub edge function push periodic snapshot para Supabase `mooter_dashboard_snapshots` table, dashboard lê dali
- **Opção C**: Manter dashboard só com `decisions_log` agregado e exibir A.3/A.5-V2 como "Demo data" indefinidamente

**Recomendação**: Opção A (pull on-demand, evita drift de snapshots). Backward-compatible com Wave 4 Phase D (CF Workers backend) — Wave 4 Phase D vai expandir o hub side, este pull endpoint pode evoluir.

**Invariantes**:
- ❌ NÃO toca em `mooter_event` schema (já v1 frozen em Wave 3 D3)
- ❌ NO PII no payload (user_id_hash pseudonymous obrigatório)
- ✅ Honest disclosure "Live · X events from Y devices · last sync Z ago"

**Estimativa**: T3 · ~3h CC (1h recon + 1.5h impl + 0.5h tests).

### #2 — A.3 Local usage heatmap 🔴 (depende de #1)

**Onde**: nova tab no dashboard entre `Decisions` e nova `Local usage`.

**UI** (já desenhado no kickoff WAVE10 §4.3):
```
You used local models for X% of your prompts this week — saved $Y

             T0    T1    T2    T3
Renames     100%  —     —     —
Commits      87%  13%   —     —
Docstrings   62%  38%   —     —
Explain      45%  55%   —     —
Debug        12%  31%   57%   —
Refactor     —    8%    72%   20%
Critical     —    —     —     100%
```

**Lista**: top 10 últimas tasks onde local handled the heavy lifting (prompt truncated + privacy-safe).

**Data source**: pipeline #1 + `mooter_event.task_category × mooter_event.decided_tier`.

**Honesty**: "Demo data — your hub doesn't have events yet" quando empty.

### #3 — A.5-V2 Dashboard flow grafo 🔴 (depende de #1)

**Onde**: nova tab no dashboard "Workflow".

**Implementação**: SVG inline Sankey-lite (sem libs pesadas — paths + rects), largura proporcional à contagem por tier.

**UI** (já desenhado no kickoff WAVE10 §4.5 Variant 2):
```
Prompts (412)            Classify              Route → Execute
                       ┌──────────────┐
                       │              │──▶ 🏠 T0 local      271  ▓▓▓▓▓▓▓▓▓▓▓▓ 66%
                       │              │       qwen2.5:3b         $0.00
   412 ═══════════════│  classify.js │──▶ ☁ T1 haiku       86  ▓▓▓▓ 21%
   prompts             │   (regex)    │                          $0.07
                       │              │──▶ ☁ T2 sonnet      41  ▓▓ 10%
                       └──────────────┘                          $0.41
                              │
                              └──────────▶ ☁ T3 opus       14  ▓ 3%
                                                                $1.50
```

**Hover/click**: drill-down lateral painel com top task_categories desse tier.

### #4 — Real telemetry validation 🔴

**Problema**: Overview tab mostra `$73.85 SAVED · 663 DECISIONS · 100% % SAVED VS ALL-OPUS`. Não está claro se é live data do hub ou cache local.

**Fix**:
- Adicionar badge inline em qualquer KPI:
  - **Live · 663 events from 1 device · last sync 14m ago** (verde) quando hub responde
  - **Demo data — connect mooter CLI to see real numbers** (laranja) quando hub vazio
- Aplicar em: Overview · How it works · Decisions tab · /admin · Settings · landing homepage stats (14,231 / 89.9% / 247)

**Verificação live actual**: a homepage mostra `14,231 Prompts routed · 89.9% Avg savings · 247 Active devs` — **estes números são reais (community hub) ou aspirational mock?** Confirmar com Paulo.

### #5 — `/install` page estado pós-phone-home 🟠

**Problema actual**: página `/install` mostra `Waiting for mooter to phone home... ●●●○○` em loop infinito mesmo após o utilizador correr `curl install.sh`.

**Fix**:
- Após install, CLI faz POST para `/api/install/heartbeat` com `{token, hardware_class, ollama_models}` (anon)
- Página `/install/<token>` faz polling de 3s e troca para estado:
```
✓ Connected · last sync 14s ago

mooter is installed on your machine.
Next: `mooter init` in your project · or open dashboard
```
- Timeout 5 min → "Couldn't detect install. Run `mooter doctor` to debug."

**Honest**: se utilizador instalou mas não associou ao token (anonymous install), página fica em loading state honest sem fake "connected".

### #6 — Setup mapping cross-reference 🟠

**Output**: `docs/strategy/SETUP_MAPPING.md` com tabela:

| Campo detectado por `mooter init` | Onde aparece em dashboard? | Status |
|---|---|---|
| GPU model | Sidebar header chip | ✅ |
| VRAM (GB) | Sidebar header chip | ✅ |
| OS | Sidebar header chip | ✅ |
| Ollama models pulled | Setup tab cards | ❓ verificar |
| Anthropic plan | AI stack section | ✅ |
| OpenAI plan | AI stack section | ❓ verificar |
| Google Gemini plan | AI stack section | ❓ verificar |
| CLAUDE.md path | (nenhum?) | ⚠️ deveria? |
| Pack recommendations | Recommended for you | ✅ |
| Adapter installed | Adapter chip | ✅ |

**Audit pendente**: signed-in dashboard para confirmar campos faltantes.

### #7 — Hero homepage statusline mock — disclaimer ou números reais 🟠

**Mock actual** (homepage):
```
mooter saved $0.31 today (89%) · T1 haiku ☑ · pack: diagram-systems
▓▓▓▓░░░░░░ 42% 5h · ▓▓░░░░░░░░ 18% 7d · ↺ 2h14m
ctx 23% · adapter: ◌ · $0.04 turn · alltime $4.21
```

**Problema**: vibe coders chegam pensando que `$0.31 saved today` é a sua média real. Quando instalam, vêem $0 inicial → quebra de expectativa.

**3 opções de fix**:
- **A**: adicionar legenda discreta `*illustrative — your numbers vary` abaixo do mock
- **B**: substituir por carousel rotativo de "Paulo's session today" / "Sarah's session" / "Mike's session" com nomes + números reais
- **C**: deixar mock + adicionar transição "after first prompt" → mostra animação `$0.00 → $0.04`

**Recomendação**: A (mais honesto, menos esforço).

### #8 — Signed-in dashboard tabs 🟠

**Não auditado** ainda (sessão de Paulo expirada durante redeploy). Tabs a auditar quando Paulo der login:
- **Devices**: 1 device · last sync 49d ago — UX para reconnect, empty state se 0
- **Setup**: hardware probe + subscriptions + recommended packs
- **Metrics**: per-tier breakdown (depende de #1 telemetry pipeline)
- **Decisions**: lista detalhada (depende de #1)

### #9 — Mobile responsiveness 380px 🟠

**Não auditado** (Chrome MCP resize_window não fez resize efectivo — window mostrou `innerWidth: 2048` após resize). **Recomendação**: CC testa via puppeteer/Playwright headless OR Paulo testa no telemóvel.

**Suspeito alto-risco**:
- Hero `Got Moo?` H1 168px font-size → overflows em 380px
- WhyLocalCards grid 3 columns → precisa wrap para 1 column
- Statusline mock visual (font monospace, ~78 cols) → scroll horizontal inevitável

**Fix esperado**: media query `@media (max-width: 480px)` ou `repeat(auto-fit, minmax(280px, 1fr))` no grid.

### #10 — /admin panel audit 🟠

Wave 6.5 D1+D2 shipped o admin panel. Verificar live:
- RBAC: `ADMIN_EMAILS=paulo.loureiro.shp@gmail.com` enforce (non-admin redirect)
- User table com email masking `p***@gmail.com`
- Hardware shows class only ("high-end") não modelo exacto
- Audit log entry per view (mooter_admin_audit table — migration 007 aplicada ✓)
- Feedback view: lista entries `mooter_feedback` (migration 008 ✓)
- PII rejection no submit_feedback (email regex)

**Bloqueio**: precisa Paulo logged-in via Chrome MCP. Ou Paulo audita manualmente.

### #11 — Footer "Pack browser" vs nav "Packs" 🟡

**Inconsistência menor**: footer link `Pack browser`, nav header link `Packs`. Decidir nome canónico (recomendado: `Packs` curto, consistente).

### #12 — `/methodology` audit 🟡

Confirmar:
- Benchmark data citation (142 prompts, blind judge, source) freshness
- Quality delta numbers updated (`-1.2pp` etc.)
- Reproducibility instructions claras

### #13 — `/compare` audit 🟡

Confirmar table vs LiteLLM/OpenRouter/Cursor/Plain CC reflectir Wave 8/9/10 features (per-bash badge, digest, sparkline).

### #14 — `/packs` audit 🟡

7 packs sementinha shipped Wave 1. Confirmar:
- Display nomes + descriptions
- "Recommended for you" logic baseado em hardware/subscription
- Pack browser navegação

### #15 — Footer signing 🟡

`Made with ❤️ for vibe coders by Paulo Loureiro & contributors` — se há contributors externos (Wave 1 gate ≥3 contributors), considera listar nomes/handles.

### #16 — /onboarding wizard 🟡

Audit fluxo signed-in: hardware/persona/plan → mint install token → redirect /install/<token>.

### #17 — /settings audit 🟡

Profile/subscriptions/devices management. CLAUDE.md já refere "Telemetry, sync cadence & adapter are managed in your CLI (`mooter quiet --help`); cloud edit ships Wave 4 Phase D" — confirmar este disclosure visível.

---

## 3. Sequenciamento recomendado para CC

### Phase B.1 — Telemetry foundation (~5-6h CC)
1. Recon #1 (telemetry pipeline) → reporta findings ao Paulo
2. Paulo decide Opção A/B/C → CC implementa #1
3. CC implementa #2 (heatmap) + #3 (Sankey grafo) usando pipeline #1
4. CC implementa #4 (Live/Demo badges) em todos KPIs
5. Final-reviewer T3-gate · PR Phase B.1 · tag `v1.3.0-telemetry-pipeline`

### Phase B.2 — UX/UI polish (~3-4h CC)
6. CC implementa #5 (install state) + #6 (setup mapping doc)
7. CC implementa #7 (mock disclaimer) + #11 (footer fix) — quick wins
8. CC implementa #9 (mobile responsiveness)
9. CC audita signed-in tabs #8 + #10 + #16 + #17 (depende de credenciais — Paulo loga via Chrome MCP)
10. Final-reviewer T3-gate · PR Phase B.2 · tag `v1.3.1-site-audit-polish`

**Total Phase B**: 8-10h CC · ~$30-40 Anthropic API.

### Stop points obrigatórios
- Após recon #1 → Paulo escolhe Opção A/B/C
- Após #4 implementado → Cowork re-audita live · Paulo confirma "B.1 ok, segue B.2"
- Após #5-#11 → Cowork re-audita
- Antes de tag `v1.3.x-*` → final-reviewer T3

---

## 4. Invariantes para Phase B

- ❌ classify.js byte-identical (P11)
- ❌ safety_boost + adapter_selection + schemas v1 INTACTOS
- ❌ migrations 006/007/008 NOT re-applied
- ❌ hub/ produção INTACTO **excepto sub-feature #1** (que pode ler novo endpoint do hub se Opção A escolhida — não escreve)
- ❌ NÃO `git add -A` · `--no-verify` · merge `main` sem aprovação
- ✅ Final-reviewer T3-gate por sub-phase (Phase B.1 + Phase B.2)
- ✅ Auto-merge dev por sub-phase (NUNCA main directamente)
- ✅ Tags: `v1.3.0-telemetry-pipeline` (B.1) + `v1.3.1-site-audit-polish` (B.2)
- ✅ Vocabulário GLOSSARY (Mooter · Moos · packs · adapter)
- ✅ Honesty: "Live · N events" vs "Demo data" badges obrigatórios em qualquer KPI numérico
- ✅ NO PII em telemetry (`user_id_hash` pseudonymous)
- ✅ EN-only landing/dashboard (Wave 9 policy)

---

## 5. Notas finais Cowork

- **Phase A está extremamente sólida em prod**. WhyLocalCards na homepage funcionam, statusline Variant C tem sparkline + tier colors a contar a história, /under-the-hood tem o explainer técnico mais completo de qualquer LLM-router que vi (quantization bars + LoRA ASCII + quality delta + benchmark provenance).
- **Bottleneck verdadeiro de Phase B é o #1** (telemetry pipeline). Sem isso, A.3 e A.5-V2 ficam mock indefinidamente. Recomendo Paulo aprovar a decisão #1 design ANTES de CC arrancar Phase B.
- **Mobile responsiveness (#9)** é hipótese — não conseguio confirmar via Chrome MCP. Paulo deve testar manualmente no telemóvel + abrir issue se quebrar.
- **Signed-in audits (#8, #10, #16, #17)** ficam bloqueados até Paulo fazer login via Chrome MCP ou auditar manualmente.
- **Estado overall**: a 2-3 sub-phases (B.1 + B.2 + opcional Phase C arquitectura) de qualidade Anthropic showcase end-to-end completa.

---

## 6. CC recon #1 — findings (2026-06-01, Sessão #72)

**A boa notícia: a maior parte do pipeline já existe no hub.**

- **Hub source**: `hub/worker.js` (router) + `hub/routes/*.js`. Rotas: `/api/delta` · `/api/device-heartbeat` · `/api/stats` (`handleStats`) · `/api/models` · `/api/version` · `/submit-events` · **`/aggregate-stats` (`handleAggregateStats`, `hub/routes/events.js`)** · `/health`.
- **Dados tier×category JÁ agregados no hub**: `handleAggregateStats` computa `tierDist[decided_tier]` + top-10 `task_category` sobre a tabela `frugal_events`/`mooter_events` (alias, migration 004). `/api/stats` dá hw_tier/sub_profile/device counts.
  - ⚠️ **Gap real para A.3 (#2)**: o hub faz dois `GROUP BY` SEPARADOS (`GROUP BY decided_tier` e `GROUP BY task_category`), **NÃO um cross-tab** `GROUP BY task_category, decided_tier`. A matriz do heatmap precisa desse cross-tab → SELECT novo no hub (read-only, sem schema change, mas é código do hub — confirmar contra o invariante "hub intacto excepto #1").
- **Landing NÃO tem URL do hub wired** (sem `CF_WORKERS_URL`/`MOOTER_HUB_URL` em `landing/`). O wire hub→dashboard não existe → trabalho central do #1.
- **`CommunityPulse` (homepage) mostra MOCK**: busca `/api/community/pulse` (que **não existe** em `landing/app/api/`) com timeout 2s e cai no **fallback hardcoded `14,231 / 89.9% / 247`**. Comentário do próprio componente: *"The /api/community/pulse endpoint does not exist in Phase A (it is Phase D), so this always renders the placeholder."* → **confirma #4 e #7**: números da homepage são placeholder documentado mas parecem reais ao visitante.

**Conclusão**: Opção A é a mais directa — dados já existem no hub via `/aggregate-stats`; falta (a) wire server-side landing→hub + 2 routes (`/api/dashboard/aggregates` + `/api/community/pulse`), (b) possivelmente 1 query cross-tab nova no hub p/ o heatmap (#2), (c) Live/Demo badges (#4). **Precisa do Paulo**: (1) escolher Opção A/B/C; (2) URL deployado do hub; (3) se `/aggregate-stats` filtra por `user_id_hash` (per-user) ou é community-wide.
