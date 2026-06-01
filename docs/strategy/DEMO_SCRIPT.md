# Mooter v1.0 — Demo Script (10 min, verbatim + timing)

> Companion to `ANTHROPIC_SHOWCASE_PLAN.md` §3. Read aloud while screen-sharing.
> **Audience**: Anthropic DevRel / a vibe-coder evaluator. **Goal**: show radical routing transparency inside Claude Code, local-first, honest.
>
> ⚠ **Run BEFORE the live demo** so the screen matches this script:
> 1. Apply Supabase migrations 006/007/008 (else `/admin/feedback` + install-URL are empty).
> 2. Land the polish-PR that fixes the 6 stale `"ships D2"` strings (`statusline-multi.js:679`, `adapter_selection.js:87`, `adapter.ts:68/136`, `dashboard.ts:254`, `trail.ts:313`) — otherwise the adapter chip on screen reads `(forge ships D2)` instead of the corrected text below.
> 3. `mooter login` done; Ollama running with `qwen2.5:3b` pulled; an Anthropic key set.

**Legend** — 🗣 = say · ⌨ = type/show · ✅ = expected on screen.

---

## 0:00–1:00 · Hero + framing

🗣 "Mooter is the only open-source LLM router that lives *inside* Claude Code — no proxy, no extra bill. It teaches Claude Code itself when to use local Ollama vs Haiku/Sonnet/Opus, and shows you every decision."

⌨ Open `mooter.ai` homepage.
✅ Vaquinha hero · tagline *"Mooter pastors the Moos for Claude Code"* · lock badge "your code stays local" · **v1.0** badge.

🗣 "It's MIT-licensed, native JS/TS, and it *amplifies* a Claude Max plan — local handles the trivial, Claude handles the hard. Win-win."

---

## 1:00–2:30 · `mooter init` (the wizard)

⌨ In a terminal:
```bash
mooter init
```
🗣 "First run probes the machine — no cloud call."
✅ Hardware probe (e.g. `RTX 4090 detected` / `Ollama: qwen2.5:3b`), persona prompt `[a/b/c/d]`, pack recommendations (top-3 by fit), telemetry opt-in (**HMAC-signed, anonymous, off by default**).

🗣 "Persona and hardware shape which Moo Packs it recommends — packs are *tools*, not just models. And telemetry is opt-in and signed; nothing leaves the machine unless you say so."

---

## 2:30–3:30 · Statusline (the transparency)

⌨ Show the Claude Code statusline (or `mooter explain statusline`).
✅ Two-line, e.g.:
```
🟢 mooter saved $0.75 (37%)        │ T2 · 🎵 sonnet 0.65 · 42% 5h
🐂 · 🏠 local ×4 · last10 T0:0 T1:0 T2:5 T3:5 · 🎮 RTX 4090 (8.4GB / 24GB) · quant Q4_K_M (-72% size · ~99% quality vs FP16) · adapter ◌ baseline · install via `mooter forge install <gguf>`
```
🗣 "Every chip is real, not invented: savings vs an all-Opus baseline, the current tier + confidence, how many local Moos ran, GPU VRAM live from nvidia-smi, the quantization with a *verifiable* size/quality number, and the adapter slot — honestly `baseline` until you install a real LoRA."

⌨ `mooter explain statusline`
✅ Educational breakdown of each chip. 🗣 "Built-in, so users learn what they're paying for."

---

## 3:30–5:00 · Three live prompts (the routing)

🗣 "Watch it route three prompts of different complexity."

⌨ **(1) Trivial → local, $0:**
```
muda a cor do botão de login para azul
```
✅ Badge `[🐄 🏠 ollama …]` · runs on local Ollama · **cost $0**.

⌨ **(2) Reasoning → Sonnet, with a safety boost:**
```
review this auth middleware for security holes
```
✅ Badge `[🐂 ☁ sonnet … boosted from T1 · security]` — 🗣 "It *escalated* — a safety signal forced a higher tier than complexity alone suggested. The reason is shown."

⌨ **(3) Architecture → Opus:**
```
design a sharding strategy for the events table
```
✅ Badge `[🦬 ☁ opus … ]` · `critical_phrase_match`.

🗣 "After each turn, the **Moo card** prints model · tier · confidence · est. savings vs T3-default. No black box."

---

## 5:00–6:00 · `mooter dashboard` (the TUI)

⌨
```bash
mooter dashboard
```
✅
```
🐮 Mooter Dashboard
MOOS ACTIVE: 🏠 qwen2.5:3b ×4 · 🎵 sonnet ×2 · 💎 opus ×1
SAVINGS: $0.75 session
CONTEXT: [█████░░░░░] 47%
QUOTA: 100% 5h
ADAPTER · ◌ baseline (run `mooter adapter list` · auto-training ships Wave 5 D3)
```
🗣 "One screen: which Moos are active, savings, context budget, quota, adapter state. All from real local data."

---

## 6:00–7:00 · `mooter trail --evolution` (the proof over time)

⌨
```bash
mooter trail --evolution
```
✅
```
EVOLUTION (vs previous 7-day window)
  savings: $4.21 → $6.83   (+62.2%)
  prompts: 89 → 124        (+39.3%)
OPTIMIZATIONS
  quantization: Q4_K_M (local baseline)
  LoRA: ◌ none yet (Forge shipped v0.5.1 · install your own .gguf via `mooter forge install`)
```
🗣 "It tracks its own value over time — and stays honest: no LoRA is claimed until you actually install one."

---

## 7:00–8:00 · Logged-in web (mooter.ai/dashboard + admin)

⌨ `mooter.ai/dashboard` (logged in).
✅ CLI Status card (real device data) · Activity Overview · Settings · honest "ships Wave 4 Phase E" disclosures where data isn't wired yet.

⌨ `mooter.ai/admin` (admin only).
✅ User table with **masked emails** (`p***@gmail.com`), persona/hardware charts, signups timeline, **Feedback tab** (from `mooter feedback`). 🗣 "Privacy by default — emails masked even in CSV export, every admin view is audit-logged, prompt content is never shown."

---

## 8:00–9:00 · Adapter Forge (only if a `.gguf` is ready)

⌨
```bash
mooter forge install ./diagram-systems-v1.gguf --base-model qwen2.5:3b --type lora
mooter forge benchmark <id>     # measured, not invented
mooter forge activate <id>
```
✅ Statusline flips to `adapter 🔧 diagram-systems-v1 (+NN% accuracy)`.
🗣 "Bring your own LoRA: it's validated (signature + base-model match), benchmarked with *measured* numbers, and only then honored. Auto-training via Docker is the next wave."

> If no `.gguf` is on hand, skip — say "the validation pipeline shipped in v0.5.1; auto-training is Wave 5 D3" and move on.

---

## 9:00–10:00 · Why Anthropic should care + Q&A

🗣 Three points:
1. **Amplifies Max** — happy users spend Max *consciously*, not wastefully. Local absorbs the trivial.
2. **Open-source MIT, zero proxy** — no cloud-side competition; it makes Claude Code stickier.
3. **Honest by design** — verifiable quant numbers, "none yet" until real, safety boosts with reasons, 6 disciplined recons that caught real drift. **v1.0** converges two histories cleanly (see README Genealogy).
4. **Roadmap** — multi-agent local (Wave 7+): Dynamic Workflows backed by *local* LoRAs = ~$0/workflow vs Opus.

🗣 Close: "It's not a unicorn — realistic TAM is 5–15% of Claude Code Max users. But for that slice, it turns bill anxiety into a dashboard they're proud of."

---

### Reset between takes
```bash
# (optional) clear the session savings/tier-mix for a clean statusline
rm -f ~/.mooter/last-decision.json
# re-pull Ollama baseline if needed
ollama pull qwen2.5:3b
```
