# Contributing to frugal

This document is for people who already have access to the private repo. If you don't, see [REQUEST_ACCESS.md](REQUEST_ACCESS.md) first.

---

## Before you contribute

frugal is a one-person project in private beta. That means:

- **Direction is set by Paulo.** During beta I'm keeping scope tight and opinionated. Open an issue before sinking time into a PR for a large change.
- **PRs are reviewed by one person.** Expect response within 5 days. Smaller PRs get merged faster.
- **The doctrine is sacrosanct.** Any change to `~/.claude/CLAUDE.md` or the HIGH_RISK list in `classify.js` requires explicit Paulo sign-off *before* you write code.
- **I dogfood this daily.** Breaking changes to the classifier must ship with tests and a migration story for existing `router-tuning.json` / `decisions.log`.

---

## What I welcome as a contribution

| Contribution type | Sweet spot | Likely to be merged? |
|---|---|---|
| **Bug reports** with minimal reproductions | Always | Yes, usually same week |
| **New regex patterns** with a test case and before/after stats | Small, targeted | Very likely |
| **New subagents** for specific workflows | Under 100 lines, clear purpose | Likely |
| **Doc improvements** (typos, missing examples, confusing wording) | Any size | Always |
| **New providers** (e.g. OpenAI, Mistral) as T1/T2 destinations | Requires design issue first | After design discussion |
| **Dashboard ideas** for v0.6 | Design-level | Discussion first, code after |
| **Rewriting `classify.js` in a different language** | N/A | No during beta |
| **Adding a proxy layer** | N/A | No ever |

---

## Development setup

```bash
# 1. Clone the repo (requires collaborator access)
git clone git@github.com:pauloloureiroshp-ship-it/frugal.git
cd frugal

# 2. Install into your live Claude Code (idempotent — safe to re-run)
bash install.sh

# 3. Verify the classifier works
node ~/.claude/tools/router/classify.js "test prompt"

# 4. Run the test suite
node ~/.claude/tools/router/backtest.test.js
```

You should see `11/11 pass` in <1 second. If you don't, check `decisions.log` exists and is readable, and that Node 20+ is installed.

### Running the auto-learning loop locally

```bash
# One-shot backtest + update
node ~/.claude/tools/router/backtest.js
node ~/.claude/tools/router/update-router.js

# Or via the slash command inside Claude Code
/update-router
```

After `update-router.js` runs, inspect `classify.js` — there should be exactly one `TUNED-BLOCK-START` / `TUNED-BLOCK-END` pair and the generated timestamp should be recent.

### Running on a clean fixture

To test `analyze()` without touching your real `decisions.log`:

```js
// scratch.js
const { analyze, buildTuning } = require('~/.claude/tools/router/backtest.js');
const fake = [
  { prompt_preview: 'test', prompt_len: 4, tier: 'T0', confidence: 0.8 },
  // ...
];
console.log(buildTuning(analyze(fake)));
```

---

## Coding standards

### JavaScript

- **Node 20+**, CommonJS, `'use strict';`
- **Zero npm dependencies** in `tools/router/*.js` unless absolutely necessary. The entire stack is stdlib today and that is a feature.
- **Pure functions** where possible. `analyze()`, `buildTuning()`, `signature()` are all pure. Keep them that way.
- **No `any` equivalent.** Use JSDoc for types if it helps readers.
- **No console.log left in merged code.** Use the existing logging patterns or the Pino instance if one is added.

### Style

- 2-space indent
- Single quotes for strings except when escaping requires doubles
- Trailing commas in multi-line arrays/objects
- Comments explain *why*, not *what* — the code already says what
- Comments in PT-PT are welcome if the doctrine or a user-visible string is in PT-PT; code identifiers stay in English

### Git

- Branch from `main`. Feature branches: `feat/<short-name>` or `fix/<short-name>`.
- **Selective staging**: never use `git add -A` or `git add .`. Stage files by name. No rogue config files.
- Commit messages follow Conventional Commits: `feat(router): description`, `fix(classifier): description`, `docs: description`, `test: description`, `chore: description`.
- Include a `Co-Authored-By` trailer if a human or AI pair-programmer contributed.
- **Never `--no-verify`.** If a hook fails, fix the root cause.
- **Never force-push to `main`.** To `feat/*` branches is OK before merge.

Example:

```
feat(router): add TUNED_PROMOTE_T0 runtime pass

Mirrors the TUNED_DEMOTE_T3 logic with the same high === 0 guardrail.
When the daily backtest learns that a short/low-conf pattern is always
routed to T1/T2/T3 for no reason, it now gets demoted to T0 in runtime.

Tested via backtest.test.js integration tests.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Testing

**Every classifier change must ship with a test.** This is non-negotiable. The test suite is `node:test`-based with zero dependencies — see `tools/router/backtest.test.js` for patterns.

**Minimum coverage for a PR:**

- One unit test for any new pure function
- One integration test for any new runtime path (spawn `classify.js` in a subprocess, assert output)
- Idempotency test for anything that writes to disk

Run:

```bash
node ~/.claude/tools/router/backtest.test.js
```

Expected output:

```
✔ ... (11 tests)
ℹ pass 11
ℹ fail 0
```

If you break a test, fix the test *or* the code — don't delete the test.

---

## Docs

If your change is user-visible, update:

- `README.md` if it affects the 60-second pitch
- `ARCHITECTURE.md` if it affects the technical design
- `CHANGELOG.md` with a `[Unreleased]` entry in Keep-a-Changelog format
- `ROADMAP.md` if it closes or opens a roadmap item
- The relevant `docs/*.md` if it affects the routing policy or limitations

If your change is internal-only (refactor, test, CI), skip the docs. The diff is the documentation.

---

## Pull request checklist

Before opening a PR:

- [ ] Tests added or updated, all 11+ passing
- [ ] `classify.js` still loads: `node -c tools/router/classify.js`
- [ ] `backtest.js` still runs against a real `decisions.log`
- [ ] `update-router.js` still idempotent (run it twice, diff the output — should be empty)
- [ ] No secrets, no `.env*` files, no `decisions.log` committed
- [ ] `CHANGELOG.md` has an `[Unreleased]` entry if the change is user-visible
- [ ] Commit messages follow Conventional Commits
- [ ] Your PR description answers: *what problem does this solve?* and *how should I test it?*

---

## Reporting bugs

Open an issue with the label `bug`. Include:

1. **What you did** — minimal reproduction
2. **What you expected** — intended behaviour
3. **What happened** — actual output (paste `classify.js` stdout if relevant)
4. **Your environment** — OS, Node version, Claude Code version, relevant `router-tuning.json` contents

If the bug is a misclassification, please include the exact prompt (sanitised if sensitive) and the current `classify.js` output. The faster we can reproduce it, the faster it gets fixed.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## Code of conduct

Be kind, be rigorous, don't waste each other's time. That's it. Paulo reserves the right to remove anyone from the beta who is abusive, dishonest, or trying to exfiltrate the repo.

---

*Thanks for contributing. frugal is built in public (well, private-public) because the problem it solves is universal to Claude Code users, and the solution is better with more eyes on it.*
