# Wave 24 — Pre-Launch Fixes (Friends-launch Blockers)

> **Goal**: Resolver 6 blockers descobertos no E2E audit 2026-06-06 antes de
> friends-launch outreach. Sem isto, friends vêem produto que parece abandonado,
> mente sobre privacy, e tem dashboard quebrado.
>
> **Trigger**: Wave 23 v1.13.0-self-audit EM PROD + Cowork pre-launch audit
> revelou 8 issues divididos em 3 categorias (visuais broken + copy mentiroso +
> data pipeline quebrado).
>
> **Scope**: 1 PR consolidado · 6 critical fixes · ~8h CC autonomous + ~1h Paulo
> validation. Tag dev `v1.14.0-pre-launch-fixes-dev` → prod `v1.14.0-pre-launch-fixes`.
>
> **Non-negotiables**:
> - classify.js byte-identical (P11 sha256 `7b01eb86…87762`)
> - Wave 21/22/23 tracker shapes intact
> - Zero PII em payloads
> - UserPromptSubmit hook intact
> - **Honesty alignment com Wave 23 audit findings** — não voltar a contradições

---

## 0. Pre-flight — audit findings (Cowork 2026-06-06)

### Phase 1 — Landing public pages: ✅ **5/5 PASS**

| Page | Verdict |
|---|---|
| / homepage | ✅ "Got Moo?" serif, dark, 0 frugal leaks, 44 mooter mentions |
| /install | ✅ Install command présent (404 string foi falso positivo) |
| /under-the-hood | ✅ Quantization/LoRA/DoRA explainer |
| /privacy | ✅ "your code stays yours" claim (mas precisa caveat — 24.C) |
| /compare | ✅ Comparison content |
| /onboarding | ✅ Wizard present (1 nit: title = homepage SEO) |

Wave 15 LoginHero fix está LIVE em prod ✅ (cream → dark + fabricated stats removed).

### Phase 2 — Dashboard signed-in: ❌ **4 issues blockers**

Logged in como `paulo.loureiro.shp@gmail.com` (RTX 4090 Windows gpu-high):

| # | Issue | Severidade |
|---|---|---|
| A1 | **Tooltips overlapping** texto principal em "How it works" tab — paragraph cut mid-word, multiple overlay boxes simultaneously visible | 🔴 CRITICAL |
| A2 | **"v0.9 (54d ago, stale)"** versible top-right e mid-content — prod é v1.13.0 | 🔴 CRITICAL |
| A3 | **"$73.85 saved · 663 decisions"** marked "Outdated · last sync 54d ago" — friends will think product is dead | 🔴 CRITICAL |
| A4 | **Cards Signal extraction** expose `has_code_block`, `has_file_refs` ao user — muito técnico, sem contexto | 🟠 IMPORTANT |

### Phase 3 — Hub data pipeline: ❌ **5 issues blockers**

```
GET https://mooter-hub.frugal-hub.workers.dev/aggregate-stats
→ { total_events:0, unique_instances:0, tier_distribution:{}, avg_confidence:0,
    savings:{total_usd:0}, ... }

GET https://mooter-hub.frugal-hub.workers.dev/api/stats
→ { prompt_count:5, user_count:1, avg_tier_distribution:{t0:0,t1:0,t2:0,t3:0},
    sub_distribution:[{sub_profile:"max",count:5}], hw_distribution:[{hw_tier:"apple-silicon"}] }

GET https://mooter.ai/api/community/pulse
→ { "source": "demo" }

GET https://mooter.ai/api/dashboard/aggregates
→ { "source": "demo" }
```

| # | Issue | Severidade |
|---|---|---|
| C1 | CLI nunca auto-sync — Paulo (e friends) precisam correr `mooter sync` manual | 🔴 CRITICAL |
| C2 | Hub `/aggregate-stats`: **ZERO events, ZERO savings**, `avg_tier_distribution all 0` — Pastor não aprende | 🔴 CRITICAL |
| C3 | Landing `/api/community/pulse` retorna `{"source":"demo"}` — fallback porque hub vazio | 🔴 CRITICAL |
| C4 | hw_tier "apple-silicon" no hub mas Paulo principal é Windows RTX 4090 — cross-machine sync precisa verificar | 🟠 IMPORTANT |

### Wave 23 honesty alignment

Wave 23 audit descobriu: **"local-summarizer" routes T0 mas executa cloud Haiku quando API key existe** (Discovery 2 quantified 18.6× tokens).

Mas dashboard **"How mooter works"** card diz: **"No data sent anywhere"** — direct contradição.

`/privacy` page diz: **"your code stays yours"** — mesmo gap.

Wave 24 24.C tem de alinhar copy com honest discovery (without losing trust).

---

## 1. Sub-features (6 critical)

### 24.A — Dashboard UX broken fixes (CRITICAL)

**Root cause**: "How it works" tab tem tooltips overlapping main text. Multiple info boxes flutuantes visible simultaneously.

**Fix path**:

1. Read `landing/app/(app)/dashboard/...HowItWorks*` component
2. Identify tooltip/popover trigger logic (provavelmente Radix or shadcn Popover)
3. Fix:
   - Tooltips should only show on hover/focus, not all at once
   - Z-index correcto
   - Tooltip max-width para não overflow card boundaries
4. Hide "v0.9 (54d ago, stale)" inline content text — keep only one place (header chip), not multiple
5. Test responsive: mobile + desktop layouts

**Estimate**: 2h CC.

### 24.B — Stale data UX honesty (CRITICAL)

**Root cause**: Dashboard mostra `$73.85 saved · 663 decisions` from 54d ago sem prominent prompt to update. Friends will think product abandoned.

**Fix path**:

1. Add **prominent banner** topo dashboard quando `last_sync_age > 7d`:
   ```
   ⚠ Your dashboard shows data from 54 days ago.
   Run `mooter sync` in your terminal to refresh.
   [Copy command] [Learn more]
   ```
2. Dim ou strikethrough dos numbers stale ($73.85 / 663) quando outdated
3. CLI version chip stale: replace "v0.9 (54d ago, stale)" by "Update available: mooter v1.13.0" com link to /install
4. Empty state quando user nunca correu `mooter sync`: show onboarding gradient com "Run mooter sync to see your first numbers" CTA

**Estimate**: 1.5h CC.

### 24.C — "No data sent anywhere" copy honest (CRITICAL)

**Root cause**: Wave 23 found local-summarizer executes Haiku cloud when API key. Dashboard + /privacy claim "no data sent anywhere" — direct lie.

**Fix path**:

1. Update "How mooter works" card "Your prompt" content:
   - Before: "Zero data leaves your machine at this step."
   - After: "Zero data leaves your machine **for routing**. The actual model call (T0 local / T1-T3 cloud) is then made — the divergence chip in your terminal shows when local intent routes cloud."
2. Update "Pre-processing" card:
   - Add: "100% local. Pure regex, no AI."
3. Update `/privacy` page:
   - Add section: "**Routing vs Execution**: Mooter's classifier runs 100% locally — no data sent during prompt classification. The actual LLM call may execute locally (Ollama) or cloud (Anthropic API). When you have an API key, summarisation tasks classify as T0 but execute cloud Haiku for quality. The divergence chip in your CLI shows this in real time."
4. Update terminal mockup landing — add ⚠ exec divergence chip example

**Estimate**: 1h CC.

### 24.D — CLI auto-sync OR onboarding prompt (CRITICAL)

**Root cause**: CLI never auto-syncs. User installs, uses Mooter, dashboard always stale.

**Fix path** (3 options, CC chooses via AskUserQuestion if hard call):

**Option α**: Auto-sync background daemon (every 6h)
- New `mooter daemon` command
- Systemd/launchd service
- Risk: Linux/macOS/Windows compat hell

**Option β**: Auto-sync on `mooter X` command run (lazy)
- Hook to every CLI command, sync if last_sync_age > 1h
- Async, non-blocking
- Risk: latency per command

**Option γ**: Onboarding prompt + dashboard reminder (no auto-sync)
- After install: prompt "Run `mooter sync` to start tracking"
- Dashboard banner persistent (24.B)
- Honest, lowest risk

**Recommended**: γ first, α/β Wave 25+.

**Estimate**: 1.5h CC (γ approach).

### 24.E — Hub data validation (CRITICAL)

**Root cause**: Hub recebe writes mas `avg_tier_distribution` all 0 — Pastor não aprende.

**Fix path**:

1. Run `mooter sync` from Paulo's WSL Linux
2. Check hub `/api/stats` — should now show non-zero tier distribution
3. If still zero:
   - `wrangler tail mooter-hub` while syncing
   - Identify which migration/route drops tier data
   - Fix
4. If non-zero:
   - Verify Pastor learning loop (decisions_v2.jsonl → hub events → aggregate)
   - Add monitoring endpoint `/api/pastor/learning-health`

**Estimate**: 1.5h CC (depends on root cause).

### 24.F — hw_tier detection multi-platform (IMPORTANT)

**Root cause**: Hub regista "apple-silicon" for Paulo when he's mainly Windows RTX 4090. Cross-machine sync working differently per platform.

**Fix path**:

1. `tools/router/hw-detect.js` — verify detection logic per OS
2. Linux WSL: `nvidia-smi` → "gpu-high" or specific model
3. macOS: sysctl → "apple-silicon-m1/m2/m3"
4. Windows native: wmic/PowerShell → similar
5. Test: Paulo runs `mooter env-detect` on each machine → correct output
6. Hub: avoid double-counting Paulo's same user across machines (use stable user_id_hash)

**Estimate**: 1.5h CC.

---

## 2. Sequência (~8h autonomous)

### Day 1 — Phase 0 recon + 24.A/B/C (~4h)

1. Recon 30 min: read HowItWorks component + identify tooltip lib
2. 24.A Dashboard UX (~2h)
3. 24.B Stale data UX (~1h)
4. 24.C Copy honest (~1h, includes /privacy edit)

### Day 1 (continued) — 24.D/E/F + closure (~4h)

5. 24.D Onboarding prompt approach γ (~1.5h)
6. 24.E Hub data validation — corre `mooter sync` test (~1.5h, depende root cause)
7. 24.F hw_tier detection multi-platform (~1.5h)
8. Tests 6 new + classify.js sha guard + PR squash + final-reviewer T2 Sonnet (~1h)

**Total**: ~8h CC autonomous.

---

## 3. Non-negotiables

| # | Item | Como verificar |
|---|---|---|
| 1 | classify.js byte-identical | sha256 = `7b01eb86…87762` |
| 2 | Wave 21/22/23 tracker shapes intact | snapshot() unchanged |
| 3 | Honesty alignment | grep "no data sent" → 0 matches |
| 4 | UserPromptSubmit hook intact | smoke test |
| 5 | Zero hub touch unless 24.E needs migration | git diff hub/ |
| 6 | Tests router + 6 new | npm test pass |

---

## 4. Definition of Done (Wave 24)

1. ✅ 24.A — Dashboard "How it works" tab renders cleanly (no tooltip overlap)
2. ✅ 24.A — Version display ONE place (não duplicated mid-content)
3. ✅ 24.B — Banner prominent quando stale data
4. ✅ 24.C — "Routing vs Execution" section em /privacy + dashboard copy honest
5. ✅ 24.D — Post-install onboarding prompt visível + dashboard reminder persistent
6. ✅ 24.E — After Paulo runs `mooter sync`, hub `/api/stats` shows non-zero tier_distribution
7. ✅ 24.F — `mooter env-detect` correto per OS
8. ✅ classify.js sha intacto
9. ✅ Tag prod `v1.14.0-pre-launch-fixes` em main
10. ✅ Notion sub-page + SYNC.md update
11. ✅ **Friends-launch GO** após Paulo re-test dashboard end-to-end

---

## 5. Master prompt CC

```
Inicia Wave 24 Pre-Launch Fixes conforme docs/strategy/WAVE24_PRE_LAUNCH_FIXES_KICKOFF.md.

Pré-flight: Wave 23 v1.13.0-self-audit EM PROD. Cowork pre-launch audit 2026-06-06 revelou 8 issues blockers (4 dashboard UX + 4 hub data pipeline). Friends-launch HOLD até Wave 24 ship.

Scope: 1 PR consolidado com 6 fixes — 24.A Dashboard UX broken + 24.B Stale data UX honesty + 24.C "No data sent" copy honest (Wave 23 alignment) + 24.D CLI onboarding prompt + 24.E Hub data validation + 24.F hw_tier multi-platform.

Lê PRIMEIRO:
  - docs/strategy/WAVE24_PRE_LAUNCH_FIXES_KICKOFF.md inteiro
  - landing/app/(app)/dashboard/ (How it works tab component)
  - landing/app/(marketing)/privacy/page.tsx
  - tools/router/hw-detect.js
  - tools/router/classify.js (P11 sha256 7b01eb86…87762 — NUNCA tocar)
  - SYNC.md (Wave 23 audit context)

Non-negotiables:
  - classify.js byte-identical (GUARD em cada commit)
  - Wave 21/22/23 tracker shapes intact
  - Honesty alignment com Wave 23 (zero "no data sent" claims sem caveat)
  - UserPromptSubmit hook intact
  - Zero hub touch unless 24.E needs schema fix
  - Tests router + 6 new

Sequência (~8h autonomous):
  Day 1 Phase 0 Recon (30 min): identify tooltip lib + read HowItWorks
  24.A Dashboard UX broken (~2h): fix tooltip overlap + version display ONE place
  24.B Stale data UX (~1h): prominent banner + dim outdated numbers + CLI version update prompt
  24.C Copy honest (~1h): edit "How mooter works" + /privacy "Routing vs Execution" section
  24.D Onboarding prompt γ (~1.5h): post-install + dashboard persistent reminder
  24.E Hub data validation (~1.5h): Paulo runs mooter sync test, verify tier_distribution non-zero
  24.F hw_tier multi-platform (~1.5h): Linux/macOS/Windows detection
  Tests + PR (~1h): 6 new tests + classify guard + squash → wave24-pre-launch-fixes + final-reviewer T2 Sonnet

Tag dev v1.14.0-pre-launch-fixes-dev.

E2E gate (Paulo + Cowork):
  - Paulo browser /dashboard → no tooltips overlap, no "v0.9 stale", banner prominent
  - Paulo runs mooter sync → hub /api/stats shows non-zero tier_distribution
  - Paulo /privacy → "Routing vs Execution" section visible
  - Cowork Chrome MCP re-audit pass 100%

NÃO promover prod até PASS.

Reporta findings em docs/strategy/WAVE24_DAY_X_FINDINGS.md por etapa.

Após Wave 24 prod ship, Paulo + Cowork executa friends-launch outreach (3 DMs) com pitch v3 incluindo "Mooter audited Mooter, found gaps, shipped fixes — produto honest end-to-end".
```

---

## 6. Wave 25 backlog (deferred)

Items moved from Wave 24:
- 22.A herd v167 nuclear fix
- frugal-* branding cleanup 5 router files
- Dual admin-token security
- token_tracker aggregateTranscript Wave 22.B real
- LoRA train 212 strict samples
- AUDIT_REPORT.md path correction

Estimate Wave 25: ~6h CC + LoRA overnight. Friends-launch JÁ feita até este wave.

---

**Composed by Cowork, 2026-06-06 pós-Wave 23 prod + pre-launch audit. 6 critical
fixes para friends-launch GO honest. ~8h CC autonomous. Tag v1.14.0. Friends DMs
desbloqueados após PASS.**
