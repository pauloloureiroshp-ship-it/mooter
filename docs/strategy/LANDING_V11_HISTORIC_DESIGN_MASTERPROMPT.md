# LANDING V12 HISTORIC + CRAFT — Claude Design Master Prompt (mooter.ai redesign)

> **v12 changes (2026-06-08):** Removed "Pastor" user-facing (kept internal naming), refined "Mooter is the roteador" positioning, CC-aligned slash command taxonomy, added system requirements wizard spec, added Linear-grade navigation (collapsible sidebar + Cmd+K command palette), added explicit craft aesthetic principles (anti-AI-generated look).

# LANDING V11 HISTORIC — Claude Design Master Prompt (mooter.ai redesign) — superseded by v12 sections below

> **Use this prompt in Claude Design (claude.ai/code design mode) to redesign mooter.ai landing + login area + logged-in dashboard area.**
>
> **Output expected:** Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui code, deployable to Vercel, fully responsive, dark-mode native, WCAG 2.1 AA compliant.
>
> **Reference architecture:** `docs/strategy/MOOTER_SESSIONS_ORCHESTRATOR_DESIGN_v1.md` (foundational) + `docs/strategy/WAVE33_5_HISTORIC_SPAWN_ORCHESTRATOR_KICKOFF.md` (implementation context).

---

## Context for Claude Design

You are designing the next iteration of **mooter.ai** — landing page, login area, and logged-in dashboard area — for **Mooter v1.21.1-historic-spawn-orchestrator** (shipping Wave 33.5).

**Mooter is the roteador** (router) for Claude Code — local-first, learns forever, and now spawns agents safely by default. Mooter:
- Routes every prompt to the right tier (T0 Ollama → T1 Haiku → T2 Sonnet → T3 Opus) before any expensive call happens
- Spawns local-first agents inside a 4-layer sandbox by default
- Observes every Claude Code session you have open and coordinates the writes that would otherwise race
- Predicts when your 5h Anthropic quota will hit the wall and tells you which session to pause
- Learns from your routing decisions across sessions (smart routing engine, no LLM call to route)
- Ships native plugins for Zellij, tmux, WezTerm, Warp
- Real-time statusline + GDPR data rights + optional federated wisdom

**Three things to remember when writing copy:**
1. **Mooter is the roteador** — never "orchestrator" externally, never "agent framework". Roteador first; spawn/observe/learn are how it serves the routing job.
2. **Never use the word "Pastor" in user-facing copy** — that's our internal name for the routing intelligence engine. Externally: "smart routing", "routing intelligence", "Mooter learning", "Mooter knows what to pick".
3. **Match Claude Code's language** — users coming from CC expect familiar terms. See §19 for the canonical mapping.

The product has shipped 33 waves and reached "historic" milestone: only tool in 2026 hitting 9 differentiation dimensions simultaneously (see §3 comparison table).

**Your job:** redesign the public surface to match this technical depth without overwhelming visitors. **Intent-first**, not dashboard-first. Side-by-side terminal comparisons. 8 trunfos communicated. Conversion-optimized.

---

## §1 Strategic positioning (one-liner candidates)

Test 3 hero candidates in design — Paulo will choose:

**Candidate A (heritage)**
> Your LLM router. Local-first. Learns forever.

**Candidate B (historic)**
> One brain. Every Claude Code session. Spawn agents safely. Save 47%.

**Candidate C (intent-first)**
> Type what you want. Mooter spawns the agent, picks the model, keeps you under budget.

**Candidate D (multi-session)**
> Run 5 Claude sessions in parallel without breaking anything. Mooter coordinates.

**Recommendation for first iteration:** **Candidate C** as primary hero, **Candidate D** as secondary hero (scroll position 2). Both align with intent-based UX shift (+27% retention research data) and concrete value props. Candidate D directly addresses pain that Paulo and other power-users feel today.

---

## §2 The 10 trunfos (must communicate ALL of these)

These are Mooter's defensible advantages. Each gets ≥1 landing section (10 sections min).

| # | Trunfo | One-line landing copy | Visual treatment |
|---|---|---|---|
| 1 | **Strategy** | "Local-first by design. Your code never leaves your machine unless YOU send it." | Diagram: local box + Ollama + RTX 4090, optional cloud arrows |
| 2 | **Methodology** | "16-layer architecture. 33 waves shipped. classify.js sha intact." | Layered architecture visualization (clickable layers) |
| 3 | **Security** | "4-layer sandbox: network, filesystem, secrets, config. CVE-2025-59528 stops here." | Shield icon + 4-quadrant breakdown |
| 4 | **UX/UI** | "Type your intent. Mooter resolves the command. Total transparency." | Animated terminal showing intent → command resolution |
| 5 | **Structured database** | "17 migrations. Versioned schema. k-anon ≥50 federated wisdom (opt-in)." | ER diagram simplified |
| 6 | **Routes (CLI surface)** | "50+ commands. 12 slash commands that feel like Claude Code. 16 MCP tools. All documented." | Searchable command palette demo |
| 7 | **Transparency** | "Every bash command. Every routing decision. Every dollar. In statusline, real-time." | 4-mode statusline live demo (mini/compact/full/didactic) |
| 8 | **Real-time statusline** | "≤10ms render budget. Quota forecast 5h. Tier decisions visible second by second." | Statusline animated, chip explanations on hover |
| 9 | **Orquestração entre sessões (Conductor)** | "Run 5 Claude sessions in parallel. Mooter holds the locks so git and Notion never race." | Conductor lock visualizer + heartbeat animation + queue list |
| 10 | **Workflow visibility real-time** | "Watch your local workflow agents progress live — same idea as Claude Code's dynamic workflows, but local and cheaper." | Workflow chip animated with progress dots + agents count + tokens |

---

## §3 The historic comparison table (§3 of landing — high prominence)

Mooter is the **ONLY** tool in 2026 hitting ALL 9 dimensions:

| Feature | Composio AO | Conductor | Claude Squad | Cursor Bg | Anthropic Agent Teams | OpenAI Codex | Antigravity | Termdock | **Mooter** |
|---|---|---|---|---|---|---|---|---|---|
| Spawn agents | ✅ cloud | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **✅ default** |
| Local-first | ❌ | ❌ | 🟡 | ❌ | ✅ | ❌ | ❌ | ✅ | **✅** |
| Cross-session $ savings | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| 5h quota forecast | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Cross-session routing learning | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| 4-layer sandbox | 🟡 | 🟡 | ❌ | ✅ | ✅ | ✅ | ⚠️ CVE'd | 🟡 | **✅** |
| Intent-based UX | ❌ | 🟡 | ❌ | ✅ | 🟡 | ✅ | 🟡 | ❌ | **✅** |
| State-of-art install wizard | 🟡 | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 🟡 | ❌ | **✅** |
| Multiplexer plugins | ❌ | ❌ | ❌ | N/A | 🟡 | ❌ | ❌ | ✅ | **✅** |
| **Orchestration locks entre terminais** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Workflow visibility statusline chip** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| **Score** | 1/11 | 1/11 | 2/11 (CC-native) | 4/11 | 4/11 | 4/11 | 3/11 | 3/11 | **11/11** |

**Design treatment:** Sortable table by category. Sticky first column. Mooter column visually distinguished (border accent + slightly larger). Source citations footer (links to comparison research).

---

## §4 Side-by-side 2-terminal comparison (HERO showpiece)

**Critical visual feature.** Replaces traditional hero video. Two animated terminals side-by-side:

### Left terminal (without Mooter)
```
$ claude --dangerously-skip-permissions
Welcome to Claude Code v2.1.168

> Fix the bug in landing/components/Hero.tsx

[Claude processes — uses Opus the whole way]
✓ Done. Cost: $0.47 for this task.
[5h quota: 28% used]

$ # 30 minutes later, another task
$ claude
> Rename the variable in utils.ts

[Claude processes — uses Opus again for a trivial rename]
✓ Done. Cost: $0.31 for a one-line rename.
[5h quota: 41% used — burning fast]
```

### Right terminal (with Mooter)
```
🐮 mooter "Fix the bug in landing/components/Hero.tsx"

[Mooter routes → T3 Opus (architecture change)]
[4-layer sandbox active, spawning in ~/.mooter/spawns/abc123]
✓ Done. Cost: $0.47 for this task. (matched the left terminal)
[5h quota: 28% used]

🐮 mooter "Rename the variable in utils.ts"

[Mooter routes → T0 Ollama qwen2.5:3b (trivial rename)]
[Smart routing engine confirms tier downgrade]
[4-layer sandbox active, Ollama subprocess]
✓ Done. Cost: $0.00 (local) for trivial rename. Saved $0.31.
[5h quota: 28% used — preserved]

📊 Session total: $0.47 used / $0.78 baseline = 40% saved
```

**Design treatment:**
- Animated typing effect (synced timing)
- Real Asciinema-recorded session embedded (asciinema.org/embed)
- Hover any chip → tooltip explanation
- Mobile: stacked vertical with toggle button
- Dark mode primary (terminal aesthetic)
- Accessibility: animation can pause + read aloud

---

## §5 Landing page IA (information architecture)

### Above the fold (mobile-first, max 100vh)

1. **Header** (sticky, transparent → solid on scroll)
   - Logo 🐮 mooter
   - Nav: Why · Compare · Install · Dashboard (login) · Docs · GitHub
   - CTA: "Install in 30s"

2. **Hero (intent-first)**
   - Tagline: Candidate C ("Type what you want. Mooter spawns the agent...")
   - Interactive intent prompt input (with cursor pulse animation)
     ```
     > _ (type your dev task here)
     [Tab for command palette · Enter to see demo]
     ```
   - Subtle CTA: "Install · See live · GitHub"
   - Real-time savings counter: "1,247 developers saved $34,823 today" (replace with real numbers when wave 33.5 ships if data available; else aspirational with note)

3. **2-terminal comparison** (§4)
   - Headline: "Same task. Mooter routes locally first. You save 47%."

### Mid-page sections (scroll-driven)

4. **The 8 trunfos** (§2)
   - 8-card grid (4×2 on desktop, 2×4 on tablet, 1×8 mobile)
   - Each card: emoji icon + headline + 1-line + "Learn more" expand
   - Sticky nav rail with progress dots

5. **Live demo / Architecture animation**
   - Show how request flows: User → classify.js → Pastor → Route (Opus/Sonnet/Haiku/Ollama) → Spawn (sandboxed) → Output
   - Lottie animation or React Flow diagram

6. **The historic comparison table** (§3)
   - Sortable, sticky column, Mooter highlighted
   - Footer: "Methodology: comparison based on public docs as of June 2026" + link to /compare for details

7. **Install in 30 seconds**
   - Single command: `curl -fsSL install.mooter.ai | bash`
   - Copy button + alternative methods (npm, brew, scoop)
   - Wizard preview animation (Block C of Wave 33.5)
   - "What happens when you install" — 5-step breakdown

8. **Real users, real numbers** (social proof)
   - 3-card testimonial grid (use real friends-launch feedback once available)
   - Numbers: GitHub stars, total $$$ saved aggregate, sessions analyzed
   - Trust signals: "33 waves shipped · classify.js sha intact · MIT licensed"

9. **Security primer**
   - Headline: "Local-first means nothing without sandboxing"
   - 4-layer sandbox visualization (network, filesystem, secrets, config)
   - CVE-2025-59528 callout: "We learned from Antigravity's mistake."
   - Link to /security docs page

10. **Worktree Conductor showcase** (NEW)
    - Headline: "Multiple Claude sessions? Mooter coordinates them so you don't break git."
    - Animated visualization: 3 terminal cards + lock arrows + heartbeat dots
    - Live example: "Session A holds git-lock, Session B queues, Session C continues with Notion-lock"
    - CTA: "See conductor docs"

11. **Dynamic Workflow live preview** (NEW)
    - Headline: "Watch your workflow agents progress in real-time, like CC's but local + cheaper."
    - Mockup: statusline chip animated `🔄 wf-abc 3/7 agents 💠💠💠○○○○ · 4.2k tk`
    - Side comparison: "CC dynamic workflow vs Mooter Workflow Engine (Wave 28)"
    - CTA: "See workflow docs"

12. **Footer CTAs**
    - Install one-liner (repeat)
    - GitHub link
    - Docs link
    - Discord/community
    - Footer: changelog, MIT license, made with 🐮 by Paulo

---

## §6 Login area design

**URL:** `mooter.ai/login`

**Design philosophy:** Minimalist, dark-first, single primary action.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  🐮 mooter                                  Back ←  │
├─────────────────────────────────────────────────────┤
│                                                     │
│             ╭─────────────────────╮                 │
│             │                     │                 │
│             │    Welcome back     │                 │
│             │                     │                 │
│             │    Sign in to       │                 │
│             │    see your live    │                 │
│             │    cross-session    │                 │
│             │    intelligence     │                 │
│             │                     │                 │
│             │  [GitHub OAuth]     │                 │
│             │  [Google OAuth]     │                 │
│             │  ─────── or ───────  │                 │
│             │  Email magic link   │                 │
│             │                     │                 │
│             ╰─────────────────────╯                 │
│                                                     │
│   No account? Install Mooter first:                 │
│   curl -fsSL install.mooter.ai | bash               │
│                                                     │
│   New users skip login — Mooter works locally.      │
│   Login only for cross-device federated wisdom.     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Key principle:** Login is **OPT-IN**, not required. Local-first means most users never login. Login = federated wisdom + cross-device sync (Wave 35).

### Auth providers
- GitHub OAuth (primary — dev audience)
- Google OAuth (secondary)
- Email magic link (Supabase Magic Link)

### Privacy gate
First-time login shows GDPR consent:
- ☐ I consent to federated wisdom (k-anon ≥50 only)
- ☐ I consent to cross-device sync
- Privacy policy link
- Data rights summary (export, delete-all, forget-me one-click)

---

## §7 Logged-in dashboard area design

**URL:** `mooter.ai/dashboard`

**Design philosophy:**
- F-shaped scanning (research-validated)
- Top-left = most critical KPI
- 5-7 primary KPIs max
- Progressive disclosure (overview → drill-down)
- Intent-based command palette as default focused element (Cmd+K open)

### Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐮 mooter · Paulo                            Sessions · Help · ☰ menu│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ┌─ KPI: $ saved this month ─────────┐ ┌─ KPI: Active sessions ────┐ │
│ │ $147.32 · 47% avg                │ │ 3 LIVE · ☁ 47% / 5h quota │ │
│ │ ↗ +12% vs last month            │ │ Lock forecast: 02:47 BRT  │ │
│ └──────────────────────────────────┘ └────────────────────────────┘ │
│                                                                      │
│ ┌─ Sessions live ───────────────────────────────────────────────────┐│
│ │ [1] wave33-ultimate  ★ active  2h14m  T3  77/$0.09  ▶            ││
│ │ [2] wave34-llmlingua 💤 idle   47m    T2  23/$0.04  ▶            ││
│ │ [3] mooter-hotfix    🟢 fresh  4m     T1  3/$0.01   ▶            ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ Routing intelligence ────┐ ┌─ Tier distribution (last 30d) ─────┐│
│ │ 264 routing decisions      │ │ T0: 18%  T1: 32%  T2: 2%  T3: 48% │││
│ │ 6 adapters registered     │ │ [stacked bar chart]              │ │
│ │ Last accuracy: 91%        │ └─────────────────────────────────────┘│
│ │ [View details →]          │                                       │
│ └───────────────────────────┘                                       │
│                                                                      │
│ ┌─ Recent spawns ──────────────────────────────────────────────────┐│
│ │ ID    Task                      Tier  Cost   Duration  Status   ││
│ │ a3f   "fix bug Hero.tsx"        T3    $0.47  2m14s    ✅ done  ││
│ │ b9c   "rename var utils.ts"     T0    $0.00  8s       ✅ done  ││
│ │ d2e   "audit landing copy"      T1    $0.01  1m02s    ✅ done  ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ Conductor (orchestration entre sessões) ───────────────────────┐│
│ │ Active locks: 1 · Queue: 2 · Heartbeats: 3 live                 ││
│ │ 🔒 git-frugal-hash (Session 1 'wave33-ultimate', 12s, TTL 48s) ││
│ │   ↳ Waiting: Session 2 (wave34-exp), Session 3 (hotfix)        ││
│ │ Last op: 06:14:32 — Session 1 ACQUIRED git-frugal-hash         ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ Active workflows ──────────────────────────────────────────────┐│
│ │ 🔄 wf-abc Day 0 recon · 5/7 agents · 💠💠💠💠💠○○ · 12.3k tk ││
│ │ 🔄 wf-def Block A build · 2/4 agents · 💠💠○○ · 4.2k tk     ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ Press [Cmd+K] for command palette                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile layout
Stacked cards, bottom tab nav (Home / Sessions / Spawns / Settings), Cmd+K replaced with floating "+" button (intent prompt).

### Color tokens (Tailwind v4 + custom)
- Background: `#0a0a0a` (deep black)
- Surface 1: `#141414` (cards)
- Surface 2: `#1f1f1f` (elevated)
- Border: `#2a2a2a`
- Text primary: `#ededed`
- Text secondary: `#a3a3a3`
- Accent (Mooter brand): `#fbbf24` (mooter yellow — cow theme)
- Success: `#10b981`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Tier T0 (local): `#10b981` (green — free)
- Tier T1 (haiku): `#fbbf24` (yellow — cheap)
- Tier T2 (sonnet): `#f97316` (orange — moderate)
- Tier T3 (opus): `#ef4444` (red — expensive)

### Typography
- Heading: Geist Sans (or Inter as fallback)
- Body: Geist Sans
- Mono (terminal/code): Geist Mono (or JetBrains Mono)

### Components (shadcn/ui)
- Card · Button · Input · Dialog · DropdownMenu · Tabs · Table · Badge · Progress · Toast · Tooltip · CommandPalette (cmdk)
- Custom: Statusline preview (live), TerminalDemo (animated), TierChip, QuotaBar, SessionCard

---

## §8 Wording overhaul (high-impact strings)

Replace any:
- "Mooter is a router" → "Mooter spawns agents safely, locally, by default — and tells you when you're about to burn the quota."
- "Save money on Claude" → "Save 47% across every Claude Code session. Local-first. No surprises."
- "Local-first" alone → "Local-first by design. Your code never leaves your machine unless YOU send it."
- "AI orchestrator" → "The only orchestrator that knows what every other session is doing."

### Hero microcopy variants for A/B test
1. "Type what you want. Mooter handles the rest."
2. "Your local LLM router. Spawn agents. Save 47%. Sandboxed."
3. "Claude Code's missing intelligence layer."

### CTA buttons
- Primary: "Install in 30s" (not "Get Started" — too generic)
- Secondary: "See live demo" (terminal anim)
- Tertiary: "Read the docs"

### Empty states
- Sessions area: "No sessions yet. Run `mooter spawn 'fix that bug'` in your terminal."
- Spawns area: "Spawn your first agent. `mooter spawn '<task>'`"
- Routing intelligence area: "Mooter needs 50 routing decisions before it starts learning your patterns. Currently: 12/50."

### Error states
- Quota exceeded: "Anthropic 5h quota hit. Mooter is routing T0/T1 only until reset at <time>. You're safe."
- Network: "Can't reach Anthropic. Local Ollama models still available."
- Sandbox warn: "Sandbox layer X failed audit. Run `mooter security audit --fix`."

---

## §9 New routes scaffolded (Block G of Wave 33.5)

Design these pages too:

### `/spawn` — info about spawn agents
- Hero: "Spawn agents safely. Local-first. By default."
- 4-step diagram: classify → sandbox → spawn → observe
- CLI example animated
- Link to docs

### `/sessions` — cross-session intelligence
- Hero: "One brain. Every Claude Code session."
- Ralph TUI mockup screenshot
- 4 USPs cards
- CLI commands list

### `/security` — sandbox 4-layer explainer
- Hero: "Local-first means nothing without sandboxing."
- 4-layer interactive diagram (click each → details)
- CVE-2025-59528 case study
- Threat model link
- Trust signals

### `/install` — wizard preview
- Hero: "30 seconds. 8 steps. Done."
- Animated wizard walkthrough
- Platform-specific instructions (Linux/WSL2/macOS)
- Health check explanation
- Uninstall instructions (transparency)

### `/compare` — full comparison table
- The §3 table, full-page, sortable
- Methodology disclosure
- Source citations
- Last updated date

### `/changelog` — version history
- v1.21.1 entry first (Historic)
- Each entry: tag · date · highlight · "view sub-page" Notion link
- Stable nav by major version

### `/conductor` — Worktree Conductor explainer (NEW)
- Hero: "Multiple Claude sessions? Mooter coordinates them."
- Visualization: 3-terminal scenario + lock arrows + heartbeat dots
- Lock manager + heartbeat protocol + queue + auto-recovery explained
- "Why this matters" callouts: prevents race in git push, Notion writes, hub deploys, tag bumps
- Trust signal: "Synthetic race-condition test passes"
- CTA: install + try `mooter conductor status`

### `/workflow` — Dynamic Workflow visibility (NEW)
- Hero: "Your local-first agent orchestrator. Live."
- Statusline chip animated `🔄 wf-{id} 3/7 agents 💠💠💠○○○○ · 4.2k tk`
- Comparison vs CC dynamic workflow (similar UI, local cost, Pastor learns)
- `mooter workflow watch` Mission Control TUI screenshot
- Workflow handoff cross-session (Wave 28 engine reuse)
- CTA: install + try `mooter workflow run "your task"`

---

## §10 Technical constraints for CC Design implementation

### Stack
- **Framework:** Next.js 16 (App Router, RSC default)
- **React:** 19
- **TypeScript:** strict mode
- **Styling:** Tailwind v4 (CSS-first, no PostCSS plugin) + shadcn/ui registry
- **Animations:** Framer Motion (for hero) + Lottie (architecture diagrams) + cmdk (command palette)
- **Forms:** react-hook-form + zod
- **Auth:** Supabase Auth (GitHub OAuth + Google OAuth + Magic Link)
- **DB connection:** Supabase Postgres (existing schema)
- **Deploy:** Vercel

### Performance budgets
- LCP < 2.0s
- INP < 100ms
- CLS < 0.05
- Bundle JS < 200 KB first page (heavy use of RSC)
- Images: AVIF + WebP fallback
- Fonts: variable, subset, preloaded

### Accessibility (WCAG 2.1 AA mandatory)
- Color contrast ≥ 4.5:1 (text), 3:1 (UI)
- All animations: prefers-reduced-motion respected
- Keyboard nav: every interactive element reachable
- Screen reader: aria-live for statusline updates, descriptive labels
- Focus indicators: 2px solid mooter-yellow with offset
- Skip-to-content link

### Dark mode
- Default: dark (matches terminal aesthetic)
- Light mode: opt-in via theme toggle (system pref respected)
- Saved to localStorage + cookie

### Responsive breakpoints
- Mobile: 320-639px
- Tablet: 640-1023px
- Desktop: 1024+px
- Wide: 1536+px (max-width container)

### SEO
- Open Graph: dynamic per page
- Twitter Cards
- Sitemap: `/sitemap.xml` auto-generated
- robots.txt
- JSON-LD: WebSite + SoftwareApplication schemas
- Meta description: ≤155 chars
- Title pattern: `{Page} · Mooter — Local-first LLM router for Claude Code`

### i18n preparation
- All strings in `lib/i18n/en.json`, `lib/i18n/pt-pt.json`, `lib/i18n/pt-br.json`
- Routing prep: `/`, `/en`, `/pt`, `/br` (Wave 34 ship)

---

## §11 Deliverables expected from this design session

When you complete this design task, produce:

1. **Next.js 16 codebase** — full landing + login + dashboard areas, ready to deploy to Vercel
2. **Component library** — reusable Statusline, TerminalDemo, TierChip, QuotaBar, SessionCard, ComparisonTable in `components/ui/mooter/`
3. **Asset library** — SVG diagrams (architecture, 4-layer sandbox), Lottie animations (routing flow), screenshot mocks
4. **Style guide** — Storybook stories for all custom components
5. **Performance report** — Lighthouse scores for desktop + mobile
6. **A11y report** — axe-core audit results
7. **Comparison table data file** — `lib/data/comparison.ts` with sortable structured data (for §3 table)
8. **Wave 33.5 routes** — 6 new pages (/spawn /sessions /security /install /compare /changelog) per §9
9. **Test asciinema cast** — placeholder or real recording for 2-terminal comparison (§4)
10. **Deployment guide** — `landing/DEPLOY.md` with Vercel setup + env vars + domain config

---

## §12 What NOT to do

- ❌ Don't use generic SaaS stock illustrations — Mooter is terminal-aesthetic
- ❌ Don't include team photos / corporate look — single-founder project
- ❌ Don't add chatbot widget — Mooter IS the chat interface
- ❌ Don't add cookie consent banner unless GDPR strictly required (we're local-first, minimal tracking)
- ❌ Don't include "Powered by Vercel" badges or similar
- ❌ Don't use animated GIFs — heavy + accessibility issues. Use Lottie/CSS animations.
- ❌ Don't include marketing automation (newsletter signup on every page) — only in /install area as opt-in
- ❌ Don't break the Wave 32+ landing actual until /v33_5 prefix is ready for migration

---

## §13 Open creative questions for designer

Mark these as "Open" in your deliverable so Paulo decides post-review:

1. Hero candidate A vs B vs C? (Recommend C, but show all 3 in design)
2. Single-page scroll vs multi-page? (Recommend hybrid: 1 landing scroll-heavy + 6 detail pages)
3. Animated terminal: SVG-only vs Asciinema embed vs Lottie? (Recommend Asciinema embed for authenticity)
4. Dashboard area: include or defer to v12? (Recommend INCLUDE — it's part of "historic" claim)
5. Login: required for /dashboard or optional? (Recommend OPTIONAL — local-first principle)
6. Comparison table: full opaque or partially hidden behind /compare deep dive? (Recommend FULL on landing — it's the selling point)
7. Mobile-first vs desktop-first design? (Recommend MOBILE-FIRST — Cursor/Codex do this well)
8. Brand mascot 🐮 emoji vs custom SVG cow logo? (Recommend custom SVG for brand recognition, keep emoji for casual contexts)

---

## §14 Reference materials (for designer to study)

### Direct competitors to emulate (and exceed)
- [Cursor landing](https://cursor.com/) — "AI tool that happens to be editor" philosophy
- [Windsurf (Codeium)](https://codeium.com/) — #1 LogRocket 2026
- [Continue.dev](https://continue.dev/) — open-source flexibility
- [Composio AO](https://github.com/ComposioHQ/agent-orchestrator) — dashboard pattern
- [Cline](https://cline.bot/) — AI dev tool aesthetic

### Inspirational dev tool landing pages 2026
- [Vercel](https://vercel.com/) — minimalist, performance-first
- [Linear](https://linear.app/) — typography excellence
- [Anthropic Claude](https://claude.ai/) — restraint + trust
- [shadcn/ui](https://ui.shadcn.com/) — component aesthetic

### Research sources for design decisions
- SaaS Dashboard UX Patterns 2026 (F-shaped scanning, 5-7 KPIs, progressive disclosure)
- AI-Native SaaS Design Patterns 2026 (intent-based +27% retention)
- WCAG 2.1 AA reference
- Cursor's intent-first composer pattern

---

## §15 Mooter brand voice for copywriting

- **Tone:** Founder-pragmatic, dense in facts, no hyperbole
- **Voice:** Honest about limits, confident about strengths
- **Person:** "Mooter does X" (third person, not "we" or "I")
- **Brazilian-Portuguese hint:** never translated proper nouns (Mooter, Pastor, LORAUTER stay English-spelled)
- **Tables > prose** for comparisons
- **Numbers always real:** never invent stats. If unknown, write "TBD post-launch"
- **No corporate-speak:** ❌ "revolutionary" "game-changing" "synergize" — only concrete claims
- **Markers:** ✅ shipped · 🔜 next · 🟡 in progress · ⚠️ attention · 🔥 focus · ❄️ paused

### Examples of strings to use

**Good:**
- "Mooter routes 47% of your prompts to local Ollama. Free."
- "classify.js sha intact across 33 waves."
- "4-layer sandbox: network, filesystem, secrets, config."

**Bad:**
- ❌ "Revolutionary AI-powered router that transforms your workflow"
- ❌ "Save up to 100% with our innovative platform"
- ❌ "Best-in-class AI orchestration solution"

---

## §16 Validation checklist (post-design review)

Before submitting design for Paulo review, confirm:

- [ ] All 8 trunfos visible in landing
- [ ] §3 comparison table accurate (verify each tool's docs)
- [ ] 2-terminal comparison animation works on mobile
- [ ] Login is OPT-IN messaging clear
- [ ] Dashboard F-pattern + 5-7 KPIs respected
- [ ] Wizard preview matches WAVE33_5 Block C spec
- [ ] WCAG 2.1 AA passes (axe-core report attached)
- [ ] Lighthouse scores ≥90 all metrics
- [ ] Dark mode default, light mode functional
- [ ] Brand voice respected (no hyperbole, no corporate-speak)
- [ ] All 6 new routes scaffolded per §9
- [ ] i18n preparation (en + pt-pt + pt-br JSON ready)
- [ ] No animated GIFs (Lottie/CSS only)
- [ ] CTAs use "Install in 30s" pattern (not generic "Get Started")
- [ ] Asciinema embedded (or recording instructions if not available)
- [ ] Mooter mascot SVG logo (not just emoji)
- [ ] Wording overhaul applied (no "Mooter is a router" generic)

---

## §17 Sources de research consultadas (web 2026-06-08)

### Landing page patterns
- [Cursor landing analysis](https://cursor.com/)
- [Best AI Code Editors 2026 — Playcode](https://playcode.io/blog/best-ai-code-editors-2026)
- [Cursor vs Continue.dev 2026 — LowCode Agency](https://www.lowcode.agency/blog/cursor-ai-vs-continue-dev)

### Dashboard UX 2026
- [SaaS Dashboard UX Patterns 2026 — GitNexa](https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns)
- [AI-Native SaaS UX 6 Design Patterns 2026](https://www.technology.org/2026/04/28/the-new-ux-of-ai-native-saas-and-erp-six-design-patterns-were-shipping-in-2026/)
- [Smart SaaS Dashboard Design Guide 2026 — F1Studioz](https://f1studioz.com/blog/smart-saas-dashboard-design/)

### Install wizard UX
- [How to Create a CLI Tool with Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view)
- Inquirer.js + Chalk + Ora pattern
- [npm-init wizard reference](https://docs.npmjs.com/cli/init/)

### Security framework
- [AI Agent Sandboxing Enterprise Guide 2026 — BeyondScale](https://beyondscale.tech/blog/ai-agent-sandboxing-enterprise-security-guide)
- [3 Isolation Patterns 2026 — DigitalApplied](https://www.digitalapplied.com/blog/ai-agent-sandboxing-isolation-patterns-2026)
- [Claude Code Sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing)
- CVE-2025-59528 (Google Antigravity sandbox escape, CVSS 10.0)

### Intent-based UX
- Gartner: 60% of SaaS analytics platforms will integrate generative AI interfaces by 2027
- Intent-based interfaces +27% first-week retention (14 products tracked, late 2024 onwards)

---

## §18 Acceptance criteria for Paulo

This design is ACCEPTED when:

1. **Hero is intent-first** (Candidate C or chosen variant)
2. **§4 2-terminal comparison** is the most visually striking element on landing
3. **All 8 trunfos** have dedicated landing real estate
4. **§3 comparison table** is sortable + prominent + accurate
5. **Login is OPT-IN** (not gated)
6. **Dashboard reaches /dashboard with 5-7 KPIs F-pattern**
7. **6 new routes** scaffolded with placeholder content matching §9
8. **WCAG 2.1 AA** verified via axe-core
9. **Lighthouse ≥90** all metrics on landing
10. **Brand voice** respected (no hyperbole, technical concrete claims)
11. **Wording** updated per §8 (no generic "Mooter is a router")
12. **Deployable to Vercel** without additional configuration
13. **/conductor and /workflow routes** implemented with full content per §9 (Worktree Conductor + Dynamic Workflow visibility)
14. **Dashboard mockup** includes Conductor panel + Active workflows panel per §7 visual updates

---

## §19 Craft aesthetic — anti AI-generated look (v12 NEW)

This landing exists in a sea of AI-generated SaaS pages. Most look like a Figma template ran through ChatGPT: same gradient hero, same 3-column features, same "Trusted by 10,000 teams" without trust signals. **Mooter has to look hand-built.** The reader should feel a human cared.

### 19.1 Principles

| Principle | Apply this way |
|---|---|
| **Show the seams** | Comments in code samples, real version numbers in screenshots, real hash strings (e.g. `classify.js sha 7b01eb86`). Avoid placeholder data. |
| **Real numbers > Smooth round numbers** | "$25.95 saved (47%)" beats "Save up to 50%". Never invent stats. |
| **Concrete > abstract** | "Spawned in 200ms via bubblewrap" beats "lightning-fast". |
| **Asymmetry over symmetry** | A 60/40 grid feels designed. A perfect 50/50 grid feels generated. |
| **Type as ornament** | Use weight contrast, tracking, optical sizing. Inter at one weight for everything looks generated. Try Geist + IBM Plex Mono pairing. |
| **One scrappy detail per section** | A handwritten margin note, a slight rotation on a sticker, a tiny typo deliberately preserved. Linear does this with little arrows. Raycast with playful icons. |
| **Photography of physical things, not Midjourney** | If we use imagery: real keyboard, real terminal photographed, real notebook. Not generated stock. |
| **Loading states with personality** | Not "Loading..." — "Counting routing decisions..." or "Asking the cow for advice..." (cow reference is Mooter mascot). |
| **Microcopy with voice** | "Mooter would suggest T1 here" feels human. "AI recommendation: T1" feels generated. |
| **Error states with respect** | "Hub is down. Routing continues locally. Pricing pulled at 06:14 BRT." beats "An error occurred." |

### 19.2 Anti-patterns (do NOT do these)

- ❌ Gradient hero with "Built for the future of work"
- ❌ 3-column "Feature, Feature, Feature" with identical card heights
- ❌ "Loved by developers worldwide" without specific names
- ❌ Lottie animations of abstract shapes pulsing
- ❌ Hero copy with em-dashes used like commas — like — this — everywhere
- ❌ "Boost productivity" / "Streamline workflow" / "Unlock potential" (corporate Mad Libs)
- ❌ Stock photography of people in offices high-fiving
- ❌ Generic icons from Heroicons that the same 500 SaaS pages use without modification

### 19.3 Inspirations to study

- **Linear** — `linear.app` — for typography precision and trust signals (Loom, Vercel, Raycast logos that mean something)
- **Raycast** — `raycast.com` — for dark theme + playful detail balance + extension marketplace pattern
- **Ghostty** — `ghostty.org` — for terminal-native pages
- **Charm.sh** — `charm.sh` — for CLI tool branding done right (TUI screenshots as hero)
- **Anthropic Claude** — `claude.ai` — for restraint and trust
- **Vercel** — `vercel.com` — for performance-first feel
- **Tailscale** — `tailscale.com` — for explaining complex networking with clarity

### 19.4 Designer's note in the page itself

In the footer, include a tiny "Made by Paulo Loureiro in Lisbon" or "Crafted in São Paulo / Lisbon" line — not a corporate "© 2026 Mooter Inc". The page is honest about being one person's project.

---

## §20 Claude Code–aligned slash command taxonomy (v12 NEW)

Mooter's slash commands should feel like Claude Code's slash commands. Users coming from CC shouldn't have to learn a new system. Where CC has `/init`, Mooter has `/moo-init`. Same shape.

### 20.1 The CC slash commands users already know (2026 standard)

| CC command | What it does | Mooter equivalent | What Mooter does |
|---|---|---|---|
| `/init` | Initialize project (CLAUDE.md) | `/moo-init` | Initialize Mooter (preferences.json + routing setup) |
| `/help` | List all commands | `/moo-help` | List Mooter commands grouped by category |
| `/clear` | Clear conversation | `/moo-clear` | Clear local session cache (preserves cross-session learning) |
| `/compact` | Compress context | — | N/A (Mooter doesn't have a conversation context to compact) |
| `/context` | Visual grid of context usage | `/moo-context` | Visual grid of routing context + quota usage |
| `/cost` | Check token usage | `/moo-cost` | Check session cost + saved $ + tier breakdown |
| `/model` | Switch model mid-session | `/moo-model` | Lock tier for next N prompts |
| `/effort` | Adjust reasoning budget | `/moo-effort` | Set effort mode (default / ultramoo / eco) |
| `/resume` | Pick up earlier session | `/moo-resume` | Pick up where Mooter left a workflow |
| `/branch` | Fork conversation | `/moo-branch` | Spawn a parallel routing branch |
| `/review` | Code review prompt | `/moo-review` | Routing decision review (was this tier the right call?) |

### 20.2 Mooter-only slash commands (the 12 we ship today + 4 new in Wave 33.5)

| Command | Purpose | Status |
|---|---|---|
| `/moo-workflow` | Start a local workflow | ✅ Wave 32 |
| `/moo-herd` | Spawn a herd (multiple sub-agents) | ✅ Wave 32 |
| `/moo-dashboard` | Open TUI dashboard | ✅ Wave 32 |
| `/moo-status` | One-line current state | ✅ Wave 32 |
| `/moo-distill` | Distill recent decisions into a skill | ✅ Wave 32 |
| `/moo-pack` | Browse / install packs | ✅ Wave 32 |
| `/moo-sessions` | Cross-session orchestrator TUI | 🟡 Wave 33.5 |
| `/moo-sessions-list` | List active CC sessions with savings | 🟡 Wave 33.5 |
| `/moo-sessions-quota` | 5h quota forecast across sessions | 🟡 Wave 33.5 |
| `/moo-sessions-handoff` | Transfer workflow artifact session-to-session | 🟡 Wave 33.5 |
| `/moo-spawn` | Spawn agent locally with 4-layer sandbox | 🟡 Wave 33.5 |
| `/moo-conductor` | Show worktree conductor state (locks + queue) | 🟡 Wave 33.5 |

### 20.3 Landing page treatment

A dedicated `/commands` page or a section in `/help` route showing the table above side-by-side. **"If you know Claude Code, you already know Mooter."** Make this a hero claim.

---

## §21 System requirements + setup flow (v12 NEW)

The setup is the first 90 seconds. Get it right or the user bounces.

### 21.1 System requirements page (`/install` route + landing section)

Stop hiding requirements behind "Just curl this URL". Show them upfront. Trust earned.

```
┌─ System requirements ─────────────────────────────────────────┐
│                                                                │
│  REQUIRED                                                      │
│  ✓ macOS 14+ (Sonoma) / Ubuntu 22.04+ / WSL2 / Windows 11     │
│  ✓ Node.js 22+ (LTS) — installable via the wizard             │
│  ✓ Claude Code v2.1.150+                                       │
│  ✓ 200 MB disk for Mooter itself                              │
│                                                                │
│  RECOMMENDED                                                   │
│  + 8 GB RAM (16 GB if running Ollama locally)                 │
│  + GPU with 8+ GB VRAM (NVIDIA RTX 3060 or better)            │
│  + Ollama installed (auto-detected by wizard)                 │
│  + Zellij, tmux, or WezTerm (multiplexer plugins)             │
│                                                                │
│  OPTIONAL                                                      │
│  · bubblewrap (Linux/WSL2) for 4-layer sandbox spawn          │
│  · vLLM (GPU box) for EAGLE-3 + Multi-LoRA                    │
│  · Cloud API keys (Anthropic, OpenAI) — Mooter routes locally │
│    when you don't have them                                    │
│                                                                │
│  PLATFORM-SPECIFIC                                             │
│  · macOS: Apple Seatbelt sandbox-exec (built-in)              │
│  · Linux/WSL2: bubblewrap (sudo apt install bubblewrap)       │
│  · Windows native: Job Objects + restricted token (preview)   │
│                                                                │
│  [Check my system →]                                          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 21.2 "Check my system" interactive checker

JS-only, runs in browser:
- Detect OS via User-Agent
- Detect Node version: ask user to paste `node --version` output (no execution)
- Detect Claude Code: ask "Do you have Claude Code installed?" Y/N
- Score: PASS / OPTIONAL FAIL / REQUIRED FAIL with explanation
- Below the result: copy-paste install commands for their specific OS

### 21.3 The install wizard (animated preview)

The landing should show what the install wizard looks like. Animated terminal recording (asciinema), 8 steps, ~30 seconds:

```
Step 1/8  Name  → Paulo
Step 2/8  Use case → Solo (1-3 sessions parallel)
Step 3/8  LLM providers → Anthropic (auto) + Ollama (auto)
Step 4/8  Monthly budget cap → $20
Step 5/8  Privacy → Local-first ✓
Step 6/8  Statusline mode → Compact (recommended)
Step 7/8  Spawn → Local-first with 4-layer sandbox
Step 8/8  Multiplexers → Zellij detected, install plugin ✓

Installing...
✓ classify.js INTACT verified
✓ Migrations 001-017 applied
✓ Routing intelligence baseline ready
✓ 6 adapters registered
✓ Zellij plugin installed
✓ Statusline configured
✓ Health check passed

🐮 Mooter v1.21.1 ready. Type `mooter help` to start.
```

Show this as a video (asciinema embed) OR as scroll-driven terminal animation. Either way: **real recording, not designed mockup**. Authenticity.

### 21.4 First 5 minutes — what to expect

A small section "Your first 5 minutes with Mooter" with 4 quick wins:

1. **0:30** — Install complete, see your dashboard for the first time
2. **1:00** — Run `mooter spawn "say hello"` — watch a local agent spin up safely
3. **2:00** — Open a Claude Code session and see Mooter's statusline appear automatically
4. **5:00** — Spawn 3 sessions in parallel, watch the Conductor coordinate

Each step links to the relevant docs.

---

## §22 Navigation patterns (Linear-grade) (v12 NEW)

Research data (2026): **collapsible sidebar + command palette = the pattern**. Notion, Linear, Asana, HubSpot all converged. Mooter dashboard should follow.

### 22.1 Sidebar (left, collapsible)

```
┌──────────┬────────────────────────────────────────┐
│ 🐮       │  Page content                          │
│          │                                        │
│  Home    │                                        │
│  Sessions│                                        │
│  Spawns  │                                        │
│  Workflows                                        │
│  Pricing │                                        │
│  Settings│                                        │
│          │                                        │
│  ─       │                                        │
│  Help    │                                        │
│  GitHub  │                                        │
│          │                                        │
│  Paulo   │                                        │
│  [⚙]    │                                        │
│          │                                        │
│  [‹]     │  ← Collapse toggle                     │
└──────────┴────────────────────────────────────────┘
```

**Rules:**
- Expanded width: 240px
- Collapsed width: 64px (icons only)
- Collapse state persisted in localStorage (`mooter.sidebar.collapsed`)
- Tooltips on hover when collapsed
- Each item: icon + label + optional badge (e.g. "3" for active sessions)
- Footer pinned: user avatar + settings cog
- Border-right: subtle (`border-zinc-800/50`)

### 22.2 Command palette (Cmd+K / Ctrl+K) — Linear gold standard

The single most important interaction on the dashboard. Type → action.

```
┌────────────────────────────────────────────────────┐
│  /  Type a command or search                       │
├────────────────────────────────────────────────────┤
│                                                    │
│  RECENT                                            │
│    Start workflow                          ⏎      │
│    Switch to Compact statusline mode       ⏎      │
│                                                    │
│  SESSIONS                                          │
│    Show all sessions                       S      │
│    Open quota forecast                     Q      │
│    Kill idle session                       —      │
│                                                    │
│  SPAWN                                             │
│    Spawn local agent...                    N      │
│    List recent spawns                      L      │
│                                                    │
│  SETTINGS                                          │
│    Change statusline mode                  —      │
│    Configure spawn sandbox                 —      │
│    GDPR data export                        E      │
│                                                    │
│  [Cmd+K to close · ↑↓ navigate · ⏎ select]        │
└────────────────────────────────────────────────────┘
```

**Rules:**
- Cmd+K (macOS) / Ctrl+K (Win/Linux) opens from anywhere
- Esc closes
- Fuzzy search across: commands, recent actions, doc pages, sessions
- Use `cmdk` library (shadcn/ui has wrapper)
- Show keyboard shortcuts inline (e.g. "S" to jump to sessions)
- Recent actions section persists (localStorage `mooter.cmdk.recent`)
- Group by category (Sessions, Spawn, Workflows, Settings, Help)
- "Type a command or search" placeholder, italics

### 22.3 Top bar (right side)

```
┌────────────────────────────────────────────────────┐
│  Mooter / Dashboard          🔍 ⌘K   🛎  Paulo ▾  │
└────────────────────────────────────────────────────┘
```

- Breadcrumb left: `Mooter / Sessions / wave33-ultimate`
- Right side: search/cmdk hint, notifications bell (toasts), user menu
- Sticky on scroll
- Subtle border-bottom on scroll

### 22.4 Mobile navigation

- Hamburger top-left opens sidebar as overlay
- Bottom tab bar: Home / Sessions / Spawns / Settings
- Cmd+K replaced with floating "+" button (intent input)
- Touch targets ≥ 44px

### 22.5 Routes mapping

```
/                       Landing
/install                Install + system requirements
/dashboard              Logged-in home
/dashboard/sessions     Cross-session orchestrator
/dashboard/spawns       Active + recent spawns
/dashboard/workflows    Workflow runs
/dashboard/pricing      Cost analysis + budget settings
/dashboard/settings     Preferences + GDPR rights
/spawn                  Public info: spawn agents
/sessions               Public info: cross-session intelligence
/security               Public info: 4-layer sandbox
/compare                Comparison table
/changelog              Version history
/conductor              Public info: worktree conductor
/workflow               Public info: dynamic workflow visibility
/commands               Slash command reference (CC-aligned)
/login                  OPT-IN login (federated wisdom)
/docs                   Documentation (Mintlify-style or just MDX)
```

### 22.6 Loading states with personality

Per §19.1:
- Sessions loading: "Counting your terminals..."
- Workflows loading: "Asking the cow for an update..."
- Pricing loading: "Pulling prices from each provider..."
- Spawns loading: "Tracking down the agents..."
- Empty state Sessions: "No Claude Code sessions running. Open a terminal and type `claude`."
- Empty state Spawns: "No agents spawned yet. Try `mooter spawn 'rename this file'`."

---

## §23 Validation checklist v12 additions

In addition to §16:

- [ ] **Zero "Pastor" in user-facing copy** (search the entire codebase)
- [ ] **"Mooter is the roteador"** consistently across hero, headers, copy
- [ ] **CC slash command taxonomy** matches §20 exactly
- [ ] **System requirements section** matches §21.1 exactly
- [ ] **Install wizard preview** shows real 8-step flow per §21.3
- [ ] **First 5 minutes** section per §21.4
- [ ] **Collapsible sidebar** + Cmd+K command palette per §22
- [ ] **No gradient hero** with abstract Lottie shapes
- [ ] **Real numbers everywhere** (no "up to 50%")
- [ ] **One scrappy human detail per section** (handwritten note, slight asymmetry)
- [ ] **Loading states with personality** per §22.6
- [ ] **Footer credit**: "Crafted by Paulo Loureiro in São Paulo / Lisbon" (not corporate)
- [ ] **`/commands` route** with CC-aligned mapping table
- [ ] **`mooter.ai/install` shows requirements** before showing the install one-liner

---

*Master prompt v12 composto 2026-06-08 ~07h BRT. Adições: §19 craft aesthetic + §20 CC-aligned slash commands + §21 system requirements wizard + §22 Linear-grade navigation + §23 v12 validation. Designer should treat WAVE33_5_HISTORIC_SPAWN_ORCHESTRATOR_KICKOFF.md as implementation reference. **This is the landing that announces Mooter as historic — and looks hand-built, not generated. Make it count.**

---

*Original §1-§18 (v11) precedem este addendum. Read both. v12 overrides v11 wherever they conflict.*
