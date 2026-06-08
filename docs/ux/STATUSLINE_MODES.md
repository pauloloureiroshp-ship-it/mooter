# Statusline Modes (Wave 32)

Mooter's statusline has four explicit modes plus the adaptive default. Pin one with:

```bash
mooter statusline mode <mini|compact|full|didactic|auto>
mooter statusline show     # preview the current mode (demo render)
```

The mode persists to `~/.mooter/preferences.json` (`statusline_mode`). With **no
mode pinned** (`auto`), the statusline keeps its historical width-based behavior —
**lines 1-2 are byte-for-byte identical** to every prior wave (a hard doctrine
contract; the default path is unchanged, only the explicit modes are new).

| Mode | Lines | What it shows |
|---|---|---|
| `mini` | 1 | Headline only — savings + tier badge. The quietest. |
| `compact` | 2 | Headline + operational chips (line 3 forced **off**). The everyday default richness. |
| `full` | 3 | compact + synthesis chips on line 3 (compression · pastor · limits · effort · quant · vector …). |
| `didactic` | 5 | Human-friendly. Explains every number in plain language — savings, where work ran, the last decision, quota, and a takeaway. |
| `auto` | 1–3 | Adaptive — picks layout from terminal width (`COLUMNS`). The default; restores byte-identical legacy behavior. |

## Render budget

Every mode renders in **≤10 ms** (Starship-grade), verified by
`tools/router/statusline-modes.test.js`. The hot path never makes a network call;
chips that need live data (quant/vector/effort) read **cached snapshots** the CLI
writes, not Ollama directly.

## Line 3 chips (opt-in)

Line 3 only appears in `full` mode (or when `statusline_line3:true` /
`MOOTER_STATUSLINE_LINE3=1`). Chips, each silent when inactive:

- `🐄 ultramoo` / `⚡ effort:high` — current effort mode (`effort-status.js`)
- `📦 <model> · <quant> · <GB>` — local quantization (`quant-status.js`, fed by `mooter quant status`)
- `🧭 <embed-model> · <dims>d` — embedding model (`vector-status.js`, fed by `mooter vector status`)
- plus the Wave 29/30 chips: compression · setup · ecosystem · wave · dogfood · mlwr · limits · pastor

## Didactic example

```
🐮 Mooter saved you $0.27 so far (89% vs running everything on Opus).
   Of 27 routed turns: 67% ran FREE on your machine (T0 🏠), 7% on Haiku, 15% on Sonnet, 7% on Opus.
   Last turn → T2: mid cloud (Sonnet) — real reasoning at 84% confidence.
   You have 42% of your Claude 5h window left.
   ↳ Most work is staying local — that is the savings engine working.
```
