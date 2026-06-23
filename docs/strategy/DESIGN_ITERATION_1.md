# Mooter Design — Iteration 1 (Phase 1 → Phase 1.5)

> **Como usar**: cola tudo abaixo de `=== START ===` na mesma conversa do Claude Design onde Phase 1 foi entregue. Self-contained.

---

=== START ===

# Phase 1 review + 5 additions for Phase 1.5

## Acknowledgment

Phase 1 landed beautifully. The 8 P0 surfaces on the single canvas are clean, the "Got Moo?" 168pt mark is unforgettable, the shepherd's crook icon distinct from the cow mascot is exactly the right call, and the 3-line statusline as shared primitive across hero/step-5/settings shows the discipline we asked for. Keep all of that.

Before moving to mobile responsives, Forge dashboard, and side-by-side alternates — there are 5 specific additions Paulo wants worked into the existing P0 canvas. These are not redesigns; they're new sections or enrichments that the marketing surface needs to land for the indie dev audience.

## Addition 1 — Quantization explainer (macro, 30-second read)

### Why

Mooter routes to local models (Ollama Qwen, Gemma, DeepSeek) for T0 tier. These models are quantized — that's why a 30B-parameter model fits on a 24GB GPU. Vibe coders don't need a PhD explanation, but they should leave the site understanding **why** local models are viable now.

### Where it lives

New section on landing, between `#models` and `#statusline`, named `#under-the-hood` or `#how-pastor-thinks`. Quantization is the first of two sub-sections (LoRA/DoRA is the second — see Addition 2).

### Specs

Two-column section, ~520px tall:
- Left column: 1-paragraph explainer + simple before/after visual
- Right column: technical detail card with tier mapping

### Ready-to-use copy

**Headline**: "Why your laptop can run Opus-grade models now"

**Sub-head**: "Quantization, in 30 seconds."

**Body** (left column, max 4 sentences):
> Full-precision AI models are huge. A 30-billion-parameter model in 32-bit floats weighs 120GB — too big for your GPU. Quantization compresses the model's numbers to 4-bit integers, shrinking it to 18GB while keeping ~98% of the quality. The same model now runs on your RTX 4090 instead of a data center. Mooter prefers quantized local models for T0 whenever quality stays above the bar — saving you money without trading off the answer.

**Visual (left column, below copy)**:
A simple comparison block:
```
┌──────────────────────────────────┐
│ qwen3:30b (full precision FP32)  │
│ ████████████████████  120 GB     │
│ ✗ doesn't fit your GPU            │
├──────────────────────────────────┤
│ qwen3:30b (quantized Q4_K_M)     │
│ ████  18 GB                       │
│ ✓ fits 24GB GPU · ~98% quality   │
└──────────────────────────────────┘
```

**Right column technical card**:
```
Quantization in mooter

T0 models (local, free)        Q4_K_M default
├─ qwen2.5-coder:7b            5 GB · code
├─ qwen3:30b                   18 GB · reasoning
├─ gemma3:12b                  7 GB · general
└─ deepseek-r1:7b              4 GB · math

T1–T3 models                   served by provider
                               quantization handled cloud-side

Quality delta (T0 quantized vs FP32):
  qwen2.5-coder    -1.8pp
  qwen3:30b        -1.2pp
  gemma3:12b       -2.4pp

Source: mooter benchmark, 142 prompts, blind judge
```

### Constraints

- Don't use jargon without explaining (e.g. say "Q4 integers" not "FP32 → INT4")
- Don't show parameter counts in B without contextualizing
- Keep visual contrast obvious — the "doesn't fit" vs "fits" should be the takeaway

## Addition 2 — LoRA / DoRA explainer (Adapter Forge teaser)

### Why

Wave 5 of mooter ships **Adapter Forge** — local DoRA training on the user's codebase. The selling moment is that vibe coders get specialized model performance without ever touching HuggingFace, PyTorch, or training scripts. The landing needs to plant this seed without overwhelming.

### Where it lives

Second sub-section inside `#under-the-hood`, right after Quantization. Title: "And when you want it specialized: LoRA / DoRA."

### Specs

Two-column section, ~480px tall:
- Left column: 1-paragraph explainer + diagram
- Right column: "Coming in Wave 5: Adapter Forge" preview card

### Ready-to-use copy

**Headline**: "Specialize the brain on your code — locally, overnight."

**Sub-head**: "LoRA and DoRA, in 30 seconds."

**Body** (left column):
> A 7-billion-parameter model knows a lot — but it doesn't know your codebase. Re-training from scratch would take weeks and a cluster. LoRA (Low-Rank Adaptation) lets you train a tiny "patch" — usually under 100MB — that adjusts the model toward your specific style, your conventions, your domain. DoRA is the 2024 refinement: it separates *how much* the patch moves a weight from *which direction*, which makes the adapter sharper for the same compute budget. Mooter's Wave 5 trains a DoRA r=32 adapter on your repo locally on your RTX 4090 in 3-6 hours, overnight. Activate it in your terminal. Your code never leaves your machine.

**Visual (left column)**:
A diagram showing the adapter pattern:
```
┌─ Base model (frozen, 7B params, 5GB) ─┐
│                                        │
│   ┌──────────────────────────────┐    │
│   │ LoRA adapter (your code)     │    │
│   │ r=32 · ~80MB · trained 4h    │    │
│   └──────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
         ↓
   Output specialized to your repo
```

**Right column "Coming Wave 5" card**:
```
🛠 Adapter Forge — Wave 5

Train your code's brain.
Locally. Overnight. ToS-safe.

  ✓ Self-distillation on your repo
  ✓ DoRA r=32 + Unsloth
  ✓ Qwen3-14B base
  ✓ Eval harness vs Sonnet
  ✓ Hot-swap via vLLM
  ✓ Your code never leaves your machine

  Eligibility: 30 days of mooter use + ≥200 logged decisions
  Estimated time: 3–6 hours on RTX 4090
  Estimated gain: +12pp quality on your domain prompts

  Status: in development · expected Q3 2026
```

### Constraints

- Don't oversell "AI training" — be specific that it's an adapter, not a retrain
- Make "your code never leaves your machine" prominent (privacy is the trust gate)
- Don't show this as available today — clearly mark Wave 5 / Q3 2026

## Addition 3 — Cost calculator (hardware + OS + subscriptions + plans)

### Why

The Methodology page already has a calculator but it's too abstract. Paulo wants a richer one that lets a visitor put in their **actual setup** and see savings. This is the conversion moment for skeptics — "show me my number."

### Where it lives

The interactive cost calculator on `/methodology`. Expand from the current "sub type + prompts/day + % T3" to also include hardware and OS.

### Specs

Replace current sliders with a 4-step calculator that updates live:

**Step 1 — Hardware** (radio group)
```
What's your dev machine?
  ( ) No discrete GPU (MacBook Air, basic laptop, Mac mini, Chromebook)
  ( ) 8 GB GPU       (RTX 3060, RTX 4060, M1 Pro 16GB)
  ( ) 16 GB GPU      (RTX 4070, M2 Pro 32GB, M3 Pro 36GB)
  (•) 24+ GB GPU     (RTX 4090, RTX 5090, M2/M3/M4 Max, A100)
```

**Step 2 — Operating system** (radio group with icons)
```
OS?
  ( ) macOS    (Apple Silicon recommended)
  ( ) Linux    (Ubuntu 22+ or Arch)
  (•) Windows  (WSL2 required for full features)
```

**Step 3 — Subscriptions you have** (multi-select)
```
Subscriptions:
  [x] Anthropic Claude   ( ) Free  ( ) Pro  (•) Max  ( ) Team  ( ) API only
  [x] OpenAI ChatGPT     ( ) Free  (•) Plus ( ) Pro  ( ) Codex ( ) API only
  [ ] Google Gemini      ( ) Free  ( ) Advanced ( ) Ultra
  [ ] Grok               ( ) API only
```

**Step 4 — Usage pattern** (sliders)
```
Prompts per day:     [────●──────] 80
% critical (T3):     [──●────────] 8%
```

**Output panel (right side, updates live)**:
```
Without mooter:
  ┌──────────────────────────────┐
  │ $84.30 / month               │
  │ all-Opus on every prompt     │
  └──────────────────────────────┘

With mooter:
  ┌──────────────────────────────┐
  │ $7.20 / month                │
  │                              │
  │ Saved:  $77.10 / month       │
  │         91% saved            │
  │                              │
  │ Tier distribution:           │
  │   T0 local   ████████ 62%   │
  │   T1 haiku   ██  18%        │
  │   T2 sonnet  ██  14%        │
  │   T3 opus    ▓   6%         │
  └──────────────────────────────┘

  Your stack supports:
  ✓ All local models (24GB GPU)
  ✓ Sonnet (Anthropic Max)
  ✓ GPT-4o (OpenAI Plus)
  ✓ Opus when needed (Anthropic Max)
```

### Calculator logic (for the agent's reference)

Approximate formula (use as starting point, refine in implementation):
- Without mooter: `prompts_per_day × 30 × $0.042` (avg Opus cost)
- With mooter: tier distribution depends on hardware
  - GPU 0GB: T0 disabled → fallback to T1 distribution (T1 50% / T2 35% / T3 15%)
  - GPU 8GB: T0 partial (small models only, 35%) / T1 25% / T2 25% / T3 15%
  - GPU 16GB: T0 50% / T1 22% / T2 18% / T3 10%
  - GPU 24+GB: T0 62% / T1 18% / T2 14% / T3 6%
- Cost per tier: T0 $0.000 / T1 $0.001 / T2 $0.003 / T3 $0.042

### Constraints

- Calculator MUST update on every input change (no submit button)
- Hardware step is dominant — drives the rest
- If user picks "No discrete GPU", show a warning: "T0 local tier disabled. Mooter still saves on T1/T2/T3 cloud routing."
- If user picks "API only" for all subs, show: "No web subs detected. Pricing is per-call API rate — savings still apply but baseline is higher."
- Subs section uses the brand colors of each provider (Anthropic orange, OpenAI black/white, Google blues)

## Addition 4 — Professional footer

### Why

Current site has no proper footer. Marketing surface for v1.0 needs one — for trust, navigation, legal, and reinforcing "Got Moo?" as the closing brand statement.

### Where it lives

Bottom of every public marketing page (landing, methodology, how-it-works, docs, packs browser). NOT in the logged-in `/app/*` (those have their own minimal footer).

### Specs

Three-tier footer (top to bottom):

**Tier 1 — "Got Moo?" sign-off strip** (full bleed, ~280px tall)
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              Got Moo?                               │
│              ─────────                              │
│                                                     │
│         Stop overpaying for AI.                     │
│         Start shepherding your stack.               │
│                                                     │
│       [Install mooter →]  [Sign in with GitHub]     │
│                                                     │
└─────────────────────────────────────────────────────┘
```
- Got Moo? at 96pt (smaller than hero 168pt but still dominant for the page-end)
- Same beige background as hero, with subtle pattern (very low-opacity cow ears tessellation)

**Tier 2 — link columns** (4-column grid, ~320px tall)
```
┌────────────┬────────────┬────────────┬────────────┐
│ Product    │ Resources  │ Community  │ Legal      │
│            │            │            │            │
│ Install    │ Docs       │ GitHub ↗   │ Terms      │
│ Pack       │ Methodology│ Discord ↗  │ Privacy    │
│  browser   │ Benchmark  │ Twitter ↗  │ License    │
│ Modes      │ Changelog  │ Blog       │ Security   │
│ Forge      │ API docs   │ Bluesky ↗  │ Status     │
│ Pricing    │ Status     │ Contribute │            │
│            │  page      │            │            │
└────────────┴────────────┴────────────┴────────────┘
```

**Tier 3 — bottom bar** (single row, ~80px tall)
```
[🐮 mooter logo]  © 2026 mooter.ai · MIT License · Open source
                                              ──────────────
   Made with ❤️ for vibe coders               [GH] [X] [DC]
   by Paulo Loureiro & contributors
```

### Color palette

- Tier 1: same beige as hero, ink for headline, rose for `?`
- Tier 2: ink background (#1F1612 or your existing ink), beige for column titles, muted beige for links
- Tier 3: deeper ink (#0A0807), muted text, social icons in beige

### Constraints

- Don't put telemetry pixels or analytics opt-outs in the footer prominently — the page already uses Plausible (privacy-first, no cookies). Mention briefly in the Privacy link target.
- Don't add a newsletter signup unless we have a real one (we don't — leave out)
- Don't add awards, "as featured in" badges, or fake social proof
- Social icons: GitHub (priority), Twitter/X, Bluesky, Discord (when we have one). Skip LinkedIn (not vibe coder audience).

## Addition 5 — Shepherd's crook SVG (standalone component)

### Why

Pastor needs its own visual mark. You already created one in Phase 1 (mentioned in the decisions). Paulo wants this formalized as a reusable SVG component, distinct from the cow mascot, with multiple variations.

### Specs

Create a `ShepherdCrook` component in the design system with 4 variations:

1. **Solid** (filled version) — for hero usage next to "Pastor" label
2. **Outline** (stroke only) — for inline mentions in body text
3. **Animated** (subtle sway animation, ~3s loop) — for Pastor section header
4. **With cow** (crook + small cow head silhouette below it) — for the "shepherd + herd" combined mark in Forge dashboard

### Visual reference

A traditional shepherd's crook is a tall walking stick with a curved hook at the top. The hook should be:
- Recognizable at small sizes (down to 16x16px)
- Match the cow mascot's vibe (organic, hand-drawn feel, not techy/geometric)
- Color: ink (#1F1612) primary, beige (#F2ECDF) accent for highlights

### Starting SVG (use as anchor, refine)

```svg
<svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" aria-label="Pastor — the shepherd that guides the herd">
  <!-- Staff body -->
  <path d="M30 95 L30 35" stroke="#1F1612" stroke-width="6" stroke-linecap="round"/>
  <!-- Crook (curved hook at top) -->
  <path d="M30 35 Q30 10, 18 10 Q6 10, 8 22" stroke="#1F1612" stroke-width="6" stroke-linecap="round" fill="none"/>
  <!-- Subtle wood grain detail (beige highlight) -->
  <path d="M28 90 L28 40" stroke="#F2ECDF" stroke-width="1" opacity="0.4"/>
  <!-- Small notch where crook meets staff -->
  <circle cx="30" cy="35" r="2" fill="#EDAEB0"/>
</svg>
```

### Placement across surfaces

- **Hero**: small crook next to the `?` of "Got Moo?" — subtle but present
- **#under-the-hood section heading**: outline version inline with "Pastor thinks. Mooter routes."
- **Statusline mockups**: when showing the brand mark, can pair cow ears + tiny crook as combined icon
- **Forge dashboard**: combined "crook + cow" mark as the section icon
- **Footer**: small crook in the Tier 1 sign-off, between "Got" and "Moo?"

### Constraints

- Don't over-stylize — the crook must read instantly as a shepherd's crook (not as a question mark, not as a candy cane, not as an umbrella handle)
- Don't make it bigger than the cow mascot anywhere
- Don't change its color palette — ink + beige + occasional rose accent only
- Keep aspect ratio: the staff portion should be longer than the crook diameter (vertical bias)

## Addition 6 — Comparison table (mooter vs the rest)

### Why

Indie devs evaluating mooter ask "but why not just use Continue.dev / LiteLLM / OpenRouter / just-manually-pick-Haiku?" — and they're right to ask. We need a single honest table that shows what's different. Not a tear-down. A clear feature matrix where mooter's strengths are obvious without overpromising.

### Where it lives

New section between `#under-the-hood` (Quantization + LoRA from Additions 1+2) and `#statusline`. Title: `#compare` or `#vs-the-rest`.

### Specs

Single 5-column table, ~520px tall on desktop. Sticky-scroll first column on mobile.

### Ready-to-use copy

**Headline**: "How mooter compares"

**Sub-head**: "We're not the only LLM router. We are the one built for Claude Code."

### Table content (use verbatim)

|  | mooter | Claude Code default | LiteLLM proxy | Continue.dev | OpenRouter |
|---|---|---|---|---|---|
| **Architecture** | Hook (local) | Direct API call | HTTP proxy | IDE plugin | API gateway |
| **Local models (Ollama)** | ✓ T0 native | ✗ | ✓ (configurable) | ✓ | ✗ |
| **Auto-routing by complexity** | ✓ T0–T3 axis | ✗ Opus on all | ⚠️ rule-based | ⚠️ manual | ⚠️ tags |
| **Domain routing (packs)** | ✓ 7+ Moo Packs | ✗ | ✗ | ✗ | ✗ |
| **Pre-prompt < 50ms overhead** | ✓ 14ms p50 | n/a | ~80–200ms | ~120ms | ~200ms cloud |
| **Code/prompts leave machine** | ✗ T0 stays local | ✓ all to Anthropic | ✓ through proxy | ✓ to cloud | ✓ via gateway |
| **Pack-based specialization** | ✓ Moo Packs | ✗ | ✗ | ⚠️ commands | ✗ |
| **Adapter Forge (local LoRA)** | ✓ Wave 5 | ✗ | ✗ | ✗ | ✗ |
| **Subscription-aware** | ✓ tier-detect | ✗ | ⚠️ via env | ✗ | n/a |
| **Live statusline HUD** | ✓ 3-line | ✗ | ✗ | ⚠️ side panel | ✗ |
| **Cost tracking per-prompt** | ✓ real-time | ✗ | ✓ in logs | ⚠️ session | ✓ dashboard |
| **Open source** | ✓ MIT | n/a (closed) | ✓ Apache 2 | ✓ Apache 2 | ✗ (gateway hosted) |
| **Free** | ✓ forever | depends on sub | self-host or paid | ✓ | ⚠️ markup on API |
| **Setup time** | 1 command | n/a | 30+ min (config) | install plugin | sign up + key |
| **Works without internet** | ✓ T0 local | ✗ | ✗ | ✗ | ✗ |

### Visual styling

- Mooter column: rose accent on header, beige row backgrounds
- Other columns: muted ink on header, neutral row backgrounds
- ✓ in T0 green (#3D8B5E)
- ✗ in muted ink with reduced opacity
- ⚠️ in T3 muted (warning amber-ish)
- Hover on a row: full-row highlight + 1-line caveat tooltip if applicable

### Caption below table

> Last updated 2026-05-28. Snapshot of public functionality at the time. We checked the docs. If we got something wrong, [open an issue](https://github.com/pauloloureiroshp-ship-it/mooter/issues) and we'll fix it.

### Constraints

- Don't tear down competitors. State facts. Each tool has its place.
- Don't claim what mooter doesn't do yet (Adapter Forge marked as "Wave 5" with future indicator if possible)
- Use ⚠️ for nuanced cases (LiteLLM CAN do auto-routing if you write rules — mooter ships those rules built-in)
- Link to each competitor at the column header (their official site, not a comparison hit-piece)
- Don't include Cursor, GitHub Copilot, Sourcegraph Cody — they're IDE assistants, not routers. Mention in footnote: "Cursor / Copilot / Cody are AI coding assistants, not LLM routers — mooter complements rather than replaces them."

## Addition 7 — Data & code preservation (privacy + legal compliance)

### Why

This is the trust gate. Vibe coders ship side projects, sometimes with proprietary code, sometimes regulated industries (finance, health, legal). They need to know — in a glance, not in legal jargon — that mooter doesn't exfiltrate their work, ever. We must communicate this prominently and clearly, with the legal frameworks named so anyone in EU (GDPR) or BR (LGPD) feels covered.

### Where it lives

Two surfaces:

1. **Dedicated section** on landing, between Comparison (Addition 6) and Statusline. Title: `#privacy` or `#your-code-stays-yours`
2. **Mini privacy badge** in the hero, top-right corner of the terminal mockup: a small lock icon + "your code never leaves your machine"
3. **Settings page enrichment**: in `/app/settings`, the existing opt-in matrix gets a "What we collect, what we don't" expandable card

### Specs

Two-column section, ~640px tall:

- Left column: pictogram-driven explainer (4 cards in 2×2 grid)
- Right column: legal compliance + verifiability card

### Ready-to-use copy

**Headline**: "Your code stays yours. Always."

**Sub-head**: "Mooter is a hook in your terminal, not a proxy through someone else's servers."

**Left column — 4 pictogram cards**:

```
┌─────────────────────────┐ ┌─────────────────────────┐
│ [icon: closed laptop]   │ │ [icon: lock with key]   │
│                         │ │                         │
│ T0 stays local          │ │ Prompts hashed          │
│                         │ │                         │
│ When mooter routes to   │ │ We log a SHA-256 hash   │
│ your local Ollama, your │ │ of each prompt — never  │
│ prompt and your code    │ │ the text itself. We     │
│ never touch a network.  │ │ can't reconstruct your  │
│                         │ │ work even if we wanted. │
└─────────────────────────┘ └─────────────────────────┘

┌─────────────────────────┐ ┌─────────────────────────┐
│ [icon: handshake]       │ │ [icon: open book]       │
│                         │ │                         │
│ Opt-in telemetry        │ │ Open source · audit it  │
│                         │ │                         │
│ Defaults OFF. When you  │ │ Every line of mooter is │
│ turn it on, only aggre- │ │ on GitHub under MIT.    │
│ gated stats leave (k-   │ │ Read the code. Run your │
│ anonymity ≥50 + DP      │ │ own fork. Audit any    │
│ noise). Revoke anytime. │ │ behavior, anytime.      │
└─────────────────────────┘ └─────────────────────────┘
```

**Right column — Compliance card**:

```
┌──────────────────────────────────────────────────┐
│ Compliance & data laws                           │
│                                                  │
│ ✓ GDPR-aligned (EU)                              │
│   - Data minimization · purpose limitation       │
│   - Right to access · right to erasure           │
│   - No third-country transfers (data stays in    │
│     Cloudflare EU edge for hub aggregates)       │
│                                                  │
│ ✓ LGPD-aligned (Brazil)                          │
│   - Consentimento expresso e granular            │
│   - Direito de acesso, correção, eliminação      │
│   - Hosting na borda Cloudflare US/EU            │
│                                                  │
│ ✓ CCPA-aligned (California)                      │
│   - No sale of personal information              │
│   - Right to know what's collected               │
│                                                  │
│ ✓ Privacy-first by design                        │
│   - Telemetry default OFF                        │
│   - k-anonymity threshold ≥50 before any         │
│     aggregate is published                       │
│   - Differential privacy noise (ε=1.0) added     │
│     to quality scores                            │
│                                                  │
│ ✓ Open source                                    │
│   - MIT License · github.com/.../mooter          │
│   - Reproducible builds                          │
│   - Independent audit welcome                    │
│                                                  │
│ [Read the privacy policy →]                      │
│ [Read the security policy →]                     │
└──────────────────────────────────────────────────┘
```

### Hero badge (mini surface)

In the hero's terminal mockup, top-right corner of the terminal frame, add a small chip:

```
🔒 your code stays local
```

12px font, beige background with rose border, sits inside the terminal head row next to "mooter · live routing" title.

### Settings expandable card

In `/app/settings`, near the existing opt-in matrix, add:

```
▾ What mooter collects when you opt-in to telemetry

We collect (aggregated, anonymous, k-anon ≥50):
  ✓ Prompt SHA-256 hash · NOT prompt text
  ✓ Tier chosen + cost · NOT model response
  ✓ Pack used + confidence · NOT pack contents
  ✓ Latency in ms · NOT request payload
  ✓ Optional /mooter rate feedback (thumb + sentiment of comment)
     NOT the full comment text

We never collect:
  ✗ Your code (any part, any form)
  ✗ Your prompts (text, screenshots, partial)
  ✗ Model responses
  ✗ Personal identifiers (email, IP retained ≤7 days, anonymized)
  ✗ Repository URLs or commit messages
  ✗ File paths or directory structures

You can revoke consent anytime via /mooter share OFF
or by deleting ~/.mooter/consent.json
```

### Constraints

- Don't put privacy badges/seals from random orgs (no fake "ISO certified" if we aren't)
- Don't claim GDPR "certified" — say "GDPR-aligned" (no formal certification exists)
- Don't add a dark-pattern checkbox ("I've read..." pre-checked) — opt-in is opt-in
- Link to actual policy pages (`/legal/privacy`, `/legal/security`) — those pages need to exist before launch
- The lock icon in the hero badge must be visually subtle — privacy is the default, not a feature to scream about

## Addition 8 — Hero illustration (Shepherd with Moos at work)

### Why

The hero is currently terminal-on-the-right + tagline-on-the-left. It's clean but doesn't show the *story* of what mooter does. Paulo wants a hero illustration that captures the metaphor: a shepherd (Pastor) guiding a flock of cows (Moos), each cow representing a different model tier, working in harmony. It should feel hand-drawn, organic, on-brand with the existing cow mascot — not stock-illustration-y, not AI-generated-y.

### Where it lives

Hero section, replaces the current right-column terminal mockup as the **primary visual** — OR sits **above** the terminal as a wider banner. Decide based on layout density.

Recommended: full-bleed horizontal banner ABOVE the existing 2-column hero, ~360px tall, then the existing `[tagline | terminal]` grid below. This gives the illustration room without compressing the terminal demo.

### Specs

Width: full container width (max 1200px on desktop, fluid down to mobile)
Height: 360px desktop, 240px tablet, 180px mobile
Format: SVG (preferred) — must scale without raster artifacts at all viewports

### Scene composition (illustrative brief)

A pastoral landscape, stylized, hand-drawn vibe. From left to right:

1. **Left third** — a rolling hill in the foreground with **the Shepherd standing on top**:
   - Tall, slender figure in profile (not facing camera — looking right toward the herd)
   - Holding the **shepherd's crook** (Addition 5) in one hand, pointing slightly toward the herd
   - Wearing a simple muted-rose cloak (matches `#EDAEB0`)
   - Face is not detailed — just a silhouette / very stylized form (avoid identifying a specific person/ethnicity)

2. **Center two-thirds** — a herd of **4 distinct cows**, each colored to match a tier:
   - **T0 cow** (small, energetic, grazing): green-tinted (#3D8B5E muted), labeled with a tiny "T0" tag floating above
   - **T1 cow** (compact, alert): blue-tinted (#5A9BD4 muted), tiny "T1" tag
   - **T2 cow** (medium, considered): purple-tinted (#A88BD4 muted), tiny "T2" tag
   - **T3 cow** (large, regal but slow): rose/coral-tinted (#D46A5A muted), tiny "T3" tag
   - All cows have the same MOOTER_MARK silhouette as the brand logo (ears + eyes visible) — they're variations of the same character, not different animals
   - Cows are arranged in a loose semicircle, suggesting community, not lineup

3. **Right third** — open landscape suggesting "more to come":
   - A small grove of stylized trees or a fence
   - Hint of a barn in the far distance (where Adapter Forge lives, optional Easter egg)
   - Subtle dotted path leading off-frame (the journey ahead)

4. **Sky**: gradient from beige (#F2ECDF) at the bottom to a slightly warmer tone at the top, no harsh colors. Subtle sun glow in the upper-right (low opacity).

5. **Ground**: warm beige/wheat-tone, with sparse organic dots suggesting grass.

### Style guidelines

- **Hand-drawn feel** — slightly imperfect lines, organic curves, NOT pixel-perfect or geometric
- **Limited palette** — only the existing brand colors (beige, rose, ink, tier colors). No new color introduced.
- **Flat with subtle shading** — like a children's book illustration, not photorealistic
- **No text inside the illustration** (besides the tiny T0/T1/T2/T3 tags above each cow)
- **Atmospheric** but **not busy** — should breathe, not feel cluttered

### Optional micro-animations (SVG-friendly)

If implementing as animated SVG (CSS animations OK):
- Cows gently sway (very subtle, ~3s loop)
- Shepherd's cloak edge ripples once every ~5s
- Sun glow pulses subtly (~4s)
- Total animation load should be < 5KB extra CSS

### Constraints

- Don't make the shepherd visually dominant over the cows — Pastor *guides*, doesn't *rule*. The cows should feel like the protagonists.
- Don't depict any specific country/landscape stereotype — keep it universal pastoral
- Don't add humans other than the silhouette shepherd — no developers, no faces, no diversity-poster vibes
- Don't make the cows look sad, scared, or chaotic — they're a healthy herd
- Don't include AI/tech imagery in the illustration (no screens, no robots, no neural network patterns) — the metaphor IS pastoral, deliberately
- The illustration must work in PT-PT as well — no language-specific elements
- Don't use a sunset/sunrise overly dramatic gradient — keep it sober, warm, neutral

### Alternative layouts to explore

If full-bleed banner doesn't compose well with the existing hero:
- **Option B**: illustration becomes the right column (replaces terminal), terminal moves below the hero
- **Option C**: illustration as background watermark behind the entire hero (very low opacity, ~15%)
- **Option D**: split scene — shepherd + crook on left side of hero, herd on right, terminal centered below

Recommend Option A (full-bleed banner above) as default. Try B if the layout demands compression.

## Acceptance criteria for Phase 1.5

Before declaring this iteration done:

- [ ] Quantization section (Addition 1) added between `#models` and `#statusline`
- [ ] LoRA/DoRA section (Addition 2) follows Quantization in same `#under-the-hood` block
- [ ] Both explainer sections use the ready-to-use copy verbatim (with minor polish OK)
- [ ] Quantization comparison visual shows file size + GPU fit clearly
- [ ] LoRA diagram shows the "frozen base + tiny adapter" pattern unambiguously
- [ ] Calculator on `/methodology` includes hardware + OS + subs + plans steps
- [ ] Calculator output panel shows tier distribution donut + savings $ + stack compatibility list
- [ ] Footer present on all public marketing pages with 3 tiers
- [ ] Footer Tier 1 reuses "Got Moo?" at 96pt (sub-hero scale)
- [ ] Shepherd's crook SVG exists as standalone component with 4 variations
- [ ] Crook appears in at least 3 surfaces (hero, under-the-hood, footer)
- [ ] Comparison table (Addition 6) with 5 columns + 15 feature rows, mooter column highlighted
- [ ] Each ✓/✗/⚠️ in comparison table uses correct tier color tokens
- [ ] Comparison table caption with "last updated" date + GitHub issues link
- [ ] Privacy section (Addition 7) with 4 pictogram cards + compliance card
- [ ] Compliance card lists GDPR + LGPD + CCPA explicitly with alignment language (not "certified")
- [ ] Hero terminal mockup has subtle `🔒 your code stays local` chip
- [ ] Settings page expandable card lists what we collect + never collect
- [ ] Hero illustration (Addition 8) full-bleed banner above the 2-col hero grid
- [ ] Illustration shows shepherd + 4 cows in T0–T3 tier colors + open landscape
- [ ] No new color outside existing palette in illustration
- [ ] All 4 cows in illustration use same MOOTER_MARK silhouette (variations of same character)
- [ ] No "AI-powered", "revolutionary", "game-changing" copy anywhere
- [ ] No new colors outside the existing palette (beige + rose + tier colors + ink)

## Questions to answer in the iteration deliverable

When you deliver Phase 1.5, address these:

1. How did you keep "Got Moo?" still dominant when adding a second 96pt instance in the footer? (Hierarchy preservation.)
2. How is the Quantization explainer accessible to someone who has never trained a model? (Test with a non-technical reader if possible.)
3. How does the LoRA section avoid implying training is available today (it's Wave 5)?
4. What did you do for the calculator when a user picks "No discrete GPU" + "API only" everywhere? (Edge case — show degraded savings honestly.)
5. Does the shepherd's crook compete with the cow mascot for visual weight in the hero? (It shouldn't.)
6. In the comparison table (Addition 6), where did you use ⚠️ over ✓/✗ and why? (We want nuance, not tear-downs.)
7. In the privacy section (Addition 7), how does the language stay legally accurate without lawyer-speak? (Indie devs should be able to read and trust it in under 60 seconds.)
8. In the hero illustration (Addition 8), how does the shepherd guide-but-not-dominate the cows visually? (Composition: who reads first, second, third?)

=== END ===
