# Wave 11 — Warm-Intro Readiness · CLOSURE

> 2026-06-02. Outcome: **SHIPPED — warm-intro ready.** Prod `v1.6.1-anthropic-credit`.
> Paulo's Day-4 incognito E2E passed all 14 steps (25 min, wow 4/5, "would recommend: yes").

## Definition of Done (§4) — 10/10

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Fresh Docker install completes | ✅ | `scripts/test-install-docker.sh` PASS + Paulo step 9 ("mooter v1.6.1 installed") |
| 2 | `mooter feedback` reaches `/admin/feedback` | ✅ | Paulo steps 12→13→14 (via `mooter login`; anon path deferred — see below) |
| 3 | Paulo incognito OAuth+wizard+install+feedback E2E | ✅ | Day-4 report: all 14 ✓, OAuth → `/onboarding`, 25 min |
| 4 | Anthropic rubric ≥4/5 each | ✅ | `ANTHROPIC_SHOWCASE_RUBRIC_V1.md` ~23/25, C4 fix live (`v1.6.1`) |
| 5 | No claim without citation | ✅ | hero ranged claim + `/methodology` link (PR-A) |
| 6 | Telemetry opt-out works | ✅ | `mooter quiet --telemetry-off`, default opt-out ("nothing collected") |
| 7 | Subagents bundled or documented | ✅ | install.sh copies 6 `agents/*.md` (Docker-verified: 6) |
| 8 | Ollama auto-pull opt-in or documented | ✅ | `/dev/tty [Y/n]` consent (PR-B); Paulo chose Y, worked |
| 9 | Statusline + digest + `mooter trail` functional | ✅ | install wires hook (Docker) + Paulo session wow 4/5 |
| 10 | Prod tag v1.6.x, mooter.ai 200, no regressions | ✅ | `v1.6.1-anthropic-credit`, mooter.ai 200 |

## What shipped (prod)

- **`v1.6.0-warm-intro-ready`** (PR #60 `720f04e`): PR-A honest hero copy + `/methodology` citation + `AuthErrorBanner`; PR-B install.sh **public self-clone** (the public `curl mooter.ai/install.sh | bash` one-liner now actually installs — was a friends-beta stub) + Ollama `[Y/n]` consent + version 0.11.0→1.6.0 + committed `scripts/test-install-docker.sh`.
- **`v1.6.1-anthropic-credit`** (PR #62 `0ea1fa5`): footer "Built for Claude Code & made with Claude Code · routes across Anthropic's Claude models (Opus·Sonnet·Haiku)" — rubric C4 2→5.

The decisive win: the **#1 warm-intro gap (public one-liner = dead stub) is closed**, prod-verified end-to-end by both CC Docker and Paulo's real incognito run.

## Honest deferrals (NOT blockers — documented for the next wave)

- **PR-C — anonymous `mooter feedback`** (FB-LOGIN). Feedback currently works **login-gated** (Paulo's E2E confirms the loop: login → feedback → /admin/feedback ✓). The kit's "anonymous" promise is not yet true. Anon needs migration 009 (`grant submit_feedback to anon`) + an abuse guard on the unauthenticated `/api/feedback` insert (Vercel route, no rate-limit). Deferred to a dedicated PR. **Action for Cowork:** until then, the outreach kit should say "sign in once, then `mooter feedback`", not "anonymous".
- **C3 / C5 rubric 5/5 bumps** (routing+hook explainer on `/under-the-hood`; condensed persona+$ line on hero) → Wave 12. Both already ≥4.
- **D2-5** returning-user → `/dashboard` (currently always `/onboarding`); **D5-7** env-var `MOOTER_TELEMETRY=off` (CLI flag exists, env var doesn't); Mac/Windows-native install (only Docker/Linux E2E-tested) — Wave 12 / validation-week findings.

## Validation 5 vibe coders — now unblocked

Technical prerequisites met: public install works, subagents bundled, statusline/digest live, feedback loop works (login-gated), migrations applied, rubric ≥4. Remaining is human (5 names/openers + Tally + Calendly) per `VALIDATION_OUTREACH_KIT.md` — with the one copy tweak above (login, not anonymous).

## Tags
`v1.6.0-rc1-warm-intro-dev` (dev) · `v1.6.0-warm-intro-ready` (main, PR #60) · `v1.6.1-anthropic-credit` (main, PR #62).
