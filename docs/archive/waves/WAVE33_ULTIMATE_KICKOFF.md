# WAVE 33 — ULTIMATE: Polish + TurboQuant + EAGLE-3 + Quality + Friends-Launch Ready

**Sequência:** Wave 32 v1.20.0-transparency-performance SHIPPED (`32d0c9c`) → **Wave 33 Ultimate**
**Tag esperada:** `v1.21.0-ultimate-polish-turboquant`
**Estimate:** 10-14h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo · classify.js sha INTACT obrigatório
**Date kickoff:** 2026-06-08

---

## Por que esta mega-wave (a verdade nua)

Wave 32 SHIPPED 17 fases com **0-HIGH / 0-MED / 3-LOW** final-reviewer. Validação 2026-06-08 confirmou:

- ✅ 7 hub endpoints LIVE (smoke 200/202/422/400 esperados)
- ✅ Dashboard 5+ widgets LIVE (658 calls reais, $25.95 saved 47%)
- ✅ `mooter explain statusline` mostra TUDO (ctx bar + 5h quota + quant + adapter + tier dist)
- ✅ Pastor learning de 658 calls reais com 7 moos active (3 locais + 4 cloud)
- ✅ 12 MCP tools, 3 packs installed, GDPR data-rights LIVE

**Mas validação real expôs 5 gaps + 4 oportunidades estratégicas:**

**Gaps (Block A — Polish):**
1. Statusline mode é manual (preferences.json à mão) — friends-launch footgun
2. Session timer `⏱️ session 2h47m` NÃO shipou (design v3 não materializado)
3. Jargon `turn`/`alltime` (devia ser `this prompt`/`session`)
4. 3 LOW nits final-reviewer dormant
5. LoRA train deps conflict (unsloth × transformers) bloqueia Wave 26.G overnight

**Oportunidades (Block B — Performance):**
1. **TurboQuant** (ICLR 2026 Google DeepMind, paper arxiv 2504.19874): 6× KV cache memory reduction, 3-bit sem perda. Fork `AmesianX/TurboQuant` JÁ tem llama.cpp impl shipping (5.2× real).
2. **EAGLE-3** speculative decoding: 2-2.5× inference speedup via vLLM (Wave 32 H+I já tem vLLM opt-in — encaixa perfeito).
3. **MiniMax M3** weights chegam June 10-11, 2026 (3-5 dias) — preparar auto-detect + opt-in install.
4. **Continuous arbitrage routing** (V5 layer L11): real-time price/latency from providers → re-route mid-session.

**Gaps de qualidade (Block C):**
- Hardware widget (RTX 4090) só visível terminal wide — narrow terminal corta
- Workflow widget AUSENTE no dashboard validation
- Auto-update lists models/providers/prices não tem job recurring

**Friends-launch readiness (Block D):**
- DMs Task #218 14 dias pendente
- Pitch deck refresh com Wave 33 numbers
- Onboarding flow não foi auditado pós-Wave 32

**Doctrine:** ship o polish que destrava users + as performance wins que diferenciam Mooter de qualquer router open-source 2026.

---

## Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ 32d0c9c` |
| Branch feature | `wave33-ultimate` |
| Tag pré-merge | ❌ NÃO criar (lição Wave 21-32) |
| Tag pós-merge | `v1.21.0-ultimate-polish-turboquant` apontando para main HEAD final |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) |
| classify.js sha | `7b01eb86…87762` **INTACT obrigatório** — re-verificar pré + post-merge |
| Wave 28-32 packages | **INTOCADOS** — apenas estender via novos sub-packages |
| Doutrina | Honest > forced. Day 0 recon obrigatório. final-reviewer Opus gate antes merge. |
| Anthropic quota | Spread tasks T0/T1 (Ollama/Haiku) onde possível para preservar quota Opus para architectação |

---

## Day 0 honest recon (~45-60 min, ANTES de qualquer commit)

1. **Re-validar classify.js sha INTACT** — `git log --all --diff-filter=M -- packages/router/src/classify.js` deve estar vazio desde Wave 11.
2. **Localizar 3 LOW nits final-reviewer Wave 32** — procurar em PR comments do PR de Wave 32 + git log + qualquer doc Wave 32 que mencione "LOW". NÃO assumir o que são — ler primeiro.
3. **Auditar statusline output actual** — `mooter statusline --debug` e comparar com `mooter explain statusline`. Identificar diff entre o que documentação diz e o que código gera. Wave 32.1.A precisa saber este diff.
4. **Localizar workflow widget code** — `grep -r "workflow" packages/cli/src/commands/dashboard.ts` — confirmar se está implementado mas oculto, ou se nunca foi shippado.
5. **Validar hardware widget threshold** — encontrar COLUMNS threshold que oculta o widget RTX 4090 do dashboard. Reduzir ou tornar adaptive.
6. **Web search latest unsloth + transformers compat 2026-06** — Day 0 OBRIGATÓRIO antes Block A.E (LoRA deps fix). Não inventar versões.
7. **Smoke clone `AmesianX/TurboQuant`** — `git clone https://github.com/AmesianX/TurboQuant` numa dir temporária; ler README; identificar se há binary release ou se precisa build from source. Block B.A depende disto.
8. **Auditar Wave 32 vLLM backend code** — `packages/vllm-backend/src/` — confirmar interfaces para EAGLE-3 draft model integration. Block B.B depende disto.
9. **Web search MiniMax M3 weights status** — verificar HuggingFace `ox-ox/MiniMax-M3-GGUF` ou `ubergarm/MiniMax-M3-GGUF` quando disponível.
10. **Verificar FRIENDS_LAUNCH_DMS.md existe e estado** — `cat docs/strategy/FRIENDS_LAUNCH_DMS.md | head -50` — confirmar template + lista friends + status DMs.

**Output Day 0:** ficheiro `docs/strategy/WAVE33_DAY0_RECON.md` com findings de TODOS os 10 pontos acima. Escalar para Paulo se algum revelar bug bigger que polish (>30 min fix).

---

## BLOCK A — Polish (Wave 32.1 inteiro, ~3h)

### A.1 — CLI `mooter statusline mode <name>` 🔥

**O que:** Sub-cmd que escreve `~/.mooter/preferences.json` directamente.

**Comportamento:**
```bash
mooter statusline mode                  # mostra current mode + lista disponíveis
mooter statusline mode compact          # set + persist + echo "✓ statusline mode = compact"
mooter statusline mode full
mooter statusline mode didactic
mooter statusline mode mini
mooter statusline mode legacy           # revert para default byte-idêntico
mooter statusline mode --help           # explica cada mode com preview
mooter statusline mode --preview compact  # mostra como ficaria SEM persistir
```

**Implementação:** sub-cmd em `packages/cli/src/commands/statusline.ts` (extensão).

**Validação:** smoke `mooter statusline mode compact && cat ~/.mooter/preferences.json` → confirma JSON valid.

**Tier sugerido:** T1 (Haiku) — file I/O simples, validação tight.

### A.2 — Session timer chip ⏱️

**O que:** Statusline chip `⏱️ session 2h47m` mostrando tempo desde início da sessão CC.

**Source of truth:** stdin `transcript_path` (CC JSONL) → `fs.stat(birth time)` → `now - birth`.

**Formatação:** `<60min` → `47m` · `<24h` → `2h47m` · `>=24h` → `2d4h`.

**Localização:** linha 2, entre `5h reset` e `this prompt $` (após rename A.3) — só modes compact/full/didactic.

**Hide cmd:** `mooter quiet --hide-session-timer`.

**Budget impact:** medir antes/depois. Se >0.5ms add, optimizar (cache birth_time por session).

**Tier sugerido:** T1 (Haiku) — string manipulation + fs.stat.

### A.3 — Rename `turn`/`alltime` → `this prompt`/`session` 🔥

**O que:** Reduzir jargon em statusline + dashboard.

**Antes:** `turn $0.09 · alltime $0.09`
**Depois:** `this prompt $0.09 · session $0.09`

**Onde:**
- `tools/router/statusline_line2.sh` (ou equivalent TS)
- `packages/cli/src/commands/dashboard.ts` SAVINGS widget
- `mooter explain statusline` doc
- `mooter --help` cmd outputs onde aparece

**Excepção:** NÃO renomear em logs internos / database fields / API responses (breaking change). Só UX-facing labels.

**Validação:** `grep -r "turn \$" packages/` e `grep -r "alltime" packages/` — confirmar zero matches em UX paths pós-fix.

**Tier sugerido:** T0 (Ollama) — find/replace cirúrgico, regression test em statusline modes.

### A.4 — Fix 3 LOW nits final-reviewer Wave 32

**O que:** Endereçar os 3 LOW nits identificados em Wave 32 final-reviewer.

**Pre-req:** Day 0 #2 localizou os 3 nits.

**Tier sugerido:** depende dos nits (provável T1).

### A.5 — LoRA train deps fix (unsloth bump)

**O que:** Resolver conflito `unsloth==2025.5.1` vs `transformers<4.46 and >=4.43`.

**Sub-tasks:**
1. Day 0 #6 já fez web search → usar versões compatíveis 2026-06.
2. Update `synthesis/scripts/train_lora.py` requirements.
3. Update `requirements-lora.txt` (ou equivalent).
4. Smoke dry-run install (sem GPU): `pip install --dry-run -r requirements-lora.txt` confirma resolução.
5. **NÃO executar treino** — Paulo executa overnight RTX 4090 separadamente.

**Tier sugerido:** T2 (Sonnet) — dep resolution requer contexto domain.

### A.6 — CLI `mooter effort set` + `mooter sessions list`

**O que:** 2 sub-cmds CLI:
- `mooter effort set <level>`: persistir effort em `preferences.json`. Levels: `default`, `ultramoo`, `eco` (novo — caps em T0/T1 só).
- `mooter sessions list`: lista sessões CC com idade + tier breakdown + savings.

**Output `mooter sessions list`:**
```
session start              age      prompts  T0/T1/T2/T3   $ saved
2026-06-08 02:15 (LIVE)    2h47m    23       2/3/8/10      $4.32
2026-06-08 00:42            4h20m    12       1/2/5/4       $1.87
2026-06-07 22:10            6h52m    45       8/12/15/10    $9.41
```

**Source of truth:** ficheiros `~/.claude/projects/*/sessions/*.jsonl` (birth time + JSONL line count + classify.js tier).

**Tier sugerido:** T2 (Sonnet) — file glob + parsing + table render.

---

## BLOCK B — TurboQuant + EAGLE-3 + MiniMax M3 (~4-5h)

### B.1 — TurboQuant llama.cpp integration (3-bit KV cache, 6× compression) 🔥

**Research base:** ICLR 2026 paper arxiv 2504.19874 (Google DeepMind) — 3-bit quantization sem perda, 6× memory reduction, 8× faster attention @ 4-bit em H100.

**Implementation path:** Fork `AmesianX/TurboQuant` (https://github.com/AmesianX/TurboQuant) já tem llama.cpp impl com 5.2× memory reduction real.

**Approach:**
1. **NÃO substituir** llama.cpp shipped — package opt-in `@mooter/turboquant-backend`.
2. Detect: se Ollama version supports TurboQuant flag → expose via `mooter turboquant enable`.
3. Fallback: build custom llama.cpp from AmesianX fork → `mooter turboquant build` (one-shot, ~10 min em RTX 4090).
4. Statusline chip: `🐢 TQ-3bit` quando enabled (line 2, opt-in via `mooter quiet --show-turboquant`).
5. Benchmark gate: deve mostrar measurable VRAM reduction in dashboard hardware widget (Block C.1) — se não mostrar, opt-out automático.

**Risks:**
- AmesianX fork pode estar atrás de mainline llama.cpp → resolver merge manualmente OU esperar oficial Google Q2 2026 (já chegou — verificar).
- Build from source requires CMake + CUDA toolchain — wrap em script `mooter turboquant build` com error handling claro.

**Tier sugerido:** T3 (Opus) — arquitectura + risk mgmt.

### B.2 — EAGLE-3 speculative decoding via vLLM backend (2-2.5× speedup)

**Research base:** vLLM já suporta EAGLE-3 (Red Hat Developer 2025-07, vLLM docs Speculators). llama.cpp NÃO suporta ainda (Discussion #15902 open).

**Implementation path:** **Wave 32 H+I já tem `@mooter/vllm-backend` opt-in.** Extender para Multi-LoRA + EAGLE-3 draft model.

**Approach:**
1. Add `eagle3` option em `mooter backend install vllm` config:
   ```bash
   mooter backend install vllm --eagle3 --run
   ```
2. Validate GPU memory: EAGLE-3 draft model needs ~10% extra VRAM. Check + warn.
3. Statusline chip: `⚡ EAGLE-3` quando active (line 2, opt-in).
4. Benchmark esperado: 2-2.5× tokens/sec em workloads steady-state.
5. **Fall back gracioso:** se GPU insuficiente, NÃO instalar EAGLE-3 — log + opt-out.

**Risks:**
- Draft model selection: matching qwen2.5-coder:14b needs custom EAGLE-3 head training. Approach: usar pre-trained drafts disponíveis em HF (procurar `Eagle-Draft-Qwen-*`) ou usar Medusa heads se EAGLE-3 não disponível para qwen.

**Tier sugerido:** T3 (Opus) — arquitectura + multi-component integration.

### B.3 — MiniMax M3 auto-detector + opt-in installer

**Research base:** MiniMax M3 weights expected **June 10-11, 2026** (3-5 dias). Day-one support: vLLM + GGUF "expected shortly after".

**Implementation path:** `@mooter/minimax-watcher` package — daemon que polls HuggingFace API por weights availability.

**Approach:**
1. Cron job `mooter watcher` (CF Worker cron `*/15 * * * *`):
   - Poll `https://huggingface.co/api/models?search=MiniMax-M3-GGUF`
   - If found, write `hub/d1/minimax_m3_available=true`
2. CLI `mooter minimax-m3 install`:
   - Detect platform (Mac/Linux/Win)
   - Download GGUF Q4_K_M from preferred uploader (ox-ox or ubergarm)
   - Install em Ollama: `ollama create minimax-m3 -f Modelfile`
   - Register em Pastor adapter registry
3. Statusline chip: `🆕 MiniMax M3 available — run mooter minimax-m3 install` quando hub flag = true e user not installed.

**Risks:**
- HF API rate limit: 1 poll/15min é safe.
- Quantization quality: Q4_K_M default, Q5_K_M opt-in para better quality.
- Model size: M3 expected ~20-30GB GGUF Q4 → check disk space + warn.

**Tier sugerido:** T2 (Sonnet) — poller logic + install orchestration.

### B.4 — L11 continuous arbitrage routing (V5 layer)

**Research base:** V5 architecture layer L11 (Real-time arbitrage) — re-route mid-session based on provider price/latency changes.

**Implementation path:** `@mooter/arbitrage-monitor` package.

**Approach:**
1. Background job `mooter monitor providers` (opcional, opt-in):
   - Every 5 min, ping each cloud provider (Anthropic, OpenAI, Google) for current price/latency
   - Write to `~/.mooter/arbitrage_state.json`
2. classify.js continua INTACT — Pastor reads `arbitrage_state.json` como input adicional, ajusta bias dentro do tier.
3. Example: se Sonnet latency dispara 3× over baseline, Pastor sugere routing T2 → Opus para hard prompts.
4. Statusline chip: `📊 arbitrage active` (line 2, opt-in).

**Risks:**
- Privacy: NÃO enviar prompts para providers para "ping" — usar status pages públicas (ex: status.anthropic.com).
- False signals: requer ≥10 samples antes de adjust bias.
- Doctrine wins: classify.js tier floor sempre prevalece (mesmo princípio de Ultramoo).

**Tier sugerido:** T3 (Opus) — arquitectura sensível, doctrine impact.

---

## BLOCK C — Quality fixes (~1.5h)

### C.1 — Hardware widget visível em narrow terminals

**O que:** RTX 4090 (12.1GB / 24GB) widget só renderiza se `COLUMNS >= 120`. Em narrow terminals (80-100 cols), invisível.

**Fix:**
1. Detect `COLUMNS` runtime.
2. Se `< 100`: render minimal `🎮 RTX4090 50%` (label compacto).
3. Se `100-119`: render `🎮 RTX 4090 12.1/24GB`.
4. Se `>= 120`: render full atual.

**Localização:** `packages/cli/src/commands/dashboard.ts` widget hardware.

**Tier sugerido:** T1 (Haiku) — render logic + responsive layout.

### C.2 — Workflow widget shipping no dashboard

**O que:** Wave 32 D especificava workflow widget no dashboard. Validation 2026-06-08 mostrou widget ausente.

**Day 0 #4 já investigou** se está implementado mas oculto, ou nunca foi shippado. Fix depende.

**Cenário A (implementado mas oculto):** unhide + responsive layout.

**Cenário B (nunca shippado):** implementar minimal widget:
```
WORKFLOWS
Active: 0  ·  Completed today: 0  ·  Avg cost: $0.0028
Run `mooter workflow watch` for live mission control
```

**Tier sugerido:** T2 (Sonnet) se Cenário B; T1 (Haiku) se Cenário A.

### C.3 — Auto-update lists (models, providers, prices) job

**O que:** Pricing tables hard-coded em `packages/router/src/pricing.ts` — desactualizam.

**Fix:**
1. CF Worker cron `0 6 * * *` (daily 6am UTC):
   - Fetch latest pricing from each provider's pricing page (HTML scrape ou API).
   - Update `pricing_state` table em D1.
2. `mooter pricing-update` CLI cmd: pull latest from hub → update local `~/.mooter/pricing_cache.json`.
3. Pastor reads pricing_cache para arbitrage decisions (Block B.4).

**Privacy:** pricing pages são públicas, zero PII.

**Risks:**
- Provider changes HTML structure → scrape break. Solution: fallback para hard-coded + log warning.

**Tier sugerido:** T2 (Sonnet) — scraping + cron orchestration.

---

## BLOCK D — Friends-launch readiness (~1.5h)

### D.1 — FRIENDS_LAUNCH_DMS.md refresh com Wave 33 numbers

**O que:** Update template DMs (Task #218 14 dias pendente) com:
- v1.21.0-ultimate (post-ship)
- 47% savings real (validado)
- 658 calls reais (dashboard)
- TurboQuant 3-bit (Block B.1)
- EAGLE-3 2.5× speedup (Block B.2)
- Session timer (Block A.2)
- GDPR data rights (Wave 32 NEW3)

**Output:** novo `docs/strategy/FRIENDS_LAUNCH_DMS_v2.md` com 3 DMs prontos (PT-PT, PT-BR, EN versions).

**Tier sugerido:** T1 (Haiku) — copywriting refresh.

### D.2 — Onboarding flow audit pós-Wave 32

**O que:** Wave 32 shipou GDPR + Ultramoo + slash commands. Onboarding (mooter.ai/onboarding) NÃO foi auditado pós-ship.

**Sub-tasks:**
1. Smoke `mooter.ai/onboarding` em browser (Chrome MCP).
2. Validar 8 slash commands `/moo-*` aparecem com sucesso.
3. Validar `mooter explain statusline` ensina o user os modes.
4. Identificar friction points para friends-launch.
5. Output: `docs/strategy/WAVE33_ONBOARDING_AUDIT.md` com 3-5 fixes.

**Tier sugerido:** T2 (Sonnet) — UX audit + critical thinking.

### D.3 — E2E smoke test full flow

**O que:** Script `scripts/e2e_friends_launch.sh` que simula friend user:
1. `curl install.sh | bash`
2. `mooter init`
3. Activate Ollama
4. Run 5 prompts variados
5. `mooter sync`
6. Open `mooter.ai/dashboard`
7. Verify all data flows

**Output:** PASS / FAIL com timeline + failure points.

**Tier sugerido:** T2 (Sonnet) — scripting + assertion.

---

## BLOCK E — Marketing artefacts (~1h)

### E.1 — TWEET_THREAD_WAVE33.md (5 tweets thread)

**O que:** Compor thread tweets para announce v1.21.0:
- Tweet 1: hook + 47% savings real + 658 calls
- Tweet 2: TurboQuant 3-bit (Google DeepMind ICLR 2026)
- Tweet 3: EAGLE-3 via vLLM (2.5× speedup)
- Tweet 4: Session timer + slash commands + GDPR
- Tweet 5: CTA install + repo

**Tier sugerido:** T1 (Haiku) — copywriting.

### E.2 — BLOG_POST_WAVE33.md (~800 words)

**O que:** Blog post format para Substack/Medium — explica TurboQuant + EAGLE-3 + friends-launch.

**Tier sugerido:** T2 (Sonnet) — long-form writing + technical depth.

### E.3 — Update Mooter.ai landing — Wave 33 differentiation section

**O que:** Adicionar à landing section "Why Mooter":
- "Local-first KV cache 3-bit compression (Google DeepMind TurboQuant)"
- "Speculative decoding via vLLM (Wave 33)"
- "MiniMax M3 ready when released (June 11, 2026)"

**Validação:** Vercel preview deploy + Chrome MCP smoke.

**Tier sugerido:** T1 (Haiku) — copy edit + Vercel deploy.

---

## Ordem de execução recomendada

```
Day 0 (~1h)           Honest recon 10 pontos
                      Output: WAVE33_DAY0_RECON.md

Day 1 (~4h)           Block A (Polish) inteiro
                      smoke local após cada A.X (no Anthropic quota burn)
                      Bundle clean check

Day 2 (~5h)           Block B (TurboQuant + EAGLE-3 + MiniMax M3 + arbitrage)
                      B.1 TurboQuant build + benchmark
                      B.2 EAGLE-3 install + benchmark
                      B.3 MiniMax M3 watcher
                      B.4 arbitrage monitor (opt-in)

Day 3 (~2h)           Block C (Quality fixes)
                      C.1 + C.2 + C.3

Day 4 (~1.5h)         Block D (Friends-launch readiness)
                      D.1 refresh DMs + D.2 onboarding audit + D.3 E2E smoke

Day 5 (~1h)           Block E (Marketing)
                      E.1 + E.2 + E.3

Pre-merge (~1h)       final-reviewer Opus gate
                      classify.js sha re-verify
                      Bundle esbuild clean (target <650 KB total)
                      PR feature → main (Wave 32 pattern)
                      Tag v1.21.0-ultimate-polish-turboquant
                      Notion sub-page sessão Wave 33
                      MEMORY.md update + SYNC.md update
                      Hub deploy (se Block C.3 incluiu CF Worker changes)
```

---

## Checklist pré-merge (doutrina Wave 32 lesson learned)

### Block A — Polish
- [ ] `mooter statusline mode <name>` cmd shipou + smoke OK (4 modes + legacy)
- [ ] Session timer chip aparece em modes compact/full/didactic, AUSENTE em legacy
- [ ] `turn` → `this prompt` e `alltime` → `session` em statusline + dashboard + docs
- [ ] 3 LOW nits final-reviewer Wave 32 endereçados
- [ ] LoRA deps resolvem dry-run (`pip install --dry-run` exit 0)
- [ ] `mooter effort set ultramoo` persiste em preferences.json
- [ ] `mooter sessions list` lista ≥1 sessão actual com tier breakdown

### Block B — Performance
- [ ] `@mooter/turboquant-backend` package criado + installer + benchmark passa (3-bit KV, measurable VRAM reduction)
- [ ] `@mooter/vllm-backend` extended com EAGLE-3 option + GPU memory check + fallback gracioso
- [ ] `@mooter/minimax-watcher` package + cron poll HF + CLI install cmd + chip statusline
- [ ] `@mooter/arbitrage-monitor` opt-in package + provider status page polls + classify.js INTACT preserved

### Block C — Quality
- [ ] Hardware widget responsive 3 breakpoints (mini/medium/full)
- [ ] Workflow widget LIVE em dashboard (Cenário A unhide OU Cenário B implement)
- [ ] Auto-update lists CF Worker cron + CLI pull cmd

### Block D — Friends-launch
- [ ] `FRIENDS_LAUNCH_DMS_v2.md` com 3 DMs (PT-PT/PT-BR/EN), Wave 33 numbers
- [ ] `WAVE33_ONBOARDING_AUDIT.md` com 3-5 fixes identificados
- [ ] `scripts/e2e_friends_launch.sh` PASS

### Block E — Marketing
- [ ] `TWEET_THREAD_WAVE33.md` 5 tweets
- [ ] `BLOG_POST_WAVE33.md` ~800 words
- [ ] Mooter.ai landing Wave 33 differentiation section (Vercel preview + Chrome smoke)

### Gates universais
- [ ] classify.js sha `7b01eb86…87762` verificada **pré** + **post-merge**
- [ ] Statusline budget ≤10ms preservado (re-medir após session timer + chips novos)
- [ ] Bundle esbuild clean (< 650 KB total)
- [ ] `final-reviewer` (Opus) corrido sem high severity
- [ ] Notion sub-page criada via `mooter_notion_write` MCP
- [ ] Wave 28-32 packages **INTOCADOS** verificado via `git diff --stat`
- [ ] PR feature → main mergeado
- [ ] **SÓ ENTÃO** `git tag v1.21.0-ultimate-polish-turboquant <main HEAD>` + push
- [ ] Hub deploy se Block C.3 mexeu hub (`cd hub && npx wrangler deploy -c wrangler.mooter.toml`)

---

## Riscos tracked

| Risco | Severidade | Mitigação |
|---|---|---|
| TurboQuant fork não build em ambient padrão | HIGH | Day 0 #7 smoke clone; backup: official Google release Q2 2026 (verificar disponibilidade) |
| EAGLE-3 draft model não existe para qwen2.5-coder | HIGH | Fallback: Medusa heads (mais maduro), ou desabilitar B.2 e shippar restante |
| MiniMax M3 weights atrasam além June 11 | LOW | Watcher continua poll, install opt-in quando chegar — não bloqueia ship |
| Arbitrage monitor pings classified as spam by providers | MED | Use status pages públicas (status.anthropic.com etc), não API endpoints |
| Session timer break ≤10ms budget | LOW | Cache birth_time per session; medir |
| Rename `turn`→`this prompt` quebra grep/parsing externo | MED | Day 0 grep semântico vs UX label; só renomear UX |
| Unsloth bump quebra Wave 26.G LoRA train script | MED | Dry-run only; Paulo executa real RTX 4090 separado |
| 3 LOW nits revelam bug maior | LOW | Day 0 leitura primeiro; escalar se > 30 min fix |
| Bundle esbuild > 650 KB | MED | Tree-shake new packages; opt-in features lazy-load |
| classify.js sha mutated accidentally | CATASTROPHIC | Pre-commit hook re-check + final-reviewer gate; rollback se detected |
| Anthropic quota durante Block B (heavy architecture) | MED | Day 0 + Block A em Haiku/Sonnet; Block B em Opus mas spread |

---

## O que NÃO está nesta wave (e porque)

- ❌ **Default statusline flip** para mode novo (Paulo deve decidir após viver com `compact`/`full` modes — Wave 33.1 candidate baseado em feedback)
- ❌ **Federated learning expansion** — Wave 34 candidate (precisa ≥10 devices primeiro)
- ❌ **LLMLingua hardening** — Wave 34 candidate (precisa user feedback Ultramoo Wave 32 antes)
- ❌ **MCP marketplace listing** — Wave 35 candidate (precisa formal Anthropic review)
- ❌ **Plugin Claude Code official publish** — Wave 35 candidate
- ❌ **Wave 28 workflow engine extensions** — INTOCADO doctrine
- ❌ **Wave 31 LORAUTER changes** — sha intact doctrine
- ❌ **Wave 32 packages refactor** — produto estável, INTOCADO
- ❌ **Hub schema mudanças que quebrem clients** — additive-only

---

## Marketing diff Wave 32 → Wave 33 Ultimate

### Tweets
- @mooter_ai (se exists) — 5-tweet thread (Block E.1)
- Personal Paulo Loureiro tweet com link install + benchmark

### Blog
- Substack/Medium post (Block E.2) "Mooter v1.21: TurboQuant ICLR 2026 + EAGLE-3 + MiniMax M3-ready"
- Cross-post Dev.to + Hacker News (submit "Show HN: Mooter — local-first LLM router with 3-bit KV cache")

### Landing
- `mooter.ai` Wave 33 differentiation section (Block E.3)
- `mooter.ai/changelog` — add v1.21.0-ultimate entry
- `mooter.ai/dashboard` — public showcase mode (já existe, validar)

### Friends-launch
- 3 DMs envias Paulo (Task #218) com refreshed pitch (Block D.1)
- Slack/Discord communities relevantes (vibe coding, local AI, llama.cpp)

### Notion
- Sub-page Wave 33 Ultimate em Mooter HQ (auto via MCP)
- Update Mooter HQ metrics secção

---

## Definitions of Done

**Wave 33 Ultimate is DONE when:**
1. ✅ Tag `v1.21.0-ultimate-polish-turboquant` em main
2. ✅ All 5 blocks shipped + checklist pré-merge 100%
3. ✅ classify.js sha INTACT verified
4. ✅ Hub deploy (se Block C.3 mexeu)
5. ✅ Notion sub-page LIVE
6. ✅ FRIENDS_LAUNCH_DMS_v2.md ready para Paulo enviar
7. ✅ TWEET_THREAD + BLOG_POST artefactos prontos
8. ✅ Mooter.ai landing actualizada
9. ✅ MEMORY.md + SYNC.md actualizados
10. ✅ E2E smoke test PASS

---

## Pós-Wave 33 next steps

- **Friends-launch real:** Paulo envia 3 DMs com `FRIENDS_LAUNCH_DMS_v2.md` content
- **Wave 34 candidate:** LLMLingua hardening + Federated wisdom + Auto-update polish
- **Wave 35 candidate:** MCP marketplace + Plugin Claude Code official publish
- **Continuous monitoring:** Mooter.ai/dashboard metrics + Pastor learning curves

---

*Brief composto 2026-06-08 pós-validation Wave 32 v1.20.0 + web research TurboQuant/EAGLE-3/MiniMax M3 actualizada. Day 0 recon começa próxima sessão CC — não confiar nas premissas acima sem validar com filesystem + web. classify.js sha intact pré-verificar.*

**Sources de research consultadas:**
- TurboQuant ICLR 2026 (Google DeepMind paper arxiv 2504.19874)
- AmesianX/TurboQuant llama.cpp fork (5.2× memory reduction real)
- EAGLE-3 vLLM/SGLang production (2-2.5× speedup, Red Hat Developer 2025-07)
- MiniMax M3 expected weights June 10-11, 2026 (vLLM day-one support confirmed)
- QVAC SDK 0.12.0 TurboQuant production reference (Tether)
