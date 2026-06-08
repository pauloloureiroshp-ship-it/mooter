# WAVE 33.9 — Day 0 Honest Recon

**Date:** 2026-06-08 · **Branch:** `wave33_9-visual-migration` (worktree `mooter-wave33_9`, base `main @ 9dd9916`)
**Mode:** ultracode + dangerous autonomous · **Isolation:** dedicated git worktree (Wave 33.8 session untouched in `frugal/` worktree)

---

## TL;DR (3 lines)

1. **classify.js sha256 = `7b01eb86…87762` — EXACT MATCH. Sagrada intact (19 waves).**
2. **The landing is far more migrated than the kickoff assumed:** Hero "Got Moo?", live-routing terminal, and the full 3-line statusline HUD are **already in prod** (Wave 33.7). Blocks A/B are ~done; the real net-new work is **C (author pulse strip), D (11×8 multi-session table), E (Conductor + Workflow pages), F (Cmd+K)**.
3. **Honest > forced enforced:** I will not regress the existing honest components (rotating terminal, "*illustrative" disclaimers) into a literal single-frame canvas copy. I carry the canvas *intent and copy* onto the mature Next.js 15 architecture.

---

## §1 — classify.js sha INTACT ✅

```
sha256  7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762  tools/router/classify.js
```
Matches the sagrada hash byte-for-byte. This wave touches **only** `landing/` + docs — classify.js is out of scope and will be re-verified at the pre-merge gate.

## §2 — Wave 28–33.8 packages untouched ✅ (baseline)

Working in an isolated worktree off `main @ 9dd9916`. No `packages/**` edits are planned. `git diff --stat main` at the gate must show changes confined to `landing/**` + `docs/strategy/**`. Wave 33.8 statusline-v2 work lives in the **other** worktree (`frugal/`, branch `wave33_8-statusline-v2`) with uncommitted changes — never touched by this session.

## §3 — landing/ architecture audit

- **Next.js 15 + React 19 + TS strict**, hand-rolled CSS tokens (`--color-*`), no Tailwind/shadcn. `next/font/google` → Space Grotesk (`--font-sans`) + JetBrains Mono (`--font-mono`).
- Route groups: `app/(marketing)/` (compare, packs, install, methodology, privacy, security, sessions, spawn, under-the-hood, changelog) and `app/(app)/` (dashboard, settings, admin). **Hero lives at `app/page.tsx`, NOT `(marketing)/page.tsx`** — kickoff path was imprecise.
- Shared components in `landing/components/` map 1:1 to the canvas `mooter-v1-shared.jsx` primitives: `TerminalCard`, `StatuslineCard`, `TierChip`, `LockChip`, `ProgressBar`, `NavBar`, `Btn`, `Card`, `Eyebrow`, `MonoNum`, `MooterMark`, `PastorCrook (CrookOutline)`, `MooHerd`, `ProviderLogo`. **Token translation needed:** canvas uses `var(--accent)`, `var(--term-bg)`, `var(--tier-3)`; landing uses `var(--color-accent)`, `var(--color-term-bg)`, `var(--color-tier-3)`.

## §4 — Reference visuals (SOURCE, INTOCADO)

Located untracked in the Wave 33.8 worktree: `/home/paulo/frugal/landing-v12-deploy/` (read-only this session).

| File | Lines | Carries |
|---|---|---|
| `mooter-v1-iter1.jsx` | 1430 | Hero (l.291), **pulse strip (l.363–377)**, **compare 11×8 (l.553–692)** |
| `mooter-v1-showcase.jsx` | 221 | **Conductor + Workflow** artboards (MiniTerm, lock state, WorkflowChip, two-bills) |
| `mooter-v1-cmdk.jsx` | 187 | **Cmd+K** palette (marketing/app modes, hint chip, toast, kbd nav) |
| `mooter-v1-shared.jsx` | 338 | Primitives (already mirrored in `landing/components/`) |

## §5 — CSS tokens available (`landing/app/globals.css`, 1388 lines)

Present: `--color-bg/-2`, `--color-surface/-2`, `--color-border/-light`, `--color-text/-muted/-faint`, `--color-accent/-2/-08/-25`, `--color-green/-yellow`, `--color-tier-0..3`, `--color-term-bg/-border/-header/-fg/-dim`. Keyframes present: `pulse-dot`, `blink`.

**Net-new to add (namespaced, additive — no existing token mutated):**
- Tokens: `--color-accent-06`, `--color-accent-12` (cmdk active row + score cell).
- Keyframes: `mspin` (workflow ⟳), `mheart` (heartbeat dots), `mpulse` (session status dot).
- Font: `--font-caveat` (Caveat via next/font/google) for the Conductor handwritten annotation.

## §6 — Components needing update (honest delta)

| Block | Target | Current state | Net work |
|---|---|---|---|
| **A** Hero | `app/page.tsx` | "Got Moo?" + badge + CTAs + trust **present**. Badge stale: `v1.21.2 · 17 waves`; jsonLd `1.21.2`. | Align to **v1.21.5 · 19 waves** (honest, ships with this wave's tag). |
| **B** Terminal | `app/_components/HeroTerminal.tsx` | **Done & honest** — 4 rotating T0–T3 scenes, `StatuslineCard` 3-line HUD, "*illustrative" disclaimer. Better than the single-frame canvas spec. | Keep. No regression. |
| **C** Pulse | `app/_components/PulseStrip.tsx` (**new**) | `CommunityPulse` exists but is a *different* concept (future herd telemetry, renders "—"). | New static **author real-numbers** strip: 658 / $25.95 / 47% / 3 packs + 🐮 caption. Swap into hero. |
| **D** Compare | `app/(marketing)/compare/page.tsx` | 19×6 **routers** table (LiteLLM/OpenRouter/Continue) — honest, "compares routers not agents". | Add canvas **11×8 multi-session** table (Composio/Conductor/Cursor Bg/Agent Teams/Codex/Antigravity/Termdock) with **derived** scores + CVE-2025-59528 footnote as the primary section; keep routers table below. |
| **E** Showcase | `(marketing)/conductor/page.tsx` + `workflow/page.tsx` (**new**) | Neither exists. | Full new pages: MiniTerm trio + lock-state card + Caveat annotation; animated WorkflowChip + two-bills cards ($0.45 cloud vs $0.0028 local, 160×). |
| **F** Cmd+K | `app/_components/CmdKPalette.tsx` (**new**) | None. `cmdk` not installed. | Global palette, marketing + app modes, hint chip, toast, kbd nav, mounted in root layout. |

## §7 — Prod baseline

mooter.ai is **live** on Vercel project `landing` (Wave 33.7, v1.21.3). 135/135 landing tests + 74/74 hub tests at last ship. No automated Lighthouse run available in this headless WSL session; regression guard = `next build` success + axe-friendly markup + no blocking JS added to the critical path (CmdK is a lazy client island; animations honor `prefers-reduced-motion`). Lighthouse 90+ to be confirmed on the Vercel preview deploy post-merge.

---

## Derived-score verification (Block D honesty proof)

Counting `'y'` cells per competitor column across the 11 rows yields exactly:
**mooter 11 · Cursor Bg 4 · Codex 4 · Agent Teams 3 · Termdock 2 · Composio 1 · Conductor 1 · Antigravity 1.**
Scores are computed in-component from the cells (`rows.filter(r => r.cells[col]==='y').length`), not hardcoded — internally consistent and matches the kickoff claim. Antigravity's sandbox is marked ⚠ (CVE-2025-59528, disclosed) rather than passing.

## Honest deviations from the kickoff (flagged, not silent)

1. **Hero path** is `app/page.tsx`, not `(marketing)/page.tsx`.
2. **Blocks A/B already shipped** — net work is polish (A) / none (B), not a rebuild.
3. **Block C** is a *new* component distinct from the existing `CommunityPulse` (author numbers vs future herd telemetry) — both honest, different purposes.
4. **Wave count** "19 waves" used (per kickoff §2 + MEMORY), superseding the stale "17" in the live badge.
5. **Cmd+K** library choice (vanilla `cmdk` lib vs the canvas's own hand-rolled pattern) decided at install time against the kickoff §8 ESM/version-pin risk; the UX/visual is identical either way.
