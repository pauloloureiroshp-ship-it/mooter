<!--
Thanks for contributing to frugal!

Before you open this PR, make sure you have read CONTRIBUTING.md — especially
the section on the doctrine and HIGH_RISK list, which require sign-off BEFORE
you write code.
-->

## Summary

<!-- One or two sentences. What does this PR change? -->

## Motivation

<!-- What problem does this solve? Link to an issue if one exists. -->

Closes #

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (a change that may require users to update their setup)
- [ ] Docs only
- [ ] Refactor / internal cleanup (no user-visible change)
- [ ] Test-only

## Does this touch the doctrine or HIGH_RISK?

- [ ] No
- [ ] Yes — and I have prior sign-off from Paulo (link it in the description)

## How I tested this

<!-- The exact commands I ran to verify the change works. -->

```bash
node ~/.claude/tools/router/backtest.test.js
# ...
```

- [ ] `node -c tools/router/classify.js` (syntax check)
- [ ] `node tools/router/backtest.test.js` (unit + integration, 11+ tests must pass)
- [ ] I ran `update-router.js` twice and confirmed the classify.js diff is empty the second time (idempotency)
- [ ] I dogfooded the change on my own Claude Code session for at least one prompt

## Checklist

- [ ] My code follows the [coding standards](../CONTRIBUTING.md#coding-standards)
- [ ] I have added tests for any new logic
- [ ] I have updated `CHANGELOG.md` with an entry under `[Unreleased]` if the change is user-visible
- [ ] I have updated relevant docs (`README.md`, `ARCHITECTURE.md`, `docs/*.md`, `ROADMAP.md`)
- [ ] I have used Conventional Commits for my commit messages
- [ ] I have staged files individually (no `git add -A` / `git add .`)
- [ ] No secrets, `.env*` files, or `decisions.log` committed

## Screenshots / output (if relevant)

<!-- For statusline, UI, or classifier output changes. -->

## Reviewer notes

<!-- Anything you want the reviewer to pay particular attention to. Known limitations, trade-offs, edge cases. -->
