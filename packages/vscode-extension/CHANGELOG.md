# Changelog

All notable changes to **Mooter — Cost Cockpit for Claude Code**. Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

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
