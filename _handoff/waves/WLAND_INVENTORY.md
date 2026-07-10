# W-LAND — branch landing inventory (Wave 1, 2026-07-10)

> Read-only inspection of the **23 most recent** unmerged branches (last commit ≥ 2026-06-22) that had no open PR. One independent agent per branch (git ref-only; no checkout — the live fleet runs from this worktree). Merge/prune is Paulo (two-factor).

**Verdicts:** LANDABLE 10 · LP_CLOUD_MANAGED 2 · SUPERSEDED 10 · STALE 1 (of 23 inspected).

## Draft PRs opened by the runner (5)

| PR | branch | conflicts | note |
|---|---|---|---|
| #237 | `wave/directors-cut-v2` | ⚠️ SYNC.md, packages/vscode-extension/src/extension.js | OPEN_DRAFT_PR — genuine, well-tested, non-duplicated local DCv2 feature (unique files on n |
| #236 | `feat/lp-cockpit-layout` | clean | OPEN_DRAFT_PR — unique, additive, gate-respecting trivial-bypass classifier not on main an |
| #238 | `feat/moo-dispatch` | ⚠️ packages/vscode-extension/src/extension.js, packages/vscode-extension/src/webview-syntax.test.js | OPEN_DRAFT_PR — genuine unmerged cockpit feature not on main and not covered by any open P |
| #239 | `feat/wire-adaptive-learner-decide-agent` | clean | OPEN_DRAFT_PR — genuine, self-contained opt-in wiring not on main, not superseded, merges |
| #235 | `feat/pm-adapters` | clean | OPEN_DRAFT_PR — genuine, coherent, self-contained additive feature; new path absent on mai |

## Full inventory (23)

| branch | category | ahead/behind | conflicts | sha | disposition |
|---|---|---|---|---|---|
| `feat/lp-cockpit-layout` | LANDABLE | 2/1 | n | ok | OPEN_DRAFT_PR — unique, additive, gate-respecting trivial-bypass classifier not on main and not covered by any → PR #236 |
| `feat/moo-dispatch` | LANDABLE | 1/112 | Y | ok | OPEN_DRAFT_PR — genuine unmerged cockpit feature not on main and not covered by any open PR; draft because ext → PR #238 |
| `feat/pm-adapters` | LANDABLE | 1/168 | n | ok | OPEN_DRAFT_PR — genuine, coherent, self-contained additive feature; new path absent on main and all siblings, → PR #235 |
| `feat/site-v2` | LANDABLE | 5/210 | n | ok | OPEN_DRAFT_PR — additive site v2 sections absent from main and from all open site PRs (#200 pilar/site-clean, |
| `feat/wire-adaptive-learner-decide-agent` | LANDABLE | 1/118 | n | ok | OPEN_DRAFT_PR — genuine, self-contained opt-in wiring not on main, not superseded, merges clean, gate invarian → PR #239 |
| `wave-W3-loop-polish` | LANDABLE | 4/295 | Y | ok | OPEN_DRAFT_PR — genuine additive work absent from main and from every open PR; one UI conflict to resolve; con |
| `wave-WFV-fleet-view` | LANDABLE | 3/295 | Y | ok | OPEN_DRAFT_PR — genuine additive work (WN1 niche bench + Fleet UI tab), not on main and not covered by any ope |
| `wave-WN1-niche-eval` | LANDABLE | 2/295 | n | ok | OPEN_DRAFT_PR — genuine additive bench work absent from origin/main and from all 17 open PRs; merges clean; cl |
| `wave/cockpit-w1-autoskill` | LANDABLE | 4/262 | Y | ok | OPEN_DRAFT_PR — but scoped: cherry-pick only the W1 auto-skill commit (67a569a) onto origin/main; do NOT merge |
| `wave/directors-cut-v2` | LANDABLE | 5/87 | Y | ok | OPEN_DRAFT_PR — genuine, well-tested, non-duplicated local DCv2 feature (unique files on no other branch, no o → PR #237 |
| `feat/live-edit` | LP_CLOUD_MANAGED | 1/113 | Y | ok | LEAVE — Live Preview MP5 trilho is cloud-managed; engine already landed on main more maturely and newer lp/mp5 |
| `feat/lp-preview-diagnostics` | LP_CLOUD_MANAGED | 1/116 | Y | ok | PRUNE — its one commit is a 5-day-old, strictly smaller subset of Live Preview diagnostics already on main via |
| `feat/overclock-moo-p1` | SUPERSEDED | 1/203 | Y | ok | PRUNE — Fase 1 already landed on origin/main (superset present; ~half the files byte-identical) and a p2 succe |
| `fleet-f1` | SUPERSEDED | 34/295 | Y | ok | PRUNE — local-only branch (no origin), every commit is covered by open PRs #195-199 or the already-landed F2 f |
| `pilar/council` | SUPERSEDED | 39/295 | Y | ok | LEAVE — superseded by the wave-council stack #195-199; do NOT re-PR (would duplicate all ~33 stacked commits). |
| `pilar/site` | SUPERSEDED | 38/295 | Y | ok | PRUNE — its site work is already in PR #200 (pilar/site-clean, a clean extraction with matching commit message |
| `wave-council-w2` | SUPERSEDED | 33/295 | Y | ok | PRUNE — exact duplicate of wave-autopilot-loop (PR #199); all 33 commits already covered by open PRs #195-199, |
| `wave-W4-council-chip` | SUPERSEDED | 28/295 | n | ok | LEAVE — do NOT re-PR: a W4->main PR would duplicate the entire in-flight council stack (#195-#198). Keep the b |
| `wave-W5-council-revert` | SUPERSEDED | 35/295 | Y | ok | LEAVE — base is fully covered by open PRs #195-#199; the 2 W5-unique commits are a registered NEUTRAL eval fin |
| `wave/cockpit-handoff` | SUPERSEDED | 2/260 | Y | ok | PRUNE — feature fully absorbed and superseded on origin/main (v0.16.24→v0.16.62, all functions present); 260 b |
| `wave/cockpit-handoff-v2` | SUPERSEDED | 3/260 | Y | ok | PRUNE — the ⇄ Handoff feature already merged to main via origin/cockpit/handoff-button and evolved 260 commits |
| `wave60_design_redesign` | SUPERSEDED | 31/410 | Y | ok | PRUNE — every code file already on main (near-identical; graphify literally re-landed as Wave 66), 410 commits |
| `wave66-graphify` | STALE | 1/298 | n | ok | PRUNE — the only unique commit is an empty CI-refresh no-op; branch is 298 behind main with a tree equal to an |

## Prune candidates (SUPERSEDED / STALE — Paulo review)

- `feat/overclock-moo-p1` — A single "Fase 1" commit introducing the packages/overclock-moo package (allocator, matrix-bridge, job-catalogue, runner.mjs, metrics ledger, types + 3 test fil (superseded by origin/main (packages/overclock-moo already present as a superset, incl. benchmark.mjs + pool.mjs) and successor branch origin/feat/overclock-moo-p2)
- `fleet-f1` — fleet-f1 is a rollup branch bundling the entire Wave Council package tree (packages/council/*), the cockpit autopilot-loop, and an early F1 fleet (fleet.json + (superseded by wave-council PRs #195/#196/#197/#198 + wave-autopilot-loop #199 (council + autopilot); feat/fleet-arm #232 for the fleet arm (origin/main already carries the newer F2 fleet.json/orchestrator, causing the add/add conflicts))
- `pilar/council` — Full Wave Council body: an additive packages/council/ (deliberate, verdict, compose, CAS, calibration/conformal ACT-ESCALATE, agreement, telemetry, ledger, buil (superseded by wave-autopilot-loop (PR #199) — plus the stacked council train PRs #195/#196/#197/#198; git rev-list shows 0 commits on wave-council-d and 0 on wave-autopilot-loop that are absent from pilar/council)
- `pilar/site` — A kitchen-sink branch that bundles three separate trilhos: the entire Wave Council package (packages/council + cli + mcp wiring + tests), an autopilot-loop cock (superseded by pilar/site-clean (open PR #200) for the site/dashboard commits; wave-council PRs #195-#199 for the council commits)
- `wave-council-w2` — wave-council-w2 is an exact local duplicate of the wave-autopilot-loop branch (PR #199): its tip 70500d3 is byte-identical to origin/wave-autopilot-loop with ze (superseded by wave-autopilot-loop (open PR #199, identical tip 70500d3) which stacks wave-council #195 / wave-council-b #196 / wave-council-c #197 / wave-council-d #198)
- `wave-W4-council-chip` — Builds the entire packages/council/ stack (Advisory + Builder Council, Bloco A-D: compose/verdict/CAS/deliberate/builder/tests-judge/telemetry/pastor/distill + (superseded by wave-council-d (open PR #198; stack #195/#196/#197 for Bloco A-C). rev-list origin/wave-council-d...wave-W4-council-chip = 0 / 1, i.e. W4 is that PR head plus one chip commit.)
- `wave-W5-council-revert` — Branch = the entire Wave Council stack (Bloco A/B/C/D + Autopilot Loop + Council Quality Eval, 33 commits) which is already covered by open PRs #195/#196/#197/# (superseded by wave-autopilot-loop (PR #199) — W5 is exactly #199's head + 2 extra commits; underlying council body covered by wave-council #195, wave-council-b #196, wave-council-c #197, wave-council-d #198)
- `wave/cockpit-handoff` — Introduces the ⇄ Handoff cockpit feature (session→Cowork context: clipboard + SYNC.md upsert, hybrid local Ollama RECAP/DOING narrative, §SAVINGS footer) in the (superseded by origin/main (all 5 handoff functions present at vscode-extension v0.16.62 vs this branch's v0.16.24) via the landed handoff family (origin/cockpit/handoff-button, perfect-handoff.*); local successor wave/cockpit-handoff-v2 is 1 commit ahead of it.)
- `wave/cockpit-handoff-v2` — A 3-commit cockpit feature adding the ⇄ Handoff button to the VS Code extension (session→Cowork context: deterministic skeleton + local Ollama RECAP/DOING narra (superseded by origin/cockpit/handoff-button (merged to origin/main; feature now at v0.16.62 on main))
- `wave60_design_redesign` — A ~3-week-old (tip 2026-06-21) redesign+graphify branch bundling three workstreams: the wave60 landing site / VS Code cockpit visual redesign, the wave61 "graph (superseded by origin/main — wave60 cockpit/design via PR #231 (feat/lp-cockpit-layout) + numerous cockpit commits; wave61 graphify re-landed on main as "Wave 66" (graph-context.js/graph-aware-decide.ts/code-graph pack byte-identical modulo wave-label rename); the .gitignore cleanup + archived docs/reports/*.md are covered by open PR #191 (chore/gitignore-cleanup-to-main).)
- `wave66-graphify` — The branch's only unique commit (e8aa53f) is an explicit empty commit — its own message states "tree identical to 37e7391b... No code change" — created merely t

## LP trilho (cloud-managed — do NOT duplicate)

- `feat/live-edit` — A Jul-5 WIP snapshot preserving the MP5.0/5.1 Live Edit work (click-to-code LiveEditTap.tsx + the deterministic $0 byte-splice engine live-edit-ast.js and its h
- `feat/lp-preview-diagnostics` — A single commit (715620b) adding the "MP4 Honest Diagnostics" Live Preview error-tap: a dev-only cross-origin error relay from the framed landing dev server to

## Not individually inspected — the ancient tail

~85 older branches (last commit **before 2026-06-22**, mostly single-commit, 300–750 commits behind main — many `docs(sync)`/`Wave NN closure`) were **not** individually inspected. Landing any now would reintroduce ancient divergence; their content is almost certainly already on main or abandoned. **Recommend a bulk `git branch` prune review** rather than PRs.
