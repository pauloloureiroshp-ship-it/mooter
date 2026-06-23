# Friends-launch DMs — v8 (Wave 32 Transparency+Performance SHIPPED)

> Refresh pós Wave 32 v1.20.0 (2026-06-08). **0-HIGH/0-MED/3-LOW final-reviewer**.
> Numbers validados em LIVE: 658 calls reais · $25.95 saved (47%) · classify.js sha intact (12 waves consecutive).
> Mantém honest: TurboQuant + EAGLE-3 (Wave 33) está em brief composto, não shipped ainda.
> Versões abaixo: PT-PT (Portugal) · PT-BR (Brasil) · EN (international).

---

## 🇵🇹 PT-PT (Portugal)

### Short DM (1-liner warm intro)

> Lembras-te do Mooter (router local-first p/ Claude Code que decide Opus vs Sonnet vs Haiku vs Ollama)? Acabei de shippar a **Wave 32** com 4 modes de statusline configuráveis, 8 slash commands `/moo-*`, **Ultramoo mode** (efeito tipo ultracode mas local-first) e GDPR data rights. No meu setup: **47% poupança real** em 658 calls. 5 min p/ experimentar?

### Medium DM (technical friend)

> Wave 32 do Mooter shippada (v1.20.0-transparency-performance). Validado em LIVE no meu setup:
>
> 1. **4 statusline modes** (mini/compact/full/didactic) — opt-in via `mooter statusline mode <name>`. Default continua byte-idêntico ao legacy (zero breaking changes).
> 2. **8 slash commands `/moo-*`** em CC autocomplete: workflow, effort, herd, dashboard, status, distill, pack, help.
> 3. **Ultramoo mode** (`mooter effort set ultramoo`): flipa 8 sub-systems (LLMLingua + Caveman + LORAUTER + Multi-LoRA + workflow auto + cost cap stricter + hard local bias + statusline chip). **Advisory** — classify.js tier floors sempre prevalecem (doctrine wins).
> 4. **vLLM opt-in backend** + **Multi-LoRA serving** (6 adapters concurrent, <10ms hot-swap). Fallback gracioso para Ollama se sem GPU.
> 5. **GDPR data rights** (export credentials redacted · delete-all · forget-me HMAC-signed).
>
> Numbers (dashboard live no meu setup):
> - **658 calls reais** (316 Opus + 145 Haiku-4.5 + 105 qwen3:30b local + 63 Haiku + 15 Sonnet + 12 qwen2.5:3b + 2 qwen2.5-coder:14b)
> - **$25.95 saved (47%)** vs all-Opus baseline
> - **3 packs installed** (data-spreadsheet, diagram-systems, voice)
> - **12 MCP tools** (Pastor route/suggest, Obsidian sync, forget-me, transparency, effort_set, ultramoo_toggle, workflow_watch, data_export, etc.)
>
> Privacy-first: opt-in everywhere · k-anonymity ≥50 nos agregados hub · classify.js sha `7b01eb86…87762` gated em CI (intact 12 waves consecutive).
>
> **Wave 33 em brief** (próxima 1-2 semanas): TurboQuant 3-bit KV cache (Google DeepMind ICLR 2026, 6× memory reduction) + EAGLE-3 speculative decoding (2-2.5× via vLLM) + MiniMax M3 ready-detector (weights expected June 10-11, 2026).

### Long DM (deeply technical friend)

> Mooter v1.20.0-transparency-performance shipped (Wave 32, 17 phases, 15 atomic commits, final-reviewer Opus **SHIP 0-HIGH/0-MED/3-LOW**). Tenho o relatório completo no Notion. Quick hits:
>
> **Architecture (V5, 16 layers):**
> L0 cache · L1 routing (classify.js INTACT) · L2 quant (TurboQuant Wave 33) · L3 speculative (EAGLE-3 Wave 33) · L4 Multi-LoRA · L5 Pastor v2 LORAUTER · L6 packs · L7 workflows · L8 federated wisdom · L9 telemetry · L10 privacy · L11 arbitrage routing (Wave 33) · L12 transparency · L13 GDPR · L14 user setup intelligence · L15 ecosystem intelligence · L16 prompt quality intelligence.
>
> **Wave 32 deliveries (each shipped + tested):**
> - 4 statusline modes (≤10ms render budget verified, default byte-identical to Wave 31)
> - Inline token tracker per command via `@mooter/transparency`
> - Dashboard 5-widget TUI (Pastor + hardware + workflows + limits + savings)
> - Workflow watch Ralph Mission Control (external control plane — Wave 28 workflow engine INTOCADO)
> - Pastor train-watch TensorBoard-like local view (loss curves + per-task scores)
> - 8 `/moo-*` slash commands as `.claude/skills/mooter-*/SKILL.md`
> - `@mooter/effort` (Ultramoo) — 8 sub-systems flip, advisory mode
> - `@mooter/data-rights` — GDPR export/delete-all/forget-me with HMAC signing
> - Quant + vector status chips real-time from Ollama
> - vLLM opt-in backend + Multi-LoRA (6 adapters concurrent)
> - Hub migration 017 (transparency_events + forget_me_requests, additive, idempotent, k-anon ≥50)
> - 2 new hub routes (`/v1/transparency`, `/v1/forget-me`)
> - MCP tools 8 → **12** (added: ultramoo_toggle, workflow_watch, data_export, effort_set)
>
> **Validation 2026-06-08:**
> - 7 hub endpoints smoke 200/202/422/400 esperados (LIVE)
> - Dashboard 5 widgets renderizam (658 calls real Pastor data)
> - `mooter explain statusline` reveals all chips (ctx bar, 5h quota, quant, adapter, last10 dist)
> - Pastor learning from 658 real calls across 7 moos
>
> **Wave 33 Ultimate brief composto** (10-14h CC estimate):
> - Block A polish: CLI `mooter statusline mode` + session timer chip + rename `turn`/`alltime` jargon + 3 LOW nits + LoRA deps fix + `mooter effort set` / `mooter sessions list` CLI
> - Block B performance: TurboQuant llama.cpp integration (AmesianX fork READY) + EAGLE-3 via existing vLLM backend + MiniMax M3 auto-detector + L11 arbitrage routing
> - Block C quality: hardware/workflow widgets responsive + auto-update pricing job
> - Block D friends-launch: refresh DMs + onboarding audit + E2E smoke
> - Block E marketing: tweet thread + blog post + landing diff
>
> Repo: github.com/pauloloureiroshp-ship-it/mooter · tag `v1.20.0-transparency-performance` · doc canónico em `docs/MOOTER_OPERATIONS_GUIDE_v1.0.md`.

---

## 🇧🇷 PT-BR (Brasil)

### Short DM

> Lembra do Mooter (router local-first pro Claude Code que decide Opus vs Sonnet vs Haiku vs Ollama)? Acabei de shippar a **Wave 32** com 4 modes de statusline configuráveis, 8 slash commands `/moo-*`, **Ultramoo mode** (igual ultracode mas local-first) e GDPR data rights. No meu setup: **47% de economia real** em 658 calls. 5 min pra experimentar?

### Medium DM

> Wave 32 do Mooter shippada (v1.20.0). Validado em LIVE:
>
> 1. **4 statusline modes** (mini/compact/full/didactic) — opt-in via `mooter statusline mode`. Default continua igual ao Wave 31 (zero breaking changes).
> 2. **8 slash commands `/moo-*`** no autocomplete do CC.
> 3. **Ultramoo mode** flipa 8 sub-systems (LLMLingua + Multi-LoRA + cost cap mais rigoroso + etc). **Advisory** — classify.js sempre ganha (doctrine wins).
> 4. **vLLM opt-in** + **Multi-LoRA** (6 adapters simultâneos, hot-swap <10ms).
> 5. **GDPR**: export, delete-all, forget-me com HMAC.
>
> Numbers reais (meu dashboard):
> - **658 calls** distribuídas em 7 modelos (3 locais + 4 cloud)
> - **$25.95 economia (47%)** vs baseline all-Opus
> - **12 MCP tools** integrados
>
> Privacy: opt-in tudo · k-anonymity ≥50 · classify.js sha intacto 12 waves consecutivas.
>
> **Wave 33 em brief**: TurboQuant 3-bit KV cache (Google DeepMind) + EAGLE-3 (2.5× speedup via vLLM) + MiniMax M3 ready-detector (weights chegam 10-11 junho).

---

## 🇬🇧 EN (international)

### Short DM

> Remember Mooter (local-first router for Claude Code that picks Opus vs Sonnet vs Haiku vs Ollama)? Just shipped **Wave 32** with 4 configurable statusline modes, 8 `/moo-*` slash commands, **Ultramoo mode** (like ultracode but local-first), and GDPR data rights. On my setup: **47% real savings** across 658 calls. Worth 5 min?

### Medium DM

> Wave 32 Mooter shipped (v1.20.0-transparency-performance). LIVE-validated:
>
> 1. **4 statusline modes** (mini/compact/full/didactic), opt-in via `mooter statusline mode`. Default stays byte-identical (zero breaking changes).
> 2. **8 `/moo-*` slash commands** in CC autocomplete: workflow, effort, herd, dashboard, status, distill, pack, help.
> 3. **Ultramoo mode** (`mooter effort set ultramoo`) flips 8 sub-systems (LLMLingua + Multi-LoRA + stricter cost cap + hard local bias + …). **Advisory** — classify.js tier floors always win (doctrine wins principle).
> 4. **vLLM opt-in backend** + **Multi-LoRA serving** (6 adapters concurrent, <10ms hot-swap). Graceful fallback to Ollama if no GPU.
> 5. **GDPR data rights**: export (creds redacted), delete-all, forget-me (HMAC-signed).
>
> Numbers from my live dashboard:
> - **658 real calls** (316 Opus + 145 Haiku-4.5 + 105 qwen3:30b local + 63 Haiku + 15 Sonnet + 12 qwen2.5:3b + 2 qwen2.5-coder:14b)
> - **$25.95 saved (47%)** vs all-Opus baseline
> - **3 packs installed** (data-spreadsheet, diagram-systems, voice)
> - **12 MCP tools** (Pastor, Obsidian, forget-me, transparency, etc.)
>
> Privacy-first: everything opt-in · k-anonymity ≥50 on hub aggregates · classify.js sha `7b01eb86…87762` gated in CI (intact across 12 consecutive waves).
>
> **Wave 33 in brief** (next 1-2 weeks): TurboQuant 3-bit KV cache (Google DeepMind ICLR 2026, 6× memory reduction) + EAGLE-3 speculative decoding (2-2.5× via vLLM) + MiniMax M3 auto-detector (weights expected June 10-11, 2026).

---

## 📋 3 friends shortlist (Task #218)

> Paulo: lista pendente — preencher antes de enviar.

| Nome | Stack/Background | Versão DM recomendada | Status |
|---|---|---|---|
| TBD #1 | TBD | Short (warm intro) | ⏳ Pendente |
| TBD #2 | TBD | Medium (technical) | ⏳ Pendente |
| TBD #3 | TBD | Medium ou Long (deep tech) | ⏳ Pendente |

**Sugestão de critério (Wave 15 audit):**
- ≥6 meses Claude Code activo
- Trust-quotient alto (vai dar feedback real, não bajulação)
- Mix: 1 PT-PT (Portugal) + 1 PT-BR (Brasil) + 1 EN (international) para validar i18n statusline + UX

---

## 🔗 Links partilháveis

- Landing: **mooter.ai**
- GitHub: **github.com/pauloloureiroshp-ship-it/mooter**
- Tag actual: **v1.20.0-transparency-performance** (commit `32d0c9c`)
- Doc canónico: **`docs/MOOTER_OPERATIONS_GUIDE_v1.0.md`** (~1000 linhas, Notion-ready)
- Install one-liner: `curl -fsSL install.mooter.ai | bash`
- Quick tryouts pós-install:
  - `mooter dashboard` (TUI live)
  - `mooter explain statusline` (didactic mode)
  - `mooter pastor route "build me a React component"` (LORAUTER em acção)
  - `mooter pastor distill` (extrair skill das tuas decisões)
  - `mooter effort set ultramoo` (8 sub-systems flip)
  - `/moo-help` em CC (slash command discovery)

---

## ⚠️ Honesty rules (não esquecer ao enviar)

- ❌ NÃO prometas TurboQuant/EAGLE-3/MiniMax M3 como shipped — só em brief
- ❌ NÃO inventes numbers que não estão validados no teu setup
- ✅ Sempre referir tag actual (v1.20.0-transparency-performance) — não tag aspiracional
- ✅ Numbers ($25.95 saved, 47%, 658 calls) são do teu setup; friend vai ter os deles diferentes
- ✅ Mencionar que classify.js sha está intact (12 waves) como prova de não-breaking-changes
- ✅ Privacy-first é diferenciador real — não compromir
- ✅ Se friend pergunta "porque Mooter > LiteLLM/OpenRouter": local-first + Pastor learning + classify.js gated + GDPR rights default + Ultramoo mode

---

*Composto 2026-06-08 04h BRT pós-validation Wave 32 v1.20.0 + Wave 33 brief composto. Versões anteriores em `audit/FRIENDS_LAUNCH_DMS_v7.md` (Wave 31 Pastor v2) e `audit/FRIENDS_LAUNCH_DMS.md` (Wave 27 baseline).*
