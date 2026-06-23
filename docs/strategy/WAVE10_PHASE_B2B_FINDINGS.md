# Wave 10 Phase B.2b — Signed-in Audit Findings

> **Auditor**: Cowork (Chrome MCP, signed in via Paulo's GitHub OAuth session) · 2026-06-01 · pós-deploy `v1.3.5-phase-b2-complete` em prod.
> **Cobertura**: /onboarding · /dashboard (Overview · Devices · Setup · Metrics · How it works · Workflow · Decisions) · /admin · /settings.
> **Para CC**: implementa fixes priorizados abaixo. Cada finding tem severity + effort + ficheiro estimado.

---

## 1. Sumário executivo

**12 findings total**: 1 bug crítico (math 743%) · 5 important (UX/copy) · 6 polish (consistency).

**Estado overall signed-in**: bom — 7 tabs do dashboard renderizam, admin/settings/onboarding funcionais, honesty layer presente (Metrics tab é exemplar, Demo badge no Workflow). Falta polish em Setup tab (sub-utilizada) e Settings (sem editing UI).

| Severity | Count |
|---|---|
| 🔴 Critical | 1 (math bug admin 743%) |
| 🟠 Important | 5 |
| 🟡 Polish | 6 |

---

## 2. Critical (1)

### F-1 🔴 `/admin` Overview KPI "743% avg savings"

**Onde**: `landing/app/(admin)/admin/page.tsx` (KPI grid)

**Observado live**: header KPIs mostram `1 USERS · +1 active (7d) · 1 DEVICES · 1/user · 663 DECISIONS · 743% avg savings · $73.85 SAVINGS · all time`

**Problema**: `743%` é matematicamente absurdo (avg savings deveria ser 0-100% ou %-equivalent like "9x cheaper"). Provavelmente `savings_usd / spent_usd × 100` em vez de `(allOpus - spent) / allOpus × 100`.

**Fix esperado**:
- Verificar formula em `admin/page.tsx` (ou similar) onde "avg savings" é calculado
- Mudar para `min(100, (allOpus - actual) / allOpus * 100)` (mesma fórmula que Overview Wave 9 usou)
- Adicionar test source-level: `expect(avgSavingsPct).toBeLessThanOrEqual(100)`

**Severity**: 🔴 critical (vibe coder que olhe admin vê 743% e perde confiança imediata)

---

## 3. Important (5)

### F-2 🟠 `/onboarding` Step 1 GPU string técnica

**Onde**: `landing/app/onboarding/page.tsx` ou hardware probe component

**Observado live**: hardware probe mostra `GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)`

**Problema**: string raw do WebGL ANGLE — vibe coder vê e pensa "WTF é Direct3D11 vs_5_0 ps_5_0?"

**Fix esperado**:
- Parsing regex: `/NVIDIA GeForce ([^(]+) \(/` → captura `RTX 4090`
- Display: `NVIDIA GeForce RTX 4090` (normalizado) + class chip "gpu-high"
- Fallback se regex falhar: `Unknown NVIDIA GPU` em vez de string raw

**Severity**: 🟠 important (onboarding é first impression — string técnica destrói trust)

### F-3 🟠 `/settings` Persona "unknown"

**Onde**: `landing/app/(app)/settings/page.tsx` + Wave 6 D1 profiles schema

**Observado live**: Settings → PROFILE → `paulo.loureiro.shp@gmail.com · unknown · Hardware: windows nvidia`

**Problema**: Paulo passou pelo onboarding (Wave 6 D1) com persona picker (Solo Founder/Senior IC/OSS Maintainer/Other). Settings mostra `unknown` — persona não foi guardado OR não é lido.

**Fix esperado**:
- Verificar: install token config → profiles table → settings read
- Possível causa: persona field é "Other" mas UI mapeia para "unknown" (label bug)
- Adicionar edit CTA: "Change persona" → re-runs onboarding step 3 OR inline picker

**Severity**: 🟠 important (settings page com dado errado vê-se imediatamente)

### F-4 🟠 `/dashboard` Setup tab sub-utilizada

**Onde**: `landing/app/(app)/dashboard/_components/SetupTab.tsx`

**Observado live**: Setup tab só mostra `✓ Install mooter Done · ✓ First sync Done · ✓ Configure Ollama Done`

**Problema**: 3 checklist items é vazio para "Setup". Devia mostrar:
- Hardware probe details (RTX 4090 · 24GB VRAM · win32) — já em sidebar header, mas Setup é onde drill-down faz sentido
- AI providers detected (Anthropic ✓ · Ollama ✓ · OpenAI ✓ · Gemini ✓)
- Recommended packs (per persona/hardware)
- Adapter status (◌ baseline · install via mooter forge)
- Re-run onboarding CTA se profile incompleto

**Fix esperado**: expandir SetupTab para 4-5 cards (hardware · AI stack · packs · adapter · re-onboard).

**Severity**: 🟠 important (Setup tab é prime real estate, está vazia)

### F-5 🟠 `/dashboard` Overview sem DataSourceBadge

**Onde**: `landing/app/(app)/dashboard/_components/Overview.tsx`

**Observado live**: Overview KPIs (`$73.85 SAVED · 663 DECISIONS · 100% % SAVED VS ALL-OPUS`) NÃO têm DataSourceBadge (Live/Demo). Apenas Workflow tab tem.

**Problema**: B.1a #4 honesty layer só ficou no Workflow tab. Overview KPIs ficam ambíguos: vibe coder não sabe se 663 decisões é dele real ou demo.

**Fix esperado**:
- Adicionar `<DataSourceBadge source="live"|"demo" devices={1} lastSync="49d ago" />` no Overview KPI strip
- Reutilizar componente B.1a (já existe em `landing/app/_components/DataSourceBadge.tsx`)
- Mesmo padrão Devices tab + Decisions tab (consistency)

**Severity**: 🟠 important (honesty layer incompleta — B.1a só fez parcial)

### F-6 🟠 `/dashboard` Devices sem reconnect CTA

**Onde**: `landing/app/(app)/dashboard/_components/Devices.tsx`

**Observado live**: 1 device · `49d ago` · sem botão para reconnect/refresh

**Problema**: Stale telemetry visível mas nenhuma acção. Vibe coder pensa "como reactivo?".

**Fix esperado**:
- Adicionar CTA inline: "Run `mooter sync` to refresh" (snippet copiável) OR
- Self-service link: "Run mooter doctor" (debug install) OR
- Disclosure already shipped: "Real-time CLI↔cloud sync ships Wave 4 Phase D" — keep but add the manual sync alternative

**Severity**: 🟠 important (dead-end UX)

---

## 4. Polish (6)

### F-7 🟡 Version chip "v0.9" no dashboard + settings + devices

**Onde**: telemetry CLI report

**Observado live**: chip mostra `v0.9` (CLI do Paulo está em frugal-era v0.9.x). Não é code bug — é setup gap.

**Fix esperado**: **NÃO é fix de código.** É setup gap do Paulo. Documentação: adicionar nudge "Your CLI is on v0.9 · update with `curl install.sh`" se versão reportada ≥ 2 majors atrás do current.

**Severity**: 🟡 polish (Paulo-specific, mas pode acontecer a outros vibe coders early adopters)

### F-8 🟡 `/admin` "Other" persona quando Paulo passou wizard

**Onde**: admin persona distribution

**Observado live**: PERSONA DISTRIBUTION · Other 1 (100%)

**Problema**: relacionado com F-3 — persona não persisted. Admin mostra "Other" pois é o default.

**Fix esperado**: fix F-3 resolve isto automaticamente (mesma source).

### F-9 🟡 Recommendations Overview têm CTA inline mas sem copy

Observado live: `Install qwen2.5:3b for fast T0 · Install qwen3:30b for T0-smart · Optimise your Router with a backtest`

**Problema**: copyable commands estão lá, mas falta "✓ Applied" state quando user já correu. Static cards.

**Fix esperado**: state-aware — se Ollama models pulled (via dashboard sync), card vira "✓ Installed · run `ollama ls`".

**Severity**: 🟡 polish

### F-10 🟡 Settings page sem edit UI

**Onde**: `landing/app/(app)/settings/page.tsx`

**Observado live**: read-only data, só "Logout" botão

**Problema**: utilizador não tem maneira de editar persona, subscriptions, ou remover devices via web.

**Fix esperado** (per CLAUDE.md): manter read-only + adicionar disclaimer claro: `ⓘ Telemetry, sync cadence & adapter are managed in your CLI (mooter quiet --help). Cloud-side editing ships Wave 4 Phase D.` Idealmente com link para `/under-the-hood#wave-4` ou similar.

**Severity**: 🟡 polish (disclaimer já existe em alguns sítios; falta no settings)

### F-11 🟡 `/admin` Recent Activity formato datas inconsistente

**Onde**: admin Recent Activity log

**Observado live**: `4h ago · p***@gmail.com profile updated` + `2026-04-13 · p***@gmail.com sync from Windows DESKTOP-J26409Q (win32) — 663 decisions`

**Problema**: 1 row usa "4h ago", outra usa data ISO. Inconsistência.

**Fix esperado**: normalizar — todas as rows mostram relative (`4h ago`, `49d ago`) se ≤30 days OR ISO se >30 days. Tooltip mostra absolute.

**Severity**: 🟡 polish

### F-12 🟡 Hardware string nas sidebar não normalizada

**Onde**: header sidebar mostra `RTX 4090 · win32 · gpu-high`

**Problema**: `win32` é OS tag, mas combinado com `RTX 4090` (GPU) parece raw. Vibe coder vê `win32` e pensa "huh?" — devia ser `Windows`.

**Fix esperado**: mapping `win32` → `Windows`, `darwin` → `macOS`, `linux` → `Linux` em UI display (manter `win32` em telemetry payload).

**Severity**: 🟡 polish

---

## 5. Estado live confirmado (já funcional, NÃO precisa fix)

✅ Sign-in flow GitHub OAuth funcional (silent re-auth para sessões válidas)  
✅ Onboarding 3-step wizard (Setup · Stack · Persona) funcional  
✅ Dashboard 7 tabs renderizam todos: Overview · Devices · Setup · Metrics · How it works · Workflow · Decisions  
✅ Workflow tab Sankey-lite com tier distribution (T0 272 66% · T1 87 21% · T2 41 10% · T3 12 3%) + Demo badge honest  
✅ Metrics tab honest disclosure de "How mooter measures savings" vs VSCode plugin vs decisions.log  
✅ Admin email masking `p***@gmail.com` · setup completion funnel · hardware/AI/persona distributions  
✅ Settings shows profile · subscriptions · devices read-only  
✅ Sidebar header com email + hardware chips + Sign out CTA  
✅ EN-only consistency em todas as pages signed-in (Wave 9 policy)  
✅ "Real-time CLI↔cloud sync ships Wave 4 Phase D" disclosure presente em 4-5 sítios (honest)

---

## 6. Sequenciamento recomendado para CC

### B.2b — Recommend 2 sub-slices

**B.2b.1 — Critical + Important** (~3h CC):
- F-1 admin 743% math bug
- F-2 GPU string normalização onboarding
- F-3 persona "unknown" persistence
- F-4 Setup tab expansion
- F-5 DataSourceBadge no Overview
- F-6 Devices reconnect CTA

**B.2b.2 — Polish** (~1.5h CC):
- F-7 version stale nudge
- F-8 resolve automaticamente via F-3
- F-9 recommendations state-aware
- F-10 settings disclaimer
- F-11 admin Recent Activity datas
- F-12 win32 → Windows mapping

### Tags

- `v1.3.6-signed-in-critical` (B.2b.1)
- `v1.3.7-signed-in-polish` (B.2b.2)
- Promote único `v1.4.0-phase-b2b-complete` no fim

### Invariantes (não-negociáveis)

- ❌ classify.js byte-identical (P11)
- ❌ safety_boost + adapter_selection + schemas v1 INTACTOS
- ❌ migrations 006/007/008 NOT re-applied
- ❌ hub/ produção INTACTO
- ❌ Não `git add -A` · `--no-verify` · merge `main` sem aprovação
- ✅ Final-reviewer T3-gate por sub-slice
- ✅ Auto-merge dev por sub-slice
- ✅ Honesty layer EXPANDIR (não regredir)
- ✅ EN-only (Wave 9 policy)

---

## 7. Stop points obrigatórios

- Após F-3 recon (persona persistence): CC pode pedir Paulo decidir entre "Other" preserve vs default redirect para Solo Founder
- Após F-1 fix: CC mostra novo número antes de merge (math sanity check)
- Antes de promote a prod: Cowork re-audita signed-in pages live

---

## 8. Notas finais Cowork

- **Estado overall signed-in muito sólido**. Os 12 findings são polish/honesty-layer, não estruturais. Phase B.2b é completable em 1 sessão CC bem orquestrada.
- **F-1 (743%) é o único showstopper** — vibe coders que abram admin vêem isto e questionam tudo. Prioritário.
- **F-2 (GPU string ANGLE)** é o mais visível para new users (onboarding step 1) — first impression.
- **B.1b (per-user heatmap)** continua adiada para Wave 4 Phase D. Não conflita com B.2b findings.

Após B.2b shipped + promoted, **Phase B está COMPLETO** e Anthropic showcase quality fica em ~95%. Resta apenas Phase C (architecture audit) que é opcional.
