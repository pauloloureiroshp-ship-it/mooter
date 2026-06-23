# Mooter — Implementation Handoff (one-page spec)

**Version (single source of truth):** `v1.38.5` — derive from `version.json`, inject into hero badge,
compare table, footer, plugin header. Never hardcode per page.

Two surfaces, one design system: **website** (mooter.ai) + **VS Code "Cockpit" plugin**. Same tokens,
same wordmark (Space Grotesk), the **same single canonical cow**, same voice.

---

## 1 · Color tokens (identical on both surfaces)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B0A09` | warm near-black — never `#000` |
| `--bg-2` | `#0F0E0C` | dot-grid / recessed |
| `--surface` | `#141311` | cards, hero card |
| `--surface-2` | `#1C1A17` | lifted (marketplace icon bg) |
| `--border` | `#252220` | hairlines |
| `--border-light` | `#302C28` | emphasized borders |
| `--text` | `#F2EDE6` | warm off-white — never `#FFF` |
| `--muted` | `#7A7168` | secondary text (AA on bg) |
| `--accent` (rose) | `#E8888A` | primary action/emphasis — **accent only** |
| `--accent-2` | `#F2A5A5` | rose highlight |
| `--tier-0` | `#4CAF6A` | T0 local/Ollama — green |
| `--tier-1` | `#5A9BD4` | T1 Haiku — blue |
| `--tier-2` | `#A88BD4` | T2 Sonnet — purple |
| `--tier-3` | `#D46A5A` | T3 Opus — coral |

**Plugin (webview) native greys** — inherit `--vscode-*`; these are the design reference values:
`side #1f1f1f · header #191919 · editor #1e1e1e · activity #2b2b2b · border #2d2d2d · text #cfcfcf ·
dim #8a8076 · faint #5f5a55 · chip #161616`. Brand shows through **accents only** (rose, the warm
hero card, the cow). No "green on everything"; green is reserved for genuine positive signal.

## 2 · Type

- **Space Grotesk** — wordmark, headings, big numbers. Weights 400/500/600/700.
- **JetBrains Mono** — all numbers, code, terminal, labels, tier chips.
- **Caveat** — sparing handwritten annotation only.
- Site sizes: H1 `clamp(84px, 11vw, 152px)` / `-0.055em` · section H2 `46px` / `-0.035em` ·
  body `15px` / 1.6 · eyebrow mono `11px` uppercase `0.08em`. Min body on site ≥ 13px.
- Plugin sizes (300px): tab `11px` · card label (eyebrow) `10px` · hero number `26–32px` ·
  body `11–12.5px` · pill `9.5px`. Body uses the editor UI font.

## 3 · Spacing · radii · shape

- Radii: `6px` controls · `8–10px` cards · `12–14px` hero/window · pill `9999px`.
- Site band padding: `56–64px` desktop → `20px` (`.m-pad`) under 768px; vertical `36–40px` mobile.
- Grid gaps: `16–28px`. All multi-col grids collapse to 1 col under 768px (`.m-stack`),
  4-col stat strips → 2 col (`.m-2col`), wide tables → horizontal scroll (`.m-scroll-x`).
- Focus: `:focus-visible` 2px rose ring on every interactive element.

## 4 · The cow (assets in `handoff/assets/`)

- One canonical mascot only: cream `#F5EDD4` + orange `#FF6B35` (`#E85D2A` inner ear),
  pale muzzle `#FBE6C8`, dark eyes `#2A2622` with white catch-light. 🐮 emoji is the signature.
- `cow.svg` — canonical, full color. `favicon.svg` — same, for the site (replaces the legacy teal "F").
- `cow-mono.svg` — `currentColor` silhouette with eyes knocked out via mask, for the VS Code Activity Bar.
- `cow-marketplace-512.svg` — 512×512 on lifted `#1C1A17` (so it survives the dark Marketplace gallery).
- Kill every other variant (line-art cow, teal favicon, off-brand marketplace icon).

## 5 · Honest-number rules (non-negotiable, both surfaces)

1. **Lead with the REAL number.** Muted/neutral styling for `$0` and for advisory/estimated values —
   **never green for a zero or a naive estimate.** Green = genuine positive only.
2. Label estimates `token-estimated · advisory`. Show **coverage** on partial data (e.g. `measured 126/408`);
   when there is genuinely none yet, say **"no data yet" + a CTA** — never `0/0`.
3. Never place two contradictory numbers side by side (no savings claim next to `$0 saved`).
4. One version string everywhere, from one source (`v1.38.5`).
5. Every degraded/empty state carries a **CTA** — never a raw `—` or "command not found".
6. Disclaimer present: **"Community project · not affiliated with Anthropic."**

## 6 · Plugin — per-tab notes (300px sidebar, ≤5 tabs, no wrap, arrow-key nav, `role=tab`)

**Header (always visible, compact):** cow + project + Claude-Code pairing state (one coherent source —
header and Setup must agree) · Mode picker (🐄 LazyMoo / 🐮 Moo / 🐂 CrazyMoo) · next-prompt model picker ·
labelled **Mooter Score N/8** (never a bare "NN%").

- **Cockpit** — hero "Saved vs all-Opus": big real number, "% below", `real $X vs naive $Y`,
  `token-estimated · advisory`, trend sparkline; offline → "⚠ tracker offline · last known (age)" + reconnect.
  Mode segment + next-prompt picker repeated. Mooter Score: 8 checks, red→amber→green gradient bar, each
  pending check a working **fix** button. Tier-mix bars (T0–T3 colors). CTA "New Claude Code session".
- **Setup** (the heart) — 5-step wizard, each step greens when satisfied: 1 Claude Code detected ·
  2 Mooter engine · 3 Account & keys (show detected plan e.g. "Anthropic: Max ✓ via OAuth"; **keys never
  shown**) · 4 Ollama & model (3 states absent/offline/online, hardware-matched recommendation, one-click
  pull) · 5 Slash commands (one-click install/update). Below: Hardware · Software · Subscriptions ·
  Budget (`$/mo` editor).
- **Herd** — active run (agents done/total · tokens), spawns w/ status, tokens×LLM×agent matrix; empty =
  one line + "Spawn an agent".
- **Decisions** — feed (tier · preview · time · model · confidence · rule), expandable rows + star feedback;
  Insights (cache-hit w/ coverage, confidence Δ, quant/LoRA, hub sync). Empty = "no decisions yet" + CTA.
- **Doctor** — full 8-check list w/ fix buttons, slash-command status, 4-layer sandbox panel
  (network · filesystem · secrets · config).

**States to build for every tab:** happy · first-run (encouraging "to-do", never red "missing") ·
degraded (clear CTA) · loading (readable fallback w/ timeout, never a stuck "renderer warming up…").
Prove reflow at **560px**.

## 7 · Site — surfaces (priority)

P0 `/` (hero + stats + pulse) · `/compare` (11×8 matrix, honest derived scores) · `/install` ·
`/dashboard` (login gate: "works fully offline — sign in only for federated wisdom + cross-device sync"
+ clearly-labelled illustrative teaser). P1 `/conductor` `/workflow` `/methodology` `/packs` `/cockpit`.
P2 `/security` `/sessions` `/changelog` `/privacy` `/commands` `/under-the-hood`.

Hero: primary CTA "Install in 30s" above the fold at 1440px **and** mobile. Terminal animation:
transform/opacity only, respect `prefers-reduced-motion`, pause when off-screen. Zero horizontal overflow
anywhere under 768px.
