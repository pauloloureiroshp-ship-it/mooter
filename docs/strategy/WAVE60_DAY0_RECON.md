# Wave 60 — Day-0 Recon · Cache-Aware Cost + Roster + HW-aware T0 (GAP 2 + trends 3/4)

> **Mission:** make the agent-cost estimate cache-aware (switching backends breaks the hot prefix),
> refresh the local roster, and bias T0 to the best model that fits VRAM. Host-side, zero-proxy,
> zero LLM, no frozen-file edits. **Branch:** `wave60-cache-aware-hw` (off `main` @ v1.39.0), isolated
> worktree `../mooter-wave60`. **Companion:** [[REFUTATIONS_LOG.md]] · [[TOKEN_ECONOMY_SOTA_GAP_2026-06.md]].

---

## 0. Invariant checks (before first line of code)
- `classify.js` sha256 == `427d8c0b…364bc48f` ✅ verified on the worktree.
- `decide-agent.ts` is engine (Wave 58 allowlist) — **wrap, never edit**.
- Block A adds a NEW file `packages/router/src/cache-aware-cost.ts` — allowlisted ("ADIÇÕES de ficheiros NOVOS a packages/router/src/").

## 1. Anchors (read, real line numbers)
- `packages/router/src/decide-agent.ts` (560 lines, FROZEN) — public interface: `DecideAgentResult.blended_cost`, `AgentAlternative.cost`, `blendedCost(in,out)=in+0.3*out` (`:218`), `tierForModel()` (`:109`), `isLocalModel` from `cost.ts`. **Wrappable**: Block A consumes its result + a session context and adjusts the comparison cost; it never re-implements cost math.
- `tools/router/savings-tracker.js` (1716 lines) — savings accounting.
- `tools/router/model-manager.js` (464 lines) — an Ollama management **CLI** (`--check-updates`, `--benchmark`), NOT the routing roster (see W60-R2).
- `tools/router/gpu-probe.js` (225 lines) — writes `hw-capability.json` to `~/.claude/tools/router/` (`:144`), only when a GPU is detected (`:206`).
- `tools/router/_model-resolver.js` — the dispatch roster: local → **`qwen3:30b`** (`:19,31`).
- `tools/router/classify.js` (FROZEN) — the T0 **default** model is `qwen2.5:3b`, env-overridable via `ROUTER_OLLAMA_GENERAL`/`ROUTER_OLLAMA_TERSE`/`ROUTER_OLLAMA_MODEL` (`:162-169,216`).
- `tools/router/budget-engine.js` — local cascade `['qwen3:30b','gemma3:12b','deepseek-r1:7b','qwen2.5:3b']` (`:46`), `T0_ALT: 'qwen2.5:3b'` (`:57`).

## 2. Live Ollama roster (Day-0, `ollama list`)
`qwen3:30b` (18GB) · `qwen2.5-coder:14b` (9GB) · `qwen2.5-coder:7b` (4.7GB) · `gemma3:12b` · `gemma4:e4b` · `deepseek-r1:7b` · `qwen2.5:3b` · `nomic-embed-text`. **`qwen3-coder-next` is NOT installed and is not a known Ollama tag.**

## 3. Refutations (repo/registry contradicted the brief)

**W60-R1 — `qwen3-coder-next` does not exist.** The brief's Block C wants `qwen2.5:* → qwen3-coder-next / qwen3-30b`. The live roster has no `qwen3-coder` of any kind; the best installed coder is `qwen2.5-coder:14b`. The brief itself said "confirmar disponibilidade no Ollama no Day-0 antes de hardcodar" — confirmed: **cannot hardcode a non-existent model.**

**W60-R2 — the roster does not live in `model-manager.js`, and the general swap is largely already done.** `model-manager.js` is a management CLI (zero routing roster — one stale hint string `ollama pull qwen2.5:3b` at `:268`). The actual local model is `qwen3:30b` on the dispatch path (`_model-resolver.js:19,31`, `budget-engine.js:46`). The remaining `qwen2.5:3b` is the **T0 default inside FROZEN `classify.js`** (`:162-216`) — changeable only via env vars (`ROUTER_OLLAMA_*`), never by editing the file. **⇒ Block C as briefed is essentially moot/blocked**: the upgrade is either already done (dispatch = qwen3:30b) or sits behind a frozen file + env override. Actionable surface is tiny (a stale hint string) and not worth a wave block.

**W60-R3 — `hw-capability.json` location + presence.** It lives at `~/.claude/tools/router/hw-capability.json` (NOT `~/.mooter`, as the brief implies) and is written by `gpu-probe.js` **only when a GPU is detected** (`:206`). It does not exist on this machine right now. **⇒ Block D must read the correct path and degrade gracefully when the file is absent or GPU-less (no fake bias).** The HW bias must also respect that the local model is already `qwen3:30b` and the T0 default is frozen+env-driven.

**W60-R4 — `decide-agent.ts` is frozen but cleanly wrappable.** Confirmed Block A can wrap it without edits: read `blended_cost` from its result and apply a switching-cost adjustment in a NEW `cache-aware-cost.ts`. We adopt only the *idea* of switching cost (cache read 0.10× vs write 1.25× on a new backend), never a cache mechanism (NO-PROXY, mission §5).

## 4. Reshaped scope (recommendation)
- **A** `packages/router/src/cache-aware-cost.ts` (NEW) — switching-cost wrapper over decide-agent. ✅ real value, doable.
- **B** session affinity host-side in `inject_context.js` — prefer the session's established moo unless a strong reason. ✅ doable, zero KV read.
- **C** **DESCOPE** — moot/blocked (W60-R1/R2). At most: fix the stale `qwen2.5:3b` hint in `model-manager.js:268` → `qwen3:30b`, and (optional, runtime) document the `ROUTER_OLLAMA_*` env upgrade. No model hardcoding.
- **D** HW-aware T0 module (reads the correct `hw-capability.json`, degrades gracefully) + `mooter models`. ✅ doable with W60-R3 guards.

## 5. Gate (end of wave)
final-reviewer 0-HIGH · re-verify sha · diff confined (host-side `tools/router/` + NEW `packages/router/src/cache-aware-cost.ts` + docs) · handoff · β tag `v1.41.0-cache-aware-hw` (Paulo applies final).
