# Wave 12 — Statusline Polish Micro-Brief

> **Scope**: aesthetic + microcopy + ordering refinements to `tools/router/statusline-multi.js` (and `sparkline.js`).
> Wave 10 Phase A Variant C is the baseline (sparkline + tier mix + savings $). This brief polishes
> per 2026 terminal-UI best practices (Starship · Oh My Posh · Lualine · Powerline · Spaceship)
> WITHOUT touching any calculation, schema, or data layer.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - All calculation logic (savings %, tier confidence, local %, VRAM, quota math) UNCHANGED
> - Only changes: labels, order, separators, colors (within existing palette), missing qualifiers, removal of stale CTAs
> - Statusline test snapshots updated (no behavior regression)

---

## 1. Reference benchmarks (2026 state of the art)

### Dominant cross-shell prompts
- **[Starship](https://starship.rs/)** (Rust, 45k+ stars) — "minimal, blazing fast, customizable". Default philosophy: "show only what matters". Presets like Pastel Powerline + Catppuccin Powerline are reference aesthetic.
- **[Oh My Posh](https://ohmyposh.dev/)** (Go) — JSON config, segments (git/path/node/exit/executiontime), supports true color + nerd fonts.
- **[Lualine](https://github.com/nvim-lualine/lualine.nvim)** — Neovim plugin. **Sections A/B/C/X/Y/Z** mental model: A (mode/big signal), B (file/branch), C (filename), X (filetype/encoding), Y (progress), Z (location). **Mooter statusline benefits from this chunking model.**
- **[Powerline](https://github.com/powerline/powerline)** — pioneer of segment-with-arrow style.
- **[Spaceship Prompt](https://spaceship-prompt.sh/)** (ZSH) — async, sections-driven.

### Key design principles synthesized from research
1. **Visual hierarchy** — eye naturally goes to highest-contrast element first. `saved $` should win the first glance.
2. **Color as signal** — green=positive, yellow=watch, red=alert. Mooter already does this with tier colors (cinza T0 / azul T1+T2 / rosa T3). Don't add more colors; use what's there better.
3. **Progressive disclosure** — what's dense for vibe coders is overwhelming for casuals. Mooter's audience is vibe coders → dense OK, but stale/broken elements must go (G-3 below).
4. **Information chunking** — group related elements; separate groups by visual gap or anchor emoji.
5. **No superfluous visual baggage** — every glyph earns its place.
6. **Qualifiers reduce ambiguity** — `100%` alone is meaningless; `100% Claude Max · 5h reset` is concrete.

### What Mooter does that others don't (keep these)
- **Sparkline tier-mix `▁▁▃▁█▃▁▁▃█ last 10`** — single most memorable Mooter element. Anthropic showcase trunfo.
- **Inline education** — `Q4_K_M (-72% size · ~99% quality vs FP16)` teaches quantization while you work.
- **Hardware chip** — `🎮 RTX 4090 (5.4GB / 24GB)` gives agency ("I have headroom").
- **Hook architecture** — appears in <50ms, not async. Polished real-time vs Starship's git-status latency.

---

## 2. Audit of current statusline (2026-06-02)

```
🐮 mooter saved $1.80 (53%) · T0 local 0.80  ▁▁▁▁▁▁▁▁ last 10
🐄 · 🏠 local ×2 · ░░░░░░░░░░ 60% local · 🎮 RTX 4090 (5.4GB / 24GB) · 100% 5h · quant Q4_K_M (-72% size · ~99% quality vs FP16) · adapter ○ baseline · install via mooter forge install <gguf>
```

### Element-by-element grade

| # | Element | What it means | Grade | Why |
|---|---|---|---|---|
| 1 | 🐮 | Brand marker | ✅ A | Memorable, single glyph cost |
| 2 | `mooter saved $1.80 (53%)` | Cumulative savings + % vs baseline | ⚠️ B | Missing timeframe (today? session?). Missing baseline label (vs all-Opus?) |
| 3 | `T0 local 0.80` | Tier + classifier confidence | ⚠️ B+ | Missing model name. Confidence number without color signal |
| 4 | `▁▁▁▁▁▁▁▁ last 10` | Sparkline tier mix last 10 decisions | ✅ A+ | The trunfo. Don't touch. |
| 5 | 🐄 | Second cow emoji | ❌ D | Redundant with 🐮. Communicates nothing distinct |
| 6 | `🏠 local ×2` | Count of local runs in session | ⚠️ B | Missing denominator ("×2 out of how many?") |
| 7 | `░░░░░░░░░░ 60% local` | Bar + % local session-wide | ✅ A | Complements sparkline at different scale |
| 8 | `🎮 RTX 4090 (5.4GB / 24GB)` | Hardware ID + VRAM now/total | ✅ A | Tactical, gives agency |
| 9 | `100% 5h` | Claude Max quota: % avail + h to reset | ❌ D | No label. Looks like noise. Vibe coder novo doesn't decode |
| 10 | `quant Q4_K_M (-72% size · ~99% quality vs FP16)` | Quantization education | ✅ A | Educative without being condescending |
| 11 | `adapter ○ baseline` | Adapter state, ○ = none | ⚠️ C+ | ○ alone is ambiguous. "baseline" word helps but unclear semantic |
| 12 | `install via mooter forge install <gguf>` | CTA for adapter install | 🔴 F | **`mooter forge install` is not shipped** (Wave 5 ETA Q3 2026). Suggests a command that fails |

### Severity bucket

🔴 **Critical (honesty/broken)**: G-3 (`mooter forge install` doesn't exist), G-9 (`100% 5h` no label)

🟠 **Important (clarity)**: G-2 (missing `saved` timeframe + baseline label), G-5 (missing model name), G-6 (missing denominator on local count)

🟡 **Polish**: G-4 (redundant 🐄), G-11 (adapter ○ semantic)

---

## 3. Proposed redesign — line by line

### Design principles applied
- **Hierarchy**: brand → outcome → ritmo → tier-specifics on Line 1; system context on Line 2.
- **Chunking** (Lualine A/B/C/X/Y/Z model): visual mental sections separated by `·`; emoji as section anchor.
- **No stale CTAs**: replace `mooter forge install <gguf>` (Wave 5 not shipped) with shipped alternative `mooter pack list` (exists).
- **Qualifiers** added where ambiguous (`today`, `vs all-Opus`, `Claude Max`).
- **One brand glyph** (🐮) instead of two.

### Proposed Line 1 — outcome + ritmo + tier-now

```
🐮 saved $1.80 today (53% vs all-Opus)  ▁▁▁▁▁▁▁▁ last 10  ·  T0 qwen2.5:3b · conf 0.80
```

Changes from current:
- `mooter saved` → `saved` (🐮 already brands)
- Added `today` qualifier (alternatives: `this session`, `this week` — pick one consistently)
- Added `vs all-Opus` baseline label
- Sparkline moved **before** tier text (sparkline is the trunfo — visual hit first)
- `T0 local 0.80` → `T0 qwen2.5:3b · conf 0.80` (model name surfaced; `local` redundant since T0 = local by definition)
- `conf 0.80` instead of bare `0.80` (the number means nothing without label)

### Proposed Line 2 — system context

```
🏠 6/10 local  ████░░░░░░ 60%  ·  🎮 RTX 4090 22% VRAM  ·  ☁ Claude Max 100% · 5h reset  ·  ⚙ Q4_K_M −72% size · −1pp quality  ·  adapter — baseline · `mooter pack list`
```

Changes from current:
- Removed redundant 🐄
- `local ×2` → `6/10 local` (denominator added; numbers from current data layer)
- VRAM `(5.4GB / 24GB)` → `22% VRAM` (% is more glanceable than raw GB; raw on hover/`mooter doctor` if needed)
- `100% 5h` → `☁ Claude Max 100% · 5h reset` (anchor emoji + label)
- `quant Q4_K_M (-72% size · ~99% quality vs FP16)` → `⚙ Q4_K_M −72% size · −1pp quality` (anchor emoji + tighter phrasing; "−1pp quality" is the negative framing of "99%" — more honest as a delta)
- `adapter ○ baseline` → `adapter — baseline` (em-dash reads cleaner than ○ for "none")
- `install via mooter forge install <gguf>` → **REMOVED**, replaced with `\`mooter pack list\`` (shipped command, leads to packs page)

### Narrow viewport fallback (<120 cols)

Current single-line:
```
🐮 mooter saved $0.27 (89%) · T2 sonnet 0.84 │ ctx 42% · ...
```

Proposed:
```
🐮 saved $0.27 today (89%)  ▁▁▃▁█▃▁▁▃█ ·  T2 sonnet · 60% local · ☁ 100%
```

Same principles: outcome → ritmo → tier-now → essential context. Drop hardware/quant/adapter when narrow.

---

## 4. Honest trade-offs Paulo decides

| # | Trade-off | Option A | Option B | Recomendação |
|---|---|---|---|---|
| T-1 | Timeframe qualifier | `today` | `this session` | **`today`** — matches `mooter trail` daily aggregation; "session" is fuzzy when sessions cross days |
| T-2 | Baseline label | `vs all-Opus` (long) | `vs Opus` (short) | **`vs all-Opus`** — "all-Opus" makes the comparison concrete; vibe coders know the term |
| T-3 | Sparkline position | Line 1 (proposed) | Line 1 right (current) | **Line 1 left after `saved $`** — visual hit early |
| T-4 | Adapter ○ symbol | Keep `○` | Em-dash `—` | **Em-dash** — `○` reads as "unselected radio button"; em-dash reads as "none" |
| T-5 | Quality framing | `~99% quality vs FP16` | `−1pp quality` | **`−1pp quality`** — honest delta framing; not over-claiming "99%" |
| T-6 | 🐄 second cow | Remove | Repurpose (idle/active state) | **Remove** — repurpose adds complexity for marginal value |

If Paulo disagrees on any T-X, swap; CC respects override.

---

## 5. Implementation scope (add to Wave 12 PR-G OR new PR-I)

### Files touched
- `tools/router/statusline-multi.js` — main renderer
- `tools/router/sparkline.js` — UNCHANGED (calculation intact)
- `tools/router/badge.js` — possibly minor (depends on shared formatters)
- `tools/router/__tests__/statusline.test.js` — snapshot update + per-element assertion tests
- `tools/router/__tests__/statusline.fixtures.json` — golden fixtures

### Estimated CC time
**~45-60 min**: read current renderer → apply 6 microcopy/order changes → update fixtures → tests. No calculation logic changes; classify.js byte-identical (P11).

### Bundle decision (Paulo)
- **A**: Add to Wave 12 PR-G (hero copy + methodology + statusline) — bundles "all-narrative-fixes" into one promote
- **B**: New PR-I dedicated to statusline (cleaner review, separable)
- **C**: Defer to Wave 13

**Recommendation**: **A (PR-G amend)** — same theme (value-prop crystallization), same risk profile (landing+display, no schema), same review reviewer.

---

## 6. What this DOES NOT do

To make the boundary clear:

- ❌ NOT changing any savings calculation
- ❌ NOT changing tier classification logic
- ❌ NOT changing sparkline window or color algorithm
- ❌ NOT changing local % computation
- ❌ NOT changing VRAM/quota detection code
- ❌ NOT changing the Stop-hook digest, badge, or `mooter trail` output
- ❌ NOT touching `classify.js` (P11 byte-identical)
- ❌ NOT adding new telemetry / no new endpoints

Only the **render layer** is touched.

---

## 7. Sources

### Reference statusline projects
- [Starship](https://starship.rs/) — minimal cross-shell prompt
- [Starship Pastel Powerline preset](https://starship.rs/presets/pastel-powerline)
- [Starship Catppuccin Powerline](https://starship.rs/presets/catppuccin-powerline)
- [Oh My Posh](https://ohmyposh.dev/) — JSON-themed cross-shell prompt
- [Oh My Posh vs Starship](https://ohmyposh.net/oh-my-posh-vs-starship/)
- [Lualine.nvim](https://github.com/nvim-lualine/lualine.nvim) — Neovim statusline (sections A/B/C/X/Y/Z model)
- [Powerline](https://github.com/powerline/powerline) — segment-with-arrow pioneer

### UX & terminal design principles
- [UX patterns for CLI tools (Lucas F. Costa)](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html)
- [CLI UX best practices (Evil Martians)](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)
- [A Designer's Guide to the Terminal (Alex Chan)](https://www.alexchantastic.com/designers-guide-to-the-terminal)
- [Visual Hierarchy principles (Netwave)](https://www.netwaveinteractive.com/blog/visual-hierarchy-in-ui-ux-design-principles-strategies-and-best-practices/)
- [Progressive Disclosure (NN/G)](https://www.nngroup.com/articles/progressive-disclosure/)
- [Manage Data Density High-to-Low (Fresh Consulting)](https://www.freshconsulting.com/insights/blog/ui-ux-principle-52-manage-data-density-high-level-to-low-level/)
- [Terminal Is All You Need: Human-AI Agent Collaboration (arxiv 2603.10664)](https://arxiv.org/html/2603.10664v1)

---

## 8. Master prompt for CC (append to Wave 12 PR-G OR new PR-I)

Paste into Claude Code when ready:

```
Adiciona statusline polish ao scope da PR-G da Wave 12 conforme docs/strategy/WAVE12_STATUSLINE_POLISH_MICROBRIEF.md.

Scope CRÍTICO — só camada de render. NÃO toques em:
- classify.js (P11 byte-identical)
- Qualquer cálculo de savings, tier, local %, VRAM, quota
- sparkline.js (algoritmo intacto)
- Schema mooter_event ou hub
- Stop-hook digest, badge, mooter trail

Mudanças (6 microcopy/ordem) em tools/router/statusline-multi.js:

1. **Line 1 reordering + qualifiers**:
   - Current: `🐮 mooter saved $X.XX (Y%) · T0 local 0.80  ▁▁▁▁▁▁▁▁ last 10`
   - New:     `🐮 saved $X.XX today (Y% vs all-Opus)  ▁▁▁▁▁▁▁▁ last 10  ·  T0 <model_name> · conf 0.80`
   - Adds: "today" qualifier, "vs all-Opus" baseline label, model name surfaced, "conf" prefix on confidence
   - Removes: redundant "mooter" word (🐮 brands), redundant "local" (T0 = local by definition)

2. **Line 2 remove redundant 🐄**:
   - Drop second cow emoji entirely. Single 🐮 on Line 1 is enough brand.

3. **Local count denominator**:
   - Current: `🏠 local ×2`
   - New:     `🏠 N/M local` where N=local count, M=total in session window (data already exists in tier-mix tracker)

4. **VRAM as percentage**:
   - Current: `🎮 RTX 4090 (5.4GB / 24GB)`
   - New:     `🎮 RTX 4090 22% VRAM` (compute % from existing GB values; raw GB exposed via `mooter doctor`)

5. **Claude Max label + quantization framing + adapter symbol**:
   - Current: `100% 5h · quant Q4_K_M (-72% size · ~99% quality vs FP16) · adapter ○ baseline · install via mooter forge install <gguf>`
   - New:     `☁ Claude Max 100% · 5h reset  ·  ⚙ Q4_K_M −72% size · −1pp quality  ·  adapter — baseline · \`mooter pack list\``
   - Anchor emoji ☁ for cloud quota, ⚙ for quantization
   - Honest delta framing "−1pp quality" instead of "~99%"
   - Em-dash for "none" instead of ambiguous ○
   - Replace stale `mooter forge install <gguf>` (Wave 5 NOT shipped) with `mooter pack list` (shipped CLI command)

6. **Narrow viewport fallback (<120 cols)**:
   - Single line: `🐮 saved $X.XX today (Y%)  ▁▁▃▁█▃▁▁▃█ ·  T<N> <model> · M% local · ☁ <quota>%`
   - Drop hardware/quant/adapter when narrow.

Tests:
- Update tools/router/__tests__/statusline.test.js snapshots
- Add per-element assertion tests (one per change above)
- Add narrow viewport snapshot
- Verify classify.js sha256 unchanged

Sources de referência (cita no PR description):
- Starship/Oh My Posh/Lualine/Powerline — terminal-UI 2026 SOTA
- UX patterns: visual hierarchy, progressive disclosure, information chunking
- Cita o WAVE12_STATUSLINE_POLISH_MICROBRIEF.md como design source-of-truth

Final-reviewer: pede T3 (Opus) APPROVE confirmando 0 mudanças de cálculo. Cita classify.js sha256 antes/depois no PR body.

Tempo estimado: ~45-60 min. Bundle no PR-G (recomendado) ou PR-I dedicada.
```

---

**Composed by Cowork, 2026-06-02. Statusline polish add-on to Wave 12. No new features, no
calculation changes — only render layer microcopy, ordering, and stale-CTA cleanup per 2026
terminal-UI SOTA best practices.**
