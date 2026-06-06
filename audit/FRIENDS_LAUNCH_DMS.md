# Friends-Launch DMs — pitch v5.2 (Paulo sends manually)

> **DRAFT — Paulo edits + sends. Claude Code never sends DMs.** Personalisation lines are starting points; tune to each person's real context before sending.
>
> **Honesty bar (do not break it):** Wave 26 shipped 2026-06-06 (`v1.15.0-pastor-live`). The CLI→hub sync loop is live and the Pastor produced a real personalized hint from the first sync. There is **no organic external adoption yet** — these DMs ARE the launch. Don't imply users/stars we don't have.

---

## Pitch v5.2 (the core story)

Mooter is a deterministic router for Claude Code: it picks the **minimum viable model** (local Ollama → Haiku → Sonnet → Opus) for each prompt, in <50ms, with **no proxy** between you and the LLM. You keep your Claude subscription; Mooter just stops you burning Opus on a button-colour change.

What's new (Wave 26, live now): `mooter sync` sends your *routing decisions* — tier counts, confidence, coarse hardware class, **never prompt text** — to a hub, and a "Pastor" reads them back and nudges your config. The first real sync already fired a personalized hint ("you're hitting T3 Opus on >25% of prompts — try `complexity_bias: T2`"). It's a learning loop, not a dashboard.

We also dogfood hard: we used Mooter to audit Mooter (372 files, 4 tiers, $2.04 vs $11.78 all-Opus = 82.7% saved) and published the unflattering numbers.

---

## The 3 DMs

### @celispj
> Hey — building Mooter, an open-source router for Claude Code that picks the cheapest model that'll actually do each task (local→Haiku→Sonnet→Opus), no proxy, you keep your sub. Just shipped the part I'm proud of: `mooter sync` sends your routing stats to a hub and a "Pastor" reads them back and suggests config tweaks — the first real sync already nudged me to drop routine work to Sonnet. You're exactly the kind of builder I'd want to break it. 5 min? `mooter init && mooter sync` → mooter.ai/dashboard. Brutal feedback welcome.

### @om_patel5
> Hey Om — I shipped something I think fits how you work. Mooter is a deterministic model-router for Claude Code: minimum-viable model per prompt, <50ms, zero proxy, keep your Claude sub. New this week: real CLI→hub sync + a Pastor that learns from your tier distribution and suggests CLAUDE.md tweaks (no prompt text ever leaves your machine — just counts + coarse hardware class). I dogfooded it auditing its own codebase: 82.7% cheaper than all-Opus, numbers published. Would love your take — `mooter init && mooter sync`, mooter.ai. What would make you actually keep it installed?

### @vibecademyai
> Hi — given what you teach, this might be useful for your audience too. Mooter is an open-source router for Claude Code that auto-picks the cheapest viable model per prompt (local Ollama → Haiku → Sonnet → Opus), no proxy, keep your subscription. Just went live with `mooter sync`: it sends only routing stats (tiers, confidence, hardware class — never prompts) to a hub, and a Pastor reads them back to personalize your setup. Real first-sync example: it caught me over-using Opus and suggested a Sonnet bias. Free + MIT: mooter.ai · github.com/pauloloureiroshp-ship-it/mooter. Happy to do a walkthrough if it'd help a lesson.

---

## Pitch variations (reuse for other contexts)

**Short (~50 words):**
> Mooter: open-source router for Claude Code. Picks the cheapest model that can actually do each prompt (local→Haiku→Sonnet→Opus), <50ms, no proxy, keep your sub. New: `mooter sync` + a Pastor that learns your tier mix and suggests config tweaks. mooter.ai

**Medium (~100 words):**
> I built Mooter — a deterministic model-router for Claude Code. It picks the minimum-viable model per prompt (local Ollama → Haiku → Sonnet → Opus) in under 50ms, sits beside Claude Code (not between you and the LLM), and you keep your subscription. This week I shipped `mooter sync`: it sends routing stats — tier counts, confidence, coarse hardware class, never prompt text — to a hub, and a "Pastor" reads them back and nudges your CLAUDE.md. The first real sync already told me I was over-using Opus. MIT, free: mooter.ai · github.com/pauloloureiroshp-ship-it/mooter.

**Long (~150 words):**
> I've been building Mooter, an open-source router for Claude Code, and just shipped the piece that makes it more than a cost trick. The base: a deterministic classifier picks the cheapest model that can actually handle each prompt — local Ollama for trivial stuff, Haiku/Sonnet/Opus as complexity rises — in <50ms, with no proxy between you and the LLM, so you keep your Claude subscription and there's no extra bill. New in Wave 26: `mooter sync` sends your *routing decisions* (tier distribution, average confidence, coarse hardware class — never any prompt text) to a hub, and a pull-based "Pastor" reads them back and suggests concrete config changes. The first real production sync caught me hitting Opus on 46% of prompts and suggested a Sonnet bias for routine work. I also used Mooter to audit its own codebase — 82.7% cheaper than all-Opus, numbers published, warts and all. mooter.ai · github.com/pauloloureiroshp-ship-it/mooter.

---

## Outreach tracking

| Handle | Sent | Replied | Tried it | Feedback / NPS | Notes |
|---|---|---|---|---|---|
| @celispj | ☐ | ☐ | ☐ | | |
| @om_patel5 | ☐ | ☐ | ☐ | | |
| @vibecademyai | ☐ | ☐ | ☐ | | |

**Gate (carries from validation plan):** NPS ≥ 8 from ≥ 3 testers → green-light the Anthropic showcase.

## Follow-up cadence

- **Day 0** — send DM.
- **Day 3** — if no reply: one soft nudge ("no pressure — even a 2-min reaction helps"). If replied but not tried: offer a 10-min live walkthrough.
- **Day 7** — if tried: ask the one question that matters — *"would you keep it installed? what's the one thing stopping you?"* Capture NPS (0–10).
- **Day 14** — close the loop: thank them, share what changed because of their feedback (people re-engage when they see impact).

**Rule:** max 2 nudges per person. No third follow-up. Respect the no.
