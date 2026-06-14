# Changelog

All notable changes to **Mooter — Cost Cockpit for Claude Code**. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [0.12.0] — 2026-06-14

Design-system redesign from the Claude Design handoff (Wave 60), shipped together
with the **Token Ledger** — same tokens and voice as mooter.ai, honest numbers, and
a calmer brand balance. (Consolidates the redesign and the Token Ledger, which had
collided on 0.11.0, into a single release.)

### Added
- **Token Ledger** in the Cockpit — per-model token counter with **estimated cost by model** (Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5 …), toggle **This session ⇄ All time**. Real usage read from Claude Code's own session logs (`~/.claude/projects/*.jsonl`, `message.usage`), cache tokens shown separately, prices Jun 2026 (advisory). Local (Ollama) models shown as **FREE** — the savings proof, transparent and honest.
- First-run reads as a to-do, not an error — unset Setup fields show a neutral
  "— not set" instead of red-italic "missing"; the Decisions empty state has a CTA.
- The "ask mooter anything" bar is sticky at the top with an example affordance.
- A rose `:focus-visible` ring on every interactive element; `prefers-reduced-motion`
  is honoured; the statusline has a readable fallback + retry (no stuck "warming up").

### Changed
- **Honest hero numbers** — the Cockpit "Saved vs all-Opus" and the Insights
  "Routing intelligence" numbers are neutral by default; green is now reserved for
  genuine positive signal (real savings, cache-hit > 0). No more green `$0.00`.
  With no routed prompts yet, the Cockpit shows "no routing data yet" + a CTA.
- **One coherent Claude Code state** — header and Setup no longer contradict each
  other ("paired" vs "missing"); a single ext · cli · none model drives both.
- **Mooter Score is labelled** — the header shows "Score N/8" (green only at a full
  8/8), never a bare unlabelled percentage.
- **Cockpit ↔ Doctor de-duplicated** — the Cockpit shows the score + the single
  next action; the full 8-check list lives in Doctor.
- **Brand balance** — rose is the accent for action/navigation/selection (primary
  button, active tab, mode badge & segment, active effort), ending the "green on
  everything" look. Green stays semantic (tier T0, savings, done, detected).
- **Canonical cow** — the Activity Bar uses the new `currentColor` mono cow; the
  Marketplace icon is the 512×512 cow on a lifted background.

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
