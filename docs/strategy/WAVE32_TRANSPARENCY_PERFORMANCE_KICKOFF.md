# WAVE 32 — Transparency + Performance + Slash + Ultramoo + GDPR

**Composto:** 2026-06-08 ~03h BRT, Cowork
**Sequência:** Wave 31 SHIPPED (`v1.19.0-pastor-v2` em `eb57bda`, hub deploy migration 016 LIVE smoke 422) → **Wave 32**
**Tag esperada:** `v1.20.0-transparency-performance`
**Estimate:** ~37h CC autonomous (precedent Wave 30 fez 30h em 1h19 com ultracode — esperado ~2-3h real)
**Mode:** `--dangerously-skip-permissions` + `/effort ultracode`

---

## 🎯 Posicionamento estratégico

Esta wave **materializa os 7 pontos Paulo** (transparency UX) + **8 slash commands `/moo-*`** + **Ultramoo mode** + **GDPR data export/delete**. Tudo num único merge atomic.

**Killer features que CC vai implementar:**

1. **Statusline refined** (Starship-inspired, ≤10ms render, 4 modes: mini/compact/full/didactic)
2. **`mooter dashboard`** full TUI (Ratatui — savings, Pastor, hardware, workflows, limits)
3. **`mooter workflow watch`** Ralph TUI Mission Control (pause/resume/kill per agent)
4. **`mooter pastor train-watch`** TensorBoard-like local (loss curve, per-task scores)
5. **Inline token tracker per command** (`[T0 🏠 qwen 145ms · 384 tok · $0]`)
6. **8 slash commands `/moo-*`** (workflow, effort, herd, dashboard, status, distill, pack, help)
7. **`/moo-effort ultramoo` mode** session-wide (LLMLingua + Caveman + LORAUTER + Multi-LoRA + Workflow auto + cost cap stricter)
8. **vLLM opt-in backend** (16.6× concurrent throughput vs Ollama)
9. **Multi-LoRA serving** (6 adapters concurrent, <10ms hot-swap)
10. **GDPR data export/delete** (`mooter data export/delete-all/forget-me`)

**Material foundation** (LER PRIMEIRO):
- `docs/strategy/MOOTER_TRANSPARENCY_LAYER_v2.md` (research deep dive 7 pontos)
- `docs/strategy/MOOTER_SLASH_COMMANDS_AND_ULTRAMOO_DESIGN.md` (slash commands + ultramoo spec)
- `docs/MOOTER_OPERATIONS_GUIDE_v1.0.md` (canonical reference)
- `docs/strategy/MOOTER_BIG_PICTURE_AUDIT.md` (gap 7, 9, 10 endereçados)

---

## 🛡️ NÃO QUEBRAR — Lista oficial

| Componente | Razão |
|---|---|
| `tools/router/classify.js` sha `7b01eb86…87762` | Doctrine gate test obrigatório |
| `tools/router/inject_context.js` hook | Path crítico |
| 6 subagents existentes | Auto-learning depende |
| `subagentstop_hook.js` | Wave 22 foundation |
| `mooter sync` (Wave 26) | Production |
| `packages/workflow/` (Wave 28) | LIVE — apenas usar |
| `packages/synthesis/` (Wave 29) | LIVE — apenas extender |
| `packages/validation/` (Wave 30) | LIVE — apenas extender |
| `packages/mcp-server/` (Wave 30) | LIVE — apenas adicionar tools |
| `packages/lora-routing/` (Wave 31) | LIVE — apenas usar |
| `packs/obsidian-vault-sync/` (Wave 31) | LIVE |
| Statusline linhas 1-2 byte-idênticas | UI contract |
| Pastor v1/v2 schema D1 | Preservar — adicionar 017 |
| Hub routes existentes (11+ endpoints) | LIVE — adicionar `/v1/transparency` apenas |
| D1 migrations 001-016 | INTOCADAS — adicionar 017 |
| Existing tests baseline (~600+ tests) | TODOS pass após PR |

---

## 📐 Arquitectura proposta (zero modificação existing)

### Novos packages/módulos

```
packages/transparency/                       # NOVO — Wave 32 core
├── src/
│   ├── index.ts
│   ├── statusline/                          # 4 modes
│   │   ├── mini.ts
│   │   ├── compact.ts
│   │   ├── full.ts
│   │   ├── didactic.ts
│   │   └── chip-renderer.ts                 # Common chip rendering, ≤10ms budget
│   ├── token-tracker/                       # Inline per-cmd tracking
│   │   ├── tracker.ts
│   │   ├── prefix-formatter.ts              # [T0 🏠 qwen 145ms · 384 tok · $0]
│   │   └── color-coder.ts                   # T0=green, T1=yellow, T2=orange, T3=red
│   ├── dashboard/                           # `mooter dashboard` TUI
│   │   ├── ratatui-renderer.ts              # Ratatui-style declarative TUI
│   │   ├── widgets/
│   │   │   ├── savings-widget.ts
│   │   │   ├── pastor-widget.ts
│   │   │   ├── hardware-widget.ts
│   │   │   ├── workflow-widget.ts
│   │   │   └── limits-widget.ts
│   │   └── keyboard-nav.ts
│   ├── workflow-watch/                      # Ralph TUI Mission Control
│   │   ├── ratatui-mission-control.ts
│   │   ├── agent-list.ts
│   │   ├── reviewer-list.ts
│   │   ├── metrics-panel.ts
│   │   └── controls.ts                      # pause/resume/kill per agent
│   └── pastor-train-watch/                  # TensorBoard-like local
│       ├── tb-renderer.ts
│       ├── loss-curve.ts
│       └── per-task-scores.ts
└── tests/

packages/effort/                             # NOVO — Ultramoo mode + others
├── src/
│   ├── index.ts
│   ├── effort-manager.ts                    # read/write ~/.mooter/effort.json
│   ├── modes/
│   │   ├── low.ts                           # baseline
│   │   ├── default.ts                       # Pastor hints active
│   │   ├── high.ts                          # + LLMLingua compression
│   │   └── ultramoo.ts                      # + LORAUTER + Multi-LoRA + workflow auto + caveman + cost cap stricter
│   └── state-transitions.ts                 # Smooth mode switching
└── tests/

packages/data-rights/                        # NOVO — GDPR commands
├── src/
│   ├── index.ts
│   ├── export.ts                            # mooter data export → JSON dump
│   ├── delete.ts                            # mooter data delete-all
│   ├── forget-me.ts                         # hub federated unlearn POST
│   └── privacy-audit.ts                     # confirms no PII leaks
└── tests/

packages/vllm-backend/                       # NOVO — vLLM opt-in
├── src/
│   ├── index.ts
│   ├── installer.ts                         # `mooter backend install vllm`
│   ├── multi-lora-loader.ts                 # 6 adapters concurrent
│   ├── client.ts                            # vLLM HTTP client wrapper
│   └── fallback.ts                          # Falls back to Ollama if vLLM unavailable
└── tests/

packages/cli/src/commands/                   # NOVOS subcomandos
├── dashboard.ts                             # mooter dashboard
├── effort.ts                                # mooter effort {set,show,reset}
├── status.ts                                # mooter status [--didactic]
├── data.ts                                  # mooter data {export,delete-all,forget-me}
├── backend.ts                               # mooter backend {install,uninstall,status}
└── train-watch.ts                           # mooter pastor train-watch

packages/mcp-server/src/tools/               # Wave 30 base — adicionar 4 tools
├── ultramoo-toggle.ts                       # NOVO
├── workflow-watch.ts                        # NOVO
├── data-export.ts                           # NOVO (rate-limited)
└── effort-set.ts                            # NOVO

.claude/skills/                              # NOVOS skills (8 slash commands)
├── mooter-workflow/SKILL.md
├── mooter-effort/SKILL.md
├── mooter-herd/SKILL.md
├── mooter-dashboard/SKILL.md
├── mooter-status/SKILL.md
├── mooter-distill/SKILL.md
├── mooter-pack/SKILL.md
└── mooter-help/SKILL.md

hub/routes/
└── transparency.js                          # NOVO POST /v1/transparency (opt-in telemetry)

hub/migrations/
└── 017_transparency_events.sql              # NOVO

audit/
├── WAVE32_DEMO_LOG.md                       # Live demo recording
└── FRIENDS_LAUNCH_DMS_v8.md                 # pitch v8 com Wave 32 demos

docs/
├── ux/STATUSLINE_MODES.md                   # NOVO
├── ux/DASHBOARD_GUIDE.md                    # NOVO
├── compliance/GDPR_DATA_RIGHTS.md           # NOVO
└── architecture/VLLM_BACKEND.md             # NOVO

~/.mooter/                                   # User config NOVO
├── effort.json                              # current mode
├── statusline.toml                          # mode + chip config
├── limits.toml                              # already exists (Wave 30)
└── transparency.toml                        # opt-in flags
```

---

## 🔍 Phase A — Day 0 Honest Recon (T0/T1, 30min) 🔥

ANTES de qualquer commit:

```bash
# 1. Confirm Wave 31 estado
git log --oneline main | head -10
git tag | grep v1.19.0
sha256sum tools/router/classify.js | head -c 16

# 2. Existing packages baseline tests
cd packages/workflow && npm test 2>&1 | tail -5
cd ../synthesis && npm test 2>&1 | tail -5
cd ../validation && npm test 2>&1 | tail -5
cd ../mcp-server && npm test 2>&1 | tail -5
cd ../lora-routing && npm test 2>&1 | tail -5
cd ../cli && npm test 2>&1 | tail -5
cd ../../hub && npm test 2>&1 | tail -5

# 3. Hub LIVE confirm
curl -s -o /dev/null -w '%{http_code}\n' https://mooter-hub.frugal-hub.workers.dev/v1/wave-status
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mooter-hub.frugal-hub.workers.dev/v1/pastor-adapters -H 'Content-Type: application/json' -d '{}'

# 4. Ollama models
curl -s http://localhost:11434/api/tags | head -200

# 5. Pastor LoRA state
ls -lah ~/.mooter/adapters/ 2>/dev/null || ls -lah ~/.mooter/pastor/ 2>/dev/null

# 6. Existing skills (.claude/skills/)
ls .claude/skills/

# 7. NPM workspaces
cat package.json | head -30
ls packages/
```

**Output obrigatório:** `docs/strategy/WAVE32_DAY0_FINDINGS.md` com:
- Wave 31 SHIPPED confirmed
- All packages baseline tests pass
- Hub endpoints LIVE
- Pastor adapter registry state
- 8 skills NOVOS planned (Mooter slash commands)
- Path forward final

Se uma premissa core falhar, PARA e reporta.

---

## 📋 Phases B-N (17 phases total — executar pela ordem)

### Phase B — Statusline refinement 4 modes (T2, 3h)

Implementar `packages/transparency/src/statusline/`:
- `mini.ts` — 1 line (savings + local %)
- `compact.ts` — 2 lines (default — savings + tier dist + current turn)
- `full.ts` — 3 lines (compact + Pastor + adapter + hardware chip)
- `didactic.ts` — 5 lines (human-friendly explanations)

`chip-renderer.ts` — common rendering com **≤10ms budget** (Starship-style).

CLI:
- `mooter statusline mode <mini|compact|full|didactic>`
- `mooter statusline show` (preview)

**Gate:** all 4 modes render ≤10ms; linhas 1-2 byte-idênticas vs Wave 31 baseline.

### Phase C — Inline token tracker per command (T2, 2h)

`packages/transparency/src/token-tracker/`:
- Hook into `mooter sync`, `mooter workflow create`, `mooter chat` (if exists)
- Output prefix per execution: `[T2 ☁️ Opus 380ms · 1.2k tok · $0.0094]`
- Color coding: 🟢 T0, 🟡 T1, 🟠 T2, 🔴 T3
- Backend indicator: 🏠 local, ☁️ cloud

**Gate:** every Mooter cmd outputs prefix tag; unit tests for formatter; color codes render correct.

### Phase D — `mooter dashboard` Ratatui TUI (T3, 4h)

`packages/transparency/src/dashboard/`:
- Full TUI dashboard com 5 widgets (savings, Pastor, hardware, workflows, limits)
- Keyboard navigation: r=refresh, w=watch workflow, q=quit
- Ratatui-style declarative (DEC synchronized output, no flicker)
- Refresh interval: 2s

CLI: `mooter dashboard`

**Gate:** dashboard renders correctly in 80×24 terminal min; no flicker; all 5 widgets show real data.

### Phase E — `mooter workflow watch` Ralph TUI (T3, 3h)

`packages/transparency/src/workflow-watch/`:
- Ralph TUI Mission Control inspired
- Per-agent display (workers + reviewers)
- Live metrics: ETA, cost, convergence
- Controls: [p]ause, [r]esume, [k]ill per agent

CLI: `mooter workflow watch <run_id>`

**Gate:** pause/resume/kill work em demo workflow; metrics update real-time.

### Phase F — `mooter pastor train-watch` (T2, 3h)

`packages/transparency/src/pastor-train-watch/`:
- TensorBoard-like local visualisation
- Loss curve (training + validation)
- Per-task scores comparison (frontend/backend/data/pt-pt/en)
- Sample progress + ETA

CLI: `mooter pastor train-watch`

**Gate:** loss curve renders correctly; per-task scores displayed; works even when training inactive (shows last run).

### Phase NEW1 — 8 Slash commands `/moo-*` (T2, 3h) ⭐

`.claude/skills/mooter-{workflow,effort,herd,dashboard,status,distill,pack,help}/SKILL.md`:

Each skill com frontmatter `agent:` + dynamic context injection (`run: mooter <cmd>`).

Skills:
- `/moo-workflow <task>` — wraps `mooter workflow create --local-first --adversarial`
- `/moo-effort <mode>` — `mooter effort set <mode>` (low/default/high/ultramoo)
- `/moo-herd` — `mooter herd --inline` (compact TUI in CC chat)
- `/moo-dashboard` — opens `mooter dashboard` (full TUI)
- `/moo-status` — `mooter status --didactic`
- `/moo-distill` — `mooter pastor distill > pastor-$(date).skill.md`
- `/moo-pack <action>` — `mooter pack $ARGUMENTS`
- `/moo-help` — outputs help menu (mission + commands + current session state)

**Gate:** all 8 `/moo-*` show in CC autocomplete; each delegates correctly; help menu shows mission B6d.

### Phase G — Quant + Vector status chips (T1, 1.5h)

`packages/transparency/src/statusline/chip-renderer.ts` adicionar:
- Quant chip: `📦 qwen2.5-coder:7b · Q4_K_M · 4.5 GB · 78 tok/s`
- Vector chip: `🧭 nomic-embed-text · 768d · 1.2k cached`

CLI: `mooter quant status` + `mooter vector status`

**Gate:** chips show real metrics from Ollama API; status cmds output JSON valid.

### Phase H — vLLM backend opt-in installer (T2, 3h)

`packages/vllm-backend/`:
- `installer.ts` — detects CUDA, NVIDIA driver, prerequisites
- Installs vLLM via pip in dedicated venv (`.venv-vllm`)
- Spawns vLLM server on port 8000
- Health check + smoke test

CLI:
- `mooter backend install vllm`
- `mooter backend uninstall vllm`
- `mooter backend status` (Ollama default, vLLM optional)

**Gate:** vLLM installs in dedicated venv; health check passes; smoke test against vLLM endpoint OK.

### Phase I — Multi-LoRA serving via vLLM (T3, 4h) 🔒

`packages/vllm-backend/src/multi-lora-loader.ts`:
- Loads 6 adapter types simultaneously (from Wave 31 registry)
- Per-request adapter selection (delegates to Wave 31 LORAUTER)
- Hot-swap <10ms per request
- Falls back to Ollama if vLLM unavailable (graceful degrade)

**Gate:** 6 adapters loaded concurrently in vLLM; per-request selection works; latency <10ms swap; fallback test passes.

### Phase NEW2 — Ultramoo mode session-wide (T3, 4h) ⭐

`packages/effort/src/modes/ultramoo.ts`:
- Activates simultaneously:
  - LLMLingua compression on (4-10×)
  - Caveman pack auto-apply for prose
  - LORAUTER per-task routing on
  - Multi-LoRA via vLLM (if available)
  - Workflow Engine auto-trigger threshold lower (>500 tokens)
  - Cost cap stricter ($1/workflow, $20/session)
  - Bandit Learner bias hard local
  - Statusline mode `ultramoo` (chip `🐄 ultramoo · X workers · LoRA Y`)

CLI: `mooter effort set ultramoo` → persists em `~/.mooter/effort.json`

**Gate:** ultramoo flips all 8 settings; statusline reflects; unit tests per subsystem confirm activation.

### Phase J — Hub `/v1/transparency` + migration 017 (T2, 1.5h)

`hub/routes/transparency.js` — POST endpoint (opt-in telemetry: statusline mode, effort, dashboard usage).

`hub/migrations/017_transparency_events.sql`:
```sql
CREATE TABLE IF NOT EXISTS transparency_events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  event_type TEXT,        -- 'statusline_mode' | 'effort_change' | 'dashboard_open'
  metadata TEXT           -- JSON, features only
);
```

**Gate:** migration applies clean; endpoint smoke 400/422 OK.

### Phase NEW3 — GDPR data export/delete (T2, 2h) ⭐

`packages/data-rights/src/`:
- `export.ts` — `mooter data export [--format json] > my-mooter-data.json`
  - Dumps `~/.mooter/*` + local decisions log + pastor state
- `delete.ts` — `mooter data delete-all --confirm`
  - Removes ~/.mooter/*, decisions log, adapter cache
- `forget-me.ts` — `mooter data forget-me --confirm`
  - POST hub /v1/forget-me with device_id signature
  - Hub marks for k-anonymity erasure

CLI commands + privacy-audit cmd.

**Gate:** export produces valid JSON with no PII leaks; delete-all wipes correctly; forget-me hub endpoint returns 202 (queued).

### Phase K — Tests + integration (T2, 2h)

- Unit tests para every new module
- Integration tests para:
  - statusline render budget ≤10ms
  - dashboard renders 80×24
  - workflow watch updates real-time
  - ultramoo flips all settings
  - GDPR export/delete cycles
- E2E test: full ultramoo workflow end-to-end

**Gate:** all existing tests pass + 80+ new tests pass.

### Phase L — Docs + demos (T1, 1.5h)

- `docs/ux/STATUSLINE_MODES.md` — visual examples per mode
- `docs/ux/DASHBOARD_GUIDE.md` — screenshots + keybindings
- `docs/compliance/GDPR_DATA_RIGHTS.md` — formal compliance doc
- `docs/architecture/VLLM_BACKEND.md` — install + multi-LoRA spec
- Demo recordings (asciinema) em `audit/wave32/demos/`

**Gate:** docs commited; demos viewable.

### Phase M — Final-reviewer + PR + merge + tag (T3, 1h)

1. `final-reviewer` (Opus, adversarial workflow) sobre branch `wave32-transparency-performance`
   - Zero HIGH
   - classify.js sha intact
   - All existing tests pass (Wave 28-31 packages preserved)
   - New 80+ tests pass
   - Doctrine 8/8 compliance
2. PR `wave32-transparency-performance` → `dev`
3. CI verde (incluindo benchmark + security workflows)
4. PR `dev` → `main`
5. **Tag DEPOIS do merge:**
   ```bash
   git fetch origin && git tag -f v1.20.0-transparency-performance <new main HEAD>
   git push --force origin v1.20.0-transparency-performance
   ```
6. **Hub deploy + migration 017 (manual, footgun)**:
   ```bash
   cd hub && npx wrangler d1 execute mooter-hub --remote -c wrangler.mooter.toml --file migrations/017_transparency_events.sql && npx wrangler deploy -c wrangler.mooter.toml
   ```

### Phase N — Notion auto-write + memory (T1, 0.5h)

Via `mooter_notion_write` MCP tool (Wave 30 LIVE):
- Cria Notion sub-page Wave 32 SHIPPED
- Update SYNC.md
- Update memory file

**Gate:** Notion sub-page criada com link válido; SYNC.md tem nova entrada; memory file commited.

---

## 🎯 Sucesso (gate critérios)

- [ ] classify.js sha intacta (`7b01eb86…87762`)
- [ ] Existing tests TODOS pass (Wave 28-31 packages preserved)
- [ ] 80+ new tests pass
- [ ] 4 statusline modes LIVE (mini/compact/full/didactic), ≤10ms render
- [ ] Inline token tracker prefix em todos os Mooter cmds
- [ ] `mooter dashboard` Ratatui TUI funcional
- [ ] `mooter workflow watch` Ralph TUI funcional (pause/resume/kill)
- [ ] `mooter pastor train-watch` TensorBoard-like local
- [ ] 8 slash commands `/moo-*` em CC autocomplete
- [ ] `/moo-effort ultramoo` ativa 8 sub-systems simultaneously
- [ ] vLLM backend installable + Multi-LoRA 6 adapters concurrent
- [ ] `mooter data export/delete-all/forget-me` GDPR-compliant
- [ ] Hub migration 017 + endpoint LIVE
- [ ] 4 new MCP tools registered (Wave 30 base extended)
- [ ] final-reviewer SHIP zero HIGH, 8/8 doctrine
- [ ] Tag `v1.20.0-transparency-performance` em main HEAD
- [ ] Notion sub-page auto-created via MCP

---

## 📊 Reporting

Per phase:
```
✅ Phase X SHIPPED | commit <hash> | tests N pass | notes: <findings>
```

Final:
```
🐮 WAVE 32 SHIPPED | tag v1.20.0-transparency-performance em <hash>
- 4 statusline modes LIVE
- mooter dashboard + workflow watch + pastor train-watch TUIs
- 8 slash commands /moo-* in CC autocomplete
- Ultramoo mode session-wide (8 sub-systems flip)
- vLLM opt-in backend + Multi-LoRA 6 adapters concurrent
- GDPR data rights cmds (export/delete/forget-me)
- Hub migration 017 + 4 new MCP tools
- Score 10 critérios Paulo: 90 → 96/100
- classify.js sha intact: 7b01eb86…
- All existing + N novos tests pass
- Notion sub-page auto-created via mooter_notion_write MCP
- Next: Wave 33 — TurboQuant + Speculative + MiniMax M3 (when llama.cpp shipping)
```

---

## 🛡️ Doctrine non-negotiable (consolidated)

1. classify.js sha INTACTA até ao fim
2. Wave 28-31 packages INTOCADOS (apenas usar/extender via imports)
3. Statusline linhas 1-2 byte-idênticas (chip novos em linha 3 opt-in)
4. Pastor v1/v2 schema preservado — migration 017 ADDED apenas
5. Privacy first — DP + k-anonymity ≥50 enforced em transparency telemetry
6. Doctrine wins ultramoo — classify.js tier hard guardrail
7. ≤10ms statusline render budget (Starship-grade)
8. Ultramoo é OPT-IN (default low/default)
9. vLLM é OPT-IN (default Ollama)
10. Tag SÓ depois do merge dev→main (lição 12 waves consecutivas)
11. Bundle test pre-merge (lesson Wave 28 Phase I)
12. Skills publicáveis em `.claude/skills/mooter-*` (architecture nativa CC)

---

## 📚 Referências canónicas

- `docs/strategy/MOOTER_TRANSPARENCY_LAYER_v2.md` (research 7 pontos + 25 sources)
- `docs/strategy/MOOTER_SLASH_COMMANDS_AND_ULTRAMOO_DESIGN.md` (8 commands + ultramoo spec)
- `docs/MOOTER_OPERATIONS_GUIDE_v1.0.md` (canonical, 85+ sources)
- `docs/strategy/MOOTER_BIG_PICTURE_AUDIT.md` (gaps endereçados)
- Starship docs · CShip · Ralph TUI · Ratatui · vLLM Multi-LoRA · LLMLingua

---

*Brief composto pelo Cowork pós-Wave 31 SHIPPED. 17 phases (A-N + NEW1 + NEW2 + NEW3). Tag esperada v1.20.0-transparency-performance.*
