# Wave 1 — Tweet draft (DRAFT — do NOT publish without Paulo's review)

> Status: **draft only**. Per PASTOR.md §10.7 constraints — no HN, no cookbook PR (those are Wave 4). This file is the X/Twitter announce text for when Paulo decides to post.

---

## Option A — concise (recommended)

```
Shipped Wave 1 of Mooter — an AI router that picks not just models,
but the right *tools* for the task (Moo Packs).

Two-axis routing: complexity × domain.
3 seed packs: animation-web, code-audit, diagram-systems.

Repo is public: github.com/pauloloureiroshp-ship-it/mooter

Built in 7 days. Wave 2 starts Monday.
```

---

## Option B — with the proof point

```
Most LLM "routers" answer one question: which model is cheap enough?

Mooter adds a second axis: which *tools* does this task need —
skills, MCP servers, the right library?

Wave 1 shipped. 20/20 recall, hook p99 3.7ms. Public now:
github.com/pauloloureiroshp-ship-it/mooter
```

---

## Thread continuation (optional, if Option A lands)

```
2/ A "Moo Pack" is a tiny YAML manifest: domain signals + the skills/MCPs
to wire up + a model floor + canonical libs + a smoke test.

classify_domain() matches your prompt → <pack-hint> tells the session
which tools to reach for. Pure regex, zero LLM cost on the hot path.
```

```
3/ Why doctrine, not a proxy? If Mooter dies, Claude Code still works —
it falls back to default. Zero blast radius. No ports, no middleman,
no extra bill.

Strategy is fully open: github.com/pauloloureiroshp-ship-it/mooter/blob/main/docs/strategy/PASTOR.md
```

---

### Pre-publish checklist (for Paulo)
- [ ] Repo confirmed Public (`gh repo view` → Public)
- [ ] README hero + Two-Axis diagram render correctly on GitHub
- [ ] PASTOR.md link resolves on `main`
- [ ] Pick Option A or B
- [ ] Post (manually — Claude does not auto-publish)
