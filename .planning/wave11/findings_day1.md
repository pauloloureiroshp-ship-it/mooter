# Wave 11 Day 1 — raw log (CC, 2026-06-02)

Full deliverable: docs/strategy/WAVE11_DAY1_FINDINGS.md

## Docker test (node:20, fresh, public-repo clone == /i/<token> path)
- clone OK · install.sh exit 0 (x2, idempotent)
- esbuild v1 bundle built · 6 subagents → ~/.claude/agents/ · shim+env+PATH
- mooter --version/init/doctor/uninstall dispatch OK
- mooter feedback → "Run `mooter login` first" (FB-LOGIN 🔴)
- version.json = 0.11.0 friends-beta (D4-VERSION 🟠); packages/cli = 1.0.0
- no Ollama → honest T0-disabled msg; no key → subagent-fallback msg

## Critical (warm-intro blockers)
- PUB-STUB: mooter.ai/install.sh one-liner = friends-beta stub (hero Install CTA → /install shows it). Only /i/<token> installs.
- FB-LOGIN: feedback gated behind login vs kit "anonymous".
- D2-config: OAuth provider/whitelist unverifiable from FS → Paulo incognito test.

## Important
- D1-1: "Same results / Up to 90%" uncited + banned phrase (page.tsx:37).
- D4-VERSION: stale 0.11.0 friends-beta.
- D2-4: /?auth=error not surfaced on homepage.
- D2-5: callback always → /onboarding (returning re-enter wizard).

## Confirmed-good (no fix)
- D1-5 mobile clamp ✓ · D4-4 subagents bundled ✓ · D4-5 ollama auto-pull ✓ · D4-7 idempotent ✓ · D4-8 uninstall ✓ · cookies httpOnly+secure+lax ✓

## Gate A pending: D4-4(confirm), D4-5(unconditional vs opt-in), PUB-STUB, FB-LOGIN, D1-1 copy
