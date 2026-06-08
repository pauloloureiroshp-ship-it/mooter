# Tweet thread — Wave 33.5 "Historic" (v1.21.1)

> Honest facts only. Spawn sandbox is REAL (proven against bubblewrap 0.6.1 via
> `mooter security spawn-test`). Cross-session + Conductor are local-first, no server.

---

**Tweet 1 — the hook**
Mooter v1.21.1 ships today.

Spawn coding agents that are sandboxed, local-first, and run by default — across every terminal you have open.

The only local-first orchestrator in 2026 that does all of it. 🐮🧵

---

**Tweet 2 — the comparison nobody can ignore**
9 dimensions. We're the only tool that does all of them:

· spawn agents (default) ✅
· local-first ✅
· cross-session $ tracking ✅
· 5h quota forecast ✅
· Pastor learning ✅
· 4-layer sandbox ✅
· intent-based UX ✅
· install wizard ✅
· multiplexer-aware ✅

Composio / Cursor / Codex / Antigravity each miss most.

---

**Tweet 3 — security is the headline, not the footnote**
CVE-2025-59528 (Antigravity sandbox escape, CVSS 10.0) is why we ship sandboxing as MANDATORY.

`mooter security spawn-test` runs a REAL escape attempt every release:
✅ ~/.ssh read blocked
✅ writes outside the worktree blocked
✅ API key never leaks to a local spawn

There is no --no-sandbox.

---

**Tweet 4 — the 2-terminal demo**
Same task, two terminals.

Left: Claude Code alone — $$$ climbs.
Right: Mooter routes T0/T1 first — statusline shows 47% saved, live.

[asciinema link]

---

**Tweet 5 — install + CTA**
One line:

  npx @mooter/cli init

Then:
  mooter spawn "fix bug in Hero.tsx"   # sandboxed, local-first
  mooter sessions watch                # every session, one screen
  mooter conductor status              # no more racing git pushes

GitHub: [link] · It's free and local. DM me if you want a 5-min walkthrough.
