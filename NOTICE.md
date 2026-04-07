# NOTICE

## Why is this repo private if the license is MIT?

Because **the license and the access model are different things.**

- The **[MIT license](LICENSE)** governs what you can do with the source code *once you legitimately have a copy*. Use it, modify it, redistribute it, sell it — MIT is permissive.
- The **GitHub private repo setting** governs *who can get a copy in the first place*. During private beta, access is invitation-only.

Once someone is granted access (see [REQUEST_ACCESS.md](REQUEST_ACCESS.md)), they have full MIT rights to the code they've legitimately received. They are not, however, free to re-publish the repo publicly while it's still in beta — not because the license prohibits it, but because it would break the private-beta social contract with other testers, and because I'd rather land a stable v1 before the public gets to poke at it.

---

## Intent and commercial posture

**I built frugal for myself first.** It's the daily driver for my solo-founder workflow on [cloude-home](https://github.com/pauloloureiroshp-ship-it/cloude-home) and a few other projects. Most of the design decisions are answers to problems I hit in my own Claude Code usage.

**I'm sharing it because the problem is universal.** Every Claude Code user is quietly burning Opus tokens on tasks that shouldn't cost Opus money. frugal solves that. If it helps you, great. If it helps enough people to justify a commercial tier, better.

**Possible futures, none committed:**

1. **Fully open-source at v1.0.** Make the repo public, keep MIT, accept community PRs. This is the current default plan.
2. **Dual-license (open core + commercial support).** Open-source the core, charge for custom pattern consulting, priority bug fixes, or a hosted dashboard. Common model; works if there's real demand.
3. **Business Source License (BSL 1.1).** Open for personal and small-team use, requires a commercial license for teams >N people or hosted services. Converts to Apache 2.0 after 4 years. Preserves open-source spirit while protecting against cloud vendor rehosting.
4. **Stay private forever.** Unlikely, but possible if the maintenance burden of public-facing OSS outweighs the value.

I'll decide between these based on beta feedback. If you're a tester and you have a preference, **tell me** — this is exactly the kind of decision that benefits from real users' perspectives.

---

## What you can do today (with access)

- ✅ Install and use frugal on your personal machine
- ✅ Install it on machines you admin for your employer (internal use)
- ✅ Fork it to a private repo for your own experimentation
- ✅ Modify it to fit your workflow
- ✅ Write about it publicly (blog posts, talks, screenshots)
- ✅ Send PRs back upstream (encouraged — see [CONTRIBUTING.md](CONTRIBUTING.md))

## What you should *not* do during beta

- ❌ Publish the full source to a public GitHub repo or anywhere else
- ❌ Bundle frugal into a commercial product without emailing me first
- ❌ Re-sell access to the private repo
- ❌ Exfiltrate other testers' `decisions.log` or feedback

These aren't legal restrictions — they're the social contract of the private beta. Violate them and you'll be removed from the beta. Everything else is open.

---

## Commercial use — please tell me

The MIT license does **not** require you to tell me if you're using frugal commercially. I'd still like to know.

If you or your employer is:

- Using frugal as the router for a commercial Claude Code workflow
- Bundling frugal into an internal developer tooling stack
- Interested in a support/SLA agreement
- Interested in custom pattern consulting for a specific domain
- Building a commercial product that includes frugal as a component

… please email me at **paulo@marleyliving.com** with subject `frugal commercial — <company>`. No lawyers, no NDAs needed at this stage — just a quick note so I can prioritise the features that matter to real commercial users.

---

## Trademarks and naming

- **"frugal"** (lowercase) is the name of this project. It is not a registered trademark. If another project uses the name, that's fine — the markdown `> The Claude Code router that knows when to save.` tagline is distinctive enough.
- **"Claude" and "Claude Code"** are trademarks of [Anthropic](https://anthropic.com). frugal is a third-party tool and is not endorsed by Anthropic.
- **Other provider names** (Ollama, OpenAI, Gemini, etc.) are trademarks of their respective owners. frugal integrates with them but makes no claims about affiliation.

---

## Credits

frugal is built with, and dogfooded on, Claude Code. The auto-learning loop was designed and implemented in a collaborative session between Paulo and Claude Opus 4.6 in April 2026. The 1,370-prompt validation corpus came from real production sessions, anonymised where needed.

Subagent personas (`model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer`) are inspired by the tier philosophy documented in [`docs/ROUTING_POLICY.md`](docs/ROUTING_POLICY.md).

---

*Questions about any of this? Email Paulo. This doc will be updated as the project evolves.*

— Paulo Loureiro · Lisbon · 2026
