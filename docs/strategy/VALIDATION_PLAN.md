# Mooter v1.0 — External Validation Plan (5 vibe coders)

> Companion to `ANTHROPIC_SHOWCASE_PLAN.md` §5. Goal: 5 real Claude Code Max/Team
> users run Mooter for 1 week, submit feedback via `mooter feedback`, and do a
> 30-min call. Output: NPS + bug list + feature asks + real savings numbers to
> take to Anthropic.

---

## 1. Who — target the 3 sub-personas (5 total)

| # | Persona | Profile | Where to find |
|---|---|---|---|
| 1 | Solo Founder | Pre/post-exit, pays own tokens, ROI-driven, Max plan | Anthropic Discord · X.com builders · IndieHackers |
| 2 | Solo Founder | Bootstrapped SaaS, daily Claude Code | YC/Founder Slacks |
| 3 | Senior IC | FAANG eng, company Max budget, side projects | X.com · ex-colleagues |
| 4 | Senior IC | YC-startup senior, Anthropic budget | YC network |
| 5 | OSS Maintainer | Popular repo, refactor-heavy, Dynamic Workflows user | GitHub · maintainer communities |

### Selection criteria (all must hold)
- **Real** Claude Code usage (not casual / not just curious).
- **Max or Team plan** — budget where optimisation matters.
- **Local-capable hardware** — RTX 30/40 series or M2/M3 Pro+ (so the local-first story lands).
- **30 min** for a follow-up call.
- Comfortable with an early, single-user, opinionated tool (set expectations).

---

## 2. Invite template (personalize the first line)

> **Subject:** Would you try my Claude Code cost router for a week?
>
> Hey {name} — I built **Mooter**, an open-source (MIT) router that lives *inside*
> Claude Code and decides per-prompt whether to use local Ollama, Haiku, Sonnet,
> or Opus — so you stop burning Opus on `sed`-tier tasks. No proxy, no extra bill;
> if it dies, Claude Code still works.
>
> I'm looking for ~5 people who actually live in Claude Code on a Max/Team plan to
> run it for a week and tell me where it's wrong. You'd:
> 1. Install via **mooter.ai/onboarding** (~5 min, detects your hardware).
> 2. Use it in your normal workflow for a week.
> 3. Drop feedback any time with `mooter feedback "…"` (anonymous, no PII).
> 4. Do a 30-min call so I can watch over your shoulder.
>
> In return: you keep the savings, you shape v1.x, and I'll credit you (or not —
> your call). Interested?
>
> — Paulo · github.com/pauloloureiroshp-ship-it/mooter

---

## 3. Onboarding the tester (what you send after they say yes)

1. **mooter.ai/onboarding** — sign in (GitHub or magic link) → hardware/persona/subscription → personalized `curl …/i/<token> | bash`.
2. "Review the script first if you like: `curl …/i/<token> | less` — it's plain shell."
3. After install: `mooter init` to confirm hardware + add provider keys.
4. "Feedback any time: `mooter feedback \"…\"` — it's anonymous (pseudonymous hash, no email)."
5. Set a calendar hold for the 30-min call at day 7.

---

## 4. Survey (send at day 6, before the call)

**Quant (1–5 unless noted):**
1. Setup friction (1 = painful → 5 = effortless).
2. Statusline usefulness — do you read it? (1–5)
3. Trust in the routing decisions (1–5).
4. Did savings feel real? (1–5) + "**Your `mooter trail` savings number after the week: $____**"
5. Performance / latency impact (1 = noticeable drag → 5 = invisible).
6. **NPS**: "How likely are you to recommend Mooter to a fellow Claude Code user?" (0–10)

**Qual (free text):**
7. One thing that made you go "oh nice".
8. One thing that annoyed you / felt wrong.
9. A decision Mooter got *wrong* (paste the prompt + what it picked vs what you'd want).
10. The one feature that would make this a daily keeper.
11. Would you keep it installed after this week? Why / why not?

---

## 5. The 30-min call (agenda)

- **0–5** — watch them run a normal task; don't coach. Note where they look / hesitate.
- **5–15** — walk their week: `mooter trail --evolution`, tier mix, any overrides they did.
- **15–25** — dig into survey Q8/Q9 (annoyances + misroutes). Get specifics.
- **25–30** — the keeper question (Q10) + "what would make you tell a friend?".

Record (with consent) or take structured notes against the metrics below.

---

## 6. Metrics to collect (per tester → aggregate)

| Metric | Source | Why |
|---|---|---|
| Cumulative savings $ | `mooter trail` / their report | Headline value proof |
| Tier distribution | statusline `last10` / dashboard | Is local actually absorbing load? |
| Misroutes (count + examples) | survey Q9 + `mooter feedback` | Classifier accuracy in the wild |
| Bugs | `mooter feedback` topic=bug + call | Fix list for polish wave |
| Feature asks | survey Q10 + feedback topic=feature | Roadmap signal |
| NPS (0–10) | survey Q6 | Single comparable number |
| Retention intent | survey Q11 | Leading indicator |
| Hardware/persona mix | `/admin` charts | Did we hit the 3 sub-personas? |

**Honesty guardrail:** report the *real* aggregate even if NPS is mediocre or savings < expected. The Anthropic story is "disciplined + honest", not "hype". A weak signal is itself a finding (refine ICP or messaging).

---

## 7. Analysis → next wave

After 5 testers:
1. **Bug triage** → a "Sprint D — post-showcase polish" PR (gated, final-reviewer).
2. **Misroute patterns** → feed `decisions.log` learnings into the classifier / backtest.
3. **Feature asks** → if LoRAs are requested → prioritise **Wave 5 D3 (Docker auto-training)**.
4. **NPS ≥ 8 from ≥3 testers** → green-light the real Anthropic showcase. Below that → iterate messaging/ICP first.

---

## 8. Logistics checklist

- [ ] Supabase migrations 006/007/008 applied (so `mooter feedback` + install tokens work).
- [ ] `/admin/feedback` reachable by you (ADMIN_EMAILS set).
- [ ] 5 invites sent (personalized).
- [ ] Calendar holds for 5 × 30-min calls (day 7 each).
- [ ] Survey form ready (Tally/Google Form mirroring §4).
- [ ] A shared notes doc (one section per tester) for the metrics in §6.
