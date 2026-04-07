# Changelog

All notable changes to frugal are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.4.0] — 2026-04-07

### Added
- **Statusline with live OAuth budget** — `statusline.sh` reads Anthropic OAuth usage every 2 hours:
  `◈ claude-sonnet-4-6 │ ctx:23% │ 5h:37% ↺2h14m │ 7d:12% │ $0.18 │ max:T3`
- **Budget guardrail** — dynamic tier cap based on 5h consumption: 0-50%→T3, 50-70%→T2, 70-85%→T1, >85%→T0
- **MD Enrichment** — classify.js reads `## Router Context` from project CLAUDE.md
- **SHA-256 cache** — identical prompts skip regex, TTL 30 minutes
- **9Router docs** — full multi-provider setup (Codex + Gemini Flash + Ollama)
- **CODEX_SETUP.md, GEMINI_SETUP.md, VSCODE_SETUP.md**
- **Rename: cloude-router → frugal** — install.sh detects and offers migration

### Fixed
- classify.js no longer misclassifies architecture prompts containing "commit" as T0

---

## [0.3.0] — 2026-04-06

### Added
- **replay.js** — replays decisions.log against current classifier
- **Validation on 1,370 real prompts**: T0: 83.9% | T2: 12.4% | T3: 3.6% | low-conf: 2.0% | **savings: 90.2%**
- **3 fast-path detectors** in classify.js v3 (commit→T0, architecture→T3, short→T0)
- **Ambiguous sub-categories** — weighted scoring for multi-tier matches
- **Low-confidence guardrail** — <0.60 confidence escalates one tier

### Changed
- classify.js v3 replaces v1 entirely
- decisions.log format extended with `confidence`, `sub_category`, `ambiguous`

---

## [0.2.0] — 2026-04-06

### Added
- **Mediator doctrine** (`~/.claude/CLAUDE.md`, 165 lines) — the core frugal philosophy
- **stats.js** — aggregate routing stats from decisions.log
- **benchmark.sh** — accuracy validation against labelled dataset
- **install.sh** first version with `--dry-run`, `--force`, `--uninstall`
- **Telemetry hook** — logs every routing decision to decisions.log
- **100% benchmark accuracy** on 200-prompt hand-labelled dataset
- **70% savings validated** on 200-prompt real-session replay

---

## [0.1.0] — 2026-04-06

### Added
- **classify.js** — heuristic regex classifier, <50ms, returns `{tier, confidence, reason}`
- **inject_context.js** — `UserPromptSubmit` hook, injects `router-hint` into metadata
- **6 subagents**: model-architect (Opus), model-reasoner (Sonnet), cheap-triage (Haiku), local-summarizer, local-transformer (Ollama), final-reviewer (Opus)
- **Documentation**: ROUTING_POLICY.md, HOW_IT_WORKS.md, VALIDATION_REPORT.md, MODEL_MAPPING.md, LIMITATIONS.md
- **v1 baseline**: T3 misroutes 31.0%, low-conf 27.1%, savings 27.5%
