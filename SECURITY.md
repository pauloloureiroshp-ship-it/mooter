# Security Policy

## Supported versions

During private beta (v0.x), only the `main` branch is supported for security patches. There are no long-lived release branches. If a security issue is reported, a fix lands on `main` and a new patch version is tagged (e.g. `v0.5.1`).

| Version | Supported |
|---|---|
| `main` (latest) | ✅ Yes |
| Tagged releases (v0.9.x) | ✅ Yes, while v0.9 is current |
| Older tagged releases (< v0.9) | ❌ No — upgrade |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email Paulo directly at **paulo.loureiro.shp@gmail.com** with the subject line:

> `frugal security — <short summary>`

Please include:

1. **A description** of the vulnerability and its impact
2. **Reproduction steps** — the simpler the better
3. **Affected files / functions** if you know them
4. **Your preferred credit** (name + GitHub handle, or "anonymous")

I will acknowledge receipt within **72 hours** and aim to provide a fix or explicit mitigation within **14 days** for anything rated medium or above.

---

## What counts as a vulnerability

frugal has a small attack surface by design (local-only, no network services exposed beyond `127.0.0.1:7821`), but the following are in scope:

### In scope

- **Command injection** via prompt content reaching a `spawn` or shell invocation
- **Path traversal** in `inject_context.js`, `update-router.js`, or the statusline bridge-file writer
- **Information disclosure** — any leak of `~/.claude/.env`, API keys, or Anthropic OAuth tokens via log files, stdout, or the tracker HTTP endpoints
- **Privilege escalation** — classifier or updater running with more privileges than the user intended
- **Regex DoS (ReDoS)** in the `HIGH_RISK` / `MED_RISK` / `TRIVIAL` pattern lists
- **TUNED block injection** — a prompt crafted to make `update-router.js` write invalid or malicious code into `classify.js`
- **Race conditions** in `update-router.js` while `classify.js` is being loaded
- **Tracker `127.0.0.1` bypass** — any way to reach `savings-tracker.js` from outside localhost

### Out of scope (not vulnerabilities)

- **Missing authentication on `127.0.0.1:7821`** — this is intentional, local-only, single-user
- **Prompts appearing in `decisions.log`** — this is documented behaviour, users are warned
- **MIT-license-permitted redistribution** — the repo is private during beta, but the license is permissive once you have legitimate access
- **Social engineering against Paulo** — out of scope for technical security, but please be a decent person anyway
- **Vulnerabilities in Claude Code itself** — report those to Anthropic directly
- **Vulnerabilities in Ollama, qwen2.5:3b, or any downstream model** — report upstream

---

## Disclosure policy

I follow **coordinated disclosure**:

1. You report privately
2. I acknowledge and assess within 72 hours
3. I develop, test, and land a fix
4. I tag a patch release
5. **90 days from acknowledgement, or 30 days after the fix ships (whichever comes first),** the issue is publicly disclosed in a GitHub Security Advisory and credited to the reporter (with consent)
6. If you disagree with the timeline, email me and we'll figure out something that works

If frugal is still in private beta when disclosure time comes, the advisory is pushed to external testers via email instead of GitHub.

---

## Security-by-design commitments

These are durable invariants that every release must preserve:

- **Classifier is pure.** `classify.js` must never make network calls.
- **Tracker is local-only.** `savings-tracker.js` must never bind to anything other than `127.0.0.1`.
- **Secrets stay in `.env`.** No secret may ever be written to `decisions.log`, `router-tuning.json`, or any other state file.
- **HIGH_RISK is hand-curated.** No automated system, including the backtest, may grow or shrink the HIGH_RISK list without human review.
- **Backups before writes.** `update-router.js` must always produce `classify.js.bak` before modifying `classify.js`.
- **Fail closed.** On any error, frugal falls back to default Claude Code behaviour — never up to a higher tier or a missing guardrail.

---

## Safe harbour for security research

If you're researching frugal in good faith:

- Test only against your own local install
- Don't attempt to access other testers' systems or data
- Don't exfiltrate anything beyond what's needed to demonstrate the vulnerability
- Give me reasonable time to respond before public disclosure

I won't pursue legal action against researchers acting in good faith under these rules. If in doubt, email first.

---

*Last updated: 2026-04-07*
