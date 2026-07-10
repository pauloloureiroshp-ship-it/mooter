# WAVE RUNNER — STATE (checkpoint)

> Resumable checkpoint for `_handoff/WAVE_RUNNER_MASTERPROMPT.md`. A fresh session
> reads this and resumes at the **first wave without gate PASS**. Never redo a
> committed/gated wave. This file is runner meta (docs-only), committed on the
> current wave's worktree.

**Runner started:** 2026-07-10 (session on `feat/fleet-arm` worktree)
**classify.js sha:** `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` (proven, intact)
**Brakes at start:** no STOP · `~/.mooter/quota-live.json` **absent** → fail-soft `quota: n/d` · fleet heartbeat fresh (watchdog OK)

---

## Runner doctrine (BINDING — applies to ALL waves)

1. **Inventory / sweep / classification work NEVER runs in cloud subagents.** It goes to the **FLEET**: write the task into the right pillar's INBOX (`_handoff/fleet/<pillar>/INBOX.md`) — **cronista** for inventories, **bench-eval** for classifications — and collect the OUTBOX next round ($0). The Wave 1 W-LAND fan-out (23 cloud subagents, ~1.2M tokens) violated token-diet and must **not** recur.
2. **Cloud subagent only when reasoning must be deep AND isolated AND immediate** — and never many at once (no 23-wide fan-outs).
3. **Conflict PRs stay Paulo's** until he merges the clean ones; *then* the runner rebases each onto new main in its own worktree and re-opens. Never hand-resolve conflicts mid-air.
4. Unchanged: worktree-per-wave from main ATUAL (R5) · selective adds · classify sha proven per wave · no merge/push to main (drafts yes; merge = Paulo) · destructive → DECISIONS · conflicts reported, never force-resolved.

---

## Queue status

| # | Wave | Worktree / branch | Final sha | Gate | Draft PR | Next |
|---|------|-------------------|-----------|------|----------|------|
| 0 | **HARMONY CLOSER** | `frugal-fleet-arm` · `feat/fleet-arm` | `c1234f5` | ✅ **PASS** | #232 | done |
| 1 | **W-LAND (batch landing)** | inspect (read-only, no worktree) | n/a | ✅ **PASS** | #235–#239 | done |
| 2 | **W3 (First-Magic onboarding)** | `frugal-wave-w3` · `wave-w3` | `ef140b5` | 🅿️ **PR #240** (E2E✅ · LH→CI · vsix→Paulo) | #240 | done (residual→Paulo) |
| 3 | **W-UX (Live Sessions clean)** | `frugal-wave-ux` · `wave-ux` | (confront) | 🔄 **IN PROGRESS** (confront+inventory done) | — | implement keepers |
| 4 | W15 (CTO Command Deck F0+1) | — | — | ⬜ pending | — | — |
| 5 | W6 (Budget/Economics spans) | — | — | ⬜ pending | — | — |
| 6 | W5 (Moo Loop Sessions) | — | — | ⬜ pending | — | — |
| 7 | W7 (Forge nightly schedule) | — | — | ⬜ pending | — | — |
| 8 | FRONTIER specs (W8/W9) | — | — | ⬜ pending | — | — |

---

## Wave 0 — HARMONY CLOSER — ✅ PASS (2026-07-10)

Executed `_handoff/FLEET_HARMONY_CLOSER.md` F1→F4 in the existing `feat/fleet-arm` worktree (sanctioned continuation; R5 exception).

- **F0 prova de vida** — `mooter-fleet` online 112m, 0 restarts, heartbeat age 1s, vram_free 17.3GB. Fleet never disturbed during the session.
- **F1 admin** — `pm2 install pm2-logrotate` **blocked** by the pm2 *space-in-username* bug (`C:\Users\Paulo` truncation; admin does not fix). Delivered idempotent `_handoff/fleet/ADMIN_FINALIZE.ps1` (logrotate config + best-effort install + user-logon `pm2 resurrect` schtask + `pm2 save`). Not auto-run → **Paulo** (machine-state, two-factor). Commit `c1234f5`.
- **F2 night window** — WIRED (`night-window.mjs` pure selector + `fleet-forever.mjs` per-cycle swap + `local-pillar.mjs` lazy `defaultModel()`). Config visible in `ecosystem.config.js` (`FLEET_NIGHT_MODEL=qwen3:30b`, default window 00:00–07:00 America/Sao_Paulo). **7 unit tests green**. Commit `e13aab5`.
- **F3 DIGEST→SYNC mirror** — `fleet-sync-mirror.mjs` (idempotent) + `cronista-pillar.mjs` wiring (advisory, try-guarded). First mirror seeded from live DIGEST into `SYNC.md` `## Fleet (auto)`. **6 unit tests green**. Commit `2bba0fd`.
- **F4 landing** — draft PRs opened: **#232** (fleet-arm, includes F1–F3), **#233** (quota-aware Q0–Q4). Both base `main`. **fleet-arm→main conflicts only in `SYNC.md`** (reported, not force-resolved). Pushed `feat/fleet-arm` FF `fb4a992..c1234f5`.

**Invariants:** classify sha intact · additive (day behaviour byte-identical) · no `packages/*` engine file touched · selective commits · fleet runtime artifacts gitignored.

**Tests:** 13/13 new green (7 night-window + 6 mirror); pre-existing fleet suites still pass (27 total in the fleet dir).

---

## Wave 1 — W-LAND · batch landing — ✅ PASS (2026-07-10)

Read-only inspection of the **23 most recent** unmerged branches (last commit ≥ 2026-06-22, no open PR); one independent agent per branch via a workflow (git ref-only, no checkout — the live fleet runs from this worktree). Full detail: `_handoff/waves/WLAND_INVENTORY.md`.

- **Verdicts:** LANDABLE 10 · SUPERSEDED 10 · LP_CLOUD_MANAGED 2 · STALE 1.
- **Draft PRs opened (5):** #235 `feat/pm-adapters` · #236 `feat/lp-cockpit-layout` · #237 `wave/directors-cut-v2` (⚠️ SYNC.md+extension.js conflicts) · #238 `feat/moo-dispatch` (⚠️ extension.js conflicts) · #239 `feat/wire-adaptive-learner-decide-agent` (was local-only → pushed). All base `main`, draft.
- **Not auto-PR'd (queued):** `feat/site-v2` (no local ref → agent verdict unreliable, manual re-inspect); the **June-23 cluster** (WN1/WFV/W3/cockpit-w1 — local-only, ~295 behind, overlapping → consolidate one, not 4 PRs).
- **Prune list:** 10 SUPERSEDED + 1 STALE branches (see queue); ~85 ancient branches recommended for bulk prune (not inspected). LP branches (`live-edit`, `lp-preview-diagnostics`) left to the cloud trilho.
- **No conflicts force-resolved** (brief: conflict = report + continue). classify sha intact on every inspected branch. No branch mutated (read-only + FF/new-ref pushes only).

## Wave 2 — W3 · First-Magic onboarding — 🅿️ PR #240 (runner-complete, residual → Paulo) (2026-07-10)

Worktree `frugal-wave-w3` · branch `wave-w3` from `origin/main` (f5a1f04) · sha proven.

**Confronted (NOT greenfield):** main already ships a 5-step onboarding wizard (`landing/app/onboarding/page.tsx`, 1230 lines: hardware detect → providers/budget/persona → local stack → install cmd → confirm), a full install flow (`(marketing)/install`, API token routes, `install.ps1/sh`, migration 006), and vscode `walkthrough/*.md`. `feat/first-magic-onboarding` is 0-ahead/187-behind (already landed). The real gap = **the "magic moment"**: no demo that shows a non-dev the router routing a prompt local at $0.

**W3.1 done (commit `da42695`):** `FirstMagicDemo` client component + pure `first-magic.ts` (data+helpers) + tests, wired as the **opener of onboarding Step 1** with a "get this on my machine" CTA → install step. The 6 example verdicts are **REAL frozen-classifier output** (honest-copy: "$0" only for the local tier). 6 new tests; **full landing suite 215/215 green**; `tsc --noEmit` clean; classify sha intact.

**W3.2 done (commit `ef140b5`) — gate work + a bug found on the way:**
- **/install E2E** ✅ `install-script.test.ts` 9/9 green.
- **vsix publish blocker found + fixed**: `publish-cockpit.yml` had **no `npm ci`** → live-edit tests fail on a fresh runner (need `@babel/parser`) AND the packaged vsix would ship **without its parser** (live-edit broken in the marketplace build). Added `npm ci`; with deps the extension suite is **939/939** green.
- **Lighthouse**: added `landing/.lighthouserc.json` (gate spec, ≥95 on /onboarding + /install). **Not measurable in-worktree** — Next's dual-lockfile workspace-root inference breaks `next start` locally; CI / clean env must run it.
- **Draft PR #240** opened (base main). **vsix NOT published** — no `cockpit-v*` tag pushed (Paulo's gate). Worktree `frugal-wave-w3` kept (residual pending).

**Residual → Paulo (in PAULO_QUEUE):** measure/enforce Lighthouse ≥95; republish vsix (push `cockpit-v0.16.63` tag) but **only after the publish-cockpit `npm ci` fix lands on main**, else it ships parser-less.

## Wave 3 — W-UX · Live Sessions clean — 🔄 IN PROGRESS (2026-07-10)

Worktree `frugal-wave-ux` · branch `wave-ux` from `origin/main` (c5cda85 — **PR #237 directors-cut-v2 was merged by Paulo** since W-LAND) · sha proven. Scope: only `packages/vscode-extension/**` + tests.

**Confronted §3.1** (brief `_handoff/COCKPIT_LIVE_SESSIONS_UX_BRIEF.md` + real code): `mission-control-view.js` (639), `host-extra.js` (2760), `mc-snapshot.js` (293), `extension.js` deep-link, `row-renderer.js` (699), `docs/strategy/COCKPIT_UX_AUDIT.md` (129).

**Inventory §3.2 — the removal list is EMPTY (honest finding):** the audit's 🔴 dead/dishonest controls are **already remediated** (B2 shipped) — Notion/Obsidian chips are actionable only with a real target (`openUrl`/`openFile`), else informative `role="img"` ("sem página ligada"); the ↺ integrations button already reads honestly **"marcar visto"** (not fake "refreshed"). Every control in the live view has a real handler + tooltip. **No Paulo removal-gate needed.**

**So W-UX = the remaining brief pains, not deletions:**
1. **`openSession` → `openSessionTab`** — the live view title/link buttons wire the OLD `openSession`; the coherent W15 deep-link `openSessionTab` (wave=sessão=aba) exists as a handler but is unused by the view. Switch them.
2. **Compact 1-line session row + disclosure** (B3): `[dot][ícone tipo][título][estado][modelo][📌⇄↗]`, group by state (needs-you / active / idle), collapse idle/done by default.
3. **Optimistic toggle feedback** (B1): `setMode`/`setModel`/`setAuto`/`setLoop`/`effort` flip `.on` on click, reconcile on refresh — feedback in the panel, not only the status-bar.
4. **Auto-detect** new tabs (confront `host-extra.recentSessions` poll vs event) + exact tooltips (Fase 5 — mostly already present).
- Invariants: classify frozen · `renderRow`/`renderGroupHeader` **concat-only** (webview-syntax.test) · selective adds · atomic commits per block · **no push/merge without OK** · fleet & `~/frugal` tree untouched.

## §RESUME
Fresh session: "Continua `_handoff/WAVE_RUNNER_MASTERPROMPT.md`. Waves 0–1 PASS; Wave 2 (W3) runner-complete (PR #240). **Wave 3 (W-UX) IN PROGRESS** in worktree `frugal-wave-ux` (branch `wave-ux`) — confront+inventory done, **removal list is empty** (B2 already shipped). Implement the keepers list above (openSessionTab coherence · compact row+disclosure · optimistic feedback · auto-detect), atomic commits, extension tests green, no push without OK. Verify brakes first."
