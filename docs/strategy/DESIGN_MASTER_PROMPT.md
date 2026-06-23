# Mooter.ai — Master Design Prompt (Post-Wave 5 Vision)

> **How to use**: paste everything between `=== START ===` and `=== END ===` into Claude Design (or any high-context design agent). This is the canonical brief for the redesign of mooter.ai's full surface — landing, auth, install, onboarding, logged-in app, dashboard, statusline reference, and CLI install moment.
>
> **Context for me (Paulo)**: this prompt reflects the state mooter.ai will be in *after* all 5 waves of Pastor ship (~Q3 2026). The current site (page.tsx, dashboard, onboarding) already has the visual DNA we want to preserve — palette, fonts, cow mascot, mood system (🐮 Moo / 🐂 CrazyMoo / 🐄 LazyMoo). The redesign is not a reset; it's a maturation. Read the current `landing/app/page.tsx` before starting to absorb the existing voice.

---

=== START ===

# Mooter.ai — Complete Design Brief

You are designing the full digital surface of **mooter.ai** for its v1.0 launch — the post-Wave 5 state. Your output will inform Figma files, then React/Tailwind implementation in Next.js 16 + shadcn/ui.

## 1. The product in one sentence

> **Mooter is the AI shepherd for Claude Code users — it routes every prompt to the right model across your local GPU, your subscriptions, and frontier APIs, so you get Opus-level results at Ollama-level cost, automatically.**

## 2. Where mooter is today vs where this design takes it

### Today (May 2026)
- A hook for Claude Code that classifies prompts and routes to T0 (local) / T1 (Haiku) / T2 (Sonnet) / T3 (Opus)
- Open-source friends-beta on GitHub (`pauloloureiroshp-ship-it/mooter`)
- ~90% cost savings validated on 1,437 community prompts
- A landing page with strong DNA: cow mascot, beige palette, terminal-first tone

### After Wave 5 (this design)
- **Pastor (Shepherd)**: the routing brain. Two axes already shipped (complexity + domain via Moo Packs), third axis (specialization via Project LoRA / Pack LoRA + DoRA r=32 quantization) shipping in Wave 5
- **Moo Packs**: domain bundles (animation-web, code-audit, diagram-systems, data-spreadsheet, prd-strategy, voice-tts, knowledge-third-brain, +community)
- **Telemetry-driven**: `mooter_event` schema feeds savings tracking, statusline, weekly digest, hub trust_score, and Project LoRA training
- **Statusline**: 3-line narrative HUD with savings + pack info + adapter state (already designed in `tools/router/statusline-multi.js`)
- **Slash commands**: full vocabulary — `/mooter init`, `/mooter why`, `/mooter status`, `/mooter rate`, `/mooter override`, `/mooter pack {list,show,search,install,publish}`, `/mooter forge {status,train,eval}`, `/mooter adapter {use,off}`, `/mooter digest`
- **Hub**: Cloudflare D1 + R2, opt-in upload with k-anonymity ≥50 and DP noise ε=1.0, trust_score for community packs
- **Quantization + LoRA/DoRA**: vibe coders get specialized local performance without ever touching ML tooling

## 3. Brand voice & taglines

### Primary tagline (hero, OG, social)
**"Got Moo?"**
A playful nod to "Got Milk?" — instantly memorable, ownable, low-effort recall. Paulo's idea. Use as the dominant signature across the surface.

### Supporting taglines (rotate by context)
| Context | Tagline |
|---|---|
| Hero alt | "The AI shepherd for your Claude Code." |
| Sub-hero | "Route smarter. Ship faster. Got Moo?" |
| OG / Twitter | "Opus quality. Ollama cost. Got Moo?" |
| Install screen | "One command. Your whole stack, herded." |
| Dashboard banner | "Your shepherd's been busy. Got savings." |
| Pack publishing | "Got a Moo Pack? Share with the herd." |
| Wave 5 / Forge | "Got a specialized brain? Forge it locally. Got Moo." |

### Tone
- **Founder-pragmatic** — terse, fact-dense, no hyperbole
- **Terminal-first but accessible** — speak to developers but never gatekeep
- **Confident, not arrogant** — show the numbers, let them speak
- **Playful in branding, serious in proof** — "Got Moo?" on the hero, p99 latency tables in the methodology

### Words to avoid
- "Revolutionary", "game-changing", "AI-powered" (everything is AI-powered now)
- "Enterprise-grade" — we're for vibe coders, not Fortune 500
- "Magic" — show the mechanism, don't hide it
- Anything that promises savings without specifying the baseline

## 4. The 12 narrative pillars (Paulo's brief, expanded)

Every screen should reinforce one or more of these. The hero alone should hit pillars 1, 6, 8, 10.

| # | Pillar | What it means | Where it lives |
|---|---|---|---|
| 1 | **Selling point razor-sharp** | The one-sentence definition (§1) must appear within the first 600px of the hero. No paragraph longer than 2 sentences above the fold. | Hero |
| 2 | **Pastor / Shepherd** | The routing engine has a name. Pastor in PT, Shepherd in EN. The cow mascot is the herd; Pastor is what guides it. Visual metaphor: a shepherd's crook icon next to "Pastor" anywhere in the UI. | Hero, How it works, Methodology |
| 3 | **Quantization + LoRA/DoRA differentiator** | Vibe coders get model specialization without ever opening HuggingFace. We do DoRA r=32 self-distillation on their codebase, locally, on their RTX 4090. Show this as **Wave 5: Adapter Forge** section with simple "Train your code's brain overnight" framing. | Adapter Forge section + Forge dashboard |
| 4 | **Perfect match hardware + software + subscriptions** | At install time, mooter probes GPU, OS, installed Ollama models, Claude/OpenAI/Google subscription tiers. Builds a personalized routing profile. Visual: a "compatibility scan" animation during `mooter init`. | Install flow + Onboarding + Settings/Profile |
| 5 | **End the skill/repo/agent overload** | "Tired of not knowing which skills, repos, agents to use?" — Moo Packs surface the right ones per domain. Show a "before/after" of choosing skills: chaos vs Pastor-curated. | Moo Packs section + Pack browser |
| 6 | **"Got Moo?" signature** | Dominant brand mark. Hero. Footer. OG. Wherever there's empty space and an opportunity to make people smile. | Everywhere |
| 7 | **Model recommendations per task** | A live, interactive matrix: "What's the best model for [task type] given [your subs/hardware]?" Lets a visitor type a prompt example and see what mooter would pick. | Hero terminal demo (already exists, polish it) + interactive "Try it" widget |
| 8 | **Local performance with subscription quality** | The promise that a 7B model + Pack LoRA + good prompt scaffold can match Sonnet on specific domains. Show actual benchmark numbers: "diagram-systems pack: qwen2.5-coder:7b + DoRA matches Sonnet at 96% quality, 0% cost". | Adapter Forge section + benchmark proof page |
| 9 | **"In a nutshell" install** | One command. One screen. Mooter does the rest. Show the install command in 40pt mono, with arrows pointing to what it scans automatically. | Install section (already exists, sharpen it) |
| 10 | **Terminal with/without mooter** | A side-by-side comparison. Left: plain Claude Code (Opus on everything, $0.84/session). Right: mooter active (T0/T1/T2/T3 mix, $0.09/session, statusline showing savings). | Hero secondary visual or dedicated "Before/After" section |
| 11 | **Savings methodology transparent** | "We don't hide the math." Page explaining: baseline = all-Opus cost; savings = (baseline − actual) / baseline; updated per prompt; tier distribution shown; community average shown. Already at `/methodology` — needs design love. | `/methodology` page |
| 12 | **For the vibe coders community** | Mooter is not for Fortune 500. It's for the indie dev with one MacBook, the student with a gaming GPU, the founder bootstrapping their AI product. Framing: "We're saving you the money you'd spend on AI so you can ship the thing that changes the world." | Community section + footer + about |

## 5. Visual identity — preserve, don't reset

### Keep (do not change)
- **Cow mascot** with visible ears (the `MooterMark` SVG in `landing/app/page.tsx`)
- **Beige primary background** (the `.beige-2` and base palette)
- **Rose/coral accent** (#EDAEB0, #E8888A) — the cow nose pink
- **Tier colors**: T0 green (#3D8B5E), T1 blue (#3D6FA8 / #5A9BD4), T2 purple (#7A5EA8 / #A88BD4), T3 red/coral (#B8523F / #D46A5A)
- **Fonts**: Space Grotesk (sans), JetBrains Mono (code/terminal)
- **Terminal-first hero** — the animated terminal demo with rotating prompts is core to the identity. Polish it, don't replace it.
- **Mood system**: 🐮 Moo · 🐂 CrazyMoo · 🐄 LazyMoo

### Evolve (refine without breaking)
- **Statusline mockup** — the current 6-row TTY in `<StatuslineSection>` is dense. Re-design as 3-line narrative (per Wave 2 Day 2 implementation): line 1 savings + pack, line 2 budgets, line 3 ctx + adapter
- **Models section** — current tier columns are good but cramped. Make each tier breathe more; add hardware match indicator (e.g. "fits your 24GB RTX 4090 ✓")
- **Modes section** (Moo/CrazyMoo/LazyMoo) — solid concept, refine the iconography (each mood = distinct cow expression, not generic emojis)
- **Hero numbers** — the current "1437 prompts, 89.9% savings" is great, add a live "now routing for N developers" counter post-W3 hub

### Add (new for v1.0)
- **Pack browser** — a gallery of available Moo Packs with thumbnails, trust_score, install count, "fit your stack" indicator
- **Forge dashboard** — Wave 5 surface: train, eval, activate Project/Pack LoRAs. Visual: progress bars during training, eval scores after, "adapter on/off" toggle
- **Digest screen** — `/mooter digest` UI equivalent for web: weekly savings, top packs, regression flags
- **Onboarding "perfect match" screen** — post-install, show the personalized routing profile mooter built: "We detected your RTX 4090, your Claude Max sub, your 8 Ollama models. Here's your starting profile."
- **Methodology** — currently text-heavy; needs interactive cost calculator with sliders (sub type, prompts/day, % T3) and live savings projection

## 6. Information architecture (sitemap)

```
mooter.ai/
├── /  (landing — marketing surface, public)
│   ├── #hero               "Got Moo?" + terminal demo + 90% claim
│   ├── #how                5-stage flow (existing, polish)
│   ├── #shepherd           NEW — Pastor as the brain, two-axis routing visual
│   ├── #packs              NEW — Moo Packs gallery preview (3 featured)
│   ├── #forge              NEW — Adapter Forge teaser (Wave 5)
│   ├── #models             tier roster with hardware match (existing, refine)
│   ├── #modes              Moo / CrazyMoo / LazyMoo (existing, refine)
│   ├── #statusline         3-line narrative HUD (NEW, replaces 6-row)
│   ├── #compare            terminal with/without mooter side-by-side
│   ├── #community          vibe coders, GitHub stars, contributors
│   └── #install            one-command install
│
├── /how-it-works/          deep technical explainer (existing)
├── /methodology/           savings math + benchmark proof (existing, redesign)
├── /docs/                  NEW — public docs (slash commands, packs, troubleshooting)
├── /packs/                 NEW — public pack browser (gallery + search)
│   └── /packs/[id]/        individual pack page (manifest, install count, reviews)
│
├── /auth/                  GitHub OAuth via Supabase (existing flow, redesign UI)
│   ├── /auth/sign-in/      existing
│   └── /auth/callback/     existing
│
├── /onboarding/            post-signup wizard (existing, redesign)
│   ├── step 1: hardware probe ("we detected your RTX 4090")
│   ├── step 2: subscription mapping
│   ├── step 3: pack recommendations (3 packs matched to your stack)
│   ├── step 4: install command (with copy + verify state)
│   └── step 5: confirmation + statusline preview
│
├── /setup/                 install-time helper (existing)
│
└── /app/                   logged-in product surface
    ├── /app/dashboard/     home: savings widget, weekly digest, last sessions
    ├── /app/packs/         your installed packs + browser
    ├── /app/forge/         NEW Wave 5 — Adapter Forge UI
    ├── /app/digest/        full weekly/monthly digest
    ├── /app/community/     hub stats, your contribution, leaderboard (opt-in)
    ├── /app/settings/      profile, opt-in toggles, statusline preview, sub config
    └── /app/admin/         (only for paulo / contributors) hub moderation
```

## 7. Screens to design (priority order)

### P0 — must ship for v1.0 launch
1. **Hero (`/`)** — new "Got Moo?" headline, polished terminal demo with Pastor info, 3-line statusline preview
2. **Install section (`/#install`)** — sharper one-command moment with auto-detect animation
3. **Auth (`/auth/sign-in`)** — clean GitHub OAuth landing
4. **Onboarding (5 steps)** — hardware probe → sub mapping → pack recs → install → confirm
5. **Dashboard home (`/app/dashboard`)** — savings widget, last 7 sessions, top packs, weekly digest preview
6. **Settings (`/app/settings`)** — opt-in matrix (telemetry, hub upload, forge), sub config, statusline preview, hardware refresh
7. **Pack browser (`/packs`)** — gallery + filter (domain, trust_score, fits your stack)
8. **Methodology (`/methodology`)** — interactive cost calculator

### P1 — Wave 3-4
9. **Pack detail (`/packs/[id]`)** — manifest viewer, install command, reviews, related packs
10. **Digest (`/app/digest`)** — weekly + monthly views, regression flags, drill-down per pack
11. **Community (`/app/community`)** — hub stats, your contribution rank, opt-in leaderboard

### P2 — Wave 5
12. **Forge dashboard (`/app/forge`)** — Project LoRA training UI, eval scores, adapter on/off
13. **Forge run detail (`/app/forge/[run]`)** — loss curves, hold-out eval results, training metadata

## 8. Hero — exact spec (most critical screen)

```
┌───────────────────────────────────────────────────────────────────┐
│ NAV: [🐮 mooter] [How] [Shepherd] [Packs] [Forge] [Install] [Sign in]│
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─────────────────────────────────┐  ┌─────────────────────────┐  │
│ │  [● Open source · MIT · Free]   │  │ ┌─────────────────────┐ │  │
│ │                                 │  │ │ mooter · live routing│ │  │
│ │  Got Moo?                       │  │ │              T2 sonnet│ │  │
│ │  ─────────                      │  │ ├─────────────────────┤ │  │
│ │  The AI shepherd for            │  │ │ $ claude "..."        │ │  │
│ │  your Claude Code.              │  │ │   ├─ classify 14ms    │ │  │
│ │                                 │  │ │   └─ route → sonnet   │ │  │
│ │  Your GPU. Your subs. Your      │  │ │             pack:     │ │  │
│ │  Ollama models. Pastor maps     │  │ │             diagram   │ │  │
│ │  them all and routes every      │  │ ├─────────────────────┤ │  │
│ │  prompt to the model that wins. │  │ │ 🐮 saved $0.31 (89%) │ │  │
│ │  Same results. Up to 90% less   │  │ │ ▓▓▓▓░░ 42% 5h        │ │  │
│ │  cost.                          │  │ │ ctx 23% · adapter ◌  │ │  │
│ │                                 │  │ └─────────────────────┘ │  │
│ │  [Install mooter →] [Sign in]   │  │                         │  │
│ │  ✓ Hook, not a proxy            │  └─────────────────────────┘  │
│ │  ✓ Runs locally                 │                               │
│ │  ✓ <50ms overhead               │                               │
│ └─────────────────────────────────┘                               │
│                                                                   │
│ ┌─ live community pulse ─────────────────────────────────────────┐│
│ │ 14,231 prompts routed · 89.9% avg saved · $184K saved · 247 devs││
│ └────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

- **"Got Moo?"** in Space Grotesk Bold 96pt (mobile 56pt), with `?` in rose (#EDAEB0)
- Right column: animated terminal that rotates through 4 prompt scenarios (already implemented, refine), with **3-line statusline at bottom** (replaces current 1-line)
- Below the fold: live community stats strip with 4 numbers (already exists, polish typography)

## 9. Onboarding — exact 5-step spec

### Step 1: Hardware probe (60s, animated)
Full-bleed loader showing terminal output as mooter probes:
```
> Scanning your machine...
✓ macOS 15.4 detected
✓ Apple M3 Max · 36GB unified
✓ Ollama running on :11434
✓ 8 local models found: qwen2.5-coder:7b, qwen3:30b, ...
```
Bottom: "Looks good. Got Moo?" + [Continue →]

### Step 2: Subscription mapping
Visual grid of provider tiles. User taps which subs they have:
- Anthropic: [Free / Pro / Max / Team / API only]
- OpenAI: [Free / Plus / Codex / API only / none]
- Google: [Free / Advanced / Ultra / API only / none]

### Step 3: Pack recommendations
3 packs matched to detected stack, each as a card:
```
┌─────────────────────────────────────┐
│ [icon] diagram-systems    [trust 98]│
│ For: ARCH discussions, system maps  │
│ Fits your stack: ✓ Qwen2.5 detected │
│ Saves ~73% vs all-Opus              │
│ [Install pack] [Skip]               │
└─────────────────────────────────────┘
```

### Step 4: Install command
Big mono block with copy button:
```
bash <(curl -fsSL https://mooter.ai/install.sh)
```
With live verification poller below: "Waiting for mooter to phone home... ●●●○○"

### Step 5: Confirmation
- Show the 3-line statusline preview rendered with their profile
- "You're all set. Open Claude Code and try a prompt. Pastor's watching."
- [Go to dashboard →]

## 10. Dashboard home (`/app/dashboard`) — exact spec

Three-column grid above, single column below.

### Hero widget (top-left, 2-col span)
```
┌─────────────────────────────────────────────────────┐
│ This week's savings                                 │
│                                                     │
│   $7.42                  ▓▓▓▓▓▓▓▓░░ 87%             │
│                          vs all-Opus                │
│                                                     │
│ ── Daily breakdown ──                               │
│ Mon ▂▄▆█▇▅▃▁  (last 7 days)                         │
│                                                     │
│ Top pack: diagram-systems · $0.42 saved · 24 turns │
└─────────────────────────────────────────────────────┘
```

### Quick stats (top-right column)
```
┌──────────────────────┐
│ Last session         │
│ $0.09 spent          │
│ T0 12 · T1 8 · T2 3  │
│ 2h ago               │
├──────────────────────┤
│ Adapter              │
│ ◌ idle               │
│ Eligible: 32 days    │
│ [Train Project LoRA] │
├──────────────────────┤
│ Plan                 │
│ Claude Max · 43/80   │
│ Resets in 4h 12m     │
└──────────────────────┘
```

### Recent sessions (full width, below)
Table with: timestamp, prompt count, top pack, savings %, cost, drill-down link

### Regression alerts (full width)
If any pack's quality dropped > 10pp vs baseline last week, show an amber banner with link to drill-down.

## 11. Forge dashboard (`/app/forge`) — Wave 5

This is the biggest *new* surface. Designs should communicate: "Training your code's brain is something you tap a button to start, not something you need a PhD for."

### Empty state (no adapter trained yet)
```
┌─────────────────────────────────────────────────────┐
│  Got a specialized brain?                           │
│                                                     │
│  Mooter can train a custom adapter on YOUR code,    │
│  locally on your RTX 4090, in 3-6 hours overnight. │
│  Your code never leaves your machine. ToS-safe.     │
│                                                     │
│  Eligibility: ✓ 247 decisions logged · ✓ 32 days   │
│  Estimated training time: 4h 12m                    │
│  Estimated quality gain vs base: +12pp (similar    │
│  domain prompts)                                    │
│                                                     │
│  [Start Project LoRA training overnight →]          │
│                                                     │
│  Or: [Try a Pack LoRA from the community ↓]         │
└─────────────────────────────────────────────────────┘
```

### Training in progress
- Loss curve (Chart.js line chart, live)
- Step counter (e.g. 234/600)
- ETA
- Background process indicator
- "You can close this — we'll email you when it's done"

### Adapter ready
- Eval scores vs base + Sonnet (3-bar comparison)
- Sample inferences (3 examples with diff highlighting where adapter improved)
- [Activate adapter] toggle
- [Diff against base] button

## 12. Statusline — design reference card

This is *not* a screen but a UI primitive. Provide a reference card in the design file showing:

### 3 states × 3 widths
- Healthy / marginal / broken
- ≥ 120 cols / 100-119 cols / < 100 cols (collapsed)

### Component breakdown
```
🟢 mooter saved $0.31 today (89%)  ·  T2 Sonnet ☑  ·  pack: diagram-systems
   ▓▓▓▓▓▓▓░░░ 42% 5h  ·  ▓▓░░░░░░░░ 18% 7d  ·  ↺ 2h14m
   ctx 23%  ·  adapter: code-audit-v0.2 ◌  ·  $0.04 turn  ·  alltime $4.21
```

Color tokens:
- Healthy savings = green #3D8B5E (matches T0)
- Tier active = matching tier color
- Pack info = rose (#EDAEB0) or muted ink
- Adapter idle = circle outline ◌, adapter active = solid ●

## 13. Methodology page — interactive

Currently text-heavy. Redesign with:

### Cost calculator (interactive)
Sliders:
- Subscription: [Free | Pro | Max | API only]
- Prompts per day: [10 — 500]
- % critical (T3): [0% — 30%]
- Local GPU: [None | 8GB | 16GB | 24GB+]

Output (updates live):
- Without mooter: $X/month
- With mooter: $Y/month
- Saved: $Z/month (NN%)
- Tier distribution prediction (donut chart)

### Baseline definition
Plain language: "We compare your actual cost to what the same prompts would have cost if all routed to Opus. That's the baseline. Lower is better."

### Live benchmark numbers
Pull from `/api/benchmark/latest`:
- 34 prompts × 3 arms (Pastor, Sonnet-only, Opus-only)
- Pre-registered design link
- Reproducibility info (seed, model versions, env_hash)

## 14. Pack browser (`/packs`) — gallery

### Layout
- Filter sidebar: domain (animation-web, code-audit, ...), trust_score (slider), hardware fit (toggle)
- Card grid 3-col on desktop, 1-col mobile

### Pack card
```
┌──────────────────────────────────┐
│ [icon] diagram-systems           │
│ trust 98 · 1,247 installs        │
│                                  │
│ ARCH discussions, system maps,   │
│ Mermaid generation, ADR drafting.│
│                                  │
│ Models: qwen2.5-coder:7b ✓       │
│ Skills: 3 · MCPs: 2 · Agents: 1  │
│                                  │
│ ▓▓▓▓▓▓▓▓░░ 87% saves vs Opus     │
│                                  │
│ [Install] [View detail]          │
└──────────────────────────────────┘
```

## 15. Design constraints

### Tech stack target
- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind v4 (no separate config — CSS-first)
- shadcn/ui for primitives
- Existing components in `landing/app/page.tsx` are valid as starting point

### Accessibility
- WCAG 2.1 AA minimum
- All interactive elements keyboard-accessible
- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text
- Focus rings visible (don't strip default browser focus without replacement)
- All cow mascot illustrations have meaningful `aria-label`s (not "cow image" — describe the action: "mooter logo, saving you money")

### Performance
- Hero LCP < 2.5s on 4G
- No layout shift (`hero-grid` is two-column on desktop, stacks on mobile — pre-allocate space)
- Animations use `transform` + `opacity` only (no `top` / `left` animation)
- Hero terminal demo paused when not in viewport

### Responsive
- Mobile-first
- Breakpoints: 640 / 768 / 1024 / 1280
- Hero collapses cleanly: tagline above, terminal below at < 1024
- Statusline preview becomes single-line at < 768 (collapsed mode)

### Dark mode
- **Not** in scope for v1.0 (current site is light-only and that's part of the identity — beige paper feel)
- Reserve `data-theme="dark"` selector slots in CSS for v1.1

## 16. Content you don't have to invent (use these verbatim)

### Hero supporting copy
"Your GPU, your subscriptions, your local models — you're already paying for a powerful AI stack. But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full environment and routes every prompt to the optimal model."

### Pastor / Shepherd intro
"Meet Pastor — the routing brain. Two axes: how complex the prompt is (T0-T3), and what domain it belongs to (Moo Packs). One axis tells us how much horsepower. The other tells us which tools, skills, and MCPs to bring to the table. Together, they pick the model that wins."

### Adapter Forge intro
"Local-first specialization. Mooter takes your repo, does self-distillation (path A, ToS-safe), trains a DoRA r=32 adapter on Qwen3-14B with Unsloth, and gives you a custom brain that knows your code. Train it overnight on your RTX 4090. Activate it in your terminal. Your code never leaves your machine."

### Methodology one-liner
"Baseline = what your prompts would cost on Opus-only. Actual = what they cost with mooter. Savings = (baseline − actual) / baseline. We log every decision so you can verify."

### Community closer
"Built for vibe coders. The indie devs, the bootstrappers, the students with one gaming GPU. We save you the money you'd spend on AI so you can ship the thing that changes the world."

## 17. What you should deliver

### Phase 1 — directional concept (3-4 days)
- One Figma file with:
  - Hero (desktop + mobile)
  - Onboarding 5 steps
  - Dashboard home
  - Statusline reference card (3 states × 3 widths)
  - Visual identity sheet (color tokens, typography scale, mascot variations)
- A 1-page summary of design decisions and any deviations from this brief

### Phase 2 — full surface (1-2 weeks after Phase 1 review)
- All P0 screens (§7) fully designed
- Component library extracted (buttons, cards, statusline parts, terminal, badges)
- shadcn/ui mapping doc — for each custom component, which shadcn primitive it extends
- Dev handoff: design tokens exported as CSS variables, ready to drop into Tailwind v4

### Phase 3 — implementation handoff (1 week after Phase 2)
- Component spec docs (per shipping screen): props, states, edge cases, responsive behavior
- Interaction notes (which elements animate, on what trigger)
- Asset export: SVGs of mascot variations, illustrations, icons not in lucide-react

## 18. Hard constraints (do not break)

- ❌ Don't change the cow mascot identity (you can refine the SVG, not replace it)
- ❌ Don't introduce a new primary color outside the existing palette (beige + rose + tier colors)
- ❌ Don't promise savings without specifying the baseline (always "vs all-Opus")
- ❌ Don't use stock photos of developers — terminal mockups + illustrations only
- ❌ Don't add gradients to text (terminal-clean aesthetic, solid colors only)
- ❌ Don't make "Got Moo?" smaller than the company name anywhere on the marketing surface
- ❌ Don't make the hero a video — animated terminal mockup only (faster, cheaper, on-brand)
- ❌ Don't strip the existing landing page tone in favor of generic SaaS copy

## 19. Soft preferences (Paulo's taste)

- Loves the current cow mascot — wants more variations (cow with shepherd's crook, cow with statusline overlay, cow with adapter halo for Wave 5)
- Loves beige + rose combo, wants it preserved
- Loves the terminal-first vibe — the right column on the hero is sacred
- Likes founder-pragmatic copy — direct, fact-dense, no fluff
- Doesn't want enterprise B2B vibes (this is for indie devs)
- Likes the Moo / CrazyMoo / LazyMoo mood system — wants visual upgrades, not concept changes

## 20. Acceptance criteria (Phase 1)

Before moving to Phase 2, the design must:
- [ ] Hero communicates §1 (one-sentence definition) within first 600px
- [ ] "Got Moo?" appears as a dominant brand mark
- [ ] Pastor/Shepherd named explicitly with associated iconography
- [ ] All 4 tier colors visible somewhere above the fold
- [ ] Statusline preview shows 3 lines with savings + pack + adapter
- [ ] Onboarding flow has 5 distinct steps with clear progress indicator
- [ ] Dashboard home shows savings + last session + adapter status in 3 zones
- [ ] No copy that violates §3 "words to avoid" or §18 hard constraints
- [ ] Mobile mockups exist for hero + onboarding step 1 + dashboard
- [ ] Accessibility annotations on focus order + color contrast for hero CTA

## 21. Questions you should answer in your design rationale

When you deliver Phase 1, address these:
1. How did you reconcile "Got Moo?" (playful) with technical credibility (90% savings, p99 latency, benchmark numbers)?
2. How is Pastor/Shepherd visually distinct from the cow mascot? (One is the brand mark, one is the engine — they should feel related but not identical.)
3. How does the onboarding "perfect match" moment feel — is it celebratory? Reassuring? Both?
4. How does the statusline degrade gracefully at terminal widths < 80 columns?
5. How do you communicate "your code never leaves your machine" visually in the Forge section?

=== END ===

---

## Notes for Paulo (not for the design agent)

### Why this brief structure
- 12 pillars from your brief, each mapped to a specific screen so nothing falls through the cracks
- "Got Moo?" elevated to dominant brand mark — your idea is the strongest single piece of identity capital we have
- Hard constraints (§18) protect the things you specifically said you love (mascot, beige+rose, terminal vibe)
- Soft preferences (§19) are your taste preferences — agent should respect but can push back with rationale

### What to do with this prompt
1. Paste between `=== START ===` and `=== END ===` into Claude Design (or Figma agent of choice)
2. Tell the agent: "Read `landing/app/page.tsx` first for current voice, then deliver Phase 1 per §17"
3. Review Phase 1 against §20 acceptance criteria — if any checkbox fails, send back with specific feedback
4. Only approve Phase 2 after Phase 1 directional concept is locked

### Sequencing with Pastor waves
| Wave | Design need |
|---|---|
| Wave 2 (current) | Reuse existing landing; statusline 3-line spec lands in code (§12 reference card valid) |
| Wave 3 (hub + opt-in) | New `/app/community/` + `/app/settings/` opt-in matrix |
| Wave 4 (v0.2.0 launch) | Full P0 ship: hero redesign, onboarding, dashboard, pack browser, methodology |
| Wave 5 (Adapter Forge) | Forge dashboard, training UI, eval results |

So Phase 1 of design can start now (parallel to Wave 2 code). Phase 2 ships before Wave 4. Phase 3 ships before Wave 5.

### Why "Got Moo?" works
- Cultural reference everyone gets ("Got Milk?" — one of the most successful ad campaigns ever, 1993-2014)
- Plays on the cow mascot you already have
- Unownable as competitor steal (any cow-themed router would feel derivative)
- Memorable, repeatable, T-shirtable
- Works at every length: T-shirt slogan, OG image, hero, footer
- Plays well with the existing mood system (Moo / CrazyMoo / LazyMoo)

### One thing I'd push back on
You said "selling point bem definido" (pillar 1) and "Got Moo?" (pillar 6). These are different jobs — pillar 1 needs to be a sentence that explains, pillar 6 needs to be a phrase that *sticks*. The brief separates them: §1 is the one-sentence definition (route across local + subs + APIs = Opus quality at Ollama cost). §3 puts "Got Moo?" as the dominant tagline. They reinforce each other but they're not the same thing. If the agent tries to make "Got Moo?" do both jobs, it'll fail at one. Push back if they try.
