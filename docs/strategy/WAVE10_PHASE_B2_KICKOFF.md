# Wave 10 Phase B.2 — UX/UI Polish + Signed-in Audit

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**:
> - Wave 10 Phase A (`v1.2.0`) em main ✅
> - Wave 10 Phase B.1a (`v1.3.0-community-pipeline`) em main ✅
> - Cowork re-audit homepage live confirmou: mock 14,231 desapareceu, Demo badge + Illustrative footnote funcionais
> - Hub NÃO mexido (B.1b adiado para Wave 4 Phase D)
>
> **Origem**: 13 sub-features (#5-#17) do `docs/strategy/WAVE10_PHASE_B_BACKLOG.md`. Sem hub changes — tudo landing-only + signed-in audits + polish.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave10-phase-b2`. `--permission-mode bypassPermissions`.

**Missão Wave 10 Phase B.2**: completar audit E2E + polish UX/UI. **13 sub-features agrupadas em 4 sub-phases sequenciais**:

| Sub-phase | Sub-features | Foco | Effort |
|---|---|---|---|
| **B.2a — Quick wins** | #7, #11, #15 | String/copy fixes, < 30 min cada | ~1h |
| **B.2b — Signed-in audits** | #8, #10, #16, #17 | Audit Cowork via Chrome MCP (signed-in) → entrega backlog incremental → CC fixe | ~3h |
| **B.2c — Single-feature impl** | #5, #6, #9 | Install state + Setup mapping doc + Mobile responsiveness | ~3h |
| **B.2d — Page audits** | #12, #13, #14 | /methodology · /compare · /packs · pages individuais | ~2h |

**Estimativa total**: 8-10h CC · ~$25-35 API.

## 1. Princípios

1. **Anti-bazuca**: cada sub-feature começa com recon focado. Reporta findings antes de codificar.
2. **Honesty layer**: cada KPI numérico precisa de DataSourceBadge (Live/Demo) — herdado de B.1a.
3. **Vibe coder lens**: cada copy passa pelo filtro "vibe coder 25 anos entende em <10s?"
4. **Anthropic showcase lens**: cada feature precisa passar "isto faria engineer da Anthropic mostrar a um colega?"
5. **No git add -A**: explicit staging.
6. **Final-reviewer T3-gate por sub-phase** (4 vezes).

## 2. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost + adapter_selection + schemas v1 INTACTOS**
- ❌ **hub/ produção INTACTO** (B.1b adiado — não tocar)
- ❌ **migrations 006/007/008 NOT re-applied**
- ❌ **Sub-feature #9 (mobile)**: NÃO mexer em design system tokens sem Paulo aprovar
- ❌ **Sub-feature #10 (admin audit)**: NÃO modificar admin RBAC sem Paulo aprovar
- ❌ **Não `git add -A`** · **`--no-verify`** · merge `main` sem aprovação
- ✅ **Final-reviewer T3-gate por sub-phase**
- ✅ **Auto-merge dev por sub-phase** (4 PRs · NUNCA main directamente)
- ✅ **Tags**: `v1.3.1-quick-wins` (B.2a) · `v1.3.2-signed-in` (B.2b) · `v1.3.3-install-mobile` (B.2c) · `v1.3.4-pages` (B.2d)
- ✅ **GLOSSARY** (Mooter · Moos · packs · adapter)
- ✅ **Honesty**: Live/Demo badge em KPIs · zero números fabricados · *Illustrative* disclaimer onde aplicável
- ✅ **EN-only** landing/dashboard (Wave 9 policy)

## 3. Branch + recon inicial

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3   # confirma v1.3.0-community-pipeline em main
git checkout -b wave10-phase-b2
```

---

## 4. Sub-phase B.2a — Quick wins (~1h)

### 4.1 #7 — Hero statusline mock disclaimer

**Problema**: hero homepage mostra mock `mooter saved $0.31 today (89%) · T0 local ☑ · pack: diagram-systems · ▓▓▓▓░░░░░░ 42% 5h ...` que pode confundir visitantes ("já tenho $0.31 saved?!").

**Fix**: adicionar legenda discreta `*illustrative — your numbers vary` directamente abaixo do mock visual, em texto `var(--color-text-tertiary)` font-size 12px, italic.

**Onde**: `landing/app/(landing)/_components/HeroTerminal.tsx` (ou wherever rendered).

**Recon**:
```bash
grep -rn 'saved \$0.31\|saved $0.31\|0.31 today' landing/ 2>/dev/null
```

**Tests**: +1 test confirma string `*illustrative` está presente perto do mock.

### 4.2 #11 — Footer "Pack browser" vs nav "Packs" naming

**Problema**: footer link diz `Pack browser`, nav header link diz `Packs`. Inconsistência.

**Fix**: alinhar para `Packs` (mais curto, consistente). Footer "Pack browser" → "Packs".

**Onde**: `landing/app/(landing)/_components/Footer.tsx` ou similar.

**Recon**:
```bash
grep -rn 'Pack browser\|pack-browser' landing/ 2>/dev/null
```

### 4.3 #15 — Footer signing contributor count

**Problema**: footer diz `Made with ❤️ for vibe coders by Paulo Loureiro & contributors`. Se não há contributors externos confirmados, "& contributors" é exagero.

**Decisão Paulo** (CC pergunta antes de fix):
- **Opção A**: Listar nomes/handles de contributors externos confirmados (ex: `Paulo Loureiro, @joao, @maria`)
- **Opção B**: Trocar para `Paulo Loureiro & the mooter community` (vaguidade honesta)
- **Opção C**: Manter como está se há ≥1 contributor externo verificável

**Recon**:
```bash
gh api repos/pauloloureiroshp-ship-it/mooter/contributors --jq 'length'
gh api repos/pauloloureiroshp-ship-it/mooter/contributors --jq '.[].login' | head -5
```

### 4.4 Sub-phase B.2a closure

- Final-reviewer T3-gate
- PR Phase B.2a → dev
- Auto-merge dev (squash)
- Tag `v1.3.1-quick-wins`
- **Pára** · Cowork re-audita (~5 min) · Paulo confirma "B.2a ok, segue B.2b"

---

## 5. Sub-phase B.2b — Signed-in audits (~3h)

### 5.0 Recon Phase B.2b

Phase B.2b é **maioritariamente Cowork-driven** — Cowork audita signed-in pages via Chrome MCP, entrega `docs/strategy/WAVE10_PHASE_B2B_FINDINGS.md` com findings priorizados. CC só implementa fixes do backlog.

**Aguarda esse ficheiro existir antes de mexer.** Reporta ao Paulo:
```
B.2b está bloqueado em Cowork audit. Cowork precisa Paulo logged-in via Chrome para auditar:
- /dashboard tabs (Devices · Setup · Metrics · Decisions · How it works · Workflow)
- /admin panel
- /onboarding wizard
- /settings

Aguardo `docs/strategy/WAVE10_PHASE_B2B_FINDINGS.md`.
```

### 5.1 #8 — Signed-in dashboard tabs

Após Cowork entregar findings, CC implementa fixes em:
- `landing/app/dashboard/_components/*` para cada tab afectada

Tabs a verificar:
- **Devices**: 1 device · last sync 49d ago — reconnect CTA · empty state se 0 devices
- **Setup**: hardware probe + AI stack + recommended packs · campos cross-referenced com `mooter init`
- **Metrics**: per-tier breakdown (Wave 4 Phase D / B.1b ainda não shipped — Demo badge honest)
- **Decisions**: lista detalhada · paginação · search/filter

### 5.2 #10 — /admin panel audit (Wave 6.5 D1+D2)

Cowork verifica live:
- RBAC: `ADMIN_EMAILS=paulo.loureiro.shp@gmail.com` enforce (non-admin redirect)
- User table com email masking `p***@gmail.com` ✓
- Hardware shows class only (`high-end`) não modelo exacto ✓
- Audit log entry per view (`mooter_admin_audit` table — migration 007 ✓)
- Feedback view: lista entries `mooter_feedback` (migration 008 ✓)
- PII rejection no submit_feedback (email regex)

**CC implementa fixes** se Cowork findings identificar gaps.

### 5.3 #16 — /onboarding wizard flow

Cowork audita fluxo signed-in: hardware/persona/plan → mint install token → redirect /install/<token>.

**CC implementa fixes** se findings identificar broken steps ou UX inconsistencies.

### 5.4 #17 — /settings audit

Profile/subscriptions/devices management. Verificar disclosure "Telemetry, sync cadence & adapter are managed in your CLI (`mooter quiet --help`); cloud edit ships Wave 4 Phase D".

**CC implementa fixes** se Cowork findings identificar inconsistências.

### 5.5 Sub-phase B.2b closure

- Final-reviewer T3-gate
- PR Phase B.2b → dev
- Auto-merge dev (squash)
- Tag `v1.3.2-signed-in`
- **Pára** · Cowork re-audita · Paulo confirma "B.2b ok, segue B.2c"

---

## 6. Sub-phase B.2c — Single-feature impl (~3h)

### 6.1 #5 — /install page "Waiting for mooter to phone home..." state

**Problema**: página `/install` mostra `Waiting for mooter to phone home... ●●●○○` em loop infinito mesmo após install.

**Implementação**:
1. CLI faz POST para `/api/install/heartbeat` com `{token, hardware_class, ollama_models}` (anon) após `mooter init` sucesso
2. Página `/install/<token>` faz polling de 3s (state hook)
3. Estados:
   - **Loading** (0-300s após mint token): `Waiting for mooter to phone home... ●●●○○`
   - **Connected** (após heartbeat received): `✓ Connected · last sync 14s ago` + next steps
   - **Timeout** (>5 min sem heartbeat): `Couldn't detect install. Run mooter doctor to debug.`

**Privacy**:
- Heartbeat payload contém só `{token, hardware_class, ollama_models[]}` — zero PII
- Token expira 24h (já feito Wave 6 D2)

**Recon**:
```bash
grep -rn 'phone home\|Waiting for mooter' landing/ 2>/dev/null
ls landing/app/api/install/ 2>/dev/null
```

**Tests**: +5 (loading state · connected state · timeout state · heartbeat endpoint validation · token expiry)

### 6.2 #6 — Setup mapping cross-reference doc + UI

**Output**: `docs/strategy/SETUP_MAPPING.md` com tabela:

| Campo detectado `mooter init` | Onde aparece em dashboard? | Status |
|---|---|---|
| GPU model | Sidebar header chip | ✅ |
| VRAM (GB) | Sidebar header chip | ✅ |
| OS | Sidebar header chip | ✅ |
| Ollama models pulled | Setup tab cards | ❓ |
| Anthropic plan | AI stack section | ✅ |
| OpenAI plan | AI stack section | ❓ |
| Google Gemini plan | AI stack section | ❓ |
| CLAUDE.md path | (nenhum?) | ⚠️ |
| Pack recommendations | Recommended for you | ✅ |
| Adapter installed | Adapter chip | ✅ |

CC corre `mooter init --probe` (dry-run mode) para ver campos reais detectados, depois faz cross-reference. Identifica campos missing.

**UI fix**: se campos missing em dashboard são valiosos, adicionar (ex: Gemini plan no AI stack).

### 6.3 #9 — Mobile responsiveness 380px

**Critical risk** (não auditado Cowork via Chrome MCP — resize não funcionou):
- Hero `Got Moo?` H1 168px → overflows 380px
- WhyLocalCards grid 3 columns → precisa wrap 1 column
- Statusline mock visual (~78 cols monospace) → scroll horizontal

**Implementação**:
- Media queries `@media (max-width: 480px)`:
  - H1 hero: `clamp(48px, 18vw, 168px)`
  - WhyLocalCards: `grid-template-columns: 1fr` (de 3 fr para 1)
  - Statusline mock: `overflow-x: auto` + scroll indicator
- Test em 3 viewports: 380px (iPhone SE) · 414px (iPhone 14) · 768px (iPad)

**Tools**:
- CC pode usar `puppeteer` ou `playwright` headless para screenshots em mobile viewport (se instalável)
- OR Paulo testa manualmente em telemóvel após ship → reporta issues

**Tests**: +3 (no horizontal scroll <480px, cards wrap to 1 col, hero H1 doesn't overflow)

### 6.4 Sub-phase B.2c closure

- Final-reviewer T3-gate
- PR Phase B.2c → dev
- Auto-merge dev (squash)
- Tag `v1.3.3-install-mobile`
- **Pára** · Paulo testa no telemóvel · confirma "B.2c ok, segue B.2d"

---

## 7. Sub-phase B.2d — Page audits (~2h)

### 7.1 #12 — /methodology page

Cowork audita primeiro: benchmark data freshness, citations, reproducibility instructions claras.

**CC implementa fixes**:
- Update benchmark numbers (142 prompts → real number actual)
- Confirma citação fontes (blind judge methodology)
- Add reproducibility section: "Run yourself: `npx mooter benchmark --reproduce`"

### 7.2 #13 — /compare page

Cowork audita table vs LiteLLM/OpenRouter/Cursor/Plain CC.

**CC implementa fixes** se features novas (Wave 8/9/10) não estão reflectidas:
- Adicionar row "Per-bash tool badge" (mooter sim, outros não)
- Adicionar row "End-of-session digest" (mooter sim, outros não)
- Adicionar row "Sparkline last-10 tier mix" (mooter sim, outros não)

### 7.3 #14 — /packs page

Cowork audita 7 packs sementinha (Wave 1):
- Display nomes + descriptions
- "Recommended for you" logic baseado em hardware/subscription
- Pack browser navegação

**CC implementa fixes** se UX/copy precisar trabalho.

### 7.4 Sub-phase B.2d closure

- Final-reviewer T3-gate
- PR Phase B.2d → dev
- Auto-merge dev (squash)
- Tag `v1.3.4-pages`
- **Pára** · Cowork re-audit final · Paulo confirma "B.2d ok"

---

## 8. Promoção a prod (única, após todas as sub-phases)

Após B.2d closure em dev:

```bash
# Verifica que main + dev divergem em B.2a + B.2b + B.2c + B.2d
git log --oneline main..dev

# Abre PR dev→main (acumulado de Phase B.2)
gh pr create --base main --title "Promote dev → main: Wave 10 Phase B.2 (UX polish + signed-in + mobile + pages, v1.3.5)" --body ...

# Pára. Aguarda Paulo aprovação manual no GitHub.
```

Paulo aprova + merge commit (não squash). CC tagga `v1.3.5-phase-b2-complete` em main após Vercel auto-redeploy READY.

## 9. Tests aggregate (por sub-phase)

| Sub-phase | Tests pre | Tests added | Tests post |
|---|---|---|---|
| B.1a baseline | landing 57 | — | 57 |
| B.2a | — | +3 (illustrative, footer rename, contributors) | 60 |
| B.2b | — | +N (depende findings Cowork) | ~65-75 |
| B.2c | — | +8 (install state 5 + mobile 3) | ~73-83 |
| B.2d | — | +N (depende fixes pages) | ~80-90 |

## 10. Final-reviewer T3-gate templates

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave10-phase-b2 vs dev (sub-phase B.2[a|b|c|d] subset).

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + schemas v1 INTACTOS
- hub/ + migrations/ NOT touched
- [sub-phase-specific checks]
- Vocabulário GLOSSARY (Mooter · Moos · packs · adapter)
- ZERO PII em telemetry ou UI
- EN-only consistency
- Tests passing
- Cost sanity: $0
Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES."
```

## 11. PRs + tags (4 PRs + 1 promote)

| Sub-phase | PR title | Tag dev |
|---|---|---|
| B.2a | `Wave 10 Phase B.2a: Quick wins (#7+#11+#15)` | `v1.3.1-quick-wins` |
| B.2b | `Wave 10 Phase B.2b: Signed-in audits + fixes (#8+#10+#16+#17)` | `v1.3.2-signed-in` |
| B.2c | `Wave 10 Phase B.2c: Install state + Setup mapping + Mobile (#5+#6+#9)` | `v1.3.3-install-mobile` |
| B.2d | `Wave 10 Phase B.2d: Page audits (#12+#13+#14)` | `v1.3.4-pages` |
| Promote | `Promote dev → main: Wave 10 Phase B.2 complete (v1.3.5)` | `v1.3.5-phase-b2-complete` (em main) |

## 12. Closure W10 Phase B.2 (5x — uma por sub-phase + promote)

Cada sub-phase:
- `git checkout dev && git pull origin dev`
- `cd packages/cli && npm test`
- `cd ../../landing && npm test && npm run typecheck && npm run lint`
- `git tag` + push
- **Notion**: sub-page no HQ — `📊 Sessão 2026-06-0X — Wave 10 Phase B.2x — [headline]`
- **SYNC.md**: actualizar
- **Memória persistente**: `project-mooter-wave10-phaseB2[a|b|c|d|complete].md`

## 13. Resumo final esperado (após promote)

```
✅ Wave 10 Phase B.2 — UX/UI Polish + Signed-in Audit COMPLETA
- 4 sub-phases (B.2a + B.2b + B.2c + B.2d) sequencialmente shippadas
- 13 sub-features (#5-#17 do backlog) implementadas
- Tag prod: v1.3.5-phase-b2-complete
- mooter.ai com Phase A + B.1a + B.2 live

Tests: ~80-90 landing · CLI 190 · todos verdes
Investido: 8-10h CC · ~$25-35 API · 4 PRs dev + 1 PR promote main

⏸ Para. Próximo:
1) Cowork re-audita mooter.ai final
2) Validation 5 vibe coders agora faz sentido (VALIDATION_PLAN.md)
3) Marketing push pode arrancar

Future:
- B.1b (per-user heatmap) — quando Wave 4 Phase D arrancar (hub redeploy)
- Phase C (architecture audit) — opcional, com architect agent Opus
```

=== END ===

---

## Notas para Paulo (Cowork)

- **Phase B.2 são 13 sub-features de polish + audit, não 1 feature monolítica.** Faseamento em B.2a/b/c/d permite shippar value incremental.

- **Phase B.2b precisa de Paulo logado** via Chrome para Cowork auditar signed-in pages. Cowork pede credenciais ou Paulo navega manualmente via Chrome MCP.

- **Phase B.2c #9 mobile** é risk highest — não foi auditado (Chrome MCP resize não funcionou). Sugestão: Paulo testa mooter.ai no telemóvel real e reporta antes de B.2c arrancar, OU CC usa puppeteer headless se conseguir instalar.

- **Promoção a prod é única no fim** (B.2 completo) — 1 PR dev→main em vez de 4 promotes individuais. Reduz Vercel rebuild churn.

- **Custo estimado total**: 8-10h CC + 2-3h Paulo (decisões + audit mobile + GitHub approve final) + 1-2h Cowork (audits signed-in + re-audits após cada sub-phase) · ~$25-35 Anthropic API.

- **Quando arrancar**: AGORA — Paulo abre novo CC session com `--permission-mode bypassPermissions`, cola este master prompt, Enter. CC começa B.2a recon.
