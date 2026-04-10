# LANDING_MASTER_PROMPT_V3.md
## Master Prompt for Claude Code — frugal Landing Page v3

> **Use this as your primary directive when rebuilding the frugal landing page.**
> This document supersedes V1 and V2 in all cases of conflict.
> Read every section before writing a single line of code.

---

## 0. CONTEXT — What frugal actually is

frugal is a **zero-proxy LLM router for Claude Code** that runs entirely on the developer's machine. It intercepts every prompt before it reaches Claude, classifies it in <50ms using a pure regex pipeline, and routes it to the cheapest model that can handle it:

- **T0** → Ollama local (qwen2.5:3b / qwen3:30b) — **free**
- **T1** → Claude Haiku — ~$0.001/prompt
- **T2** → Claude Sonnet — ~$0.010/prompt
- **T3** → Claude Opus — ~$0.050/prompt

**Validated on 1,437 real prompts (Paulo's actual Claude Code history, zero cherry-picking):**

| Tier | Real distribution | Model |
|---|---|---|
| T0 | **83.9%** (1,205 prompts) | Ollama — free |
| T1 | 0% without key / ~5% with key | Haiku |
| T2 | **12.4%** (178 prompts) | Sonnet |
| T3 | **3.6%** (52 prompts) | Opus |

**Real savings: $12.33 → $1.21 = 90.2% reduction** (naive Opus vs mediator path, apples-to-apples).

At real scale (input + output tokens): ~$20–25/month saved per developer.

No proxy. No port. No daemon. No cloud. No API keys required for T0 (just Ollama).

---

## 1. THE REAL STATUSLINE — This is what users will see

The 🐕 shiba emoji is the frugal brand mark in the statusline. **It must appear clearly and prominently in every terminal demo on the landing page.**

### Full 7-segment statusline format (v0.9):

```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T3] ops arch 2.5s L1→L2→T3 │ qwen 84% · hku 0% · son 12% · ops 4% │ 💰 $12.80 (90%) 79% ▓▓▓▓▓▓░░ │ 💻 RTX 4090 ▓▓▓▓░░ 61% │ ●●◐○○○
```

### Segment breakdown (use this EXACTLY in the demo):

| # | Segment | Example | Notes |
|---|---|---|---|
| ① | Git | `⬆ main·a1b2` | branch + short commit hash |
| ② | Brand | `🐕 frugal v0.9` | **shiba always visible** |
| ③ | Last turn | `[T3] ops arch 2.5s L1→L2→T3` | tier, model short, category, latency, **cascade path** |
| ④ | Distribution | `qwen 84% · hku 0% · son 12% · ops 4%` | real percentages from validation |
| ⑤ | Savings + budget | `💰 $12.80 (90%) 79% ▓▓▓▓▓▓░░` | saved amount, %, budget bar |
| ⑥ | GPU | `💻 RTX 4090 ▓▓▓▓░░ 61%` | GPU name + util bar |
| ⑦ | Provider dots | `●●◐○○○` | Claude·Ollama·Gemini·GPT·Grok·Mistral |

### Provider dot meanings:
- `●` green = live, can route to this provider right now
- `◐` yellow = configured but degraded (e.g. rate limit)
- `○` dark = not configured / not installed

### Tier emojis (show these in tier table and descriptions):
- 🏠 T0 — home/local (Ollama, free)
- 🌸 T1 — light (Haiku, cheap)
- 🎵 T2 — reasoning (Sonnet, medium)
- 💎 T3 — architecture (Opus, premium)

### Cascade path examples (segment ③):
```
L1→T0          # fast-path: trivial local, classified first pass
L1→L2→T1       # second pass needed, resolved to Haiku
L1→L2→T2       # escalated to reasoning
L1→L2→T3       # architecture decision, full escalation
L1→L2→T3⚠↯🌸  # user tried to force cheaper, arbiter blocked
```

---

## 2. TERMINAL DEMO — Side-by-side animated view

The terminal demo shows "Watch the router decide" — 3 prompts, each with a different routing outcome. The demo must use the **real statusline format** after each decision.

### Demo prompt sequence (validated routing from real corpus):

```
Prompt 1 — "write a commit message for this change"
→ Router classifies: trivial_local (conf 0.97)
→ Routes to: T0 / Ollama qwen2.5:3b
→ Latency: 0.3s
→ Cost: $0.000
→ Cascade: L1→T0

Prompt 2 — "why is my useEffect firing twice in dev mode?"
→ Router classifies: reasoning_intermediate (conf 0.78)
→ Routes to: T2 / Sonnet
→ Latency: 1.8s
→ Cost: $0.010
→ Cascade: L1→L2→T2

Prompt 3 — "redesign the auth middleware for multi-tenant support"
→ Router classifies: architecture_or_critical (conf 0.92)
→ Routes to: T3 / Opus
→ Latency: 4.2s
→ Cost: $0.050
→ Cascade: L1→L2→T3
```

### Statusline after each prompt (show as monospaced terminal output):

After prompt 1:
```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T0] qwen commit 0.3s L1→T0 │ qwen 100% · hku 0% · son 0% · ops 0% │ 💰 $0.00 (0%) 12% ▓░░░░░░░ │ ●●○○○○
```

After prompt 2:
```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T2] son reasoning 1.8s L1→L2→T2 │ qwen 50% · hku 0% · son 50% · ops 0% │ 💰 $0.04 (71%) 23% ▓▓░░░░░░ │ ●●○○○○
```

After prompt 3 (end state of full demo):
```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T3] ops arch 4.2s L1→L2→T3 │ qwen 34% · hku 0% · son 33% · ops 33% │ 💰 $0.10 (58%) 45% ▓▓▓▓░░░░ │ ●●○○○○
```

### Terminal color coding for the demo:
- T0 segments: teal `#4ec9b0`
- T1 segments: blue `#569cd6`
- T2 segments: yellow `#dcdcaa`
- T3 segments: red `#f44747`
- Dim segments (cascade path, latency comparisons): opacity 0.5
- 💰 savings: green when >75%, yellow when >40%, dim otherwise

---

## 3. SETUP / INSTALL — Storytelling mode

The landing must explain the actual install process in a narrative flow, not a dry list. The story has 5 acts:

### Act 1: One command (30 seconds)
```bash
bash <(curl -fsSL https://frugal.run/install.sh)
```
What happens:
- Creates `~/.claude/` if needed
- Backs up your existing Claude config
- Installs the classifier (`classify.js`), the hook (`inject_context.js`), and the statusline
- Merges the frugal doctrine into your `~/.claude/CLAUDE.md`
- Installs 6 subagents in `~/.claude/agents/`
- Verifies Ollama + runs smoke test
- Total: ~30 seconds

**No port. No server. No Docker. No configuration file to edit.**

### Act 2: The 🐕 appears (instant)
Next time you open Claude Code, you see:
```
🐕 frugal v0.9
```
in your statusline. That's it. The router is live.

### Act 3: The router learns (first week)
Every prompt you type is classified in <50ms before it reaches Claude. After a week:
- Your `~/.claude/decisions.log` has your personal routing history
- Run `node ~/.claude/tools/router/replay.js` to see your projected savings
- The backtest runs nightly at 02:00 and tunes the classifier to your patterns

### Act 4: The statusline tells you everything (ongoing)
```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T2] son reasoning 1.8s L1→L2→T2 │ qwen 84% · son 12% · ops 4% │ 💰 $12.80 (90%) │ ●●○○○○
```
- Which model handled your last prompt and why
- The cascade path (how it decided)
- Your real-time savings total and percentage
- Which providers are live right now

### Act 5: Share the delta, not the prompts (community)
When you run `node ~/.claude/tools/router/backtest.js --export-delta`, frugal exports a fingerprint of its routing errors — not your prompts, not your code, just anonymous signals (keyword presence, prompt length bucket, tier mismatch). You share that delta. The community classifier improves. Everyone benefits.

---

## 4. VALIDATED NUMBERS — Use only these, exactly

### Core validation numbers:
| Metric | Value | Source |
|---|---|---|
| Prompts replayed | **1,437** | `replay.js` on `~/.claude/history.jsonl` |
| T0 routing | **83.9%** | Real corpus v3 |
| T2 routing | **12.4%** | Real corpus v3 |
| T3 routing | **3.6%** | Real corpus v3 |
| Low-confidence rate | **2.0%** | Real corpus v3 |
| Naive Opus baseline | **$12.33** | At $15/Mtok, ~600 tok/prompt avg |
| Mediator cost | **$1.21** | Real tier pricing |
| Savings | **$11.12 (90.2%)** | Apples-to-apples |
| Monthly per developer | **~$20–25 saved** | Scaled to monthly cadence |
| Classifier latency | **<50ms** | Pure regex, no LLM call |
| Backtest confidence | **94%** | Validated on 3 distinct projects |
| Community users | **312** | Federated learning participants |
| Test suite | **59/59 passing** | `node:test` unit tests |

### Pricing model (input to all calculations):
| Model | Price | Tier |
|---|---|---|
| Ollama local | **$0.000** | T0 |
| Claude Haiku 4.5 | **$0.80/Mtok output** | T1 |
| Claude Sonnet 4.6 | **$3.00/Mtok output** | T2 |
| Claude Opus 4.6 | **$15.00/Mtok output** | T3 |

### Frugal subscription pricing:
| Plan | Price | Who |
|---|---|---|
| Community | **Free** | Solo devs, open source |
| Pro | **$9/month** | Power users, auto-tuning, priority updates |
| Team | **$29/seat/month** | Teams, shared config, team analytics |

### The "Pay less than you save" guarantee (Pro):
- Average monthly saving (real data): ~$23/month per developer
- Pro subscription cost: $9/month
- Net gain: **+$14/month** (you keep 60% of what you save)
- Frame it as: "frugal costs $9. It saves ~$23. You net +$14."

**DO NOT invent other numbers. DO NOT extrapolate.** If you need a figure not listed here, say "contact us" or "run your own replay."

---

## 5. PAGE ARCHITECTURE — 11 Sections

### Section 1: Nav
- Logo: `🐕 frugal` (shiba emoji must be visible)
- Links: How it works · Pricing · Docs · GitHub
- CTA button: "Get early access" → `#waitlist`
- Sticky, dark background

### Section 2: Hero
**Headline (exact text):**
> Stop paying Opus prices for commit messages.

**Subheadline:**
> frugal routes your Claude Code prompts to the cheapest model that can handle them. 83.9% go free to Ollama. Only 3.6% actually need Opus.

**Sub-sub:**
> Validated on 1,437 real developer prompts. 90.2% savings. <50ms overhead. Zero proxy.

**Animated counter on load:**
- "$0.00" counting to "$12.33" (naive cost), crossed out
- "→" arrow
- "$0.00" counting to "$1.21" (frugal cost)
- Below: "your 1,437 prompts · 90.2% saved"

**Primary CTA:** "Get early access" (→ #waitlist)
**Secondary CTA:** "See how it works" (→ #how-it-works, smooth scroll)

### Section 3: The Problem (Vibe coder journey)
Narrative: "You're building something real. You're using Claude Code every day. Then the Anthropic bill lands."

Show cost breakdown table — what a typical dev week looks like if everything goes to Opus:
| Task | Prompts | At Opus | At frugal |
|---|---|---|---|
| Commit messages | 60/week | $0.54 | $0.00 |
| Bug fixes | 30/week | $0.27 | $0.027 |
| Architecture | 8/week | $0.072 | $0.072 |
| **Total/week** | **~100** | **~$0.88** | **~$0.10** |
| **Total/month** | **~400** | **~$3.50** | **~$0.40** |

Note: these numbers use the conservative (output-tokens-only) model. With input tokens and realistic conversation lengths, monthly savings scale to ~$20–25.

### Section 4: The Solution (4-tier table)
Four-column table with tier emojis:

| 🏠 T0 — Local | 🌸 T1 — Haiku | 🎵 T2 — Sonnet | 💎 T3 — Opus |
|---|---|---|---|
| Ollama qwen | Claude Haiku | Claude Sonnet | Claude Opus |
| **Free** | ~$0.001 | ~$0.010 | ~$0.050 |
| **83.9%** of prompts | ~5% (with key) | **12.4%** of prompts | **3.6%** of prompts |
| Commit messages, docstrings, regex, file reads | Translations, summaries, simple transforms | Bug investigation, root cause, planning | Architecture, refactor, critical decisions |

Below the table: "The router decides in <50ms using a pure regex pipeline. No LLM call to classify. No round-trip to the cloud."

### Section 5: Terminal Demo ("Watch the router decide")
Side-by-side animated demo with real statusline output after each prompt.
See Section 2 of this prompt for exact content.

Left panel: terminal with animated prompt appearing + router decision flash
Right panel: statusline showing real 7-segment format updating after each decision

After all 3 prompts, show the final savings state:
```
💰 $0.10 saved · 3 prompts · avg 2.1s/turn · qwen 34% · son 33% · ops 33%
```

### Section 6: URL Analyser ("Analyse your project")
Form where user enters their GitHub/project URL. Calls `/api/analyse`.
Returns: detected platform, framework, LLM signals, projected savings %, tier breakdown, suggestions.

ResultCard must show:
- Detected stack (platform + framework)
- Tier breakdown bar (T0/T1/T2/T3 percentages, coloured)
- "Your projected savings: X%" (real calc from tier breakdown)
- Suggestion cards (max 6)

### Section 7: How It Works (5-step install story)
Use the 5-act narrative from Section 3 of this prompt.
Show code blocks for each step.
Include the actual statusline output that appears after install.

**Critical: show the actual `~/.claude/` directory structure after install:**
```
~/.claude/
├── CLAUDE.md           ← mediator doctrine (frugal merged here)
├── settings.json       ← hook wired here (frugal merged here)
├── tools/router/
│   ├── classify.js     ← the brain (<50ms, pure regex)
│   ├── inject_context.js  ← UserPromptSubmit hook
│   ├── gsd-statusline.js  ← 7-segment statusline
│   ├── replay.js       ← validate your own savings
│   ├── backtest.js     ← nightly self-tuner
│   └── savings-tracker.js ← local metrics server :7821
└── agents/
    ├── model-architect.md   ← Opus: architecture, critical
    ├── model-reasoner.md    ← Sonnet: bug hunt, planning
    ├── cheap-triage.md      ← Haiku: commit msg, docstring
    ├── local-summarizer.md  ← Ollama: summarise, compare
    ├── local-transformer.md ← Ollama: format transform
    └── final-reviewer.md    ← Opus: pre-merge gate
```

### Section 8: Safety / Guardrails
**Title:** "The router never decides alone on what matters."

Two-column layout:
Left: What frugal routes automatically (trivial tasks)
Right: What always goes to Opus (no exceptions)

**Always T3 — no exceptions:**
- Any prompt touching `.env`, `secrets`, credentials
- Migrations, schema changes, `DROP TABLE`
- CI/CD config, production deploys
- `git reset --hard`, `force push`
- Anything where blast radius is irreversible

**Dual-enforced:** The HIGH_RISK pattern list lives in both `classify.js` AND `backtest.js`. The auto-learning loop can never demote a HIGH_RISK prompt — it's filtered before it can enter candidate sets.

### Section 9: Community Learning (Federated)
**Title:** "The classifier gets smarter. Your prompts never leave your machine."

Explain the delta export:
- `backtest.js --export-delta` creates an anonymized fingerprint
- Contains: keyword signals, prompt length bucket, tier mismatch, session hour
- Does NOT contain: prompt text, file paths, project names, personal data
- SHA-256 instance ID — not linkable to you

Show the delta JSON structure (from FEDERATED_LEARNING.md — already vetted).

312 community users participating. Each delta improves the shared classifier.

### Section 10: Social Proof / Metrics
Show 6 metric cards (animated counters on scroll):
1. `1,437` — real prompts validated
2. `90.2%` — savings on real corpus
3. `83.9%` — prompts routed free to Ollama
4. `<50ms` — classification latency
5. `59/59` — tests passing
6. `312` — community users

### Section 11: Pricing
Three cards:

**Community (Free)**
- The full router — classify.js, statusline, 6 subagents
- Manual backtest (`node replay.js`)
- Community classifier updates (via delta import)
- No time limit, no feature gate
- CTA: "Download free"

**Pro ($9/month)**
- Everything in Community
- Auto-tuning (nightly backtest + auto-apply)
- Priority classifier updates
- Budget guardrail (auto-downgrade tier when budget >70%)
- Access to `frugal-hub` when it launches (v1.1)
- CTA: "Get early access"

**Team ($29/seat/month)**
- Everything in Pro
- Shared team config (`frugal.config.json` in project root)
- Per-contributor analytics
- Team delta aggregation
- Dedicated support
- CTA: "Talk to us"

**Below pricing:** the success-fee frame:
> "The average Pro subscriber saves ~$23/month. frugal costs $9. You keep the other $14."
> (Based on real validation data: 90.2% savings on $25/month naive Opus spend.)

### Section 12: Waitlist / CTA
**Headline:** "Join the private beta."
**Sub:** "1,437 prompts. 90.2% saved. Zero quality loss. Now sharing access."
Email form → Supabase `waitlist` table (existing implementation).
After submit: "You're in. We'll be in touch."

### Footer
- Logo: `🐕 frugal`
- Links: Docs · ARCHITECTURE.md · CHANGELOG.md · Security
- NO direct link to the GitHub repo (private, contains the algorithm)
- Legal: "frugal is proprietary software. See NOTICE.md."
- Copyright: © 2026 Paulo Loureiro

---

## 6. TECHNICAL STACK — Do not change these

- **Next.js 15** (App Router)
- **React 19** — `reactStrictMode: false` in `next.config.ts` (required, React 19 causes animation issues in strict mode)
- **TypeScript**
- **Plain CSS** (`globals.css`) — no Tailwind, no CSS-in-JS
- **Supabase** for waitlist + URL analysis cache (existing `app/lib/supabase.ts`)
- **Vercel** deployment

### Critical crash prevention (already in codebase — do not regress):
1. `ErrorBoundary` class component wrapping all animated sections
2. `useEffect` cleanup with `cancelled` flag and `clearTimeout`/`cancelAnimationFrame`
3. `useRef<HTMLDivElement>` (not `HTMLElement`) for intersection observer
4. `toLocaleString('en-US')` (locale-explicit to avoid SSR mismatch)

### File structure (do not rename):
```
landing/
├── app/
│   ├── page.tsx          ← main page component ('use client')
│   ├── globals.css       ← all styles (no Tailwind)
│   ├── layout.tsx        ← minimal shell
│   └── api/
│       └── analyse/
│           └── route.ts  ← POST /api/analyse (already complete)
└── next.config.ts
```

---

## 7. DESIGN SYSTEM — Visual language

**Color palette:**
```css
--bg: #0a0a0a           /* near-black background */
--surface: #111111       /* card backgrounds */
--surface-2: #1a1a1a     /* elevated surfaces */
--border: #222222        /* subtle borders */
--text: #e8e8e8          /* primary text */
--text-muted: #666666    /* secondary text */
--accent: #4ec9b0        /* teal — T0/Ollama/savings */
--t1-color: #569cd6      /* blue — T1/Haiku */
--t2-color: #dcdcaa      /* yellow — T2/Sonnet */
--t3-color: #f44747      /* red — T3/Opus */
--green: #23d18b         /* success, live providers */
--yellow: #dcdcaa        /* warning, degraded */
```

**Typography:**
- Headlines: `font-size: clamp(2rem, 5vw, 4rem)`, `font-weight: 700`
- Body: `font-size: 1rem`, `line-height: 1.7`, `color: var(--text-muted)`
- Terminal/code: `font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace`

**Terminal windows:**
- Background: `#0d1117` (GitHub dark)
- Header bar with 3 traffic lights (●●● red/yellow/green)
- Window title in dim text
- Monospace font, 14px
- Borders: `1px solid #30363d`

**Cards:**
- Background: `var(--surface)`
- Border: `1px solid var(--border)`
- Border-radius: `12px`
- Hover: border lightens to `#333`, subtle shadow

**Animations:**
- Counter: `requestAnimationFrame` loop, `easeOut` curve, 1200ms
- Fade in on scroll: `IntersectionObserver`, `opacity 0→1` + `translateY 20px→0`, `600ms ease`
- Terminal typing: character-by-character, 30ms/char, cursor blink
- Section transitions: stagger children 80ms apart

---

## 8. COPY TONE — How to write

**Voice:** A senior developer talking to another developer. Honest. Direct. No hype.
**Anti-patterns:**
- ❌ "revolutionary AI-powered..."
- ❌ "supercharge your workflow"
- ❌ "10× your productivity"
- ❌ Made-up numbers or extrapolated claims
- ❌ Passive voice

**Patterns:**
- ✅ "Validated on 1,437 real prompts — yours, replayed, not benchmarks"
- ✅ "83.9% of your prompts go free to Ollama. That's not a projection — that's a replay of your history."
- ✅ "The router sees the word 'commit' and knows it's T0. Pure regex. No LLM call to classify."
- ✅ "It costs $9/month. It saves ~$23/month. You keep the rest."
- ✅ "No proxy. No port. No daemon. No configuration file to edit."

---

## 9. WHAT NOT TO DO

1. **Never link to the GitHub repo** — private, contains the algorithm. All "source" links → `#waitlist` or docs page.
2. **Never invent numbers** — use only what's in Section 4 of this prompt.
3. **Never show T1 as >5%** — the real validated data shows T1=0% without key, ~5% with key. Do not inflate.
4. **Never show the statusline without the 🐕 emoji** — that's the brand identity in the terminal.
5. **Never skip the cascade path** in segment ③ — `L1→T0`, `L1→L2→T3` etc. That's how the user understands the routing logic.
6. **Never add Tailwind** — the project uses plain CSS.
7. **Never remove the ErrorBoundary** — it prevents the crash on React 19 with animations.
8. **Never add a `reactStrictMode: true`** — it breaks animations in React 19.
9. **Never mention the private GitHub URL** `pauloloureiroshp-ship-it/frugal` — it contains IP.
10. **Never claim T3 handles architecture "better"** — frugal routes to T3 because it's the policy for irreversible decisions, not because Opus is always best. Accuracy of this framing matters for trust.

---

## 10. DEFINITION OF DONE

The rebuild is complete when:
- [ ] All 11 sections exist and render without crash (check with ErrorBoundary catches)
- [ ] The 🐕 shiba is visible in the Nav logo AND in the terminal demo statusline
- [ ] The terminal demo shows all 3 prompts with correct routing + real statusline format including cascade path
- [ ] All numbers on the page match Section 4 exactly (no invented figures)
- [ ] The setup section tells the 5-act story with real install command and real file structure
- [ ] The pricing math is visible: "$9/month · saves ~$23/month · you keep $14"
- [ ] The provider dots (●●◐○○○) are explained somewhere on the page
- [ ] No direct GitHub repo links (any that exist → `#waitlist`)
- [ ] Page loads without JS error (verify with Chrome DevTools console)
- [ ] Waitlist form submits successfully to Supabase
- [ ] `reactStrictMode: false` is preserved in `next.config.ts`

---

## 11. HOW TO USE THIS PROMPT IN CLAUDE CODE

1. Start a new Claude Code session
2. Paste this entire document as your first message (or reference it as a file)
3. Say: "Rebuild `/frugal/landing/app/page.tsx` and `/frugal/landing/app/globals.css` using the spec in `LANDING_MASTER_PROMPT_V3.md`. Follow the Definition of Done in Section 10."
4. Claude Code will read this file and build accordingly
5. After the build, verify against the Definition of Done checklist in Section 10

**Recommended verification step:**
After Claude Code finishes, open a Chrome session and navigate to `localhost:3000`. Open DevTools console. Scroll through all sections. Any ErrorBoundary catches should appear as red boxes — fix those first.

---

*This prompt was written against frugal v0.9.0 (commit `1e852f3`), validated on 1,437 real prompts from `~/.claude/history.jsonl`. All numbers are from `docs/REAL_CORPUS_VALIDATION.md` and `ROADMAP.md`. The statusline format is from `tools/router/gsd-statusline.js`. The install process is from `INSTALL.md`.*
