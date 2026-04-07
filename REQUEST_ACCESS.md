# Requesting access to frugal

frugal is in private beta. If you'd like to try it, here's the short version:

## The 2-line email

Send an email to **paulo@marleyliving.com** with the subject line:

> `frugal access request — <your name>`

And a body that tells me:

1. **Who you are** (your name, GitHub handle, and one sentence about what you build)
2. **Why you want it** (what's your current Claude Code / LLM workflow, and what problem are you hoping frugal solves?)
3. **Your GitHub username** so I can add you as a collaborator

That's it. No form, no interview.

## What happens next

- **Within 7 days** I reply. Either:
  - **Yes** — I add you to the repo as a collaborator, you clone, you install, you give feedback.
  - **Not yet** — I tell you why and invite you to re-apply for a later wave.
- **During private beta** I'm capping at ~20 external testers so I can actually respond when things break. If the queue is full you'll go on the waiting list.
- **When frugal goes public** (v1.0, see [ROADMAP.md](ROADMAP.md)) everyone on the waiting list gets a heads-up first.

## What I need from testers

frugal is dogfooded every day on my own projects ([cloude-home](https://github.com/pauloloureiroshp-ship-it/cloude-home) and marleyliving), but real beta feedback comes from other workflows. If I grant you access I will ask you to:

1. **Actually use it for a week.** Install it on your daily driver, not a sandbox.
2. **Report surprises.** Anything that made you go "huh, that's weird" — a misclassification, a statusline glitch, a doctrine rule that doesn't match your workflow.
3. **Don't redistribute the source.** Not while it's private. The repo is MIT-licensed, but the license only activates when you legitimately have a copy. Forking to a public repo during beta is off-limits.

## What you get

- A working daily driver that consistently saves you 80-90% on Claude Code tokens compared to naive Opus routing (validated on 1,370 real prompts, see [docs/REAL_CORPUS_VALIDATION.md](docs/REAL_CORPUS_VALIDATION.md))
- Direct access to the author (me, Paulo) via issues and email — I read and reply to everything during beta
- First access to v1.0 and any commercial offering, at the friends-and-family rate whatever that ends up being
- Credit in the v1.0 launch announcement (if you want it; easy opt-out)

## Questions that are not "how do I get access"

If you have a question about frugal *itself* (how does it work, why this architecture, does it support X, etc.), you don't need access — open an issue on the repo after you have access, or read:

- [README.md](README.md) — the pitch
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the whole thing fits together
- [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) — per-request lifecycle
- [docs/REAL_CORPUS_VALIDATION.md](docs/REAL_CORPUS_VALIDATION.md) — the 1,370-prompt benchmark
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — what frugal is *not*

If the docs don't answer your question, email me with subject `frugal question — <topic>` and I will reply.

## Commercial licensing

frugal is MIT-licensed for personal and internal use. If you want to bundle it into a commercial product, host it as a managed service, or use it across a team of >5 people, please email me before doing so — not because the MIT license prohibits it (it doesn't), but because I want to know who's using frugal commercially so I can prioritise features and eventually offer a commercial support tier. See [NOTICE.md](NOTICE.md).

---

*Thanks for the interest. frugal is a one-person project built in the open by someone who cares about doing it right. Your time is respected here.*

— Paulo Loureiro
