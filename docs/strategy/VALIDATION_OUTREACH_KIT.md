# Mooter v1.0 — Validation Outreach Kit

> Companion to `VALIDATION_PLAN.md`. **Ready-to-send templates** for the 5-vibe-coder
> validation week. EN-only (international audience). Tone: founder-pragmatic, no hype,
> honest about it being a single-user opinionated tool.
>
> **How to use this file:** find the persona, copy the template, replace `{tokens}`,
> send. Don't paraphrase the *opening line* into something generic — the specificity
> is what gets a reply.

---

## ⚠️ Prod-accuracy updates — apply before sending (2026-06-04, prod `v1.9.1`)

The templates below predate the current prod. Verified against live `mooter.ai` +
the shipped CLI (`packages/cli/src/index.ts`). Three corrections to make as you send:

1. **Entry point — don't send testers straight to `mooter.ai/onboarding`.** That URL
   is auth-gated: a logged-out visitor is redirected to `/dashboard` (the sign-in
   gate). The smooth path is: **"Go to `mooter.ai`, sign in with GitHub — you'll land
   in onboarding (~5 min, detects your hardware)."** (Post-OAuth the callback sends
   them to `/onboarding` automatically.) Replace the "Install via `mooter.ai/onboarding`"
   lines accordingly.

2. **`mooter feedback` is sign-in-gated, not anonymous.** It exists and works, but it
   requires `mooter login` first; after that it's pseudonymous (hash, no email shared).
   Reword "drop feedback any time with `mooter feedback "…"` (anonymous …)" →
   **"…(`mooter login` once, then it's pseudonymous — no email shared)."** Keep the
   "anonymous **telemetry** only if you opt in" wording — that part is accurate.

3. **Version.** Prod is `v1.9.1` (was `v1.0` when this kit was written). Update the
   title + the Tally form title ("Mooter ~~v1.0~~ → week-1 feedback").

CLI commands referenced are confirmed live: `mooter trail` ✅, `mooter forge install`
✅ (needs a `<path.gguf>` arg), `mooter sync` ✅ (currently dry-run only — no cloud
refresh backend yet), `mooter feedback` ✅ (see #2). The signed-in dark UI (onboarding/
dashboard/settings, Wave 14) is live but **only verifiable while authenticated** —
worth one logged-in pass before testers arrive (Cowork Chrome-MCP / incognito).

---

## 0. Cold-open boilerplate (DM / comment / @mention)

Use this when you don't yet have permission to email — to test interest before the full pitch. **≤ 280 chars** by design (X/Discord/Slack friendly).

```
Hey {name} — built an open-source router that sits inside Claude Code and
picks Ollama / Haiku / Sonnet / Opus per-prompt. Looking for ~5 Max-plan
users to break it for a week. Mind if I DM details?
```

**Variant for X.com replies / public threads:**

```
Working on this — open-source router inside Claude Code that picks local
Ollama vs Haiku/Sonnet/Opus per-prompt. Looking for ~5 people on Max to
stress-test for a week. github.com/pauloloureiroshp-ship-it/mooter
```

**Honesty rules for the cold open:**
- ❌ Don't claim a specific savings %. The tester's number is the only one that matters.
- ❌ Don't say "revolutionary" / "game-changing" / "10x".
- ✅ Say "open-source" + "MIT" + "Max-plan" — filters for the right ICP.
- ✅ Mention Ollama by name — signals the local-first credential up front.

---

## 1. Persona A — Solo Founder (2 testers · #1 + #2)

### Hook
"You pay for your own tokens. The Opus invoice is yours, not your CFO's."

### Where to find
Anthropic Discord (#showcase, #help-and-questions), X.com builder threads, IndieHackers, YC/Founder Slacks, Reddit r/SaaS.

### Outreach template

> **Subject:** Mind testing my Claude Code cost-router for a week?
>
> Hey {name},
>
> {one specific sentence about their project / a tweet they posted / their last
> ship — DON'T skip this; templated openers get archived. e.g. "Saw your post
> about hitting $400/mo on Opus before optimising — that's exactly the pain
> I'm building around."}
>
> Quick context: I built **Mooter**, an open-source (MIT) router that lives
> *inside* Claude Code and picks the cheapest model that's good enough for each
> prompt — local Ollama for renames/commits/explain, Haiku for tactical, Sonnet
> for reasoning, Opus only when you'd actually feel the difference. No proxy,
> no extra bill, no telemetry beyond opt-in pseudonymous aggregates. If Mooter
> dies, Claude Code keeps working.
>
> I'm looking for **5 Max-plan users to stress-test it for a week** and tell me
> where I'm wrong. You'd:
>
> 1. Install via `mooter.ai/onboarding` (~5 min, detects your hardware, picks an
>    Ollama model that fits).
> 2. Use it in your normal workflow for 7 days.
> 3. Drop bug/feature feedback any time with `mooter feedback "…"` (anonymous —
>    pseudonymous hash, no email).
> 4. 30-min call at day 7 so I can watch over your shoulder.
>
> In return: you keep the savings (whatever they end up being), you shape v1.x,
> and I'll credit you in `CONTRIBUTORS.md` if you want — or stay anonymous, your
> call.
>
> Open-source repo: github.com/pauloloureiroshp-ship-it/mooter
> Built it after selling my last company (Shipay → B3, 2025) and going back to
> writing code full-time.
>
> Interested?
>
> — Paulo

### When to use
- They've posted in the last 30 days about Claude Code costs / Opus burn / local LLMs.
- They have a public GitHub showing daily AI-assisted commits.
- They mention Max/Team plan or "$X/mo on Opus".

### When NOT to use
- They're on a Pro plan (budget pain too low — won't optimise).
- They run a closed shop with no public output (can't personalise the opener honestly).

---

## 2. Persona B — Senior IC (2 testers · #3 + #4)

### Hook
"Your employer covers Max but your side projects are on you — and Opus knows it."

### Where to find
X.com tech twitter, ex-colleagues from past roles, YC company eng channels, FAANG-leaver Discord servers.

### Outreach template

> **Subject:** Quick favour — Claude Code router beta?
>
> Hey {name},
>
> {one specific sentence — e.g. "Loved your write-up on the {their thing} —
> the bit about `git blame` archaeology with Claude lined up exactly with where
> I think a router earns its keep."}
>
> I built **Mooter**, an open-source router that sits inside Claude Code and
> picks local Ollama / Haiku / Sonnet / Opus per-prompt — based on the actual
> task type, not vibes. Open-source (MIT), no proxy, anonymous telemetry only
> if you opt in.
>
> I'm running a 1-week stress test with ~5 people on a Max/Team plan. I'd
> specifically want a senior IC's take because:
> - You'll surface the failure modes that don't show in solo-founder usage
>   (multi-repo context, monorepo refactors, prod-adjacent code).
> - You're better positioned to call BS on routing decisions that look right
>   on paper but are stupid in practice.
> - Side-project savings = real savings (your company can absorb Opus burn;
>   your own card can't).
>
> The week:
> 1. Install via `mooter.ai/onboarding` (~5 min).
> 2. Normal week of work + side project.
> 3. Bug/misroute drops via `mooter feedback "…"` (no PII).
> 4. 30 min at day 7 — I watch where the classifier gets things wrong.
>
> Repo: github.com/pauloloureiroshp-ship-it/mooter
> Backstory: post-exit founder (sold to B3 in 2025), now back to engineering
> full-time, learning by shipping.
>
> Up for it?
>
> — Paulo

### When to use
- They've shipped a side project in the last 6 months.
- They post technical depth (not influence-marketing fluff).
- They have visible IC pride — phrases like "I write code", not "I lead engineering".

### When NOT to use
- They're a Director+ where their take wouldn't be hands-on.
- They've explicitly said they only use Claude through Cursor/IDE plugins (your tool sits inside Claude Code CLI).

---

## 3. Persona C — OSS Maintainer (1 tester · #5)

### Hook
"Refactor-heavy repos hit Opus the hardest — and you'd notice the difference faster than anyone."

### Where to find
Their repo's GitHub Discussions, maintainer Discords (e.g. OpenJS, CNCF), `@maintainer` accounts on X.com, r/opensource.

### Outreach template

> **Subject:** Mooter beta — refactor-heavy OSS testers wanted
>
> Hey {name},
>
> {one specific sentence — e.g. "Big fan of {their_repo} — the {specific_feature}
> migration you led last quarter is the exact use case where a router earns
> its place."}
>
> I'm building **Mooter** — open-source (MIT) Claude Code router that picks
> local Ollama / Haiku / Sonnet / Opus per-prompt. Looking for *one* OSS
> maintainer to stress-test it for a week, because:
>
> - **Refactor sessions are the model spread**. Renames go local in 200ms; PR
>   reviews land on Sonnet; the "should we deprecate this API" call ends up on
>   Opus where it belongs. Your day-to-day exercises the whole tier ladder
>   harder than anyone else's.
> - **Dynamic Workflows fit your style**. The `mooter forge` packs let you
>   pre-register intent — e.g. "this whole session is migration X" → bias
>   toward the right tier. You'd be the first user really pushing it.
> - **Bug honesty**. OSS maintainers spot fake savings claims in 30 seconds.
>   I'd rather you find the holes than have to retract a Twitter thread later.
>
> The ask: 1 week of normal maintainership with Mooter installed, anonymous
> feedback via `mooter feedback "…"`, 30 min at day 7. I'll credit you in
> `CONTRIBUTORS.md` (or not — your call).
>
> Repo: github.com/pauloloureiroshp-ship-it/mooter
> About me: sold a payments company to B3 in 2025; spent 2026 learning
> engineering deeply with AI as a force multiplier; this is one of the things
> that came out.
>
> Game?
>
> — Paulo

### When to use
- They maintain a non-trivial repo (≥1k stars, or core-domain critical).
- They've engaged with AI-assisted dev tooling (have opinions, not just curious).
- They have local-capable hardware (RTX 30/40 or M2/M3 Pro+) — visible from their setup posts.

### When NOT to use
- Their repo is "dormant maintainer" (low merge cadence; Mooter won't be exercised).
- They've publicly trashed AI tooling — you'll waste a week on outrage rather than feedback.

---

## 4. Once they say yes — onboarding follow-up

Send within 1 hour of their reply (signals you're serious; momentum matters).

```
Awesome, thank you {name}.

The flow:

1. **Onboarding**: mooter.ai/onboarding
   - Sign in (GitHub or magic link).
   - It detects your hardware and picks an Ollama model that fits.
   - Outputs a personalised one-liner: `curl <token-url> | bash`.
   - Want to inspect first? `curl <token-url> | less` — plain shell, no obfuscation.

2. **Verify install**: `mooter init` confirms hardware + lets you paste provider keys.

3. **Use normally for the week**. Statusline tells you what tier each prompt went
   to. `mooter trail` shows cumulative tier mix + savings.

4. **Feedback any time**: `mooter feedback "<text>"`. It's pseudonymous (no email,
   no prompt text leaves your machine unless you type it into the feedback
   string yourself).

5. **Day 7 call**: 30 min, here's my calendly: {your-calendly-link}
   Pick whatever works.

If anything is broken in the first 24h, ping me — I'd rather fix it before your
day 1 than have you bounce.

— Paulo
```

**Replace `{your-calendly-link}`** with your booking page (Cal.com / Calendly / SavvyCal). If you don't have one, replace with: *"reply with 2-3 windows that work for you next {Mon-Fri date range} and I'll send a calendar invite."*

---

## 5. Day 6 reminder + survey send

Send ~24h before their day-7 call. **Subject: "Mooter wk-1 wrap — quick survey?"**

```
Hey {name},

You're at day 6 of the Mooter test — call's tomorrow.

Before then, the 5-min survey (the call dives deeper):
{survey-link-from-section-7-below}

What I most want from the survey:
- The misroute example (Q9) — even 1 paste is gold.
- Your actual `mooter trail` savings number (Q4) — don't round, don't pad.
- Your honest NPS (Q6).

If the answer to Q11 ("keep it installed?") is "no", that's the most useful
data point I'll get all week. Say so.

See you tomorrow.

— Paulo
```

---

## 6. Post-call thank-you (within 1h of the call ending)

```
Thanks for the 30 min, {name}.

What I'm taking back to fix this week:
- {bug 1 they surfaced}
- {bug 2 they surfaced}
- {misroute pattern}

What I'm adding to the v1.1 backlog (won't promise dates):
- {feature ask 1}
- {feature ask 2}

Two follow-ups:
1. Mind if I quote {specific thing they said} (anonymous OR with credit —
   your call) in the Anthropic showcase if I get to that stage?
2. Want me to keep you in the loop on v1.1 ship, or shall I stop pinging?

Either way — your week genuinely shaped the next version. Beer if our paths
cross.

— Paulo
```

---

## 7. Survey form — Tally / Google Form ready

**Form title:** *Mooter v1.0 week-1 feedback (5 min)*

**Form description:**
> Anonymous unless you tell me your handle in Q12. Quant first (Q1–Q6, all 1–5 scales
> except Q6), then 5 free-text. The number that matters most: Q4 — your real `mooter trail`
> savings after the week.

### Quant questions

| # | Question | Type | Required |
|---|---|---|---|
| Q1 | Setup friction (`mooter.ai/onboarding` + install) | Linear scale 1 (painful) → 5 (effortless) | Yes |
| Q2 | Statusline usefulness — do you read it? | Linear scale 1 (no) → 5 (constantly) | Yes |
| Q3 | Trust in routing decisions (do you second-guess?) | Linear scale 1 (constantly) → 5 (never) | Yes |
| Q4a | Did savings feel real? | Linear scale 1 (no) → 5 (clearly) | Yes |
| Q4b | Your actual `mooter trail` savings $ after the week | Short text | Yes |
| Q5 | Performance / latency impact | Linear scale 1 (noticeable drag) → 5 (invisible) | Yes |
| Q6 | NPS — recommend Mooter to a fellow Claude Code user? | Linear scale 0 → 10 | Yes |

### Qual questions

| # | Question | Type | Required |
|---|---|---|---|
| Q7 | One thing that made you go "oh nice" | Long text | Yes |
| Q8 | One thing that annoyed you / felt wrong | Long text | Yes |
| Q9 | A decision Mooter got *wrong* — paste the prompt + what it picked vs what you'd want | Long text | Optional |
| Q10 | The one feature that would make this a daily keeper | Long text | Yes |
| Q11 | Would you keep it installed after this week? Why / why not? | Long text | Yes |
| Q12 | Your handle (optional — for credit / follow-up) | Short text | Optional |

### Form settings (Tally)
- **Spam protection**: off (5 testers, you know who they are).
- **Email notifications**: on, to your email.
- **Thank-you message**: *"Got it. See you on the call. — Paulo"*
- **Allow editing after submit**: yes (lets them refine Q9 examples).

### If using Google Form instead
- Switch Q1–Q5 from "Linear scale 1–5" to "Linear scale" widget with same bounds.
- Q6 → "Linear scale 0–10".
- Don't use the "summary" view as your dashboard — export to a sheet, calculate aggregate NPS manually (sum 9-10s minus sum 0-6s, divided by total, ×100).

---

## 8. Tracking sheet structure (one row per tester)

Use a single Google Sheet `Mooter v1.0 — Validation cohort` with these columns:

| Col | Field | Source |
|---|---|---|
| A | Tester # | Manual |
| B | Persona | A / B / C |
| C | Handle | Manual |
| D | First contact date | Manual |
| E | Reply date | Manual |
| F | Install confirmed (date) | `/admin/feedback` first ping |
| G | Day 7 call date | Calendar |
| H | NPS (0–10) | Survey Q6 |
| I | Self-reported savings $ | Survey Q4b |
| J | Tier mix (local %) | `/admin` dashboard |
| K | Misroute count | Survey Q9 + `mooter feedback` count |
| L | Top bug | Call notes |
| M | Top feature ask | Survey Q10 |
| N | Retention intent | Survey Q11 (Y / N / maybe) |
| O | Quoted in showcase? (Y/N + permission) | Post-call follow-up |

**Aggregate row at bottom**:
- Mean NPS · Median savings $ · Mean local % · Total misroutes · Retention Y count.
- **Gate check**: NPS ≥ 8 from ≥ 3 testers → green-light Anthropic showcase outreach.

---

## 9. Pre-flight checklist (do these before sending the first invite)

- [ ] `mooter.ai/onboarding` works end-to-end (run yourself with a throwaway GitHub account in incognito).
- [ ] Supabase migrations 006/007/008 applied (already done · `eymtobwinevywmmlmxqa`).
- [ ] `ADMIN_EMAILS` env var includes your email → confirm `/admin/feedback` loads.
- [ ] Survey form built (Tally or Google Form) — link in clipboard.
- [ ] Calendly / Cal.com link live with 30-min slots in 5 daily windows next week.
- [ ] Tracking sheet created with the columns from §8.
- [ ] Cold-open boilerplate (§0) is ≤ 280 chars in actual character count (don't trust the editor).
- [ ] You've got 5 specific names + 5 specific opening sentences researched. No "Hi there".

---

## 10. Honest expectations

- **Reply rate**: cold outreach to AI-fluent devs is ~20-30%. Plan for sending 15-25 invites to land 5 testers.
- **Drop-off**: assume 1 of the 5 will install but ghost. Have a 6th name lined up.
- **NPS reality**: a "honest 7" from 3 testers is more useful than a "polite 9" from 5. Don't optimise for the gate; optimise for the truth.
- **Savings range**: based on the wave1-benchmark `$0.022 / $0.028 / $0.034` data points (34 prompts), expect tester self-reports of **$0.50–$5/week** depending on intensity. If numbers come back below that, the messaging needs to reframe value beyond just $.

---

**End of kit.** Send the first invite when ready; report aggregate numbers in the
post-validation Notion page so the next wave (Anthropic showcase or C.1.2 cleanup
or v1.1) is decided from data, not vibes.
