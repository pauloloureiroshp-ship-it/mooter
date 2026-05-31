# ADR 020 — Adapter Forge Approach

## Status

Proposed (Wave 5 D1, 2026-05-31)

## Context

Mooter has shown the disclosure "◌ baseline · LoRA: Wave 5" since Wave 2.6 D3
(statusline, Moo card, dashboard). Wave 5 promises real LoRA/adapter support — a
Moo specialized per domain/pack. We must choose HOW to implement it without
breaking Mooter's stack (JS/TS native) or its local-first ethos.

## Decision drivers

1. **Stack** — Mooter is JS/TS native. Adding Python = a new runtime dependency
   that every casual user would have to install.
2. **Privacy / local-first** — Paulo's vision is local-first; training and
   inference should stay on the user's machine, not the cloud.
3. **Ollama** — already the local backbone. It can *load* a LoRA/adapter merged
   into a base model via a Modelfile, but it is a runtime, not a trainer.
4. **hub/** — already runs a `router-tuning` cron, but that tunes the *classifier
   regex*, not model weights. Reusing it for training would mean cloud GPUs +
   breaking local-first. (Recon confirmed: no existing LoRA/adapter infra.)
5. **Time-to-ship** — D1 is foundation only; D2 ships the first real adapter path.

## Options considered

### A. Ollama LoRA via Modelfile
- **Pros:** native stack, zero Python deps, local GPU, full privacy.
- **Cons:** Ollama loads adapters but does not train them — a trainer is still
  needed to *produce* the `.gguf` adapter.

### B. Python/PyTorch external (unsloth / mlx)
- **Pros:** more control, better for R&D.
- **Cons:** heavy new stack; complicates install for casual users.

### C. hub/router-tuning extension (cloud training)
- **Pros:** centralizes tuning in the backend.
- **Cons:** cloud-side training breaks local-first and needs GPU in hub.
- Not recommended for the Mooter ethos.

### D. Hybrid — Ollama for inference + optional external (Docker unsloth) for training
- **Pros:** default path is pure Ollama (zero heavy install); advanced users can
  train locally via an opt-in Docker image.
- **Cons:** two code paths.
- **Selected** — preserves local-first without forcing a heavy install on the
  ~90% of users who will run user-provided or shared adapters.

## Decision

**Hybrid (Option D)**, shipped incrementally:

- **D1 (this wave):** Foundation — `mooter_adapter` manifest v1 schema, a runtime
  selection stub (`tools/router/adapter_selection.js`, always returns `null` =
  baseline today), the `mooter adapter` CLI scaffold (honest stubs), and updated
  honest disclosures ("forge ships Wave 5 D2").
- **D2:** `mooter forge` CLI that accepts a user-provided `.gguf` adapter, validates
  it (base-model match, quantization, optional benchmark), and activates it so
  `adapter_selection` returns it and Ollama loads it.
- **D3+:** Optional Docker `unsloth` integration to *train* an adapter locally
  from a pack's seed examples.

## Consequences

**Positive**
- Zero Python deps by default; Mooter install stays light.
- Advanced users are not blocked from training.
- Local-first ethos preserved (no cloud training).

**Negative**
- D1 ships no real training — the disclosure stays "baseline" longer.
- Casual users accept "baseline" until D2.
- Auto-train ("Adapter Forge" proper) only arrives in D3+.

## Honest disclosure (kept in statusline / Moo card / dashboard)

- Pre-D2 (today): `adapter ◌ baseline (forge ships Wave 5 D2)`
- Post-D2, none active: `adapter ◌ baseline (run \`mooter adapter list\`)`
- Post-D2, adapter active: `adapter 🔧 {name} (validated · {quant})`

The runtime stub returns `null` even if a user manually marks an adapter active,
because D1 ships no validation pipeline — the CLI says so explicitly.
