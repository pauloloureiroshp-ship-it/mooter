# WAVE 33.9 — Visual Migration (Claude Design canvas → mooter.ai prod)

**Sequência:** Wave 33.7 SHIPPED v1.21.3 → Wave 33.8 statusline 2.0 (in progress) → **Wave 33.9 Visual Migration**
**Tag esperada:** `v1.21.5-visual-migration`
**Estimate:** 6-8h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo
**Date kickoff:** quando Wave 33.8 ship
**classify.js sha:** `7b01eb86…87762` INTACT obrigatório (19 waves consecutive)

---

## §1 Por que esta wave

Wave 33.7 SHIPPED v1.21.3-landing-enhance fez **copy refresh** + privacy-first dashboard + GitHub OAuth tightening. Mas:

**Gap visual real:** os visuals do Claude Design canvas (Got Moo? hero gigante, pulse strip stylized cards, terminal mockup live routing, comparison table 11/11, Conductor + Workflow showcases, Cmd+K palette) estão APENAS em `preview.mooter.ai` (landing-v12-deploy static canvas). **mooter.ai prod tem look maduro pre-canvas.**

**Wave 33.9 = trazer os visuals do canvas para mooter.ai prod**, preservando:
- Next.js 15 + React 19 + TypeScript strict
- Supabase auth + middleware (Wave 33.7)
- Hub wiring per-user dashboard (Wave 33.7)
- Hand-rolled CSS tokens (`--color-*`) — mantém arquitectura
- ~30 API routes
- 135/135 landing tests + 74/74 hub tests

**Doctrine:** visual migration **incremental**, **component-by-component**, **honest preserves Wave 33.7 architecture**.

---

## §2 Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ <Wave 33.8 ship commit>` |
| Branch feature | `wave33_9-visual-migration` |
| Tag pós-merge | `v1.21.5-visual-migration` |
| Vercel project | `landing` (mooter.ai prod) — Wave 33.7 already serving |
| `landing-v12-deploy/` (preview.mooter.ai canvas) | INTOCADO (referência visual SOURCE) |
| classify.js sha | `7b01eb86…87762` INTACT obrigatório (19 waves) |
| Wave 28-33.8 packages | **INTOCADOS** |
| Doutrina | Honest > forced. Day 0 recon. final-reviewer Opus gate. |

---

## §3 Day 0 honest recon (~30 min)

1. **classify.js sha INTACT**
2. **Wave 28-33.8 packages all present + untouched**
3. **landing/ current architecture audit** — `app/(marketing)/` routes, components/, lib/
4. **Reference visuals em `landing-v12-deploy/`** — `mooter-v1-iter1.jsx` (81KB principal), `mooter-v1-marketing.jsx`, `mooter-v1-showcase.jsx`, `mooter-v1-cmdk.jsx`
5. **CSS tokens existing em landing/app/globals.css** — listar todas variáveis disponíveis
6. **Identify pages/components que precisam update**
7. **Verify mooter.ai prod state** — Lighthouse score current baseline

**Output:** `docs/strategy/WAVE33_9_DAY0_RECON.md`

---

## §4 6 Blocks ordenados

### Block A — Hero migration (~1.5h, T2 Sonnet)

**Component target:** `landing/app/(marketing)/page.tsx` Hero section.

**Visual migration:**
- "Got Moo?" giant serif headline (Geist Sans bold ~120px desktop)
- Badge: `● Open source · MIT · v1.21.3 · classify.js unchanged 17 waves`
- Subtitle: "The router for Claude Code. Local-first. Learns forever. Spawns agents safely by default."
- Microcopy: "Same results, a fraction of the spend. 47% saved vs all-Opus across the author's own 658 routed calls — real data, not a community average."
- CTAs: "Install in 30s →" (primary) + "Sign in" (secondary, GitHub icon)
- Trust micro: "✓ Hook, not a proxy · ✓ Runs locally · ✓ <50ms overhead"

**CSS approach:** hand-rolled em existing `--color-*` tokens. Add new tokens se necessário (e.g. `--font-serif-display`).

**Animation:** Subtle blink cursor on input prompt mockup (existing `mblink` keyframe).

### Block B — Terminal mockup right side (~1.5h, T2 Sonnet)

**Component:** `landing/components/HeroTerminalMockup.tsx` (new).

**Visual:**
```
┌─ claude · live routing · T2 sonnet · 🔒 your code stays local ─┐
│ $ claude "draft the system map for the auth refactor"          │
│ ├─ classify 14ms · intent=arch complexity=med                   │
│ ├─ profile GPU=RTX 4090 sub=claude-max                          │
│ ├─ pack diagram-systems (trust 98)                              │
│ └─ route → claude-sonnet (over opus, saves $0.31)               │
│                                                                  │
│ ✓ generating system map... (streamed by sonnet, scaffolded)    │
│                                                                  │
│ ● mooter   saved $0.31 today (89%) · T2 sonnet · pack: ds      │
│ ━━━━━━━━━ 42% 5h · ━━━━━ 18% 7d · 2h14m                        │
│ ctx 23% · adapter: code-audit-v0.2 · $0.04/turn · alltime $4.21│
│                                                                  │
│ Smart routing intelligence — two axes: complexity + domain.    │
└─────────────────────────────────────────────────────────────────┘
```

**Honest:** mockup, não real. Mas representa **REAL pattern** que Mooter faz em terminais reais.

**CSS:** monospace + glow effects + green accent for "saved $0.31".

### Block C — Pulse strip stylized (~1h, T1 Haiku)

**Component:** `landing/components/PulseStrip.tsx` (enhance existing).

**Visual:** 4-card grid (1 desktop / 2x2 mobile):
```
┌────────────────┬────────────────┬────────────────┬─────────────────┐
│ CALLS ROUTED   │ SAVED VS OPUS  │ AVG SAVINGS    │ PACKS INSTALLED │
│      658       │   $25.95       │     47%        │       3         │
│ across 7 moos  │ alltime        │ vs all-Opus    │ data · diag · vc│
└────────────────┴────────────────┴────────────────┴─────────────────┘
🐮 From the author's machine — 1 dev (Paulo). Real numbers, not a community average.
   Opted-in herd telemetry goes live with v1.21.1.
```

**CSS:** big numbers (mono, bold, ~54px), labels uppercase small caps, separators subtle border.

### Block D — Comparison table enhance (~1h, T2 Sonnet)

**Component:** `landing/app/(marketing)/compare/page.tsx`.

**Migration:** 11×8 honest derived scores (já existe Wave 33.7 mas pode estar basic):
- 11 capabilities × 8 competitors
- Mooter column highlighted (border accent + bg subtle)
- Derived scores: Mooter 11/11 · Cursor Bg 4/11 · Codex 4/11 · Agent Teams 3/11 · Termdock 2/11 · Composio 1/11 · Conductor 1/11 · Antigravity 1/11
- CVE-2025-59528 footnote ⚠️ on Antigravity row 6
- Honest note bottom: "Scores derived honestly from per-row cells, not curated to make Mooter look better."

**CSS:** sortable table com sticky first column, hover highlight rows.

### Block E — Conductor + Workflow showcase pages (~1.5h, T2 Sonnet)

**Components:** `landing/app/(marketing)/conductor/page.tsx` + `workflow/page.tsx` (likely new).

**Conductor showcase:**
- Headline: "Multiple Claude sessions? Mooter coordinates them so you don't break git."
- Visual: 3 stacked terminal cards (wave33-ultimate / wave34-exp / hotfix)
- Arrows: git-lock held by terminal 1, queue with terminals 2+3 waiting
- Heartbeat dots animating at 5s interval (CSS keyframes)
- Sub-copy: "Filesystem locks. Heartbeats every 5 seconds. Stale recovery only with your confirm. No race conditions. No deleted commits."
- Tiny handwritten detail (Caveat font): "this is what stops 2 sessions from pushing simultaneously" with curved arrow pointing to lock

**Workflow showcase:**
- Headline: "Watch your workflow live. Same idea as Claude Code's dynamic workflows. Local. Free."
- Visual: animated statusline chip `🔄 wf-abc 3/7 agents 💠💠💠○○○○ · 4.2k tk` (progress dots cycling 500ms)
- Side-by-side: CC dynamic workflow (cloud, $) vs Mooter Workflow Engine (Wave 28, local, free) — same shape, different bills
- Sub-copy: "Mooter Workflow Engine (Wave 28) shipped 2026-06-07. Demo run cost: $0.0028 vs estimated $0.45 in cloud (160× difference)."

**CSS:** keyframe animations (`mspin`, `mheart`), Caveat font self-hosted via next/font.

### Block F — Cmd+K global palette (~1h, T2 Sonnet)

**Component:** `landing/components/CmdKPalette.tsx` (new, uses `cmdk` lib).

**Migration:**
- Global on all pages (marketing + app)
- Marketing mode: navigation + doc search
- App mode: actions + commands + sessions
- Bottom-right hint chip "Press ⌘K to search" on marketing only
- Keyboard shortcut: Cmd+K (macOS) / Ctrl+K (Win/Linux)
- ESC closes

**Stack:** `cmdk` library (shadcn/ui has wrapper, but we use vanilla cmdk for flexibility).

**CSS:** modal overlay, search input, grouped items, footer hints.

---

## §5 Acceptance gates

- [ ] classify.js sha INTACT pre + post-merge (19 waves consecutive)
- [ ] Wave 28-33.8 packages INTOCADOS via `git diff --stat`
- [ ] `landing-v12-deploy/` (preview canvas) INTOCADO
- [ ] Hero "Got Moo?" matches canvas visually
- [ ] Terminal mockup right side renders correctly
- [ ] Pulse strip 4-card grid honest data
- [ ] Comparison table 11/11 honest derived
- [ ] Conductor + Workflow showcase pages live
- [ ] Cmd+K palette global em todas pages
- [ ] Lighthouse 90+ desktop + mobile (regression-free)
- [ ] axe-core: 0 violations
- [ ] All existing API routes still work
- [ ] Supabase auth flow not broken
- [ ] Per-user dashboard still wired
- [ ] `final-reviewer` Opus SHIP sem high severity
- [ ] Notion sub-page criada via MCP
- [ ] PR feature → main mergeado directo
- [ ] **SÓ ENTÃO** tag `v1.21.5-visual-migration` + push
- [ ] MEMORY.md + SYNC.md updated

---

## §6 What's NOT in this wave

- ❌ Tailwind v4 migration — pode ser Wave 33.10 ou Wave 34 separate
- ❌ shadcn/ui FULL adoption — same
- ❌ Architecture rebuild — preserves Next.js 15 architecture
- ❌ Auth changes — Wave 33.7 já tightened
- ❌ Hub schema changes — Wave 33.7 já wired
- ❌ New routes além de /conductor + /workflow
- ❌ Wave 28-33.8 packages refactor — INTOCADO doctrine

---

## §7 Master prompt para Paulo arrancar (quando Wave 33.8 ship)

```
Lê WAVE33_9_VISUAL_MIGRATION_KICKOFF.md em docs/strategy/ e executa como master prompt completo desta sessão em modo ultracode + dangerous autonomous.

Order:
1. Day 0 honest recon (7 pontos — output em docs/strategy/WAVE33_9_DAY0_RECON.md)
2. Block A — Hero migration "Got Moo?" + badges + CTAs (~1.5h, T2)
3. Block B — Terminal mockup right side (~1.5h, T2)
4. Block C — Pulse strip stylized 4-card grid (~1h, T1)
5. Block D — Comparison table 11/11 honest derived (~1h, T2)
6. Block E — Conductor + Workflow showcase pages (~1.5h, T2)
7. Block F — Cmd+K global palette (~1h, T2)
8. Pre-merge gates universais + final-reviewer Opus + merge wave33_9-visual-migration → main directo + tag v1.21.5-visual-migration + Notion + MEMORY + SYNC update

Doctrine critical:
- classify.js sha 7b01eb86...87762 sagrada (19 waves consecutivas)
- Wave 28-33.8 packages INTOCADOS
- landing-v12-deploy/ INTOCADO (preserve preview.mooter.ai canvas SOURCE de visuals)
- landing/ Next.js 15 architecture INTACT — visual update apenas (componentes + pages + CSS)
- Hand-rolled CSS tokens existing preservados (--color-*)
- Add tokens novos se necessário (e.g. --font-serif-display, --font-caveat)
- Cmd+K via cmdk library (não shadcn full migration nesta wave)
- All existing API routes + auth + dashboard funcionam
- Lighthouse 90+ regression-free
- Honest > forced em todos deliverables

Reference visuals em landing-v12-deploy/:
- mooter-v1-iter1.jsx (81KB principal — Hero, footer, pulse strip)
- mooter-v1-marketing.jsx (sections)
- mooter-v1-showcase.jsx (Conductor + Workflow)
- mooter-v1-cmdk.jsx (palette pattern)

Carry visuals + copy fielmente. Mantém valores reais (658, $25.95, 47%, 3 packs).

Vai.
```

---

## §8 Riscos tracked

| Risco | Sev | Mitigação |
|---|---|---|
| Visual migration quebra existing routes | MED | Snapshot tests + component-by-component + smoke per block |
| Lighthouse regression | MED | Block F final smoke test + revert if drop >5 points |
| Hand-rolled CSS conflicts com new tokens | LOW | Day 0 audit current tokens, add namespaced new ones |
| cmdk library version pin | LOW | Pin exact version, ESM compat |
| classify.js sha mutated | CATASTROPHIC | Pre-commit hook + final-reviewer gate |
| Wave 28-33.8 packages touched | MED | `git diff --stat` gate |
| `landing-v12-deploy/` accidentally modified | MED | Document INTOCADO doctrine + verify |

---

## §9 Pós-Wave 33.9 next steps

- **Wave 33.10 candidate:** Tailwind v4 + shadcn FULL migration (visual refresh continuation)
- **Wave 34 candidate:** Federated wisdom + mooter audit fan-out (Task #278)
- **Wave 35 candidate:** MCP marketplace + Plugin Claude Code official publish

---

*Brief composto 2026-06-08 ~22h BRT enquanto Wave 33.8 statusline 2.0 está em CC ativo. Baseado em DAY0_RECON Wave 33.6+33.7 findings (landing/ = Next.js 15 maduro, landing-v12-deploy/ = canvas v12 preview.mooter.ai). Doctrine: visual carry incremental, hand-rolled CSS preserved, Next.js architecture INTACT. **mooter.ai prod vai ter o look novo "Got Moo?" preservando production-grade backend.** 🐮*
