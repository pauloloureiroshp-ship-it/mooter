# Wave 58.3 — Day-0 Recon (honest, empirical)

**Date:** 2026-06-13
**Author:** CC (Opus, beast mode)
**Gate:** Block A complete → this doc unblocks Block B. No code touched yet.
**Method:** every claim below was verified by reading the wired source + running
the renderer (`MOOTER_MOCK=1`), not inferred. Three prior guesses at the prefs
schema failed because they targeted the wrong file — see Root Cause §3.

---

## TL;DR (the two-line answer)

The 8–9-line statusline Paulo remembers **still exists, fully working**, inside the
wired renderer. It is gated behind **one environment variable that was lost from
the user environment**, plus a preferences file that was **created in the wrong
directory**. Nothing is broken or removed.

| Symptom | Root cause | Fix |
|---|---|---|
| Only 3 lines, providers compressed into line 1 (`🧠 0%↓`) | `MOOTER_MODE` env var not set → renderer takes the single-line condensed path | set `MOOTER_MODE=1` at USER scope |
| 🎮 GPU chip absent | dense chip line needs `lineGateOn=true`, which reads `~/.mooter/preferences.json` `statusline_line3:true` — that file is **missing** (it was created at `~/.claude/preferences.json`, the wrong path) | create `~/.mooter/preferences.json` |

---

## A.1 — Statusline architecture

### Entry point (the wired renderer)

`~/.claude/settings.json` → `statusLine.command`:

```json
"statusLine": { "type": "command",
  "command": "node \"C:/Users/Paulo Loureiro/frugal/tools/router/gsd-statusline.js\"" }
```

**The active renderer is `frugal/tools/router/gsd-statusline.js`** (the versioned
repo copy, NOT `~/.claude/tools/router/`). The `~/.claude/` copies are runtime
mirrors kept in sync by `/mooter-update`. Verified: all 5 statusline files are
**byte-identical** between `frugal/` and `~/.claude/` (`diff -q` → SAME). Sync is
healthy; this was never a sync problem.

### The statusline file family (frugal/tools/router/)

| File | LOC | Role | Wired? |
|---|---|---|---|
| `gsd-statusline.js` | 2237 | **THE wired renderer.** Self-contained: own width-adaptive layout + multi-line path. | ✅ YES (settings.json) |
| `chip-composer.js` | 165 | SSOT for the modular chip set (Wave 58 A.5). Called by the wired renderer's `appendModularChips()`. | via gsd-statusline |
| `statusline-multi.js` | 1642 | A **separate, NOT-wired** "modular composer" renderer. Has its own `renderTwoLine`/`renderFromContext`. | ❌ NO |
| `statusline-modes.js` | 163 | The 4 explicit modes (mini/compact/full/didactic). **Only** invoked by `statusline-multi.js`. | ❌ NO (dead code for the active path) |
| `gpu-status.js` | 91 | 🎮 GPU chip (Wave 58.2). A `CHIP_MODULES` member (dense-line only). | via chip-composer |

> **Architectural finding (matters for why guessing failed):** the 4-mode system
> (`statusline_mode: mini/compact/full/didactic`) lives in `statusline-modes.js`,
> which is wired into `statusline-multi.js` — **not** the active `gsd-statusline.js`.
> Setting `statusline_mode` in preferences does **nothing** to the live statusline.
> The active renderer's only layout switch is the `MOOTER_MODE` / `MOOTER_FORCE_MULTILINE`
> env var. (Do NOT touch `statusline-modes.js` — Wave 32 wired, per brief constraint 8.)

### Render flow (entry → output)

```
Claude Code
  │ pipes session JSON on stdin (or MOOTER_MOCK=1 bypasses stdin)
  ▼
gsd-statusline.js  (process.stdin 'end' / mock block, lines 2200-2237)
  │
  ├─► buildStatusline(data)            (line 1632)
  │     │
  │     ├─ IF env MOOTER_MODE=1 OR MOOTER_FORCE_MULTILINE=1   (line 1922)
  │     │     └─► renderMultiLine(...)  (line 1969)  → EXPANDED layout:
  │     │            • header row   (🐮 mooter · tiers · ctx · cycle)
  │     │            • savings row  (🐮 saved $X … · ● healthy)
  │     │            • renderSubscriptionRow() per subscription   (line 940)
  │     │                 → 🧠 Claude Max · …· relaxed pace   (one row each)
  │     │            • renderLocalRow()  (line 1024) → 🦙 Ollama local · …
  │     │
  │     └─ ELSE (default, lines 1947-1963) → ONE width-adaptive condensed line
  │              (🐮 mooter · … · 🧠 0%↓ · 💬 0%↓ · 📦 …)   ← CURRENT STATE
  │
  ▼
appendModularChips(base, data)   (line 2191)
  │   reads lineGateOn() → ~/.mooter/preferences.json statusline_line3
  └─► require('./chip-composer.js').composeChips(session, { lineGateOn })
         │
         ├─ lineGateOn=false → DEFAULT_ELIGIBLE only  → only 🎯 Matrix emits
         └─ lineGateOn=true  → CHIP_MODULES (full)    → incl 🎮 GPU + 📊 mlwr + 🪟 term
  ▼
stdout  (each line \n-terminated; v6.5 requirement)
```

---

## A.2 — Preferences schema (COMPLETE, verified per file)

**Canonical file: `~/.mooter/preferences.json`** (every chip + mode reader uses
`path.join(os.homedir(), '.mooter', 'preferences.json')`). **NOT `~/.claude/`.**

### JSON keys

| Key | Type | Default | Effect | Read by |
|---|---|---|---|---|
| `statusline_line3` | bool | `false` | `true` → `lineGateOn` → full `CHIP_MODULES` dense line (incl 🎮 GPU, 📊 mlwr, 🪟 terminal). | gsd-statusline.js:2187 |
| `statusline_chips.bench` | bool | `false` | 🧪 MooterBench accuracy chip | bench-status.js:38 |
| `statusline_chips.cca_f` | bool | `false` | 📜 CCA-F audit chip | cca-f-status.js:40 |
| `statusline_chips.agents_progress` | bool | `false` | 🤖 multi-agent progress chip | agents-progress-status.js:63 |
| `statusline_chips.burn_rate` | bool | `false` | 🔥 burn-rate $/h chip | burn-rate-status.js:43 |
| `statusline_chips.matrix` | bool | `true` (default-ON) | set `false` to hide 🎯 matrix | matrix-status.js:11 |
| `hidden_chips` | string[] | `[]` | hide named chips: `"gpu"`, `"matrix"`, `"agent_focus"`, `"conductor"`, `"custom"`, `"agents_progress"` | gpu-status.js:79, matrix-status.js, agent-focus-status.js:72, conductor-status.js:80, custom-status.js:65 |
| `statusline_mode` | `"mini"\|"compact"\|"full"\|"didactic"` | none | **DEAD for active renderer** — only statusline-multi.js reads it | statusline-modes.js:58 |
| `herd_visibility` | (legacy) | — | mentioned in statusline-modes.js header as an established pref | — |

### Environment variables

| Env var | Effect | Read by |
|---|---|---|
| **`MOOTER_MODE=1`** | **flat multi-line expanded layout** (in-prompt, the one Paulo wants) | gsd-statusline.js:1922,1943 |
| `MOOTER_FORCE_MULTILINE=1` | boxed multi-line (for the external `mooter-dashboard.js` pane) | gsd-statusline.js:1922 |
| `MOOTER_STATUSLINE_LINE3=1` | forces `lineGateOn=true` (alt to the JSON key) | gsd-statusline.js:2182 |
| `MOOTER_STATUSLINE_BURN=1` | forces `lineGateOn=true` + burn chip | gsd-statusline.js:2183 |
| `MOOTER_STATUSLINE_CCAF=1` | forces `lineGateOn=true` + cca-f chip | gsd-statusline.js:2184 |
| `MOOTER_STATUSLINE_AGENTS_PROGRESS=1` | agents-progress chip | agents-progress-status.js:62 |
| `MOOTER_STATUSLINE_MATRIX=0` / `=1` | hide / force 🎯 matrix chip | matrix-status.js:88 |
| `MOOTER_STATUSLINE_MODE` | pin mode (statusline-multi.js only — not active) | statusline-modes.js:54 |
| `MOOTER_MOCK=1`, `MOOTER_MOCK_SUBS=multi`, `MOOTER_MODE_MOCK`, `MOOTER_PROBE` | testing harness | various |
| `COLUMNS` | terminal width hint | termWidthCols() |

> **`MOOTER_MODE` blast radius (guardrail check):** grepped all of
> `frugal/tools/router/*.js` — `MOOTER_MODE === '1'` is read **only** by
> gsd-statusline.js (lines 1922, 1943) for the layout switch. `savings-tracker.js`
> uses the unrelated `.mooter-mode.json` state file (beast/zen), and
> `MOOTER_MODE_MOCK` is a separate test var. Setting `MOOTER_MODE=1` at USER
> scope affects **only the statusline** — no routing/savings side effects.

---

## A.3 — GPU chip render path (why it doesn't show)

The chip code is **correct and works** — proven directly:

```
$ node gpu-status.js
🎮 RTX 4090 24GB · gpu-high                                   ← renders fine

$ node -e "composeChips('', {lineGateOn:true})"
📊 local routes · run benchmark · 🎮 RTX 4090 24GB · gpu-high · 🪟 main · 🎯 Matrix …  ← incl GPU

$ node -e "composeChips('', {lineGateOn:false})"
🎯 Matrix: 14 mod × 24 cat · 14/336 measured · refreshed 1d ago  ← GPU absent (current)
```

`hw-capability.json` is valid (`vendor:nvidia, name:"RTX 4090", vram_mb:24564,
hw_tier:"gpu-high"`). gpu-status.js is in `CHIP_MODULES` (line 80) but **NOT** in
`DEFAULT_ELIGIBLE` — by design (Wave 58.2: "Dense-line only, never in
DEFAULT_ELIGIBLE"). So it renders **only when `lineGateOn=true`**.

**`lineGateOn()` (gsd-statusline.js:2181) returns false today** because it reads
`~/.mooter/preferences.json` `statusline_line3` — and that file does not exist.
Confirmed hypothesis: *"chip is in CHIP_MODULES but lineGateOn isn't propagating
from preferences."* — exactly right, because the prefs file is in the wrong dir.

---

## Root cause (exact)

1. **Expanded provider layout missing** → the wired renderer's `renderMultiLine`
   path (gsd-statusline.js:1922) is gated behind `MOOTER_MODE=1`. The USER
   environment currently has only `MOOTER_TERMINAL=1` set — **`MOOTER_MODE` is
   absent**. Older sessions that showed 8–9 lines had it set (session-scoped or
   previously persisted); it was lost. `/mooter-update` syncs *files*, never env
   vars, so an update could never restore it.

2. **GPU chip + full dense line missing** → `lineGateOn` reads `statusline_line3`
   from `~/.mooter/preferences.json`, which is **missing**.

3. **Why the prefs guesses failed (×3):** the file was created at
   **`~/.claude/preferences.json`** (contents: `{statusline_line3:true,
   statusline_chips:{bench,cca_f,agents_progress}}`). Every reader uses
   `~/.mooter/preferences.json`. The content was already correct — only the
   **directory** was wrong. `~/.mooter/` exists but is empty.

**The expanded multi-line layout EXISTS in current code (not removed).** Per the
Block A gate, no "implement vs revert" question is needed — Block B proceeds.

---

## Empirical proof of the fix (mock render, `MOOTER_MODE=1`)

```
🐮 mooter · 🐮 Moo · CrazyMoo · LazyMoo · ●T0 50% · ●T1 25% · ●T2 19% · ●T3 6% · ctx … · cycle d13/30
🐮 saved $1.68 (90%↓ vs all-Opus) · spent $0.18 · 42 prompts · 50% local · ● healthy
🧠 Claude Max · $43/$200 month · 5h 49% warm · relaxed pace · ▁▂▃▄▅▆▇ · → 🐂 CrazyMoo /mooter-beast
🦙 Ollama local · 50% routing · model qwen3:30b · p50 10s · cost $0 · 🐮 mooter win
🎯 Matrix: 14 mod × 24 cat · 14/336 measured · refreshed 1d ago
```

With Paulo's **real** `subscription-profile.json` (anthropic:max, openai:none,
openai_codex_cli:chatgpt_pro_or_plus, gemini:none, ollama:installed) the renderer
emits **5 provider rows** (🧠 + 💬 + 📦 ×3) + the 🦙 local row — reproducing the
exact 8–9-line layout Paulo remembers. With `statusline_line3` also on, the chip
line carries 🎮 RTX 4090.

---

## A.4 — Process gap

- **No git hooks** in `frugal/.git/hooks/` (samples only). No `post-merge` /
  `post-checkout` automation.
- `/mooter-update` is a **manual skill** ("If behind: git pull origin main").
- `/mooter-update` syncs **files** (router `*.js`, skills, agents) — it does
  **not** set environment variables. So the statusline's `MOOTER_MODE` dependency
  is invisible to it: a perfect update still yields a 3-line statusline.

**Gap:** the desired layout depends on a USER env var that nothing persists or
restores, and on a prefs file in a path users (and a previous session) get wrong.
**Fix direction (Block C):** document the post-release checklist in CLAUDE.md and
ship `~/.claude/PREFERENCES.md` as the canonical schema reference so the
`~/.mooter/` path and `MOOTER_MODE` are no longer tribal knowledge.

---

## A.5 — CI baseline (pre-existing reds, owned by Block D)

- Wave 58.2 confirmed in `main`: `c006746 feat(wave58.2): GPU chip` + release
  `0109451 sync version.json → 1.38.2`. Working tree has only untracked docs.
- CI workflows present: `.github/workflows/no-frugal.yml` (the rebrand ratchet),
  `.github/workflows/deploy-hub.yml` (hub build + npm audit).
- Three pre-existing reds (NOT introduced by this wave), each its own Block D PR:
  - **D.1** no-frugal ratchet 160 vs baseline 150 (10 new files mention "frugal").
  - **D.2** npm audit HIGH in hub (esbuild/ws dev-dep transitive).
  - **D.3** `zod` missing in `env.js` → blocks `hub-pull` (community tuning),
    does **not** block the statusline.

---

## Fix plan (Block B — adjusted to recon)

This is case **B.1 + B.2 combined** (layout exists; needs both a prefs file AND
an env var). No new renderer, no edit to frozen engine files, no `statusline-modes.js`.

1. **Create `~/.mooter/preferences.json`** (correct path) with:
   ```json
   { "statusline_line3": true,
     "statusline_chips": { "bench": true, "cca_f": true, "agents_progress": true } }
   ```
   → turns on `lineGateOn` → 🎮 GPU + 📊 + 🪟 on the dense chip line.
   (The stray `~/.claude/preferences.json` should be removed to avoid confusion.)

2. **Set `MOOTER_MODE=1` at USER scope** (permanent, all new terminals):
   ```powershell
   [Environment]::SetEnvironmentVariable('MOOTER_MODE','1','User')
   ```
   → expanded multi-line provider layout.

3. **Document** the schema in `~/.claude/PREFERENCES.md` (Block B deliverable) and
   the post-release checklist in `CLAUDE.md` (Block C).

4. **Validate** in a brand-new CC terminal: statusline shows ~9 lines incl
   `🎮 RTX 4090 24GB · gpu-high`. Capture as PR evidence.

**Open decision for Paulo before applying** (UX change + permanent env var):
which activation method, and whether to also flip the dense-line chips on. See the
chat message accompanying this doc.
