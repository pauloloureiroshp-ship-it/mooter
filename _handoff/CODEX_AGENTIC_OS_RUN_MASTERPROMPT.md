# ⇄ COWORK → CODEX · AGENTIC OS RUN — the cockpit a vibe coder can't work without

> **PT-BR p/ Paulo:** corrida contínua do Codex (implementador) para materializar tudo que decidimos na
> conversa de 15/07 (tese aprovada · Setup Radar/Wizard + EMENDA 1 · turbo · prova-ou-cinza), SEM colidir
> com o Foundation Reset V2.1 / spine que o CC executa. Alvo: perfeito PARA TI primeiro (dogfood na tua
> máquina); amigos = F0.5 do V2.1 (já existe, não duplico); clientes = fora deste packet.
> Codex NÃO faz merge/push/decisão — trabalha sem parar em waves aditivas + draft PRs; tu bates o martelo.
>
> English below on purpose: consumed by coding agents (house rule: PT in conversation, English in code).
> Home: `_handoff/` → archive to `_handoff/_archive/2026-07/` in the PR that ships the last wave.

---

## HOUSE LAWS (violating any = ABORT the wave, report, do not improvise)

- `tools/router/classify.js` FROZEN — sha256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
  re-verified before EVERY commit.
- Selective `git add` only. Never `-A`. No push to main, no merge, no branch delete — draft PRs only;
  Paulo authorizes the irreversible.
- Frozen engine packages (waves 28-34.5) untouched except the explicit allowlist below.
- Honest-copy doctrine: no fabricated number, ever. A check is green ONLY with a machine-verifiable proof;
  otherwise it renders gray `unverified`. Wrong premise → refute, don't build.
- No secrets/env in Codex prompts. UTF-8 briefs. One wave = one worktree = one owner.
- `SYNC.md` 📥 section stays 🟡 — do not write to SYNC.md at all (spine owns it).
- Never touch `../frugal-regua` (chore/tese-v2), spine worktrees, or any worktree with a live session
  (check mtime under `.git/worktrees/*/`).

## CONTEXT PACK (read in this order before Wave C0; do not re-discover)

1. `AGENTS.md` (you read it natively) — NOTE: its §Project overview still states the OLD router-first
   thesis; the approved thesis lives in the files below until PR `chore/tese-v2` lands. The NEW thesis
   is the ruler for every UX/copy decision in this run.
2. `_handoff/SETUP_RADAR_MASTERPROMPT.md` + `_handoff/SETUP_RADAR_EMENDA_2026-07-15.md` — the product
   spec of this run (Radar rings, wizard, 12-field schema, E1/E2/E3 amendments). The EMENDA overrides.
3. `_handoff/FOUNDATION_RESET_MASTERPROMPT_V2_1.md` — the CC-owned foundation plan (F0.5-F7). You do NOT
   execute it; you must not collide with it. F1.5 (thesis PR) already has worktree `frugal-regua`.
4. `_handoff/MOOTER_MASTER_ANALYSIS_2026-07-14.md` — attacks D1-D6; D5 rules this run's scope: Resume
   surfaces (Morning Brief/Time Machine) are PARKED until the Ledger spine (B-F) is fixed by CC.
5. `_handoff/CODEX_PLANE_WUX_BRIEF.md` — the proven Codex work loop (W-UX shipped, 100% Codex code).
6. `docs/strategy/PERFECT_HANDOFF_SPEC.md` + `SETUP_MAPPING.md` — what init/doctor already probe.

**The thesis (approved by Paulo 2026-07-15 — decorate every decision with it):**
Mooter exists so a vibe coder operates like a master without studying every day: best practices applied
automatically, total visibility, foundation-gap alerts, and the magic visible — piloted from the VS Code
plugin. Under the hood, the moat: deterministic local-first routing ($0, <50ms) over multi-LLM
subscriptions + the user's own GPU. **Every local token produced without error is a token that doesn't
charge, doesn't wait, and doesn't burn subscription quota.** The engine is the moat; the cockpit is the
product.

> ⚠️ **TESE SUPERADA (2026-08-02).** «The engine is the moat» já não é a tese — o router está
> comoditizado (Bifrost 11µs, RouteLLM, agent-fleet-o), o codex apanhou-o no G4 da PRIME-0, e o
> Paulo chegou à mesma conclusão. A tese viva: **o fosso é a confiança — um recibo auditável e
> verificação adversarial (crítico ≠ autor) sobre trabalho que um não-dev consegue conferir; o
> motor é table stakes, a cabine é onde a prova aparece** (`AGENTS.md` § Project overview).
> O parágrafo acima fica intacto como registo do que era verdade a 2026-07-15.

## ALLOWLIST (the only writes permitted)

- **New files** under `packages/vscode-extension/src/` (views, tests) + minimal registration edits in
  `extension.js` (additive, smallest possible diff, one registration block per wave).
- **New files** under `packages/cli/src/commands/` (e.g. `setup-probe.ts`) + minimal command registration.
- **New file** `tools/docs-hygiene.js` (+ its test) — explicitly planned in SYNC 2026-07-07.
- **Additive flag** in `packages/cli/src/commands/digest.ts` (`--write-indexes`).
- Tests everywhere (`node:test`), injectable I/O per repo convention.
- NOTHING else. If a wave seems to need more → STOP, report, wait.

## OPERATING LOOP (per wave — the W-UX method that worked)

Worktree per wave: `git fetch origin && git worktree add ../frugal-codex-<wave> origin/main -b feat/codex-<wave>`.
Dense bounded prompt per keeper (exact files + spec excerpt + gate; never the whole spec). Deterministic
verify after each keeper: full `node --test` (native Windows), `node --check` on `extension.js`, classify
sha, grep for unsourced numbers. Green → atomic commit `feat(<area>): keeper N — ...`. Red → 1 retry with
the error pasted; 2nd red → keeper returns to the Claude queue with a written reason (never grind).
Wave done → draft PR with honest attribution ("implementation: codex exec; orchestration/verification:
Cowork/CC") + token accounting + BACK block. Then IMMEDIATELY start the next wave in a fresh worktree —
this is how "non-stop" works without waiting on merges. WIP cap: ≤2 Codex worktrees live at once.

## WAVE QUEUE (strict order; each unblocks the next)

### C0 — RECON & COLLISION MAP (read-only, half a day)
Confirm: `codex --version` · native plugin test baseline (`cd packages/vscode-extension && npm test` —
memory says ~8 tests; get the real number) · which live waves touch `extension.js` (check open PRs #245,
lp-coerencia, spine A) · `RUNNER_STATE.md` if present · frozen-file map. Output: collision report +
per-wave file plan. ⛔ STOP → Paulo/Cowork OK.

### C1 — TEST NET (the debt that blocks everything: 8 → ≥60 plugin tests)
Pure-function tests only (no UI rewrite): `doctor-checks.js`, `data.js`, `lp-aggregates.js`,
`mc-snapshot.js`, `row-renderer` escapes, protocol case handlers. Every test honest (no snapshot-blessing
of wrong behavior — a wrong behavior found = listed in BACK, not encoded). Gate: ≥60 green native.

### C2 — STRUCTURE HEALTH ENGINE (`tools/docs-hygiene.js` + `digest --write-indexes`)
Implements check #12 of the Radar: validates AGENTS.md § Information architecture mechanically
(no new root .md · masterprompts under `_handoff/` · SYNC ≤ ~200 lines · executed masterprompts archived ·
`index.md` present in key folders) → JSON report with real counts. `digest --write-indexes` generates
per-folder `index.md` (local-LLM optional, deterministic fallback). Gate: runs on the real repo, honest
report (it WILL be red today — that's correct), tests green. NOTE: report-only — no auto-fix writes.

### C3 — `mooter setup probe` → `~/.mooter/setup-state.json` (the 12-input schema + turbo block)
Thin orchestrator over EXISTING probes (`init.ts` hardware/ollama/keys/subs · `env-detect` · `local-models` ·
git remote · VAULT_PATH · `.mcp.json` connectors · skills/packs listing · pm2/scheduled loops · C2 report).
Every field `{value, source, verified_at, proof}`; missing proof = `unverified`, never invented.
Include `turbo` block per EMENDA E2: `{prompt_compression, handoff_compress, precook_context,
draft_verify_app_level, index_generation}` each `{enabled, engine_local, proof}` — read current reality,
do not force-enable anything in this wave. Gate: runs on Paulo's machine, ≥10/12 fields filled-or-honest;
schema tests green.

### C4 — RADAR READ-ONLY VIEW (the F0-aligned surface; per EMENDA E3)
New view (own file + minimal registration): 4 rings (N1 Skills&Domains · N2 Memory · N3 Action/Turbo ·
N4 Team) consuming setup-state + doctor-checks. Three states only: green-with-proof (tooltip shows the
proof command + timestamp) · red-gap · gray-unverified. **A unit test enforces: no green without a proof
reference** — this is the product's soul. NO "Fix" buttons in this wave (action waits for CC's F0 close).
Hardware/VRAM/Ollama shown from probe (closes the "VRAM stored never rendered" gap). Respect
`--vscode-*` tokens + `prefers-reduced-motion`. Gate: on Paulo's real setup the Radar must HONESTLY show
today's known state (⚠ memory/SYNC, ❌ indexes, ❌ N4, Notion chip dead) — if it shows better, the wave FAILED.

### C5 — TURBO GAUGE (visible moat; numbers from the Ledger or honest "n/d")
Card in the Radar N3 ring: today's local work — handoffs compressed, prompts compressed, indexes
generated, tokens saved → $ equivalent, and "your GPU covered X% of your subscription this month" ONLY
if computable from real Ledger/savings-tracker data (else the line renders "not enough data yet — keep
working"). Subtle pulse while GPU is active (reduced-motion aware). No new telemetry invention: read
existing savings-tracker (:7821) / ledger outputs. Gate: numbers cross-check against `mooter savings`
output byte-for-byte; zero fabrication possible by construction (test).

### C6 — WIZARD MINIMAL (per EMENDA E1 — only after Paulo validates C4 on his machine)
≤3 manual inputs first session; everything else inferred (C3) or deferred (gray rings say "connect when
you want"). Flow: Detect (cards from probe) → Confirm folder+vault → **First value ≤3 min**: run one
real prompt routed locally and show the receipt (route decision, $0, time) → open the Radar rings
lighting up one by one. Notion/prod-URL/GitHub-remote are day-2 items surfaced as Radar gaps, never
setup blockers. Gate: fresh-profile run on Paulo's machine ≤15 min total, first value ≤3 min, zero terminal.

### C7 — PARKED (do NOT start; listed so nobody improvises)
Morning Brief / Time Machine / Spec Rail / "Fix" buttons / friend distribution build — all depend on
CC's spine B-F + North Star F0 closing (attack D5: a Resume built on a lying Ledger kills the honesty
brand). When CC declares F0 closed, Cowork issues the next run packet.

## WHAT THIS RUN DELIVERS FOR PAULO (the "perfect for me first" definition)

After C6: open VS Code → Radar tells the truth about YOUR agentic OS (skills, memory, turbo, gaps) with
proofs · setup-state.json exists and is fresh · the GPU's contribution is visible in $ · structure
hygiene is measured mechanically · the plugin has a real test net. Friends phase = V2.1's F0.5 baseline
re-run (already specced there, on a machine WITHOUT GPU — attack D4). Clients = later, not here.

## BACK (per wave — Cowork verifies independently before Paulo's OK)

Branch + SHA · native test count before/after · classify sha · files touched vs allowlist (must match
exactly) · keeper report (1st-try / retry / returned) · screenshots (C4-C6) · token accounting
(Codex spend vs Claude orchestration spend) · collisions detected · what was HONESTLY red on Paulo's
machine. Draft PR link. No prose without numbers.
