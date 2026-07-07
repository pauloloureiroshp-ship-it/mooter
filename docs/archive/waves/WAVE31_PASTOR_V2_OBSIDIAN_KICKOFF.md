# WAVE 31 — Pastor v2 LORAUTER + Obsidian vault-sync + Distillation

**Composto:** 2026-06-08 ~00h BRT, Cowork
**Sequência:** Wave 30 Mega SHIPPED (`v1.18.0-mega-synthesis` em `ea6e6e6`, hub LIVE) → **Wave 31**
**Tag esperada:** `v1.19.0-pastor-v2`
**Estimate:** ~16h CC autonomous (precedente Wave 30 fez 30h em 1h19 com `ultracode` — provável ~1-2h real)
**Owner:** Paulo observador + CC autonomous

---

## 🎯 Posicionamento estratégico

Esta wave materializa o **diferencial defensável crítico**: Pastor v2 deixa de ser "1 LoRA único" para ser **per-task adapter routing** com **knowledge distillation** + **Obsidian vault bridge**.

**3 partes simultâneas:**

1. **Pastor v2 LORAUTER full impl** — substitui `packages/synthesis/src/lora/routing-stub.ts` (Wave 29 L13 stub) pelo routing real baseado em LORAUTER paper (arxiv 2601.21795). Per-task adapters: `pastor-frontend.lora`, `pastor-backend.lora`, `pastor-data.lora`, `pastor-portuguese.lora`.
2. **Obsidian vault-sync** — Mooter Pack opcional. Paulo já usa vault canónico (`~/Documents/paulo-vault/`). Mooter sync bidirecional: Pastor learnings → vault notes (write) + vault preferences → Pastor priors (read).
3. **Knowledge distillation** — `mooter pastor distill > my-pastor.skill.md`. Pastor learnings transformados em markdown skill installable (pattern NotebookLM aprendido em Wave 29 audit).

**Por que importa AGORA:**
- L13 infra existe desde Wave 29 (routing-stub sempre null). LORAUTER é a primeira impl real.
- Mooter MCP server (Wave 30 EARLY) destrava Obsidian bridge via MCP.
- Pastor cresceu para 259 decisions trained — começa a ter signal real para distillation.
- Friends-launch DMs ganham peso massivo com "per-task LoRA routing" como claim.

---

## 🛡️ NÃO QUEBRAR — Lista oficial

| Componente | Razão |
|---|---|
| `tools/router/classify.js` sha `7b01eb86…87762` | Doctrine gate test obrigatório |
| `tools/router/inject_context.js` hook UserPromptSubmit | Path crítico routing |
| 6 subagents existentes (`.claude/agents/`) | Auto-learning depende |
| `subagentstop_hook.js` | Wave 22 foundation |
| `mooter sync` (Wave 26) | Production LIVE |
| `packages/workflow/` (Wave 28) | Intocar — apenas usar |
| `packages/synthesis/src/lingua/`, `setup/`, `ecosystem/`, `quality/` (Wave 29) | Intocar — apenas reusar via imports |
| `packages/validation/` (Wave 30) | Intocar — Bandit Learner + Adversarial + cost cap PRESERVADOS |
| `packages/mcp-server/` (Wave 30) | Intocar — apenas adicionar 2 tools novas |
| Statusline linhas 1-2 byte-idênticas | UI contract |
| Pastor v1 schema D1 | Preservado — apenas adicionar migration 016 |
| Existing tests (cli 238 + workflow 94 + synthesis 47 + validation 69 + mcp-server 11 + hub 54 + ...) | Todos pass após PR |
| Hub routes existentes | LIVE — adicionar `/v1/pastor-adapters` apenas |

**Modificável (Wave 31 mexe):**
- `packages/synthesis/src/lora/routing-stub.ts` → substitui pelo `routing-lorauter.ts` real (mantém API compatible)

---

## 📐 Arquitectura proposta

```
packages/synthesis/src/                      # Wave 29 base
├── lora/                                    # Wave 29 L13 infra
│   ├── adapter-registry.ts                  # JÁ EXISTE — extender com per-task metadata
│   ├── lora-loader.ts                       # JÁ EXISTE — extender com hot-swap
│   ├── routing-stub.ts                      # DELETE
│   └── routing-lorauter.ts                  # NOVO — full LORAUTER impl
├── pastor/                                  # NOVO
│   ├── adapter-trainer-stub.ts              # interface para train_lora.sh
│   ├── pastor-state.ts                      # current adapter state
│   ├── per-task-router.ts                   # task class → adapter mapping
│   └── feedback-incorporator.ts             # incorpora bandit signals
└── distill/                                 # NOVO
    ├── markdown-generator.ts                # Pastor → markdown skill
    ├── skill-emitter.ts                     # emit .skill.md compatible
    └── pattern-extractor.ts                 # extract patterns from decisions log

packages/cli/src/commands/                   # NOVOS subcomandos (delegate)
├── pastor.ts                                # mooter pastor {distill, adapters, train-status}
└── pack.ts                                  # mooter pack {install obsidian-vault-sync, ...}

packages/mcp-server/src/tools/               # Wave 30 base — adicionar 2 tools
├── pastor-adapter-suggest.ts                # NOVO MCP tool
└── obsidian-vault-sync.ts                   # NOVO MCP tool

packs/                                       # NOVO directory
└── obsidian-vault-sync/                     # First-class Mooter Pack
    ├── manifest.json
    ├── pack.ts                              # Pack lifecycle (install/uninstall/sync)
    ├── vault-detector.ts                    # auto-detect Obsidian vault paths
    ├── sync-write.ts                        # Pastor learnings → vault/Mooter/
    ├── sync-read.ts                         # vault/Mooter/preferences.md → Pastor priors
    └── tests/

hub/routes/
└── pastor-adapters.js                       # NOVO — POST /v1/pastor-adapters (registry sync opt-in)

hub/migrations/
└── 016_pastor_adapters.sql                  # NOVO — adapter registry table

.claude/skills/
└── pastor-distill/                          # NOVO skill
    ├── SKILL.md
    └── example-distilled.md

docs/architecture/
├── LORAUTER_IMPLEMENTATION.md               # NOVO — design notes per LORAUTER paper
└── OBSIDIAN_VAULT_SYNC_PROTOCOL.md          # NOVO — sync protocol spec

audit/
├── PASTOR_V2_DEMO_LOG.md                    # Live demo recording
└── FRIENDS_LAUNCH_DMS_v7.md                 # NOVO — pitch v7 com Pastor v2 numbers
```

---

## 🔍 Phase A — Day 0 Honest Recon (T0/T1, 30min) 🔥

ANTES de qualquer commit:

1. **Confirm Wave 30 estado:**
```bash
git log --oneline main | head -10
git tag | grep v1.18.0
sha256sum tools/router/classify.js | head -c 16
```

Esperado: tag `v1.18.0-mega-synthesis`, sha `7b01eb86…`.

2. **Wave 29/30 packages baseline tests:**
```bash
cd packages/synthesis && npm test 2>&1 | tail -5
cd ../validation && npm test 2>&1 | tail -5
cd ../mcp-server && npm test 2>&1 | tail -5
cd ../workflow && npm test 2>&1 | tail -5
cd ../cli && npm test 2>&1 | tail -5
cd ../../hub && npm test 2>&1 | tail -5
```

Esperado: todos pass (sem regressões Wave 28-30).

3. **Hub LIVE confirm:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://mooter-hub.frugal-hub.workers.dev/v1/wave-status
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mooter-hub.frugal-hub.workers.dev/v1/pastor-v2 -H 'Content-Type: application/json' -d '{}'
```

Esperado: 200 + 422 (Wave 30 endpoints LIVE).

4. **LoRA infra (Wave 29 L13) confirm:**
```bash
ls packages/synthesis/src/lora/
cat packages/synthesis/src/lora/routing-stub.ts | head -30
```

Esperado: 3-4 files, routing-stub returns null.

5. **Pastor state (Wave 30 cresceu para 259):**
```bash
ls ~/.mooter/pastor/ 2>/dev/null
ls ~/.mooter/state.json 2>/dev/null
```

6. **Obsidian vault Paulo:**
```bash
ls ~/Documents/paulo-vault/ 2>/dev/null | head -10
ls ~/Documents/paulo-vault/.obsidian/ 2>/dev/null && echo "VAULT CONFIRMED"
```

Esperado: Johnny-Decimal structure + .obsidian config.

7. **Ollama models para Pastor train (se vamos correr LoRA):**
```bash
curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null || curl -s http://localhost:11434/api/tags | head -100
```

Esperado: qwen2.5-coder:7b + qwen3:30b disponíveis.

8. **LoRA training data (Wave 23 carry):**
```bash
wc -l audit/lora_train.jsonl 2>/dev/null
```

Esperado: ~212 samples.

**Output obrigatório:** `docs/strategy/WAVE31_DAY0_FINDINGS.md` com:
- Wave 30 SHIPPED confirmed
- Packages baseline tests pass
- Hub endpoints LIVE
- Paulo vault path confirmed (`~/Documents/paulo-vault/`)
- LoRA training data count
- Path forward final

Se premissa core falhar, PARA e reporta.

---

## 📋 Phases B-L (11 phases, executar pela ordem)

### Phase B — Adapter Registry full impl (T2, 2h)

`packages/synthesis/src/lora/adapter-registry.ts`:
- Extend Wave 29 base com per-task metadata
- Adapter types: `coding-frontend`, `coding-backend`, `coding-data`, `prose-pt-pt`, `prose-en`, `baseline`
- Manifest format: name, version, base_model, training_data_hash, score_per_task_type
- API: `register(adapter)`, `list()`, `get(name)`, `match(task_features)`

`~/.mooter/adapters/registry.json` — persisted registry.

**Gate:** unit tests pass, registry persists across sessions.

### Phase C — LoRA Loader hot-swap (T2/T3, 3h) 🔒

`packages/synthesis/src/lora/lora-loader.ts`:
- Substitui Wave 29 stub
- Hot-swap impl: load adapter into Ollama via API (Ollama 0.30+ supports adapter loading)
- Fallback: if Ollama doesn't support, mark adapter as "unavailable" gracefully
- Latency target: <500ms swap time

**Gate:** load test passes against Ollama running; fallback test passes (mock Ollama no-adapter response).

### Phase D — LORAUTER routing-lorauter.ts (T3, 4h) 🔥 CORE

Substitui `routing-stub.ts` por `routing-lorauter.ts`:
- Implementa LORAUTER paper (arxiv 2601.21795)
- Task representation extraction: TF-IDF do prompt + features structurais
- Adapter matching: cosine similarity entre task embedding e adapter training data embedding
- Threshold-based decision: if best match score >0.7 → swap adapter; senão → baseline
- Doctrine guardrail: classify.js tier decision is hard (LORAUTER bias dentro do tier, nunca substituir)

**Gate:** integration test com 5 task types (frontend, backend, data, pt-pt, en), validates correct adapter routing; doctrine guardrail test.

### Phase E — Pastor v2 per-task router (T2, 2h)

`packages/synthesis/src/pastor/per-task-router.ts`:
- Bridge entre classify.js features e LORAUTER routing
- API: `routeRequest(prompt, classifyOutput) → {adapter, confidence}`
- Feedback incorporation: bandit signals (Wave 30 L16.2) influence routing
- Telemetry: log adapter usage per task class

**Gate:** integration test end-to-end (prompt → classify → LORAUTER route → adapter selected → telemetry logged).

### Phase F — `mooter pastor distill` (T2, 3h)

`packages/synthesis/src/distill/`:
- `pattern-extractor.ts` — extract patterns from decisions log (`tools/router/decisions.log`)
- `markdown-generator.ts` — generate markdown skill from patterns
- `skill-emitter.ts` — output to `.skill.md` format (Anthropic-compatible)

CLI:
- `mooter pastor distill` — emit `~/.mooter/distilled/pastor-{date}.skill.md`
- `mooter pastor adapters` — list registered adapters
- `mooter pastor train-status` — check if `train_lora.sh` overnight finished

**Gate:** distill cmd produces valid markdown skill; skill installable via standard `npx skills add` cmd.

### Phase G — Obsidian Pack first-class (T2, 3h)

`packs/obsidian-vault-sync/`:
- `manifest.json` — pack metadata + capabilities
- `vault-detector.ts` — auto-detect `~/Documents/*-vault/` paths (Johnny-Decimal + .obsidian/)
- `sync-write.ts` — Pastor learnings → `vault/Mooter/learnings-YYYY-MM-DD.md`
- `sync-read.ts` — `vault/Mooter/preferences.md` → Pastor priors

CLI:
- `mooter pack install obsidian-vault-sync`
- `mooter pack uninstall obsidian-vault-sync`
- `mooter pack sync` — manual trigger

**Gate:** pack install/uninstall ciclo limpo; demo: write Pastor learning → file aparece em Paulo's vault; read preferences → Mooter respeita.

### Phase H — MCP tools para Obsidian + Pastor (T2, 2h)

`packages/mcp-server/src/tools/`:
- `pastor-adapter-suggest.ts` — MCP tool `mooter_pastor_adapter_suggest`
- `obsidian-vault-sync.ts` — MCP tool `mooter_obsidian_sync`

Expose via Claude Code Plugin/MCP registry.

**Gate:** MCP tools listable via `mooter mcp list-tools`; demo: Claude Code can ask `mooter_pastor_adapter_suggest` for routing recommendation.

### Phase I — Hub `/v1/pastor-adapters` + migration 016 (T2, 1.5h)

`hub/routes/pastor-adapters.js` — POST endpoint (opt-in adapter telemetry).

`hub/migrations/016_pastor_adapters.sql`:
```sql
CREATE TABLE IF NOT EXISTS pastor_adapters (
  adapter_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  adapter_name TEXT NOT NULL,
  task_type TEXT,
  usage_count INTEGER DEFAULT 0,
  avg_score REAL,
  first_used INTEGER,
  last_used INTEGER
);
CREATE INDEX idx_pastor_device ON pastor_adapters(device_id);
CREATE INDEX idx_pastor_task ON pastor_adapters(task_type);
```

**Gate:** migration applies clean (test local first); endpoint smoke test (POST {} → 422).

### Phase J — Demo + skill + statusline chip (T1, 2h)

Demo workflow:
```bash
mooter pastor distill                       # generates skill
mooter pack install obsidian-vault-sync     # installs pack
mooter pack sync                            # triggers sync
ls ~/Documents/paulo-vault/Mooter/          # see learnings appear
mooter mcp list-tools | grep pastor         # see new MCP tools
```

`.claude/skills/pastor-distill/SKILL.md` — usage docs + examples.

Statusline chip (linha 3 opt-in):
- `🧠 pastor: 3 adapters · frontend active`

**Gate:** demo end-to-end funcional; statusline chip aparece quando adapters carregados.

### Phase K — Marketing artifacts auto-generated (T1, 1h)

Usando Mooter MCP `mooter_notion_write` (Wave 30):
- Auto-write Wave 31 Notion sub-page
- Auto-generate `audit/wave31/{tweet,blog}.md`

`audit/FRIENDS_LAUNCH_DMS_v7.md`:
- Pitch v7 com Pastor v2 LORAUTER claim
- Wave 30 numbers (MLWR 100%, $0.13, 72 calls)
- Wave 31 add: per-task adapter routing
- Link mooter.ai + GitHub

**Gate:** Notion sub-page auto-created via MCP; DMs file gerado.

### Phase L — Final-reviewer + PR + merge + tag (T3, 1h)

1. `final-reviewer` (Opus) sobre branch `wave31-pastor-v2-obsidian`
   - Zero HIGH
   - classify.js sha intacta
   - All existing tests pass (Wave 28-30 packages preserved)
   - New tests target 60+ pass
   - Doctrine 8/8 compliance
2. PR `wave31-pastor-v2-obsidian` → `dev`
3. CI verde (incluindo benchmark CI Wave 30)
4. PR `dev` → `main`
5. **Tag DEPOIS do merge:**
   ```bash
   git fetch origin && git tag -f v1.19.0-pastor-v2 <new main HEAD>
   git push --force origin v1.19.0-pastor-v2
   ```
6. **Hub deploy + migration 016** (manual, footgun know):
   ```bash
   cd hub && npx wrangler d1 migrations apply mooter-hub --remote --config wrangler.mooter.toml || npx wrangler d1 execute mooter-hub --remote --config wrangler.mooter.toml --file migrations/016_pastor_adapters.sql
   npx wrangler deploy -c wrangler.mooter.toml
   ```
7. **Notion auto-write** via `mooter_notion_write` MCP tool (validar workflow recursivo)

---

## 🎯 Sucesso (gate critérios)

- [ ] classify.js sha intacta (`7b01eb86…87762`)
- [ ] Existing tests pass (Wave 28-30 packages preserved)
- [ ] 60+ new tests pass (lora-routing 15+ pastor 15+ distill 10+ obsidian-pack 15+ mcp-tools 5+)
- [ ] `mooter pastor distill` produces valid `.skill.md`
- [ ] `mooter pastor adapters` lists registered adapters
- [ ] LORAUTER routing demo (5 task types, correct adapter selected)
- [ ] Obsidian pack install/uninstall clean
- [ ] Pack sync writes to Paulo's vault (`~/Documents/paulo-vault/Mooter/`)
- [ ] 2 new MCP tools listable
- [ ] Hub deploy + migration 016 applied
- [ ] Statusline chip `🧠 pastor: N adapters · X active` aparece
- [ ] final-reviewer SHIP zero HIGH 8/8 doctrine
- [ ] Tag `v1.19.0-pastor-v2` em main HEAD
- [ ] Notion sub-page auto-created via MCP

---

## 📊 Reporting

Per phase:
```
✅ Phase X SHIPPED | commit <hash> | tests N pass | notes: <findings>
```

Final:
```
🐮 WAVE 31 SHIPPED | tag v1.19.0-pastor-v2 em <hash>
- Pastor v2 LORAUTER full impl (substitui Wave 29 stub)
- 6 adapter types registered (coding-frontend/backend/data, prose-pt-pt/en, baseline)
- `mooter pastor distill` LIVE → exports skill
- Obsidian vault-sync pack installable
- 2 new MCP tools (pastor_adapter_suggest, obsidian_sync)
- Hub /v1/pastor-adapters + migration 016
- Statusline chip 🧠 pastor LIVE
- Score 10 critérios: 90 → 95/100
- classify.js sha intact: 7b01eb86…
- All existing + N novos tests pass
- Notion sub-page auto-created via mooter_notion_write MCP
- Next: Wave 32 — TurboQuant integration + Edge inference + Data export/delete GDPR
```

---

## 🛡️ Doctrine non-negotiable (consolidated)

1. classify.js sha INTACTA
2. Wave 28-30 packages INTOCADOS (apenas usar via imports)
3. Statusline linhas 1-2 byte-idênticas
4. Pastor v1 schema PRESERVADO — migration 016 ADDED apenas
5. Doctrine wins LORAUTER — classify.js tier hard guardrail (princ. 5 V4)
6. Privacy first — DP + k-anonymity ≥50 enforced em pastor-adapters telemetry
7. Tag SÓ depois do merge dev→main (lição 11 waves consecutivas)
8. Bundle test pre-merge: `packages/cli npm run build`
9. LORAUTER adapter selection deterministic (não usa LLM para decidir adapter)
10. MCP tools registered via existing `packages/mcp-server/` (Wave 30 base)

---

## 📚 Referências

- LORAUTER paper: https://arxiv.org/abs/2601.21795
- LoRA-Switch: https://openreview.net/forum?id=NIG8O2zQSQ
- MoLoRA per-token: https://arxiv.org/pdf/2603.15965
- MCPVault Obsidian: https://medium.com/@ai_transfer_lab/mcpvault-...
- Wave 29 L13 base: `packages/synthesis/src/lora/`
- Wave 30 MCP server: `packages/mcp-server/`

---

*Brief composto pelo Cowork pós-Wave 30 SHIPPED. Wave 31 = Pastor v2 full + Obsidian + Distillation. Tag esperada v1.19.0-pastor-v2.*
