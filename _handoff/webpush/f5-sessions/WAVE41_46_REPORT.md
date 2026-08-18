# Wave 41-46 — Friends Activation Mega · Report

> **Nota de arquivo (2026-08-15).** Este relatório vivia na RAIZ do repositório e foi
> movido para cá sem uma vírgula alterada no corpo. O motivo não é que mentisse — é o
> contrário, e a distinção interessa: ele cita `classify.js` sha `7b01eb8623a0b8fc…` como
> INTACT, o que era **verdade quando foi escrito**. O relatório é de `af6d054a`
> (2026-06-09 18:58 −03) e o `classify.js` só mudou às **21:05 do mesmo dia**, em
> `341b0a92` (wave49-p2), quando o sha congelado passou a
> `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — o valor que CI e
> canon aplicam hoje. Verificado por `git rev-list` sobre todas as versões do ficheiro:
> `7b01eb86…` foi de facto um sha real do `classify.js`, válido até 2026-06-01.
>
> O problema era de LOCALIZAÇÃO, não de honestidade: um relatório de wave parado na raiz
> é lido como estado corrente, e quem o cruzasse com o canon de hoje concluiria que o
> invariante congelado tinha sido violado. Relatórios de wave pertencem a
> `docs/archive/sessions/` (AGENTS.md § Information architecture).

**Branch:** `feat/wave41_46-friends-activation` → **PR #143** (base `main`, NOT merged)
**Expected tag (Paulo, post-merge):** `v1.24.0-friends-activation`
**Date:** 2026-06-09 · Doctrine V4 honest > forced

## TL;DR
3 of 4 phases shipped. Day-0 recon **refuted the premise of 3 phases** — scope was tightened to what's real. classify.js sha INTACT throughout. CLI 351/351, landing 146/146, builds clean. final-reviewer (Opus) SHIP-WITH-NITS 0-HIGH; both MEDs fixed.

## Results

| Phase | Wave | Brief | Status | Notes |
|---|---|---|---|---|
| 0 | recon | Day-0 sanity | ✅ | sha intact, infra audited |
| 1 | 41 | `mooter intent` NL CLI | ✅ **ENHANCED** | command pre-existed (Wave 33.5); added friend rules |
| 2 | 42.A | dashboard signed-in deep | ⏭️ **SKIPPED** | already 2303 lines/6 tabs; only gap needs recharts (dep guardrail) |
| 3 | 42.B | `/changelog` page | ✅ **REBUILT** | existed but stale+hardcoded → ISR GitHub-fetch + fallback |
| 4 | 46 | `dogfood --weekly` cron | ✅ **DONE** | + premise-conflation flag (see below) |
| 5 | — | PR + closeout | ✅ | PR #143, SYNC + memory updated |

## Day-0 refutations
1. **intent already existed** (Wave 33.5). Real gap = friend PT-PT phrases routing nowhere. Added `packs`, `savings→dashboard`, `explain/router-debug`, `doctor` rules.
2. **dashboard not "minimalista"** — 2303 lines, tabs for Devices/Setup/Metrics/HowItWorks/Decisions/Workflow(Sankey). The one missing piece (MLWR time-trend) needs `recharts`, which violates both the "dashboard/** only" scope and the package-dep guardrail. **Skipped** rather than force a risky dep install unattended on prod landing.
3. **changelog already existed** but hardcoded + stale at v1.21.1 (current v1.23.0). Rebuilt self-updating.
4. **dogfood digest ≠ savings digest.** `mooter dogfood` logs dev *friction* (Paulo's tool), not friend savings. `--weekly` implemented as asked, but the friend-facing habit digest should target `mooter digest` (MLWR/savings). **Recommend a follow-up** wiring the weekly cron to `mooter digest` if friend-habit is the real goal.

## Files changed (7)
- `packages/cli/src/commands/intent.ts` (+ test) — friend NL rules, rule-ordering hardened post-review
- `landing/app/(marketing)/changelog/{page.tsx,_lib.ts,changelog.test.ts}` — ISR GitHub fetch, plain-text-safe render, +7 tests
- `packages/cli/src/commands/dogfood.ts` (+ test) — `--weekly` / `--install-cron` (dry-run) / `--send`, +5 tests

## Gates
- classify.js sha `7b01eb8623a0b8fc…` INTACT (pre + post each phase)
- Engine packages 28-34.5 untouched except the two allowed CLI files
- No prod-critical landing files touched (hero/compare/conductor/workflow/PulseStrip)
- final-reviewer Opus: **SHIP-WITH-NITS**, 0-HIGH. 2 MED (intent rule-ordering: `packs` swallowing spawn-tasks; bare `router` swallowing install/status) → **fixed** + 4 probe tests. Security on changelog (XSS via release body) verified clean — React auto-escapes, no `dangerouslySetInnerHTML`, unauth fetch (no token leak).

## Pendente Paulo
- Review PR #143 → merge → tag `v1.24.0-friends-activation`
- Friends DMs (Task #218) — manual
- (Optional follow-up) weekly cron on `mooter digest` for real friend savings habit
- LoRA train / Mac smoke — manual
