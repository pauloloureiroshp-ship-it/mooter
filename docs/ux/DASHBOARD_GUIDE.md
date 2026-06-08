# Dashboard & Watch TUIs (Wave 32)

Three full-screen, zero-dependency (raw ANSI) terminal UIs. Each has a pure frame
builder (rendered as a string, fully testable) and a thin interactive shell.

## `mooter dashboard`

The full-screen view of the Mooter's state. Five+ widgets, refreshing live:

- **MOOS ACTIVE** — one row per model pastored this session (from `decisions.log`)
- **SAVINGS** — saved $ / % / turn / all-time (from the savings-tracker; honest "offline" when down)
- **QUOTA** — Anthropic 5h / 7d windows as bars
- **PASTOR v2** — per-task LoRA adapters registered (6) + how to route/inspect
- **HARDWARE** — GPU / VRAM / RAM / cores (from `~/.mooter/profile.json`)
- **WORKFLOWS** — recent runs (Wave 28 store)
- **LIMITS** — cost-cap ceilings (`~/.mooter/limits.toml`)

Keys: `r` refresh · `w` re-pull workflow rows · `q` quit. Renders correctly in an
80×24 terminal (display-width aware: emoji count as 2 columns).

```bash
mooter dashboard [--refresh-ms 1000] [--session-id <id>]
```

## `mooter workflow watch <run_id>`

Ralph-style **Mission Control** for a running workflow. Read-only over the Wave 28
run store (`loadRun` + `resumeFrom` — the engine itself is untouched), with an
**external control plane** at `~/.mooter/workflow-control/<run>.json`.

- AGENTS — per-agent rows (backend glyph · model · cost · latency; ✗ marks killed)
- METRICS — local/cloud split · cost · savings vs all-Opus · progress
- CONTROL — the live intent the watch broadcasts

Interactive keys: `p` pause · `r` resume · `k` kill run · `q` quit. Scriptable too:

```bash
mooter workflow watch <run_id> --pause | --resume | --kill | --kill-agent <label>
```

> Pause/resume/kill write an **intent**. A cooperating runner enforces it on its
> next poll of the control file — the watch owns the control plane; enforcement is
> opt-in on the runner side (so the Wave 28 engine stays untouched).

## `mooter pastor train-watch`

TensorBoard-like local view of LoRA training. Reads `train-status.json` (Wave 31)
plus an **optional** `~/.mooter/pastor/train-metrics.json` (loss curve / per-task
scores) the trainer may write. Honest by design: no metrics file → it shows the
basic status + the registry's task adapters, never a fabricated curve.

- RUN — phase · task · samples · progress + ETA (when running)
- LOSS CURVE — unicode sparkline of train (and validation) loss
- PER-TASK SCORES — bars per task type, or the registered adapters when no scores yet

```bash
mooter pastor train-watch [--json]
```
