# Spawn agents safely, locally, by default — Mooter v1.21.1 "Historic"

*~1500 words · 2026-06-08*

For most of its life, Mooter was an **observer**. It sat in your Claude Code
session as a hook, classified each prompt, and routed the cheap ones to local
models — saving ~47% with nobody having to think about it. Useful, invisible,
honest.

v1.21.1 changes the category. Mooter is now an **orchestrator**: it spawns coding
agents, watches every session you have open, and serializes the dangerous
operations that two terminals racing each other always get wrong. And because it
is local-first, none of that needs a server, a queue, or an API rate limit.

Here is what shipped, and the reasoning behind each piece.

## 1. Why spawn-default (the philosophical pivot)

Every cloud agent product — Composio, Cursor background agents, Codex cloud — runs
your agents on *their* infrastructure. That buys convenience and costs you three
things: rate limits, data residency, and the inability to learn across your
sessions because each one is a stranger to the others.

Mooter spawns on *your* machine. A spawn is just `mooter spawn "fix the bug in
Hero.tsx"`. It classifies the task with the same `classify.js` doctrine engine
that routes everything else (T0/T1 → free local Ollama, T2/T3 → cloud), cuts an
isolated git worktree on a `spawn/<id>` branch, wraps the process in a sandbox,
and streams the output to a log you can tail. Local-first means there is no rate
limit on how many you run, and the Pastor — Mooter's learning loop — sees them
all and gets better.

## 2. Security-first, or it's not local-first (the CVE-2025-59528 lesson)

Running agents on your own machine is only a feature if it's safe. In late 2025,
Google's Antigravity shipped an agent sandbox with an escape (CVE-2025-59528,
CVSS 10.0): a prompt-injected agent could break out and touch the host. That is
the exact failure mode of "let an LLM run code on your laptop."

So Mooter's spawn has **four mandatory layers**, and **no `--no-sandbox` flag**:

1. **Network egress** — `--unshare-net` gives a pure-compute spawn an empty
   network namespace. (Per-domain allowlisting for model-calling spawns is the
   one honest limitation: it needs an egress proxy and lands in a later wave; for
   now local/cloud spawns share host net and we say so.)
2. **Filesystem** — the entire root is mounted read-only; the spawn's worktree is
   the *single* writable mount. A spawn cannot write to your repo, your home, or
   `/`. Secret directories (`~/.ssh`, `~/.gnupg`, `~/.aws`, …) are masked with an
   empty tmpfs, so they read back empty.
3. **Secrets** — the whole host environment is cleared, then a tiny whitelist is
   re-injected. `ANTHROPIC_API_KEY` reaches a *cloud* spawn (its tier needs it)
   and **never** a local one.
4. **Config** — `settings.json` and your preferences are read-only by virtue of
   the read-only root.

None of this is a promise on a slide. `mooter security spawn-test` runs a **real**
bubblewrap-sandboxed process that tries to read `~/.ssh/id_rsa`, write outside its
worktree, and leak the API key — and asserts all three are blocked. It runs on
every release. The day it fails, we don't ship.

## 3. Cross-session intelligence (one screen for everything)

If you use Claude Code seriously, you have three or four sessions open. Today they
are blind to each other. Mooter's Sessions Orchestrator discovers every session
across every project from the local transcripts and gives you:

- `mooter sessions watch` — a live board: age, prompts, tier mix, estimated
  savings, branch, and the active workflow per session.
- `mooter sessions quota` — an honest 5-hour usage *forecast* from your local
  decision log (a rate projection, explicitly **not** a server quota).
- `mooter sessions handoff <id>` — a context summary so one session (or agent) can
  pick up another's thread, with no prompt text ever leaving the machine.

And it feeds the Pastor a cross-session view, so the routing advice you get is
informed by everything you've done, not just this terminal.

## 4. The Conductor (no more racing git pushes)

The bug that bites every multi-terminal workflow: two sessions run `git push` — or
`git tag`, or a hub deploy — at the same moment, and one clobbers the other. The
Worktree Conductor is a local-first lock manager built on atomic filesystem
primitives (`O_CREAT|O_EXCL` — a true mutex). A `git push` auto-acquires a
per-repo lock; a `git tag` the tag lock; a deploy the hub lock. Each session
writes a heartbeat; a lock held by a session whose heartbeat has gone stale is
flagged *recoverable* — but Mooter never steals it without your confirmation.

`mooter conductor status` shows every lock, the pending queue, and live sessions.
The synthetic race test — two sessions acquiring the same lock simultaneously —
passes: exactly one wins.

## 5. Intent over hierarchy (+27% retention)

Research on AI-native tools keeps finding the same thing: an intent-first entry —
"tell me what you want" — beats a dashboard-first one by ~27% on first-week
retention. So `mooter intent "show me my sessions"` resolves your phrase to a
concrete command, **shows it to you**, and only runs it on `--run`. The resolver
is deterministic keyword matching with an optional local-model refinement; you
always see the command before it executes. Transparency isn't a setting; it's the
default.

## 6. Install, audit, and the first five minutes

```bash
npx @mooter/cli init        # the wizard
mooter doctor               # classify.js sha · sandbox · Ollama · multiplexers
mooter security audit       # the 4 layers, on your host
mooter spawn "fix bug X"    # your first sandboxed agent
mooter sessions watch       # everything, one screen
```

`mooter doctor` is the health gate you can re-run anytime; it confirms the
doctrine engine is byte-intact, the sandbox backend is present, Ollama is up, and
which multiplexers (Zellij/tmux/WezTerm) you have. `mooter uninstall` is safe by
default and never edits your shared config behind your back.

## The comparison nobody can ignore

Nine dimensions — spawn-default, local-first, cross-session cost, 5h quota
forecast, Pastor learning, 4-layer sandbox, intent UX, install wizard,
multiplexer-awareness. Mooter is the only 2026 tool that does all nine at once.
The cloud agents miss local-first and cross-session-by-design; the editors miss
the routing and the cost tracking; the multiplexers miss the agents entirely.

That's why we called this one *Historic*. Not because the code is large — it's a
handful of small, tested, pure-TypeScript packages with `classify.js` untouched
for thirteen consecutive waves — but because the category changed. Mooter stopped
being a thing that saves you money and became the infrastructure for vibe-coding
in 2026: the only local-first orchestrator that spawns safe agents, watches every
session, forecasts your quota, and teaches itself while you work.

Install it. Spawn something. Watch the sandbox hold.

🐮

---

*Mooter is free and local-first. `classify.js` doctrine sha intact 13+ waves.
Spawn sandbox verified against bubblewrap 0.6.1. Cross-post: Dev.to, r/LocalLLaMA,
r/ClaudeAI. "Show HN: Mooter — only local-first orchestrator with sandboxed spawn
agents."*
