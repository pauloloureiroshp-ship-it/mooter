# LANDING_MASTER_PROMPT_V5.md
## frugal — The Definitive Landing Page Brief

> Read every word before writing a single line of code.
> This supersedes V1–V4 entirely.

---

## THE NORTH STAR — One sentence

**frugal is the only AI router that lives inside your terminal, knows your hardware, understands your AI subscriptions, and automatically sends every prompt to the cheapest model that can handle it — without slowing you down or losing quality.**

That sentence is the product. Everything on the landing page proves it.

---

## WHO WE'RE TALKING TO

Two people read this page simultaneously. Every section must work for both.

**The vibe coder** — building something real, alone or in a small team, using Claude Code daily. Has Claude Max or pays per-token. Has a decent GPU sitting idle half the time. Gets frustrated when the AI budget runs dry mid-sprint and they have to stop building. Doesn't want to think about which model to use — they just want to ship.

**The VC / technical investor** — looking for: real problem, validated solution, defensible moat, clear monetisation with a growth flywheel. Will scan the page in 90 seconds. The numbers and the community loop are what they care about.

The page speaks in developer voice. The numbers do the VC's work automatically.

---

## NARRATIVE SPINE — What the page says, in order

1. **There's a problem:** You're paying premium model prices for tasks that don't need premium models. Your AI budget is running out on things like commit messages.
2. **You probably have the answer already:** You have hardware. You have subscriptions. You're paying for things you're not using.
3. **frugal connects the dots:** One install. It reads your hardware, checks your subscriptions, and starts routing automatically. Right model, right task, every time.
4. **See it work:** Side-by-side — without frugal vs with frugal. Same prompts, radically different costs.
5. **The statusline proves it's working:** Every prompt shows you exactly what model handled it and why.
6. **The community makes it smarter:** The classifier learns from misroutes — across every user, without ever seeing your prompts.
7. **The deal:** Free forever at the core. You only pay us when we actually save you money.

---

## SECTIONS — 9 exactly. No more, no less.

---

### S1 — NAV

Minimal. Sticky. Dark.

**Left:** `🐕 frugal` — shiba + wordmark, white on black.

**Right links:** `How it works` · `See the proof` · `Pricing` · `Get access`

No GitHub link. No docs link (nothing public yet). No version number in nav.

---

### S2 — HERO

**Layout:** Full-width, centred, black background. One idea. No decoration.

**H1 — two lines, very large (clamp 3rem→5.5rem), bold, tight tracking:**
```
The right model.
For every prompt. Automatically.
```

**Sub (one line, muted, ~1.1rem):**
```
frugal routes your AI prompts to the cheapest model that can handle them —
using your own hardware, your existing subscriptions, in under 50ms.
```

**Under the sub, a single tight row of 3 proof chips:**
```
[ ✓ Works with Claude · GPT · Gemini · Ollama ]  [ <50ms routing ]  [ No proxy. No port. No config. ]
```

**Single CTA:** `Request early access →` (scrolls to S9/waitlist)

**NO animated counters. NO hero illustration. NO gradient blobs.**
The hero loads instantly and reads in 3 seconds. That's the standard.

---

### S3 — THE PROBLEM: "Sound familiar?"

**Title:** `Sound familiar?`

Three story-beats in a horizontal row. Mobile: stacked. Each beat is a card with an icon, a short title, and 2 lines of copy.

```
💸  "My AI bill this week: $63"
    Most of it was commit messages,
    file reads, and rename operations.

⏸  "I had to stop building"
    Budget ran out Thursday.
    I had a GPU and three subscriptions doing nothing.

🤯  "I just want to ship"
    I don't want to think about
    which model to use. I just want answers.
```

**No bullet points. No headers inside the cards. Just the story.**

**Below the cards, one line of copy in slightly larger text:**
```
frugal fixes this. It's not another AI subscription.
It's the layer that makes the ones you have work smarter.
```

---

### S4 — THE SOLUTION: "What frugal actually does"

This section has two jobs: explain the intelligence AND show it's personal to you.

**Title:** `What frugal actually does`

**Three capability pillars in a row — icon + title + 2-line description:**

```
🖥  Reads your hardware
    Detects your GPU, VRAM, and which local models
    you can run free. Routes there first, always.

📋  Knows your subscriptions
    Already paying for Claude Max? GPT Plus?
    frugal factors that in — it won't duplicate cost.

⚡  Routes in <50ms
    Pure regex classifier. No LLM call to decide.
    No added latency. No round-trip to the cloud.
```

**Below the pillars, the model map — a visual architecture diagram:**

Title above diagram: `Every prompt takes the right path`

```
                    [ Your Prompt ]
                           │
                    ┌──────▼──────┐
                    │  🐕 frugal  │  ← <50ms, runs locally
                    │  classifier │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   trivial / local   reasoning needed   architecture /
   no complexity     moderate context   critical / risky
          │                │                │
          ▼                ▼                ▼
   [🏠 Ollama]      [🎵 Sonnet]       [💎 Opus]
   [or Haiku 🌸]    (or equivalent)   (or equiv.)
      FREE            ~$0.010           ~$0.050
```

Show provider logos in the bottom row. Each box should show:
- The tier emoji (🏠 🌸 🎵 💎)
- The provider logo (Anthropic, Ollama, OpenAI, Google, Mistral — see logo spec below)
- The provider name
- The approximate cost

**Copy below diagram:**
```
frugal doesn't replace your AI tools.
It makes them work as a team, automatically, in every session.
```

---

### S5 — THE DEMO: "Without frugal vs With frugal"

**Title:** `What changes when you install frugal`

This is the **de para** — side-by-side split. Left column is WITHOUT frugal, right is WITH frugal. Same three prompts. Dramatically different results.

**Layout:** Two terminal panels side by side. Left panel: `Without frugal`. Right panel: `With frugal 🐕`. Mobile: stacked, without first.

**Terminal panel style:** Dark (`#0d1117`), monospace, traffic lights in header, column title as window tab.

**WITHOUT frugal (left):**
```
$ claude

> write a commit message for this change
  ↳ Model: Claude Opus  ●  $0.050  ●  4.1s

> why is useEffect firing twice in dev mode?
  ↳ Model: Claude Opus  ●  $0.050  ●  5.8s

> redesign auth for multi-tenant support
  ↳ Model: Claude Opus  ●  $0.050  ●  6.2s

──────────────────────────────────────
  3 prompts  ●  Total: $0.150  ●  16.1s
```

**WITH frugal (right):**
```
$ claude

> write a commit message for this change
  ↳ 🏠 Ollama · qwen2.5  ●  $0.000  ●  0.3s  ✓

> why is useEffect firing twice in dev mode?
  ↳ 🎵 Sonnet  ●  $0.010  ●  1.8s  ✓

> redesign auth for multi-tenant support
  ↳ 💎 Opus  ●  $0.050  ●  4.2s  ✓

──────────────────────────────────────
  3 prompts  ●  Total: $0.060  ●  6.3s
  💰 Saved: $0.090 (60%)
```

**Below the panels, the math in large text:**
```
60% cheaper.   2.5× faster.   Same quality where it matters.
```

**Small note below:** `Quality is never traded for cost. The last prompt still went to Opus — because it needed Opus.`

**The routing is animated**: prompts appear one by one, the model badge pops in with the right tier colour, the savings counter increments. Keep it simple — typewriter effect + fade in on the result line.

---

### S6 — THE STATUSLINE: "Your terminal after install"

**Title:** `Your terminal tells you everything`

Show the real statusline as a static terminal block with annotated callouts.

**The statusline (exact format, monospace, dark terminal):**
```
⬆ main·a1b2  │  🐕 frugal v0.9  │  [T0] qwen commit 0.3s  │  qwen 84% · son 12% · ops 4%  │  💰 ~$12.80 saved (90%)  │  💻 RTX 4090 ▓▓▓▓░░ 61%  │  ●●○○○○
```

**Numbered callout labels below (no arrows needed — just numbers matching each segment):**
```
①  Git branch + commit hash
②  🐕 frugal — always visible, always there
③  Last prompt: which model, why, how fast
④  Your routing mix today (live)
⑤  Total saved this session (running)
⑥  Your GPU — frugal is running local models here
⑦  Provider status: Claude · Ollama · Gemini · GPT · Grok · Mistral
    ●  live   ◐  degraded   ○  not configured
```

**Below the callouts, one line:**
```
Install once. The statusline appears automatically in every Claude Code session.
```

---

### S7 — THE PROOF: "Validated. Reproducible. Yours."

**Title:** `The proof isn't ours. It's yours.`

**Layout:** Two columns.

**Left column (what was validated):**

Large stylised metric block:
```
90%
cost reduction

on real developer prompts.
Not benchmarks. Not demos.
Real months of actual Claude Code usage,
replayed through the classifier.
```

Below it, three small proof chips:
```
[ 83% routed free to Ollama ]
[ Only 4% actually needed Opus ]
[ <50ms to classify every prompt ]
```

**Right column (how you validate yours):**

Terminal block:
```bash
# After installing frugal, run:
node ~/.claude/tools/router/replay.js

# Output:
T0 (free)   ████████████████  78%
T2 (Sonnet) ████░░░░░░░░░░░░  18%
T3 (Opus)   █░░░░░░░░░░░░░░░   4%

Projected savings: 87% ($18.40/month)
Run time: 12 seconds
```

**Below both columns, one line:**
```
We don't ask you to trust our numbers.
We give you the tool to run yours in 12 seconds.
```

---

### S8 — THE COMMUNITY LOOP: "Gets smarter with every user"

**Title:** `The classifier gets smarter. Your prompts never leave your machine.`

**Subtitle:** `This is how frugal builds a moat — without a data centre.`

**Visual — a simple 3-node horizontal flow:**

```
[ Your machine ]           [ delta: fingerprint only ]           [ Community ]
  misroute detected    ──────────────────────────────▶   shared classifier
  backtest runs                                            gets smarter
  export optional              No prompts.                for everyone
                               No code.
                               No paths.
                               Ever.
```

**Copy below the diagram:**
```
When frugal gets a routing decision wrong, it notices.
Every night, backtest.js finds the misroutes and learns from them.

You can export a delta — a privacy-preserving fingerprint
of where the classifier was wrong. Keyword signals. Prompt length.
Tier mismatch. Nothing that can be reversed to your code.

That delta feeds a shared classifier that gets better for everyone.
The more developers contribute, the more accurate frugal becomes
across languages, frameworks, hardware configs, and coding styles.
```

**Privacy callout card (distinct background, like a blockquote):**
```
🔒  A delta contains:
    ✓  keyword signals  (e.g. ["commit", "message"])
    ✓  prompt length bucket  (e.g. "50–100 chars")
    ✓  tier mismatch  (decided T2 → should have been T0)

    ✗  never your prompt text
    ✗  never file paths or variable names
    ✗  never anything reversible to your code or identity
```

**Closing line:**
```
This is how frugal gets better than any single team could make it —
powered by the community, not a training run.
```

---

### S9 — PRICING + ACCESS

**Title:** `Free to use. You pay only when we save you money.`

**Sub:** `That's not marketing. That's the model.`

**Three pricing cards:**

**Card 1 — Community (Free, forever)**
```
🐕  Community
    Free

    The full router.
    Classify. Route. Save.

    ✓  classify.js + hook + 6 subagents
    ✓  Real-time statusline
    ✓  replay.js — validate your own savings
    ✓  Manual backtest + tuning
    ✓  Community classifier updates (opt-in)
    ✓  No time limit. No feature gate.

    [ Download free ]
```

**Card 2 — Pro (highlighted, "most popular")**
```
⚡  Pro
    $9 / month
    or nothing if we don't save you at least $9

    Everything in Community, plus:

    ✓  Auto-tuning (nightly backtest applies automatically)
    ✓  Hardware-aware routing (GPU VRAM detection)
    ✓  Subscription-aware routing (knows your Claude/GPT plan)
    ✓  Budget guardrail (auto-downgrade when limit approaching)
    ✓  Priority classifier updates from community
    ✓  frugal-hub access when it launches (v1.1)

    [ Request early access ]
```

**Card 3 — Team**
```
👥  Team
    $29 / seat / month

    Everything in Pro, plus:

    ✓  Shared team config (frugal.config.json in repo)
    ✓  Per-developer cost + routing analytics
    ✓  Team delta aggregation
    ✓  Dedicated onboarding

    [ Talk to us ]
```

**Below cards, the success-fee guarantee (prominent, not a footnote):**

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Pro costs $9/month.                                               │
│   The average Pro user saves $23/month.                             │
│   If you don't save at least $9, you don't pay.                     │
│                                                                     │
│   We only make money when you make money.                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Waitlist form (below pricing):**

Title: `Join the private beta`
Sub: `We're onboarding one developer at a time. Hardware matters — tell us what you're running.`

Form fields:
- Email
- "What hardware are you running?" (dropdown: Mac M-series / Windows + NVIDIA / Windows + AMD / Linux + NVIDIA / Linux + AMD / Cloud / Other)
- "Which AI subscriptions do you have?" (multi-select chips: Claude Max / Claude API / GPT Plus / GPT API / Gemini / None)

CTA button: `Request access`

After submit: `You're in the queue. We'll reach out within 48 hours.`

---

### S10 — FOOTER

Minimal.

```
🐕 frugal   ·   built by Paulo Loureiro   ·   v0.9.0

Security · NOTICE · Docs (coming soon)
```

No GitHub link. No social links. No newsletter.

---

## LOGOS — Implementation spec

**Principle:** every provider in the diagram and demo must have a visual identity — never plain text.

**Implementation priority:**
1. SVG inline (no external deps, no CORS)
2. If SVG is too crude, use a pill badge with brand color + abbreviated name

**SVG components to build (copy these exactly):**

```tsx
// ── Anthropic / Claude ──────────────────────────────────────────────
const AnthropicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#CC785C"/>
    <text x="10" y="14" textAnchor="middle" fill="white"
          fontSize="11" fontWeight="700" fontFamily="sans-serif">A</text>
  </svg>
)

// ── Ollama ──────────────────────────────────────────────────────────
const OllamaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#1c1c1e" stroke="#444" strokeWidth="1"/>
    <circle cx="7.5" cy="9" r="2" fill="white"/>
    <circle cx="12.5" cy="9" r="2" fill="white"/>
    <path d="M6.5 14 Q10 16.5 13.5 14" stroke="white" strokeWidth="1.5"
          fill="none" strokeLinecap="round"/>
  </svg>
)

// ── OpenAI / GPT ────────────────────────────────────────────────────
const OpenAIIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#000"/>
    <circle cx="10" cy="10" r="5" stroke="white" strokeWidth="1.5" fill="none"/>
    <circle cx="10" cy="10" r="2" fill="white"/>
  </svg>
)

// ── Google / Gemini ─────────────────────────────────────────────────
const GeminiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#fff"/>
    <text x="10" y="15" textAnchor="middle" fill="#4285F4"
          fontSize="13" fontWeight="800" fontFamily="sans-serif">G</text>
  </svg>
)

// ── Mistral ─────────────────────────────────────────────────────────
const MistralIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#FF7000"/>
    <rect x="4" y="7" width="5" height="5" fill="white"/>
    <rect x="11" y="7" width="5" height="5" fill="white"/>
    <rect x="4" y="13" width="5" height="5" fill="white"/>
  </svg>
)

// ── xAI / Grok ──────────────────────────────────────────────────────
const GrokIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#000"/>
    <text x="10" y="15" textAnchor="middle" fill="white"
          fontSize="13" fontWeight="800" fontFamily="sans-serif">X</text>
  </svg>
)

// ── Codex (OpenAI) — same as OpenAI but with "C" label ──────────────
const CodexIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="5" fill="#000"/>
    <text x="10" y="15" textAnchor="middle" fill="white"
          fontSize="11" fontWeight="700" fontFamily="monospace">C/</text>
  </svg>
)
```

**Where logos appear:**
- S4 architecture diagram: next to each model in the bottom tier boxes
- S5 demo panels: inline with each routing result line
- S6 statusline: provider dots legend (small, 16px)

---

## "DE PARA" DEMO — Detailed animation spec (S5)

This is the critical section. Without frugal / With frugal, side by side.

**Animation sequence (auto-plays on scroll into view, one cycle, no loop):**

1. Both panels appear simultaneously (fade in, 400ms)
2. Prompt 1 types into both panels simultaneously (typewriter, 30ms/char)
3. LEFT result appears: `↳ Claude Opus  ●  $0.050  ●  4.1s` (fade in, 300ms)
4. RIGHT result appears: `↳ 🏠 Ollama · qwen2.5  ●  $0.000  ●  0.3s  ✓` (fade in, 300ms, T0 teal colour)
5. Pause 800ms
6. Prompt 2 types into both panels
7. LEFT: Opus result
8. RIGHT: Sonnet result (T2 yellow colour)
9. Pause 800ms
10. Prompt 3 types
11. LEFT: Opus result
12. RIGHT: Opus result (same — because it needed Opus — T3 red colour)
13. Total lines fade in
14. Savings line in the right panel pulses green once

**Timing total:** ~12 seconds for full cycle. User can interact (hover pauses).

**The key UX insight:** prompt 3 going to Opus in BOTH panels is intentional and important. It shows frugal is smart, not cheap. It never trades quality for cost.

---

## DESIGN SYSTEM

### Colors
```css
:root {
  /* Page */
  --bg: #080808;
  --surface: #111;
  --surface-2: #1a1a1a;
  --border: #222;
  --border-light: #2e2e2e;

  /* Text */
  --text: #ededed;
  --muted: #666;
  --faint: #333;

  /* Tiers — use ONLY for tier-related UI */
  --t0: #4ec9b0;   /* teal  — free/Ollama */
  --t1: #569cd6;   /* blue  — Haiku */
  --t2: #dcdcaa;   /* amber — Sonnet */
  --t3: #f47373;   /* red   — Opus */

  /* Accent */
  --accent: #4ec9b0;
  --green: #23d18b;
  --yellow: #dcdcaa;
}
```

### Typography
```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 1rem;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
}

code, pre, .terminal {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', 'Menlo', monospace;
}

/* Scale */
h1 { font-size: clamp(2.8rem, 6vw, 5.5rem); font-weight: 800; letter-spacing: -0.04em; line-height: 1.05; }
h2 { font-size: clamp(1.6rem, 3.5vw, 2.8rem); font-weight: 700; letter-spacing: -0.02em; }
h3 { font-size: 1.1rem; font-weight: 600; }
```

### Layout
```css
.container { max-width: 1100px; margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2.5rem); }
.narrow    { max-width: 680px; margin: 0 auto; }
section    { padding: clamp(4rem, 10vw, 9rem) 0; }
```

### Component specs

**Terminal window:**
```css
.terminal-window {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 10px;
  overflow: hidden;
}
.terminal-header {
  background: #161b22;
  border-bottom: 1px solid #30363d;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.traffic-light { width: 12px; height: 12px; border-radius: 50%; }
.traffic-light.red    { background: #ff5f56; }
.traffic-light.yellow { background: #ffbd2e; }
.traffic-light.green  { background: #27c93f; }
.terminal-body { padding: 1.25rem 1.5rem; font-family: monospace; font-size: 0.875rem; line-height: 1.8; }
```

**Pricing card:**
```css
.pricing-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 2rem;
}
.pricing-card.featured {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 0 40px rgba(78,201,176,0.08);
}
```

**Guarantee box:**
```css
.guarantee-box {
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  background: var(--surface);
  padding: 1.5rem 2rem;
  margin-top: 2.5rem;
}
```

**Proof chip (small tag):**
```css
.proof-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.8rem;
  color: var(--muted);
}
```

### Animations (exhaustive list — nothing else)
```css
/* Fade in on scroll */
.reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.55s ease, transform 0.55s ease; }
.reveal.visible { opacity: 1; transform: none; }

/* Stagger children */
.stagger > * { transition-delay: calc(var(--i, 0) * 80ms); }

/* Cursor blink */
@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
.cursor::after { content: '▋'; animation: blink 1s step-end infinite; }

/* Pulse (used on savings line) */
@keyframes pulse-green { 0%,100% { color: var(--green) } 50% { color: white } }
.pulse-once { animation: pulse-green 1s ease 1; }
```

**No other animations. No particles. No parallax. No gradients that move.**

---

## TECH STACK — Non-negotiable

```
Next.js 15  ·  React 19  ·  TypeScript  ·  Plain CSS (globals.css)
NO Tailwind  ·  NO CSS-in-JS  ·  NO external component libraries
```

**next.config.ts — must contain:**
```ts
const nextConfig: NextConfig = {
  reactStrictMode: false,  // ← required: React 19 + animations crash in strict mode
};
```

**Crash prevention — always include:**
```tsx
// ErrorBoundary (class component — required by React)
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e: Error) { console.warn('[ErrorBoundary]', e.message); }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// useInView — IntersectionObserver hook
function useInView(ref: React.RefObject<HTMLDivElement>, threshold = 0.15) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return visible;
}

// useTypewriter — for the demo animation
function useTypewriter(text: string, active: boolean, speedMs = 28) {
  const [displayed, setDisplayed] = React.useState('');
  React.useEffect(() => {
    if (!active) { setDisplayed(''); return; }
    let i = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (i < text.length) {
        setDisplayed(text.slice(0, ++i));
        setTimeout(tick, speedMs);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [text, active]);
  return displayed;
}
```

**Wrap ALL animated sections in `<ErrorBoundary>`.**
**Every `useEffect` with a timer must return a cleanup function with a `cancelled` flag.**

---

## COPY PRINCIPLES

**Say this:**
- "The right model for every prompt, automatically."
- "Your AI budget runs out on commit messages. frugal fixes that."
- "It reads your GPU. It knows your plan. It routes accordingly."
- "Only pay us when we save you money."
- "The last prompt still went to Opus — because it needed Opus."
- "The classifier gets smarter with every user. Your prompts never leave your machine."

**Never say this:**
- "Revolutionary AI-powered..."
- "10× your productivity"
- "Supercharge your workflow"
- "State-of-the-art"
- Any model name as a permanent superlative ("Opus is the most capable") — models change.
- Any specific number of backtest prompts ("1,437") — don't expose internal scale.
- "Enterprise-grade" — this is for developers, not enterprise buyers.

**Model name policy:** frugal routes to tiers (T0/T1/T2/T3). When naming models, always frame them as current examples: "like Ollama" or "like Sonnet" — never as the permanent definition of the tier. The tier lasts. The model doesn't.

---

## DEFINITION OF DONE

Before pushing to Vercel:

**Visual**
- [ ] Page loads in <2s on 3G throttle (Chrome Lighthouse)
- [ ] Zero console errors on load and scroll
- [ ] Mobile (375px): no horizontal overflow, all sections readable
- [ ] 🐕 shiba appears in Nav AND statusline (S6)
- [ ] Provider logos visible in S4 diagram and S5 demo (not plain text)

**Content**
- [ ] H1 is 2 lines max, <10 words total
- [ ] Exactly 9 sections (S1 nav + S2–S9)
- [ ] "De para" demo in S5 shows prompt 3 going to Opus in BOTH panels
- [ ] Success-fee guarantee box visible in S9
- [ ] No GitHub link anywhere
- [ ] No specific backtest prompt count exposed
- [ ] Model names always framed as examples, not permanent tier definitions

**Technical**
- [ ] `reactStrictMode: false` in next.config.ts
- [ ] ErrorBoundary around every animated section (S5 demo, S6 statusline)
- [ ] useTypewriter cleanup function present with `cancelled` flag
- [ ] Waitlist form submits to Supabase without error
- [ ] /api/analyse endpoint untouched

---

## HOW TO USE THIS IN CLAUDE CODE

```
Open Claude Code in /frugal/landing/

Say:
"Rebuild page.tsx and globals.css completely from scratch
using LANDING_MASTER_PROMPT_V5.md as your sole reference.
Read the entire document first.
Then build section by section in order (S1 → S9).
After each section, verify it renders before moving to the next.
When done, check every item in the Definition of Done."
```

If Claude Code runs out of context mid-build, resume with:
```
"Continue building frugal landing from LANDING_MASTER_PROMPT_V5.md.
You completed sections S1–S[N]. Continue from S[N+1]."
```

---

*V5 — written against frugal v0.9.0. Big picture: hardware-aware, subscription-aware, model-agnostic router. The de-para demo is back. Pricing uses success-fee framing. No model names as permanent superlatives. No backtest count exposed. Two audiences: vibe coder (narrative) + VC (numbers). 9 sections, no more.*
