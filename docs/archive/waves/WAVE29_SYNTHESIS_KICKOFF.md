# WAVE 29 — Synthesis Ultimate · KICKOFF

**Composto:** 2026-06-07 ~11h BRT, Cowork
**Sequência:** Wave 28 SHIPPED (esperada) → **Wave 29**
**Tag esperada:** `v1.17.0-synthesis-ultimate`
**Estimate:** ~29h CC autonomous (modo `ultracode` + dangerous)
**Owner:** Paulo (observador) + CC autonomous

---

## 🎯 Posicionamento estratégico

Esta wave materializa **6 melhorias multiplicativas** de uma só vez, com gates atomic per phase:

- **L12 LLMLingua** — prompt compression layer (4-10× compression, 1.5pp accuracy drop)
- **L13 LoRA hot-swap** — infrastructure foundation (LORAUTER pattern, full impl em Wave 31)
- **L14 Setup Intelligence** — hardware/software/subscription auto-detect + recommendations
- **L15 Ecosystem Awareness** — curated catalog + per-user recommendations + ROI tracker
- **L16.1 Prompt Quality telemetry** — schema D1 `pastor_v2_decisions` + logging
- **Caveman bundle** como Mooter Pack opcional
- **DeepSeek V4 Pro option** em T2 routing (open-weight, MIT)
- **ARCHITECTURE_V4 → V5** doc (12 → 16 layers)

Brief canónico: `docs/strategy/MOOTER_ULTIMATE_VISION.md` (LER PRIMEIRO antes de qualquer mudança)
Design doc V5: `docs/strategy/MOOTER_STRATEGIC_SYNTHESIS.md`
Workflow Engine foundation: `docs/strategy/WAVE28_WORKFLOW_ENGINE_KICKOFF.md`

Base: main HEAD pós-Wave 28 SHIPPED
Branch: cria `wave29-synthesis-ultimate` a partir de main fresh

---

## ⚠️ NÃO QUEBRAR — Lista oficial

| Componente | Path | Razão |
|---|---|---|
| classify.js sha256 `7b01eb86…87762` | `tools/router/classify.js` | Gate test obrigatório |
| inject_context.js hook | `tools/router/inject_context.js` | Path crítico routing |
| 6 subagents existentes | `.claude/agents/` (model-architect, model-reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer) | Auto-learning depende |
| subagentstop_hook.js | `tools/router/subagentstop_hook.js` | Wave 22 foundation |
| mooter sync (Wave 26) | `packages/cli/src/sync/` | Production |
| Workflow Engine (Wave 28) | `packages/workflow/` | Recém-shipped, intocar |
| Pastor v1 schema | `hub/migrations/011_sync_events.sql` | LIVE |
| Statusline linhas 1-2 | `tools/router/gsd-statusline.js` | UI contract |
| Existing tests | 333+ baseline + 60+ workflow | Todos passam after PR |

---

## 🛡️ Princípios non-negotiable V4+V5

1. **No proxy** — Synthesis layer NUNCA senta entre user e LLM
2. **Zero LLM cost na classificação** — workflow/compression/setup detection = regex/keyword
3. **Doctrine > optimisation** — classify.js wins bandit (princ. 5 V4)
4. **Explainability** — cada layer tem `reasoning` em decisions logged
5. **Subscription-aware** — todos os recommendations honram Pro/Max/Team
6. **Privacy first** — DP noise + k-anonymity em qualquer telemetria agregada
7. **Opt-in defaults** — L12/L14/L15/L16 são opt-in (default: passive monitoring only)
8. **Tag pós-merge** (lição 9 waves consecutivas)
9. **classify.js sha verification ANTES de tag** (gate hard)
10. **Existing tests TODOS ainda passam** (333+ baseline)

---

## 📐 Arquitectura proposta (zero modificação de existing)

### Novos packages / módulos / endpoints

```
packages/synthesis/                       # NOVO
├── src/
│   ├── index.ts
│   ├── lingua/                           # L12 LLMLingua wrapper
│   │   ├── compressor.ts
│   │   └── budget-controller.ts
│   ├── lora/                             # L13 hot-swap foundation
│   │   ├── adapter-registry.ts
│   │   ├── lora-loader.ts
│   │   └── routing-stub.ts               # full impl em Wave 31
│   ├── setup/                            # L14 Setup Intelligence
│   │   ├── detect.ts                     # uses existing tools/router/hardware-matcher etc.
│   │   ├── explain.ts
│   │   └── recommendations.ts
│   ├── ecosystem/                        # L15 Ecosystem Awareness
│   │   ├── catalog.ts
│   │   ├── recommend.ts
│   │   └── roi-tracker.ts
│   └── quality/                          # L16.1 telemetry
│       ├── decision-logger.ts
│       └── bandit-stub.ts                # full impl em Wave 30
└── tests/

packages/cli/src/commands/                # NOVOS subcomandos (delegate only)
├── compression.ts                        # mooter compression
├── setup.ts                              # mooter setup
├── ecosystem.ts                          # mooter ecosystem

hub/routes/
├── workflows.js                          # já existe (Wave 28)
├── federated.js                          # NOVO (skeleton)
└── pastor-v2.js                          # NOVO

hub/migrations/
├── 013_pastor_v2_decisions.sql           # NOVO
└── 014_device_setup_profiles.sql         # NOVO

tools/router/
├── workflow-status.js                    # já existe (Wave 28)
├── compression-status.js                 # NOVO (statusline linha 3 chip)
├── setup-status.js                       # NOVO (statusline linha 3 chip)
└── ecosystem-status.js                   # NOVO

.claude/skills/
├── workflows/                            # já existe (Wave 28)
└── synthesis/                            # NOVO
    ├── SKILL.md
    └── examples/

audit/
└── ECOSYSTEM_CATALOG_v1.json             # NOVO seed catalog (~100 items)
```

### NOT TOUCHED

- `tools/router/classify.js`
- `tools/router/inject_context.js`
- `tools/router/subagentstop_hook.js`
- `packages/cli/src/sync/`
- `packages/workflow/` (Wave 28 ship)
- `hub/routes/{delta,events,feedback,heartbeat,models,stats,sync_events,version}.js`
- `hub/migrations/001-011_*.sql`
- `tools/router/gsd-statusline.js` (linhas 1-2 intactas)

---

## 🔍 Phase A — Day 0 Honest Recon (T0/T1, 30min) 🔥

**ANTES de qualquer commit:**

```bash
# 1. Confirmar Wave 28 mergeado em main
git log --oneline main | head -5
git tag | grep v1.16.0

# 2. classify.js sha intacta
sha256sum tools/router/classify.js | head -c 16
# Esperado: 7b01eb86…

# 3. Existing tests baseline
cd packages/cli && npm test 2>&1 | tail -5
cd ../workflow && npm test 2>&1 | tail -5

# 4. Validate VISION doc + STRATEGIC SYNTHESIS doc
ls docs/strategy/MOOTER_ULTIMATE_VISION.md
ls docs/strategy/MOOTER_STRATEGIC_SYNTHESIS.md

# 5. Hardware-matcher + detect-subs já existem (Synthesis reusa, não recria)
ls tools/router/{hardware-matcher,detect-subscriptions,vram_detect,gpu-probe}.js

# 6. CF Worker config
grep -E "^name" hub/wrangler.mooter.toml

# 7. Ollama models available
curl -s http://localhost:11434/api/tags
```

Reporta findings em `docs/strategy/WAVE29_DAY0_FINDINGS.md`. Se alguma premissa core falhar, PARA e reporta.

---

## 📋 Phases B-L (executar pela ordem)

### Phase B — LLMLingua compression layer (T2 Sonnet, 4h) ⭐ L12

Implementar opt-in prompt compression:

```typescript
// packages/synthesis/src/lingua/compressor.ts
export interface CompressionOptions {
  target_ratio: number;        // e.g. 4 (4× compression)
  preserve_entities: boolean;  // names, paths, error messages
  budget_min_tokens?: number;
}

export async function compressPrompt(
  prompt: string,
  options: CompressionOptions
): Promise<{ compressed: string; original_tokens: number; compressed_tokens: number; ratio: number; }>
```

- Backend opcional: `llmlingua` Python lib via subprocess OR JS reimplementation
- Integration ponto: `tools/router/inject_context.js` opcionalmente compresses ANTES de classify.js
- Statusline chip (linha 3): `📦 lingua 4.2× (-1842 tokens)`
- Test: corre LLMLingua compression em 10 prompts conhecidos, valida accuracy preserve

**Gate:** compression test passes; existing tests still green; classify.js sha intact.

### Phase C — Caveman bundle (T2 Sonnet, 3h)

- Coordenar atribuição: Julius Brussee, MIT license, créditos no `mooter pack info caveman`
- `mooter pack install caveman` → instala skill + Mooter wrapper
- Mooter wrapper adds: subscription-aware (Max users default off — full output OK)
- Pastor signal: monitora acceptance rate de outputs caveman style
- Statusline chip (linha 3): `🪨 caveman -82 tokens today`

**Gate:** pack install/uninstall ciclo limpo; Pastor logs caveman acceptance signal.

### Phase D — DeepSeek V4 Pro option em T2 (T2 Sonnet, 3h)

- Add provider `deepseek-v4-pro` em `tools/router/providers/`
- Honra MIT license + API key configuration (BYOK)
- T2 routing pode escolher entre Sonnet OR DeepSeek V4 Pro
- Decisão baseada em: `subscription_tier` (PAYG = bias DeepSeek), `task_type` (SWE-bench tasks = DeepSeek 80.6%), `latency_pref`
- Statusline chip: `🤖 T2 → deepseek-v4 (SWE prefer)`

**Gate:** provider test passes (mock + live with API key if available); routing honors classify tier hard.

### Phase E — LoRA hot-swap foundation L13 (T3 Opus, 4h) 🔒 CRÍTICO

**Infrastructure only — NOT full LORAUTER yet (Wave 31).**

- `packages/synthesis/src/lora/adapter-registry.ts` — catalog de adapters disponíveis
- `packages/synthesis/src/lora/lora-loader.ts` — load LoRA adapter on-demand for Ollama
- `packages/synthesis/src/lora/routing-stub.ts` — stub que sempre devolve null (no swap yet)
- API exposed: `mooter lora list`, `mooter lora load <name>` (manual)
- Mooter Pastor v1 LoRA (Wave 23 carry, if trained) registered as `pastor-v1-default`

**Gate:** lora list/load manual works; routing-stub correctly returns null (no auto-swap yet); existing routing untouched.

### Phase F — Speculative decoding docs + benchmark stub (T1 Haiku, 2h)

- `docs/integrations/speculative-decoding.md` — explanation + roadmap
- `audit/SPECULATIVE_BENCHMARK_STUB.md` — hypothesis-driven benchmark plan
- Wave 33 vai implementar real via vLLM

**Gate:** docs commit, no code change.

### Phase G — Setup Intelligence L14 (T2 Sonnet, 4h) ⭐ Paulo Vector A

**3 sub-features:**

1. **A.1 Setup Auto-Detect** — `mooter setup detect`
   - Reuse `tools/router/hardware-matcher.js`, `vram_detect.js`, `gpu-probe.js`, `detect-subscriptions.js`
   - Synthesize into `~/.mooter/setup_profile.json` (versioned, diff-able)
2. **A.2 Setup Explainer** — `mooter setup show`
   - Pretty-print with explanations (ver Vector A.2 em VISION doc)
3. **A.3 Setup Recommendations** — `mooter setup recommend`
   - Per-profile recommendations from `audit/ECOSYSTEM_CATALOG_v1.json`
   - Examples: M5 → MLX backend, RTX 4090 → wait TurboQuant, Snapdragon → NPU pack

**Gate:** all 3 commands functional; `setup_profile.json` includes 20+ datapoints; recommendations align with hardware tier.

### Phase H — Ecosystem Awareness L15 (T2 Sonnet, 3h) ⭐ Paulo Vector B

- `audit/ECOSYSTEM_CATALOG_v1.json` — seed catalog (~100 items: skills + plugins + MCP + packs + providers)
- `mooter ecosystem list` — show catalog
- `mooter ecosystem recommend` — per-setup recommendations
- `mooter ecosystem search <query>` — basic search
- Statusline chip (linha 3): `📚 5 recommendations for your setup`
- ROI tracker stub (full em Wave 30)

**Gate:** catalog has 100+ items; recommendations rank by `compatibility × roi_estimate`.

### Phase I — L16.1 Multi-dimensional decision telemetry (T2 Sonnet, 1.5h) ⭐ Paulo Vector C

- `hub/migrations/013_pastor_v2_decisions.sql` — schema completo (ver VISION doc section 2.C.1)
- `packages/synthesis/src/quality/decision-logger.ts` — log each routing decision
- Privacy: `prompt_class` only (NUNCA prompt content)
- Bandit stub stub: `bandit-stub.ts` returns null (full impl Wave 30)
- API exposed: `mooter quality stats` — basic aggregate

**Gate:** migration applies clean to D1; decision-logger writes rows; no prompt content leaks.

### Phase J — Statusline integration linha 3 (T1 Haiku, 1.5h)

- `tools/router/compression-status.js`, `setup-status.js`, `ecosystem-status.js`
- Linha 3 (NOVA, opt-in) cycles through:
  - `📦 lingua 4.2× (-1842 tokens)`
  - `🪨 caveman -82 tokens today`
  - `📚 5 recommendations`
  - `🤖 T2 → deepseek-v4`
  - `🔧 setup: M5 + Max + 3 packs`
- Linhas 1-2 INTACTAS

**Gate:** statusline linhas 1-2 unchanged; linha 3 renders correctly when enabled.

### Phase K — Hub migration + workers.dev deploy (T2 Sonnet, 1.5h)

```bash
cd hub
npx wrangler d1 migrations apply mooter-hub --remote --config wrangler.mooter.toml
npx wrangler deploy -c wrangler.mooter.toml
```

- Migrations 013 + 014 aplicadas
- Endpoints `/v1/federated` (skeleton) + `/v1/pastor-v2` (decisions logging) LIVE
- Smoke tests pass

**Gate:** migrations apply clean; endpoints respond expected status codes.

### Phase L — Final-reviewer + PR + merge + tag (T3 Opus, 1h)

1. `final-reviewer` (Opus) sobre branch `wave29-synthesis-ultimate`
   - Zero HIGH severity
   - MEDIUMs documentados
   - classify.js sha intacta
   - Existing 333+ tests pass
   - New tests pass
2. PR `wave29-synthesis-ultimate` → `dev`
3. CI verde
4. PR `dev` → `main` (--merge)
5. **DEPOIS do merge:** tag
   ```bash
   git fetch origin && git tag -f v1.17.0-synthesis-ultimate <new main HEAD>
   git push --force origin v1.17.0-synthesis-ultimate
   ```

---

## 🎯 Sucesso (gate critérios)

- [ ] `mooter compression` opt-in funcional (LLMLingua)
- [ ] `mooter pack install caveman` ciclo limpo
- [ ] `mooter setup {detect,show,recommend}` 3 comandos LIVE
- [ ] `mooter ecosystem {list,recommend,search}` 3 comandos LIVE
- [ ] Hub `/v1/pastor-v2` aceita decision logs
- [ ] `pastor_v2_decisions` populated em D1 prod
- [ ] `device_setup_profiles` populated em D1 prod
- [ ] Statusline linha 3 opt-in funcional (5 chips diferentes)
- [ ] classify.js sha intact (`7b01eb86…`)
- [ ] Existing 333+ tests pass
- [ ] New synthesis tests pass (target: 40+ new tests)
- [ ] final-reviewer PASS sem HIGH
- [ ] Tag `v1.17.0-synthesis-ultimate` em main HEAD pós-merge
- [ ] ARCHITECTURE_V5 doc commited
- [ ] Memory file actualizado

---

## 📊 Reporting

Per phase:
```
✅ Phase X SHIPPED | commit <hash> | tests <N> pass | notes: <key findings>
```

Final:
```
🐮 WAVE 29 SHIPPED | tag v1.17.0-synthesis-ultimate em <hash>
- L12 LLMLingua compression LIVE
- L13 LoRA hot-swap foundation
- L14 Setup Intelligence (3 commands)
- L15 Ecosystem Awareness (catalog 100+)
- L16.1 Quality telemetry (schema + logger)
- Caveman bundled + Pastor signal
- DeepSeek V4 Pro option em T2
- Stats: 333+N existing tests pass; 40+ new tests pass
- classify.js sha intact: 7b01eb86…
- Next: Wave 30 — Bandit learner L16.2 + Adversarial review
```

---

## 🔥 Começa AGORA

Sem preâmbulo. O brief tem tudo. Day 0 honest recon obrigatório antes de qualquer commit. Se uma premissa core falhar, PARA e reporta.

A doctrine V4+V5 vence. Tu és o Arquiteto-Mediador. Roteamento tier mínimo viável. Commits atómicos. classify.js sha intacta até ao end. Anthropic teria orgulho.

🐮 **A esta wave, dá nome: "Mooter Synthesis Ultimate".** Vamos.
