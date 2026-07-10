Mooter — Unified Design Masterprompt (for Claude Design)

# GOAL
Mooter is a local-first LLM router for Claude Code. It has TWO surfaces that must feel like ONE polished,
honest, first-party-grade product: the website (mooter.ai) and a VS Code sidebar plugin called "Cockpit".
They share a single design system. Your job is to design both so a visitor who sees the site and then
installs the plugin feels the exact same product.

This is VISUAL + INTERACTION design. For the plugin, MOCK all data and states — do NOT implement CLI calls,
secrets, detection, or routing. Show realistic mock data and every important state.

# NORTH STAR (one sentence that decides everything)
"An Anthropic engineer opens the Cockpit and within 30 seconds understands what Mooter saved them, switches
mode, picks the model for the next prompt, and feels this is as polished as a first-party product — honest,
local-first, zero friction." Optimize for: immediate clarity, radical honesty of numbers, and a setup that
never leaves the user stuck. Anything that doesn't serve this is noise.

# THE SINGLE DESIGN SYSTEM (source of truth — applies to BOTH surfaces; any divergence is a brand bug)
COLOR TOKENS (exact hex — identical on site and plugin):
- bg #0B0A09 · surface #141311 · surface-2 #1C1A17
- brand green #4CAF6A (= tier T0) · coral/accent #E8888A
- tiers: T0 #4CAF6A · T1 #5A9BD4 · T2 #A88BD4 · T3 #D46A5A
- text cream #F2ECDF · muted #8A8076
- Reserve green and coral for ACCENTS only — never "green on everything". On the plugin, surfaces inherit
  the editor theme feel; brand shows through in accents, the hero card, and the mascot.

TYPOGRAPHY: Space Grotesk for the wordmark and big numbers. On the plugin, body text uses the editor's
default UI font; on the site, body uses the existing site font. Keep the wordmark identical on both.

MASCOT — ONE canonical cow only: geometric, cream #F5EDD4 + orange #FF6B35, dark eyes with a catch-light,
rounded muzzle (Ollama-inspired geometry). Use it consistently everywhere. KILL every other variant:
no line-art cow, no legacy teal "F" favicon, no off-brand marketplace icon. On the site, replace the
legacy teal "F" favicon with the canonical cow. The 🐮 emoji is the signature.

VOICE: playful but technical, honest, local-first. No hype — the numbers speak. Modes are named
Moo / LazyMoo / CrazyMoo.

HONESTY RULES (non-negotiable, both surfaces):
- Always LEAD with the REAL number. Use neutral/muted styling for $0 and for advisory/estimated values —
  NEVER show green for a zero or for a naive estimate.
- Label estimates as "token-estimated · advisory". Where data is partial (e.g. a model matrix), show
  coverage ("measured 14/408") and mark heuristic fallbacks. Never fabricate "best model for X".
- Never put two contradictory numbers side by side (e.g. a savings claim next to "$0 saved").
- A single version string everywhere, from one source: v1.38.5.

UI PRINCIPLES (both): dark-first; visible honesty (advisory / last-known / coverage labels on any number);
accessibility (visible focus rings, full keyboard nav, role=tab/button, AA contrast incl. high-contrast).
Degraded states ALWAYS carry a clear CTA — never a raw "—" or "command not found". A subtle
"Community project · not affiliated with Anthropic" disclaimer.

==================================================================================================
# PART 1 — VS CODE PLUGIN "COCKPIT"  (this surface came out wrong before — rebuild it carefully)
==================================================================================================
CANVAS: it lives in a VS Code sidebar — NARROW and resizable. Design primarily at 300px width; also show
560px to prove reflow. Never more than 5 tabs and never let the tab strip wrap at 300px.

HEADER (always visible, one compact row):
  🐮 mooter · {project} · [Claude Code ✓/✗ pairing] · [Mode ▾ Moo/LazyMoo/CrazyMoo] · [Next prompt: model ▾] · [Mooter Score NN%]
- The mode switch and the next-prompt model picker live HERE — both one click.
- Label the score as "Mooter Score" (not a bare "NN%").

EXACTLY 5 TABS (role=tab, arrow-key navigable, visible focus): Cockpit · Setup · Herd · Decisions · Doctor.

COCKPIT (first impression):
- Hero "Saved vs all-Opus": big number, "% below", and "real $X vs naive $Y", a small "token-estimated ·
  advisory" label, and a sparkline of the trend. Apply the HONESTY RULES: lead with the real value; muted
  for $0; if the tracker is offline show "⚠ tracker offline · last known" with the snapshot age.
- Mode segment replicated here (🐄 LazyMoo · 🐮 Moo · 🐂 CrazyMoo) + the next-prompt model picker.
- Mooter Score: 8 checks, red→amber→green gradient bar; every pending check has a working "fix" button.
- Tier mix bars (T0 local · T1 · T2 · T3) in the tier colors.
- CTA: "New Claude Code session".

SETUP (onboarding wizard — the heart of this version):
- A 5-step wizard, each step turns green when satisfied:
  1) Claude Code detected  2) Mooter engine installed  3) Account & keys (show the detected plan, e.g.
  "Anthropic: Max ✓ via Claude Code OAuth"; keys are NEVER shown in the UI)  4) Ollama & model — three
  states (absent / installed-offline / online), recommend a model by hardware, one-click pull
  5) Slash commands — one-click install/update, grouped list.
- Below the wizard: Hardware · Software · Subscriptions · Budget (a "$/month" editor).

HERD: active run (agents done/total · tokens), spawns with status, a tokens×LLM×agent matrix, live sessions.
DECISIONS: a feed (tier · preview · time · model · confidence · rule) with expandable rows and star
feedback; plus Insights (cache-hit rate, confidence delta, quant/LoRA, hub sync).
DOCTOR: the Score checks, slash-command status, and a 4-layer sandbox security panel.

STATES YOU MUST DESIGN (not just the happy path):
- First-run / empty: encouraging "to-do" styling — never red "missing" that reads as an error. Every empty
  state = one line + one CTA.
- Degraded: always a clear CTA ("needs the Mooter CLI — install").
- Advisory / coverage: show the labels described in HONESTY RULES.
- Loading: a readable fallback with a timeout — never a stuck "renderer warming up…".

PLUGIN DELIVERABLE: all 5 tabs at 300px (plus the header), the 5-step wizard states, the key empty/degraded
states, and one screen at 560px proving reflow. Annotate each honesty/hierarchy decision in one line.

==================================================================================================
# PART 2 — WEBSITE mooter.ai  (inherit the exact same system; do the items that still apply)
==================================================================================================
Apply the shared design system above (tokens, Space Grotesk wordmark, canonical cow, voice, honesty rules).
Replace the legacy teal "F" favicon with the canonical cow.

Do these items (skip the ones already clean — the 11×8 comparison matrix and the live-pulse honesty are fine):
- VERSION: stamp v1.38.5 everywhere from ONE source token, never hardcoded per page.
- HERO: tighten the copy so the primary CTA ("Install in 30s") is above the fold at 1440px and on mobile;
  move the long paragraph into a "How it works" section below. Keep the terminal mockup as live proof.
- LOGIN page: use "Works fully offline — sign in only for federated wisdom + cross-device sync", plus an
  illustrative, clearly-labelled (non-real) dashboard teaser showing savings, 5h quota forecast, and herd.
- Fix the login-gate terminal mockup bleeding off the right edge on mobile.
- Lighten the terminal animation: transform/opacity only, respect prefers-reduced-motion, pause when off-screen.
- Full responsive audit < 768px on all pages — zero horizontal overflow anywhere.

SITE DELIVERABLE: homepage (hero + stats), login page with teaser, and the responsive (390px) versions,
all coherent with the shared tokens and the canonical cow.

==================================================================================================
# HARD RULES (both surfaces)
==================================================================================================
- Brand parity is exact: same tokens, same Space Grotesk wordmark, the SAME single canonical cow, same voice.
- Plugin: ≤5 tabs, no wrap at 300px, full keyboard nav.
- Honest numbers only: lead with real, muted for $0/advisory, never green for zero, show coverage, never
  two contradictory numbers side by side.
- Every degraded/empty state has a CTA — never a raw "—" or "command not found".
- Community disclaimer present (not affiliated with Anthropic).

# ACCEPTANCE ("done & impressive")
- A user feels site and plugin are one product (colors, font, one cow, one voice).
- In the Cockpit: switch mode and pick the next-prompt model in one click from the header/Cockpit.
- The onboarding wizard can take a new user from zero to "perfect setup" without leaving the plugin
  (or with crystal-clear CTAs when the terminal is needed).
- Every number is honest (advisory/coverage/last-known); nothing fabricated.
- ≤5 tabs, no wrap; everything keyboard-navigable with visible focus.

# IF YOU NEED TO SCOPE DOWN
Build the plugin first (it came out worst): Cockpit + Setup before Herd/Decisions/Doctor. Then the site.
