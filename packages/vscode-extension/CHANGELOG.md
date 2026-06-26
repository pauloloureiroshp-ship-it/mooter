# Changelog

All notable changes to **Mooter — Cost Cockpit for Claude Code**. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [0.16.28] — 2026-06-26 — Handoff v2 polish: gen-model narrative (skip embeddings) + copy feedback + project panel

### Fixed

- **Handoff narrative could pick an embedding model.** The local DOING/RECAP/project-synthesis narrative chose the *smallest* installed Ollama model — which on a machine with `nomic-embed-text` (or any `bge`/`gte`/`e5`/`minilm`/`*embed*`) installed meant feeding the narrative prompt to an **embedding** model that returns vectors, not text. New pure helper `pickLocalGenModel(models)` filters embedding models OUT *before* sorting by size, then picks the smallest remaining generation model (qwen2.5:3b in Paulo's environment). Embedding-only install → `null` → honest deterministic skeleton. Applied to `ollamaDoing` / `ollamaRecap` / `ollamaProjectSynth`.

### Added

- **Honest engine label in the §SAVINGS footer.** When the local narrative actually ran, the footer now names the real model: `compressed locally (T0 · <model> · $0) · ~Xk tok saved…`. When it didn't (Ollama down / timeout / embedding-only), it reads `compressed locally (T0 · deterministic — no local gen model · $0) · …`. Never an invented engine. `composeHandoff` resolves the generation model once and threads it through to `generateHandoff`.
- **📋 Copiar tactile feedback** — clicking re-copy swaps the label to **✓ Copiado** for ~1.5s, then restores **📋 Copiar** (setTimeout only, no libs).
- **Best-effort gen-model warm-up** on cockpit open (`warmLocalGenModel`) — a tiny detached `/api/generate` that pulls the model into RAM so the first handoff comes from the LLM instead of a cold-start fallback. Never blocks, never throws.

### Notes

- Project handoff panel verified end-to-end: the `projHandoff` post `sid` matches the group-header panel's `data-hoff` key, so clicking reveals the board (DUP/UNCOMMITTED/UNPUSHED flags) inline + clipboard. Row/group renderers stay concatenation-only. No change to the routing engine; `classify.js` sha unchanged.

## [0.16.27] — 2026-06-26 — Handoff v2: inline live panel (per-session + per-project), on composeHandoff

### Added

- **⇄ Handoff inline panel** — the ⇄ Handoff button now SHOWS the handoff text in a live panel right below it, in real time, as well as copying it to the clipboard and upserting `SYNC.md`. The deterministic skeleton (git/branch/files + the PENDING question **verbatim**) appears instantly (`postMessage 'generating'`); the final text — produced by the **parallel + hard-4.5s-deadline `composeHandoff`** from 0.16.25 — re-fills the panel (`postMessage 'done'`). The panel shows EXACTLY what goes to the clipboard — same source, no drift. A **📋 Copiar** button re-copies it.
- **⇄ Handoff do projecto** — a per-project button on each group header builds a BOARD of every session in the project (one deterministic line per session with **DUP** / **UNCOMMITTED** / **UNPUSHED** flags) plus one bounded local synthesis line, shown in the same inline panel + clipboard + `SYNC.md` (under `__fleet__`).

### Notes

- Panel == clipboard (same `composeHandoff` / `generateProjectHandoff` source); the PENDING question is always verbatim; nothing is fabricated. If Ollama is down the panel still reaches "done" with the deterministic content (synthesis omitted, never faked) — the 4.5s deadline guarantees it.
- Row/group renderers stay concatenation-only (webview-serialisation safe). No change to the routing engine; `classify.js` sha unchanged.

## [0.16.25] — 2026-06-26 — ⇄ Handoff: never "nothing" (parallel narrative + hard deadline)

### Fixed

- **⇄ Handoff button felt like it "generated nothing".** Root cause: on sessions with ≥12 turns ('full' mode) the optional local narrative ran the DOING and RECAP Ollama calls **sequentially** (2s + 4s), so against a cold/slow Ollama the clipboard wasn't written for ~6s — with **no on-screen feedback** during the wait, the click looked dead. Now DOING and RECAP run **in parallel** behind a **hard 4.5s deadline**, so the deterministic handoff (git/branch/files + PENDING verbatim) always reaches the clipboard in **< 5s**, even when Ollama hangs or is down. Added an immediate "🐮 a gerar handoff…" status the moment the button is clicked.

### Added

- **Runtime smoke** (`handoff-runtime-smoke.test.js`) that drives the REAL orchestration (`composeHandoff`) against a fake Ollama that is **down** and **hung on /api/generate**, asserting the clipboard is non-empty, the PENDING line is verbatim, and everything ships in < 5s. The previous handoff tests were sims that never touched the Ollama path.
- `MOOTER_OLLAMA_PORT` env seam (defaults to 11434) so the smoke can point the real Ollama functions at a controllable fake server without touching the live daemon.

## [0.16.22] — 2026-06-25 — Project Stage Rail: plain-language transparency per session

### Added

- **Project Stage Rail** on every live session card — a 6-step semaphore (Edit → Save → Backup → Branch → Merge → Live) that lights the step you're actually on, derived purely from the session's existing git signal. Hover any step for a plain-language explainer ("Save — bundle changes into a restore point you can return to (git: commit)").
- **Safe-to-close chip** next to the session state, in plain words: 🟢 *safe to close*, 🟠 *unsaved work*, 🔵 *saved, not backed up*. Answers the one question a vibe coder asks before closing the laptop.
- **Plain next-move line** ("✦ …") with a single contextual action: **Save my work** when there's unsaved work (reuses the existing Commit & Push flow — selective commit, never `git add -A`, with the classify.js sha guard). Backing up (push) and merging stay advisory by design.
- A **↓N pull to catch up** hint when the remote is ahead.

### Notes

- Front-end only: zero backend change, zero new commands, no change to the routing engine. A session with no git repo shows no rail — it can't honestly claim "safe to close".
- Respects `prefers-reduced-motion`; the rail and its action are screen-reader labelled with the current step.

## [0.16.0] — 2026-06-16 — Agents panel: accurate local/subscription + status

### Fixed
- **Agents panel reads the real local/subscription signal.** Each agent line now uses the spawn's `mode` (local → 🦙 / cloud → ✨) and shows its `tier` (T0–T3) when the model name isn't recorded — instead of guessing from a (often absent) model field. The parallel count is computed the same way.
- **Failed agents shown honestly** with a red ✗ (e.g. a sandbox exit) rather than a neutral "queued" dot.

## [0.15.0] — 2026-06-16 — Live agents panel (parallel local + subscription)

### Added
- **🤖 Agents — live** panel in the Sessions tab: shows the agents working for the herd — local Moos (🦙) and subscription models (✨) — with a parallel count ("N local · M subscription working"), a run progress bar (real `agents_done/agents_total`), and one line per agent (model · role · task · status). Status is honest: an animated **working** pulse, **✓ done**, or **◌ queued**. A numeric per-agent **%** shows only if the engine emits it (`spawn.progress`) — never fabricated.
- Built strictly from **real sources** (active-run, spawns, in-flight sub-agent, the decisions matrix). When no parallel run is active, it says so plainly and lists the agent roles Mooter routed recently — and notes that full parallel local+subscription fan-out (with per-agent progress) is an engine capability in progress. The panel **lights up live** the moment the engine emits that data.
- Panel is collapsible (chevron), like the other sections.

## [0.14.0] — 2026-06-16 — Per-model counter always reachable · Sessions tab names + coherent metrics · subscription check fix

### Fixed
- **Token Ledger never hides the per-model counter.** When scoped to a focused Claude Code session, the **This session ⇄ All time** toggle now stays available — a quiet/empty session no longer shows just "No usage logged" with no way out. Flip to **All time** to see the full per-model history (local + each Claude model).
- **"Subscription profile configured" check** now recognises the current `subscription-profile.json` shape (`profiles` map from `setup-profile.js`/`detect-subscriptions.js`) — a detected provider or a budget strategy counts as configured. No longer stays pending after setup; the fix button points at the detector that writes the file.

### Added
- **Sessions tab shows each session's name** (first prompt / Claude Code title), like the cockpit — instead of the raw project path.
- **Coherent per-session metrics** in the Sessions tab: input/output **tokens**, estimated **cost**, **saved vs all-Opus**, and **tok/s** — all from that session's own transcript, same formulas as the Token Ledger (advisory, never fabricated; shown only when usage exists).

## [0.13.0] — 2026-06-16 — Collapsible sections + cleaner layout

### Added
- **Collapsible sections** — every secondary card (Next prompt model, Live sessions, Mooter Score, Router recommendations, Token Ledger) now has a ▾ chevron in its header. Click (or Enter/Space) to hide a section you don't care about. Your choices **persist** across refreshes and window reloads. Keeps the cockpit as clean as you want it. The **Saved vs all-Opus** hero and the **mode switch** stay always visible.

### Changed
- **Next prompt model** picker moved directly under the LazyMoo · Moo · CrazyMoo switch (pick the mode, then the model).
- Tidier layout: consistent collapsible headers, subtle chevron, calmer spacing.

## [0.12.4] — 2026-06-16 — Cockpit block order

### Changed
- **Cockpit layout reordered** to put the headline first: **① Saved vs all-Opus** (the savings hero) is now the top block, followed by **② the LazyMoo · Moo · CrazyMoo mode switch**. Live sessions, the next-prompt picker, Mooter Score, recommendations and the Token Ledger follow. No logic change — pure render order.

## [0.12.3] — 2026-06-15 — bug-fix sweep

### Fixed
- **Removed a stray NUL byte** from `extension.js` (a composite-key separator was written as a raw `\0`, turning the file "binary" to tooling). The repo+branch key is now a clean JSON tuple.
- **`prStage`** no longer reports a PR as plain "open" when a check is `COMPLETED` with a null conclusion (cancelled/expired run) — it now surfaces "CI ⏳".
- **Guarded `#null`** in the session PR chip if a PR ever lacks a number.
- **First paint when the panel starts collapsed** now does a full (deep) refresh instead of showing zeros for up to 60s.
- **Removed ~11 dead `.live*` CSS classes** (and the `moopulse`/`moodots` keyframes) left over from the single-cow card the herd replaced.

## [0.12.2] — 2026-06-15 — data-coherence, per-session & live herd

> Driven by the rule: **every number must match the reality of the solution — never mislead, always sincere.** A 4-way audit (code + live telemetry) confirmed several surfaces showed routing *intent* as if it were *execution*. Fixes:

### Added (UX round 2)
- **Branch + PR + stage on each live session.** A session running inside a git repo now shows its `⎇ branch` and, when there's an open PR for it, `#N · <stage>` (merged ✓ / draft / CI ⏳ / CI ❌ / ready ✅ / open) — the honest chain **session → cwd (transcript) → branch (git) → PR (gh)**. PRs are resolved **per repo** (gh runs in the session's own cwd), so a same-named branch in another repo is never mis-linked. Sessions on the **same repo+branch** are marked 🔗 (same work). Sessions outside a repo show nothing (no fabrication); gh/git failures degrade silently.
- **"Next prompt" picker promoted** — its own card with the rose accent and a clear "🎯 Next prompt model" header (was small and faded).
- **Unified Token Ledger** — cloud and local now share the **same columns** (model · in · out · cache · cost · saved vs Opus). Local is one honest "🦙 Local (Ollama · T0)" row with real measured T0 tokens (token_tracker), `$0` cost, and the saved-vs-Opus counterfactual; cloud's "saved" is "—" (a billed row *is* the spend). Note kept: local per-model isn't metered → T0 aggregate.

### Fixed (coherence — the displayed data was not the truth)
- **The cockpit showed the wrong model.** It rendered the router's *recommended* model (`/last.model_full`, an advisory tier decision) as if it had answered. In a Claude Code session the **host model answers every turn**; the recommendation only runs for real local dispatches or spawned subagents. The per-session view now derives the **real executor** from the session's transcript (host model) — and an **"Actually ran"** line states that host model + the count of real local dispatches, so an unconfirmed routing recommendation is never shown as execution.
- **`synthetic` row removed from "Tokens by model."** It was Claude Code's own `<synthetic>` placeholder ("No response requested.", zero usage), not real spend — now skipped from the ledger.
- **Savings headline labelled honestly.** "Saved vs all-Opus" is **advisory / token-estimated** (what you'd save *if* each prompt ran on its recommended tier — the host actually answers, so it isn't billed). The `$` stays, now clearly tagged advisory, with a **real executed** line ($ guaranteed-saved from actual local dispatches; $0 when there were none).
- **No fake LoRA/DoRA "evolution."** The Models/Insights tabs claimed a trained adapter and "trained on N decisions." No neural LoRA/DoRA is trained locally (it's a manual GPU job). Re-labelled: adapter "baseline (none installed)", mechanism **TF-IDF + EWMA over real decisions** — honest about what actually learns.

### Added
- **Click a cow → open that Claude Code session.** Clicking a live-session row now opens/focuses that exact session in the editor (via the extension's own `claude-vscode.primaryEditor.open` command, with the `vscode://anthropic.claude-code/open?session=` URI as fallback) and scopes the cockpit to it — go from "which session?" to interacting in one click.
- **"Your turn" alert on the herd.** Sessions where Claude finished its turn (or stalled waiting) show a pulsing amber dot + "your turn", and the header counts "N need you". Derived honestly from the `classified`/`turn_end` pair in `decisions.log` (real hook telemetry) gated by transcript freshness — it means "Claude is waiting for your reply", **not** specifically "permission required" (that would need a Notification hook; offered separately).
- **🐄 Live sessions herd.** The top of the Cockpit now shows **every open Claude Code session as its own walking cow** — the session's tab name (its first real prompt, read from that session's transcript, with `~/.claude/history.jsonl` as a fallback), the real host LLM, and a ● "generating now" indicator (its transcript is being written). **Click a cow to focus** all the numbers below (savings, prompts, recommendations, token ledger) on that session, or pick **🌐 All sessions**. Auto-follows the session you send a prompt in (`.last-classified.json`, ~1s). Per-session savings come from the tracker's own `/metrics?session_id` (one source of truth). Honest limit stated in-UI: the cockpit reads `~/.claude` logs and **cannot see which VS Code tab is focused** (no extension API), so it follows activity.
- **"Router recommendations" is now labelled advisory, with an "Actually ran" line.** The tier-mix bars were read as "usage" (e.g. "100% local") while the host model actually answered everything — incoherent. They're now titled **Router recommendations · advisory** with a line stating what **actually ran** (the host model + count of real local dispatches). No more "100% local" next to an Opus executor.
- **Local (Ollama) models in the Token Ledger** — real measured T0 tokens (in/out) from `token_tracker`, cost **$0**, and the counterfactual saved-vs-Opus. Per-model rows show **call counts** (local per-model token metering isn't available, so no per-model token figure is invented).
- **🧵 Sessions tab** (replaces the empty "Herd" facade) — recent Claude Code sessions by file activity, with the real last host model + turn count. Honestly labelled "recent", **never "active"**: the cockpit cannot detect the focused VS Code tab (no extension API), and cross-session messaging isn't tracked, so neither is shown.

### Changed
- De-clutter: tab labels get per-feature emojis (🐮 Cockpit · ⚙️ Setup · 🧵 Sessions · 🔬 Decisions · 🩺 Doctor); the redundant third mode-selector (Models tab) is now a read-only indicator.
- Brand accent aligned to the single **rose `#E8888A`** (Wave 60 direction) across mode/tabs/primary actions; tier colours unchanged.

## [0.12.1] — 2026-06-14

Mascot + accent alignment (Wave 60). Reverts the geometric cream cow introduced
with the canonical-cow pass back to the classic cow, and settles on a single rose
accent — no orange.

### Changed
- **Classic cow everywhere** — the Activity Bar mark and the Marketplace icon now
  use the classic cow (grey/white head, rose muzzle, dark eyes with catch-light),
  matching the website. The Marketplace `icon.png` is re-rendered 512×512 on a
  lifted `#1C1A17` background so it survives the dark gallery.
- **One accent: rose `#E8888A`** — the orange `#FF6B35` that arrived with the
  canonical-cow pass is removed. CSP/nonce and the read-only contract are unchanged.

## [0.12.0] — 2026-06-14

Design-system redesign from the Claude Design handoff (Wave 60) — same tokens and
voice as mooter.ai, honest numbers, and a calmer brand balance.

## [0.11.0] — 2026-06-14

### Added
- **Token Ledger** in the Cockpit — per-model token counter with **estimated cost by model** (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5 …), toggle **This session ⇄ All time**. Real usage read from Claude Code's own session logs (`~/.claude/projects/*.jsonl`, `message.usage`), cache tokens shown separately, prices Jun 2026 (advisory). Local (Ollama) models shown as **FREE** — the savings proof, transparent and honest.

## [0.10.0] — 2026-06-14

### Added
- **Slash commands grouped by type** in the Doctor tab — Modes, /mooter sub-commands, Claude pins, and Local (Ollama) pins; local pins whose model is not pulled are flagged (⚠) with a one-click hint.
- **Connect account & keys** button (runs the engine's `mooter init`, masked input) — first step toward in-panel onboarding.

## [0.9.2] — 2026-06-14

### Fixed (Windows-test feedback)
- **Buttons that ran `mooter …` now work without the CLI on PATH** — commands are routed through the resolved CLI via `node` (the `mooter` shim is often not on PATH on Windows).
- **"Pull recommended model" button** in the Mooter Score was a no-op — now actually pulls your GPU-matched model via Ollama.
- **Setup wizard no longer shown to installed users** if only the hook fell out — `runtimeInstalled` checks the hook *or* the classifier.
- **Claude Code detection** now also covers scoop, chocolatey, Program Files (Windows) and Homebrew (macOS).

## [0.9.1] — 2026-06-14

### Changed
- Accessibility: the Decisions list is now keyboard-operable (`role="button"`, Enter/Space to expand), matching the tab strip and mode controls.

## [0.9.0] — 2026-06-14

### Added
- **Mode switch on the Cockpit** — LazyMoo / Moo / CrazyMoo as a segment up top, and the header mode badge is now clickable (cycles modes). No more digging into a tab.
- **Next-prompt model picker** — pick a local (Ollama) or Claude model; the cockpit copies the matching `/pin` command to your clipboard to paste in Claude Code (read-only by design).

### Changed
- **9 tabs → 5** (Cockpit · Setup · Herd · Decisions · Doctor). Setup absorbs Install + Models; Decisions absorbs Insights; Doctor absorbs Terminal. No more 2-row wrap in a narrow sidebar.
- Keyboard support for the mode segment and header badge (`role="button"`, Enter/Space).

## [0.8.2] — 2026-06-14

### Changed
- New extension icon — the official mooter.ai cow mark (cream + orange) on a dark tile; reads clearly in Marketplace search on light and dark themes.

## [0.8.1] — 2026-06-14

### Added
- Marketplace listing screenshot (live savings, Mooter Score, tier mix) in the README.

## [0.8.0] — 2026-06-14

### Added
- **Getting Started walkthrough** — three steps (install engine → open cockpit → launch session).
- **Marketplace-grade manifest** — `extensionKind: workspace` (runs where your router lives, incl. WSL/Remote), `capabilities` (works in Restricted Mode; declares it needs a local filesystem), `qna`, `bugs`, `pricing`, refined categories & keywords.
- Refresh action in the view title bar.
- Keyboard navigation for the tab strip (arrow keys, `role="tab"`).

### Changed
- **Cross-platform**: external links now open via the OS handler (`env.openExternal`) instead of a macOS-only `open` command — works on Windows & Linux.
- Claude Code CLI detection no longer assumes a Unix path; it also recognises the installed Claude Code extension.

### Fixed
- `.vscodeignore` had literal `\n` and shipped test files in the package; rewritten with real patterns — smaller, cleaner `.vsix`.

## [0.7.1] — 2026-06-14
- Rebrand cleanup for the repository's naming ratchet (no behaviour change).

## [0.7.0] — 2026-06-14
- Resource hygiene & honesty: visibility-aware polling (brisk when visible, lazy when hidden), overlap guard against piled-up CLI batches, expanded Decisions survive the periodic re-render, explicit "tracker offline · last known" marker. `npm test` now runs all suites.

## [0.6.1] — 2026-06-12
- 🐄 Herd view: live run, agent swimlanes, the tokens × LLM × agent matrix, live sessions. Fixed a webview template-literal escape bug (with a real-render regression test).

## [0.5.0] — 2026-06-12
- Co-brand pairing detection with the official Claude Code extension; Insights tab (cache-hit, confidence trend, quant, LoRA/Pastor, per-prompt evolution).

## [0.4.0] — 2026-06-12
- Official mooter design tokens; natural-language intent bar; ⭐ feedback to the Pastor; why-not-Fable; security score.

## [0.3.0] — 2026-06-12
- Mooter Score (8 checks with fix buttons); real device/HW setup; budget editor; GPU-matched install recommendations; Moo trio (Moo / LazyMoo / CrazyMoo).

## [0.2.0] — 2026-06-12
- Brand colors; terminal-parity statusline; setup wizard; slash-command management; model/subscription picker; rich metrics.

## [0.1.0] — 2026-06-12
- First MVP: status bar, Cockpit / Decisions / Doctor, launcher.
