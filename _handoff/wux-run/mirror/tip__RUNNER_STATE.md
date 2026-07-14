# WAVE RUNNER ÔÇö STATE (checkpoint)

> Resumable checkpoint for `_handoff/WAVE_RUNNER_MASTERPROMPT.md`. A fresh session
> reads this and resumes at the **first wave without gate PASS**. Never redo a
> committed/gated wave. This file is runner meta (docs-only), committed on the
> current wave's worktree.

**Runner started:** 2026-07-10 (session on `feat/fleet-arm` worktree)
**classify.js sha:** `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` (proven, intact)
**Brakes at start:** no STOP ┬À `~/.mooter/quota-live.json` **absent** ÔåÆ fail-soft `quota: n/d` ┬À fleet heartbeat fresh (watchdog OK)

---

## Runner doctrine (BINDING ÔÇö applies to ALL waves)

1. **Inventory / sweep / classification work NEVER runs in cloud subagents.** It goes to the **FLEET**: write the task into the right pillar's INBOX (`_handoff/fleet/<pillar>/INBOX.md`) ÔÇö **cronista** for inventories, **bench-eval** for classifications ÔÇö and collect the OUTBOX next round ($0). The Wave 1 W-LAND fan-out (23 cloud subagents, ~1.2M tokens) violated token-diet and must **not** recur.
2. **Cloud subagent only when reasoning must be deep AND isolated AND immediate** ÔÇö and never many at once (no 23-wide fan-outs).
3. **Conflict PRs stay Paulo's** until he merges the clean ones; *then* the runner rebases each onto new main in its own worktree and re-opens. Never hand-resolve conflicts mid-air.
4. Unchanged: worktree-per-wave from main ATUAL (R5) ┬À selective adds ┬À classify sha proven per wave ┬À no merge/push to main (drafts yes; merge = Paulo) ┬À destructive ÔåÆ DECISIONS ┬À conflicts reported, never force-resolved.

---

## Queue status

| # | Wave | Worktree / branch | Final sha | Gate | Draft PR | Next |
|---|------|-------------------|-----------|------|----------|------|
| 0 | **HARMONY CLOSER** | `frugal-fleet-arm` ┬À `feat/fleet-arm` | `c1234f5` | Ô£à **PASS** | #232 | done |
| 1 | **W-LAND (batch landing)** | inspect (read-only, no worktree) | n/a | Ô£à **PASS** | #235ÔÇô#239 | done |
| 2 | **W3 (First-Magic onboarding)** | `frugal-wave-w3` ┬À `wave-w3` | `ef140b5` | ­ƒà┐´©Å **PR #240** (E2EÔ£à ┬À LHÔåÆCI ┬À vsixÔåÆPaulo) | #240 | done (residualÔåÆPaulo) |
| 3 | **W-UX (Live Sessions clean)** | `frugal-wave-ux` ┬À `wave-ux` | (confront) | ­ƒñØ **DELEGATED ÔåÆ Codex plane** | ÔÇö | (Codex owns) |
| 4 | **W15 (CTO Deck F0+1)** | verify-only (main c5cda85) | n/a | Ô£à **ALREADY SHIPPED** (confront) | ÔÇö | done |
| 5 | **W6 (Budget/Economics spans)** | ÔÇö | ÔÇö | Ô¼£ pending | ÔÇö | **NEXT** |
| 6 | W5 (Moo Loop Sessions) | ÔÇö | ÔÇö | Ô¼£ pending | ÔÇö | ÔÇö |
| 7 | W7 (Forge nightly schedule) | ÔÇö | ÔÇö | Ô¼£ pending | ÔÇö | ÔÇö |
| 8 | FRONTIER specs (W8/W9) | ÔÇö | ÔÇö | Ô¼£ pending | ÔÇö | ÔÇö |

---

## Wave 0 ÔÇö HARMONY CLOSER ÔÇö Ô£à PASS (2026-07-10)

Executed `_handoff/FLEET_HARMONY_CLOSER.md` F1ÔåÆF4 in the existing `feat/fleet-arm` worktree (sanctioned continuation; R5 exception).

- **F0 prova de vida** ÔÇö `mooter-fleet` online 112m, 0 restarts, heartbeat age 1s, vram_free 17.3GB. Fleet never disturbed during the session.
- **F1 admin** ÔÇö `pm2 install pm2-logrotate` **blocked** by the pm2 *space-in-username* bug (`C:\Users\Paulo` truncation; admin does not fix). Delivered idempotent `_handoff/fleet/ADMIN_FINALIZE.ps1` (logrotate config + best-effort install + user-logon `pm2 resurrect` schtask + `pm2 save`). Not auto-run ÔåÆ **Paulo** (machine-state, two-factor). Commit `c1234f5`.
- **F2 night window** ÔÇö WIRED (`night-window.mjs` pure selector + `fleet-forever.mjs` per-cycle swap + `local-pillar.mjs` lazy `defaultModel()`). Config visible in `ecosystem.config.js` (`FLEET_NIGHT_MODEL=qwen3:30b`, default window 00:00ÔÇô07:00 America/Sao_Paulo). **7 unit tests green**. Commit `e13aab5`.
- **F3 DIGESTÔåÆSYNC mirror** ÔÇö `fleet-sync-mirror.mjs` (idempotent) + `cronista-pillar.mjs` wiring (advisory, try-guarded). First mirror seeded from live DIGEST into `SYNC.md` `## Fleet (auto)`. **6 unit tests green**. Commit `2bba0fd`.
- **F4 landing** ÔÇö draft PRs opened: **#232** (fleet-arm, includes F1ÔÇôF3), **#233** (quota-aware Q0ÔÇôQ4). Both base `main`. **fleet-armÔåÆmain conflicts only in `SYNC.md`** (reported, not force-resolved). Pushed `feat/fleet-arm` FF `fb4a992..c1234f5`.

**Invariants:** classify sha intact ┬À additive (day behaviour byte-identical) ┬À no `packages/*` engine file touched ┬À selective commits ┬À fleet runtime artifacts gitignored.

**Tests:** 13/13 new green (7 night-window + 6 mirror); pre-existing fleet suites still pass (27 total in the fleet dir).

---

## Wave 1 ÔÇö W-LAND ┬À batch landing ÔÇö Ô£à PASS (2026-07-10)

Read-only inspection of the **23 most recent** unmerged branches (last commit ÔëÑ 2026-06-22, no open PR); one independent agent per branch via a workflow (git ref-only, no checkout ÔÇö the live fleet runs from this worktree). Full detail: `_handoff/waves/WLAND_INVENTORY.md`.

- **Verdicts:** LANDABLE 10 ┬À SUPERSEDED 10 ┬À LP_CLOUD_MANAGED 2 ┬À STALE 1.
- **Draft PRs opened (5):** #235 `feat/pm-adapters` ┬À #236 `feat/lp-cockpit-layout` ┬À #237 `wave/directors-cut-v2` (ÔÜá´©Å SYNC.md+extension.js conflicts) ┬À #238 `feat/moo-dispatch` (ÔÜá´©Å extension.js conflicts) ┬À #239 `feat/wire-adaptive-learner-decide-agent` (was local-only ÔåÆ pushed). All base `main`, draft.
- **Not auto-PR'd (queued):** `feat/site-v2` (no local ref ÔåÆ agent verdict unreliable, manual re-inspect); the **June-23 cluster** (WN1/WFV/W3/cockpit-w1 ÔÇö local-only, ~295 behind, overlapping ÔåÆ consolidate one, not 4 PRs).
- **Prune list:** 10 SUPERSEDED + 1 STALE branches (see queue); ~85 ancient branches recommended for bulk prune (not inspected). LP branches (`live-edit`, `lp-preview-diagnostics`) left to the cloud trilho.
- **No conflicts force-resolved** (brief: conflict = report + continue). classify sha intact on every inspected branch. No branch mutated (read-only + FF/new-ref pushes only).

## Wave 2 ÔÇö W3 ┬À First-Magic onboarding ÔÇö ­ƒà┐´©Å PR #240 (runner-complete, residual ÔåÆ Paulo) (2026-07-10)

Worktree `frugal-wave-w3` ┬À branch `wave-w3` from `origin/main` (f5a1f04) ┬À sha proven.

**Confronted (NOT greenfield):** main already ships a 5-step onboarding wizard (`landing/app/onboarding/page.tsx`, 1230 lines: hardware detect ÔåÆ providers/budget/persona ÔåÆ local stack ÔåÆ install cmd ÔåÆ confirm), a full install flow (`(marketing)/install`, API token routes, `install.ps1/sh`, migration 006), and vscode `walkthrough/*.md`. `feat/first-magic-onboarding` is 0-ahead/187-behind (already landed). The real gap = **the "magic moment"**: no demo that shows a non-dev the router routing a prompt local at $0.

**W3.1 done (commit `da42695`):** `FirstMagicDemo` client component + pure `first-magic.ts` (data+helpers) + tests, wired as the **opener of onboarding Step 1** with a "get this on my machine" CTA ÔåÆ install step. The 6 example verdicts are **REAL frozen-classifier output** (honest-copy: "$0" only for the local tier). 6 new tests; **full landing suite 215/215 green**; `tsc --noEmit` clean; classify sha intact.

**W3.2 done (commit `ef140b5`) ÔÇö gate work + a bug found on the way:**
- **/install E2E** Ô£à `install-script.test.ts` 9/9 green.
- **vsix publish blocker found + fixed**: `publish-cockpit.yml` had **no `npm ci`** ÔåÆ live-edit tests fail on a fresh runner (need `@babel/parser`) AND the packaged vsix would ship **without its parser** (live-edit broken in the marketplace build). Added `npm ci`; with deps the extension suite is **939/939** green.
- **Lighthouse**: added `landing/.lighthouserc.json` (gate spec, ÔëÑ95 on /onboarding + /install). **Not measurable in-worktree** ÔÇö Next's dual-lockfile workspace-root inference breaks `next start` locally; CI / clean env must run it.
- **Draft PR #240** opened (base main). **vsix NOT published** ÔÇö no `cockpit-v*` tag pushed (Paulo's gate). Worktree `frugal-wave-w3` kept (residual pending).

**Residual ÔåÆ Paulo (in PAULO_QUEUE):** measure/enforce Lighthouse ÔëÑ95; republish vsix (push `cockpit-v0.16.63` tag) but **only after the publish-cockpit `npm ci` fix lands on main**, else it ships parser-less.

## Wave 3 ÔÇö W-UX ┬À Live Sessions clean ÔÇö ­ƒñØ DELEGATED ÔåÆ Codex plane (2026-07-10)

> **Handed off to the Codex plane** (a separate conversation orchestrates it). The runner does **NOT** touch worktree `frugal-wave-ux` / branch `wave-ux` any further. The confront + inventory + keepers plan below is the handoff payload for whoever picks it up.

Worktree `frugal-wave-ux` ┬À branch `wave-ux` from `origin/main` (c5cda85 ÔÇö **PR #237 directors-cut-v2 was merged by Paulo** since W-LAND) ┬À sha proven. Scope: only `packages/vscode-extension/**` + tests.

**Confronted ┬º3.1** (brief `_handoff/COCKPIT_LIVE_SESSIONS_UX_BRIEF.md` + real code): `mission-control-view.js` (639), `host-extra.js` (2760), `mc-snapshot.js` (293), `extension.js` deep-link, `row-renderer.js` (699), `docs/strategy/COCKPIT_UX_AUDIT.md` (129).

**Inventory ┬º3.2 ÔÇö the removal list is EMPTY (honest finding):** the audit's ­ƒö┤ dead/dishonest controls are **already remediated** (B2 shipped) ÔÇö Notion/Obsidian chips are actionable only with a real target (`openUrl`/`openFile`), else informative `role="img"` ("sem p├ígina ligada"); the Ôå║ integrations button already reads honestly **"marcar visto"** (not fake "refreshed"). Every control in the live view has a real handler + tooltip. **No Paulo removal-gate needed.**

**So W-UX = the remaining brief pains, not deletions:**
1. **`openSession` ÔåÆ `openSessionTab`** ÔÇö the live view title/link buttons wire the OLD `openSession`; the coherent W15 deep-link `openSessionTab` (wave=sess├úo=aba) exists as a handler but is unused by the view. Switch them.
2. **Compact 1-line session row + disclosure** (B3): `[dot][├¡cone tipo][t├¡tulo][estado][modelo][­ƒôîÔçäÔåù]`, group by state (needs-you / active / idle), collapse idle/done by default.
3. **Optimistic toggle feedback** (B1): `setMode`/`setModel`/`setAuto`/`setLoop`/`effort` flip `.on` on click, reconcile on refresh ÔÇö feedback in the panel, not only the status-bar.
4. **Auto-detect** new tabs (confront `host-extra.recentSessions` poll vs event) + exact tooltips (Fase 5 ÔÇö mostly already present).
- Invariants: classify frozen ┬À `renderRow`/`renderGroupHeader` **concat-only** (webview-syntax.test) ┬À selective adds ┬À atomic commits per block ┬À **no push/merge without OK** ┬À fleet & `~/frugal` tree untouched.

## Wave 4 ÔÇö W15 ┬À CTO Command Deck (F0+1) ÔÇö Ô£à ALREADY SHIPPED (confront, 2026-07-10)

Opened a `feat/deck-tokens` worktree, confronted `packages/vscode-extension/src/extension.js` vs the spec, and found **F0 and F1 are already implemented on main** ÔÇö the spec (2026-07-03) predates the `deck-*` waves that landed it. **The runner did NOT re-build** (confront-before-emit doctrine); worktree removed (R6, git-pruned ÔÇö one orphan dir left on disk, cert-guard blocks `rm -rf`, harmless, Paulo can delete `../frugal-deck-tokens`).

- **F0 tokens/foundation Ô£à** ÔÇö `:root` token layer (extension.js:4498, "the ONLY sanctioned home for a colour literal") maps every brand colour to `var(--vscode-*, #fallback)` (structural + semantic + tier ladder + dim tints + categorical). High-contrast block (`body.vscode-high-contrast*`, l.4535). `prefers-reduced-motion` (l.2619 global + LP blocks). True bare-hex violations Ôëê 2, both sanctioned/intentional (`--on-bright` literal for text-on-chip; `#lp-frame` white iframe bg). Other files: host-extra/live-preview-view already all-`var()`; row-renderer's 3 are SVG **brand-logo** colours; lp-presets' 12 are LP **palette data** (LP trilho ÔÇö not CSS).
- **F1 spine Ô£à** ÔÇö project switcher `.pswitch` (`role=radiogroup`, "one company, one click"), `+ New Ôû¥` multi-type (­ƒÆ¼ CC ┬À ÔÖ¥´©Å Loop `­ƒîè W5` ┬À ÔÅ░ Schedule `­ƒîè W5`, honest disabled placeholders), `renderInbox()` (l.5919) with `­ƒÖï N your turn` reading **real** `cowork-waiting` data, WCAG roles/focus. `deck-shell.test.js` 5/5 green.
- **F2ÔÇôF5 evidence:** `deck-floor/lenses/live/verify.js` + their tests all exist ÔåÆ the whole CTO Deck likely shipped via prior waves. **Residual = Paulo's verification** (visual 3-theme gate + `deck-verify` button audit), not a re-build.

## ┬ºRESUME
Fresh session: "Continua `_handoff/WAVE_RUNNER_MASTERPROMPT.md`. Waves 0ÔÇô1 PASS; W3 runner-complete (PR #240); W-UX DELEGATED (don't touch `wave-ux`); **W15 F0+1 already shipped on main (confront ÔÇö no re-build)**. **Start at Wave 5 (W6 ┬À Budget/Economics spans)** ÔÇö span-level cost in the cockpit Economics lens + `est_cloud_tokens_avoided` from the fleet-ledger + quota-live chip wire (MP-Q synergy). New worktree `wave-w6` from main ATUAL (`git fetch` first) per R5; only `packages/vscode-extension/**` (+ where the ledger/quota sources live). Verify brakes first."
