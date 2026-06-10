---
name: final-reviewer-honest
description: Pre-merge gate checklist for Mooter — spawn the final-reviewer subagent, verify the classify.js sha freeze, run full test suites, hunt fabricated metrics in docs/copy, enforce selective adds, and emit a severity-ranked SHIP / SHIP-WITH-NITS / NO-SHIP verdict. Use before any push, merge, release, or deploy. Never skip.
---

# /final-reviewer-honest

The mandatory T3 gate before merge/push/release/deploy. Doctrine: "spawn
`final-reviewer` ANTES, sempre" — no exceptions, no "it's a small diff".

## Checklist (all items, in order)

1. **classify.js sha freeze**

```bash
sha256sum tools/router/classify.js
# MUST equal 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
```

Any drift = automatic **NO-SHIP**, regardless of how good the rest looks.

2. **Full test suites** — run every suite the diff touches, plus the CLI
   baseline (`packages/cli`: 362/362 as of Wave Mega Day 0). Report exact
   pass/fail counts; "tests pass" without numbers is not acceptable.

3. **No fabricated metrics in docs/copy** — grep the diff for numbers
   (percentages, ratings, user counts, benchmark figures, prices) and demand
   a source for each. Past offenders: invented `aggregateRating(4.9/1437)`,
   inflated "~90%" savings, wrong Opus pricing. Prices must match the
   `pricing-correto-2026` skill.

4. **Selective adds only** — review `git status`; every staged file must be
   intentional. Never `git add -A`. Orphan/untracked files outside the phase
   allowlist are a finding.

5. **Frozen packages untouched** — diff must not touch engine packages
   outside the wave's explicit allowlist.

6. **Spawn the `final-reviewer` subagent (Opus)** with the full diff, the
   checklist results above, and the wave's allowlist. Ask for findings
   **severity-ranked**: HIGH / MED / LOW / NIT, each with file:line.

## Verdict rubric

| Verdict | Criteria |
|---|---|
| **SHIP** | 0 HIGH, 0 MED |
| **SHIP-WITH-NITS** | 0 HIGH, MED items each consciously accepted and listed |
| **NO-SHIP** | any HIGH, sha drift, fabricated metric, or failing suite |

## Honest caveats

- The reviewer's job is to find reasons NOT to ship; if it returns zero
  findings on a large diff, treat that as a smell and re-run with a sharper
  prompt.
- Fix-then-reverify: any HIGH fixed during review requires re-running the
  affected suite AND re-checking the sha before upgrading the verdict.
- The verdict and finding counts go in the session report verbatim (e.g.
  "final-reviewer SHIP 0-HIGH") — do not soften the language.
