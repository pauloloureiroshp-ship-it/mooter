# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` no Mac, `C:\Users\Paulo Loureiro\frugal\SYNC.md` no Windows.
> Canal bidirecional Cowork ↔ Claude Code segundo o skill `/sync-project`.

**Última sync:** 2026-04-18 (Claude Code Windows — Review #11 + Counters data layer)
**Versão:** v0.9.9+ Sprint B + Landing redesign + Full Rebrand + Auth area v2.1 + Counters data layer
**Último commit main:** `418776a` (feat(counters): surface tokens_used + savings + write-counters flag)
**Sessão Claude Code:** #27 (repo Windows) — review #11 delta analysis + T0 drop diagnosed as artifact + counters pipeline (tokens + savings) live; 1 commit

---

## 🎯 Estado Actual do Projecto

**GATE PASS mantido (2026-04-16):** 88.3% overall · 100% canonical · 96% adversarial · 89/89 tests.

**Telemetry LIVE no hub** (primeira vez desde setup multi-device):
- `mooter-hub.frugal-hub.workers.dev/api/stats` agora mostra:
  - `prompt_count: 1` (era 0)
  - `user_count: 1`
  - `hw_distribution: [{hw_tier: "apple-silicon", count: 1, avg_trust: 0.288}]` (era [])
  - `sub_distribution: [{sub_profile: "max", count: 1}]` (era [])
- delta_id primeiro Mac push: `1c16ed12-6e1d-4f18-a4ae-b65b92dfbded`

---

## 🖥️ Multi-device — Mac ↔ Windows PC

### Mac (Session #4 — Mirror Win→Mac completo 2026-04-16 20:30 UTC)
- ✅ Repo `~/frugal` @ `75d4f59`, doctor "All systems operational" (9/9 verde)
- ✅ **SSH GitHub**: chave ed25519 gerada + Keychain + remote migrado HTTPS→SSH (`git@github.com:pauloloureiroshp-ship-it/frugal.git`)
- ✅ **MCPs locais**: filesystem + context7 via `claude mcp add` (`.mcp.json` commitado); 14 HTTPS MCPs claude.ai conectados (Supabase, Linear, Notion, Figma, Sentry, Cloudflare, Canva, Gcal, Gmail, Context7, Vercel, Drive)
- ✅ **Feature flags (Sprint B)**: shadow_mode, per_user_adaptation, implicit_signals, ground_truth_oracle ON via `.mooter-mode.json`
- ✅ **Ollama +1 model**: `nomic-embed-text` (KNN similarity); qwen3:30b **skipped permanentemente** (RAM 8GB < 16GB)
- ✅ **VS Code**: `code` CLI via symlink em `~/.local/bin/code` (sem sudo); 9/9 mooter extensions instaladas
- ✅ **Workspace apartado**: `~/mooter.code-workspace` (3 folders, 9 tasks, 3 launches)
- ✅ **Validation**: canonical 100% · adversarial 96% · historical 72% · overall **87.7%** (GATE PASS)
- ✅ **Smoke tests**: tiers [T0, T2, T3, T3, T2] coincidem com expectativa; HIGH_RISK detectado
- ✅ **Hub push**: delta enviado (trust 0.288), `3578ada0-3177-4052-852e-ea0ecff23fde`
- ✅ **Relatório**: `~/frugal/reports/mirror-2026-04-16T20-25-48.md` (inclui secção "Delta install.sh público vs mirror pessoal")

### Mac (Session #3 completo — Cowork pré-mirror)
- ✅ Repo `~/frugal` @ `b901c3d`, doctor "All systems operational"
- ✅ `device.id: 41c9d48c-f40a-4a80-a764-c76a784fc9e0` (distinto Windows)
- ✅ `identity.json` com email + OS + hub URL correcto
- ✅ Ollama brew service **persistente** (atravessa reboots), 4 models (qwen2.5:3b, qwen2.5-coder:14b, gemma4:e4b, nomic-embed-text)
- ✅ Env perf flags em `~/.zshrc` (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`)
- ✅ Subscription: `claude_max` OAuth budget_tracking
- ✅ Hooks todos ON + LaunchAgent backtest 02:00 daily
- ✅ savings-tracker :7821, shadow_mode ON, similarity KNN cache populado
- ✅ Dashboard deps instalados (`/frugal-dashboard` → localhost:7820)
- ✅ Hub push funcional (P3 normalize applied)

### Windows (no próximo pull)
- `git pull origin main` traz os commits Cowork + Mirror: `999f376`, `3ee442c`, `b901c3d`, `d32a866`, `75d4f59`
- Novo ficheiro: `.mcp.json` (MCPs locais filesystem + context7)
- Novo ficheiro: `reports/mirror-2026-04-16T20-25-48.md`

---

## 🎯 BIG PICTURE — MVP Onboarding end-to-end (validado 2026-04-16)

> Esta é a visão estratégica que o mirror valida. Detalhe completo em memory: `project_onboarding_vision.md` + `project_mvp_strategy.md`.

### Rollout do mooter.ai — ordem cronológica
1. ✅ **Paulo solo** (Windows PC, primary) — runtime + classifier funcionando em uso diário
2. ✅ **Paulo multi-device** (Win + MacBook M3, MVP test) — **Mirror Win→Mac validou pipeline em 2026-04-16**
3. 🔜 **Friends beta** (~5-10 amigos) — valida escala, edge cases, variedade de hardware/subs
4. 🔜 **Landing pública** (https://landing-five-azure-16.vercel.app) — signup self-serve em poucos clicks

### Pipeline end-to-end alvo
```
Landing → signup OAuth → captura perfil (hw+sw+subs+budget) →
  gera install.sh customizado → runtime instalado →
  decisões anonimizadas → hub → backtest diário → classifier melhora → beneficia todos
```

### Gaps identificados para friends beta
- **`setup-profile.js` captura 1/4 dimensões** (só subscriptions). Hardware derivado pelo doctor mas não persistido; software stack não mapeado; budget é "auto" sem ceiling. → refator pré-friends-beta (memory: `project_setup_profile_gap.md`)
- **OAuth da landing partido** (P1 pendente) — bloqueia signup → bloqueia tudo
- **Endpoint `/api/device-heartbeat` em falta no hub** (P2 pendente)
- **`install.sh` público** ainda não existe — o `MOOTER_MIRROR_WIN_TO_MAC.md` serve de template; delta documentado em `reports/mirror-2026-04-16T20-25-48.md` secção "passos genéricos vs específicos do Paulo"

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-16 19:30 UTC
**Estado:** 🟢 Lido e parcialmente aplicado em sessão #25 (2026-04-17) — ver estado abaixo

---

### ✅ Sessão #25 — 2026-04-17 (post-crash recovery + router deep fixes)

**Contexto da sessão:** PC crashou; tester offline há 3h. Paulo pediu restauro + ataque a todos os problemas acumulados.

**Commits desta sessão:**
- `0184bee` fix(router+hub): tester reliability pass + installed_fleet telemetry

**Entregas:**

| # | Task | Status | Nota |
|---|---|---|---|
| 1 | Token telemetry pipeline partido | ✅ | `update-metrics.js` criado em `~/.claude/tools/router/`; 5.04M tokens agora visíveis; saved real $33.96 (69.8%) — bem menos que os $1360 inflacionados do dashboard antigo |
| 2 | Misrouting backlog (100 pending) | ✅ | 20/28 falsos positivos eliminados (null expected_tier skip + meta-prompt filter reforçado) |
| 3 | Tester 5/6 Ollama models a 98-100% errors | ✅ (código) | `callOllama` patch: +keepalive 15m, timeout 120→180s, ANSI strip, stderr capture. Warmup pass adicionado. Activa a próximo restart |
| 4 | T1 accuracy 41% | ✅ | Root cause: `generateOllamaPrompts` confiava em labels Ollama não-fiáveis. Fix: self-consistency check com classify.js |
| 5 | P1 OAuth landing | ⏳ aguarda Paulo | Código verificado OK; falta adicionar env vars em Vercel + redeploy (ver secção abaixo) |
| 6 | P2 device-heartbeat | ✅ (código) | Endpoint + migration 007 já existiam. Adicionado `installed_fleet` a `/api/stats` (queries `device_heartbeats` directo). Aguarda deploy |
| 7 | Dashboard v2 | ✅ | `/mooter-summary` reescrito: separa uso real de synthetic tester, mostra 6 novas secções (tester lab, tier accuracy, model performance, A/B wins, optimizer, backlog) + Health Alerts automáticos |

**Ficheiros tocados:**
```
~/.claude/tools/router/update-metrics.js              (novo)
~/.claude/tools/router/mooter-summary-full.js         (novo)
~/.claude/skills/mooter-summary/SKILL.md              (reescrito)
~/frugal/tools/router/mooter-continuous-tester.js     (5 patches, commit 0184bee)
~/frugal/hub/routes/stats.js                          (+installed_fleet, commit 0184bee)
```

**Problemas revelados pelo dashboard v2 (estavam escondidos):**
1. Token telemetry pipeline simplesmente não existia (`update-metrics.js` em falta)
2. 89.6% dos "prompts all-time" eram synthetic tester, inflacionando savings reais 10×
3. Misrouting counter contava `expected=null` como T0 → falsos positivos
4. `generateOllamaPrompts` gerava labels não-fiáveis → T1 accuracy artificialmente baixa

### ✅ Sessão #25-continued — 2026-04-17 (Claude Code Windows, CLI via Vercel + Wrangler)

**Recap:** CLI Vercel + Wrangler foram instaladas nesta sessão (login OAuth já existia). Todos os pendentes manuais foram executados daqui.

| Passo | Status | Evidência |
|---|---|---|
| P1 Vercel env vars | ✅ feito | `vercel env ls production` mostra NEXT_PUBLIC_SUPABASE_URL + ANON_KEY correctas (valores iguais ao `.env.local`) |
| P1 Vercel redeploy | ✅ feito | Deploy `landing-chng0plr1` Ready, aliased a mooter.ai, 16:05 UTC-3 |
| P1 OAuth validação browser | ✅ confirmado | Paulo chegou a `/onboarding` via GitHub OAuth |
| P2a CF D1 migration 007 | ✅ feito | `wrangler d1 execute mooter-hub --file migrations/007_device_heartbeats.sql --remote` aplicou tabela `device_heartbeats` |
| P2b CF Worker deploy | ✅ feito | `wrangler deploy -c wrangler.mooter.toml` → https://mooter-hub.frugal-hub.workers.dev · Version 1083105c-ac10-4f00-af56-88eea2e5ae37 |
| P2c Validação end-to-end | ✅ feito | POST `/api/device-heartbeat` → `{ok:true}` · GET `/api/stats` → `installed_fleet.total_devices: 1` |
| Onboarding fix | ✅ feito | Botão Next estava silenciosamente disabled; adicionado `• required` marker no hardware + dynamic button label + estimated impact card. Commit `8592d73`, deploy `landing-chng0plr1` |
| Tester restart | ⏳ pendente Paulo | Janela cmd aberta: Ctrl+C → seta-cima → Enter para activar patches (callOllama, warmup, misrouting skip, self-consistency) |

**Notion session pages:**
- Sessão #25: https://www.notion.so/3456f6e42bc4810099aae0b5d1ede30e
- Sessão #25-continued (ship session): atualizar no próximo wrap
- Sessão #26 v2.1 (auth polish + Ollama factual fix): https://www.notion.so/3456f6e42bc48199b3dadda0023576e3

### ✅ Sessão #26 — 2026-04-17 (auth area polish — login hero + onboarding intelligence)

**Recap:** Paulo feedback pós-#25 — "a página após sign in ficou muito simples e pouco profissional; falta análise do setup e integração com providers; look&feel tem de bater com landing". Resposta: 3 commits atómicos, deploy imediato.

| Fase | Ficheiro | Commit | Mudança |
|---|---|---|---|
| A — Login hero | `app/(app)/layout.tsx` | `1a4c4e4` | Substituiu bloco `!user` (60 palavras) por `<LoginHero/>`: headline com accent `Haiku can do`, strip de live stats (prompts routed · avg savings · community USD) puxado do hub `/api/stats`, CTA GitHub proeminente em `--accent`, trust microcopy ("keys stay local"). Sem links repo públicos (doutrina). +210/-44 |
| B — HW auto-detect | `app/onboarding/page.tsx` | `26a86e5` | Probe browser: `navigator.userAgent` + `hardwareConcurrency` + `deviceMemory` + WebGL `UNMASKED_RENDERER_WEBGL`. Card "We detected your machine" com OS / CPU / GPU / RAM + botões "This looks right" / "Pick manually". Pré-selecciona chip hw automaticamente. Fallback silencioso se WebGL bloqueado. +190/-1 |
| C — Providers + Ollama | `app/onboarding/page.tsx` | `ec6e36e` | Relabel "subscriptions" → "providers" + microcopy privacy ("keys stay local after install"). Card recomendação Ollama condicional ao hw: `qwen2.5-coder:14b` para NVIDIA high-end (RTX 30/40/50/A/H100), `qwen2.5-coder:7b` para M-series + NVIDIA médio, `qwen2.5:3b` para AMD. Cloud/other não mostra card. +118/-1 |

**Deploy:** `vercel --prod` → `dpl_3ZhAJmcGHa3RRLyC5i5iTZDaRccJ` Ready, aliased a `mooter.ai` em 2 min.

**Risco mitigado:**
- WebGL pode retornar genérico em Firefox/Safari strict → fallback para chip manual
- `deviceMemory` só Chrome → render condicional
- Nenhuma mudança em `/api/me`, `/api/profile`, `generate-frugal-config.ts`, Supabase schema

**Pendente teste browser:** Paulo abrir `mooter.ai` em incognito, sign in → verificar novo hero + confirmar que auto-detect acerta hardware real (Windows PC → deve detectar GPU NVIDIA e suggerir `windows_nvidia`).

### ✅ Sessão #26 v2.1 — 2026-04-17 (polish pós review)

**Feedback Paulo:** "ainda não está no padrão da landing, não tem o logo que montamos, cores não estão corretas, informações de modelo local não convencem".

**Diagnóstico:** login v2 ainda usava 🐮 emoji em vez do `MooterLogo` SVG da landing; título não batia com canonical "Route smarter. Ship faster."; provider icons estavam ausentes; recomendação Ollama inventava `qwen2.5-coder:7b` com sizes fabricados — **não alinha com os modelos que o router real (`classify.js`) usa**.

| Commit | Mudança |
|---|---|
| `9e5cd22` | `layout.tsx` — inline `MooterLogo` 104px (SVG idêntico ao `page.tsx:300` e `public/mooter-logo.svg`: cream head+ears `#F5EDD4`, orange muzzle `#FF6B35`, dark eyes `#1C1209`, eye gleams). Wrapper com float animation + 40px orange drop-shadow mirror de `.hero-logo-mark`. Título canónico landing "Route smarter. Ship faster." com accent phrase. CTA laranja sólido com `boxShadow: 0 10px 30px rgba(255,107,53,0.28)` + color `#000` matching `.hero-cta`. Provider icons row "routes to: Ollama/Anthropic/OpenAI/Gemini/Qwen/DeepSeek" duplicados inline (boundary client-component preservada, zero blast na landing). +125/-63 |
| `6958c5c` | `onboarding/page.tsx` — reescreve `recommendOllamaModel` para devolver `{ baseline, optional[], note }` alinhado com classify.js real: `qwen2.5:3b` baseline (~1.9 GB), `qwen2.5-coder:14b` (~9 GB) code, `deepseek-r1-distill-qwen:14b` (~9 GB) math, `qwen3:30b` (~18 GB) heavy reasoning. Card UI passa a mostrar baseline row ("installer pulls") + optional rows ("ollama pull"). Mac M-series e NVIDIA high-end recebem stack completa; AMD só baseline+coder (ROCm caveat); cloud/other não mostra card. +149/-51 |

**Deploy:** `dpl_Huz2UMPZYhqjZspZPsmejnaASDrA` Ready, aliased a `mooter.ai`.

**Validação factual router models (ground truth):**
```
classify.js:107-112:
  ollama_terse:   qwen2.5:3b                    (legacy alias + default)
  ollama_reason:  qwen3:30b
  ollama_code:    qwen2.5-coder:14b
  ollama_math:    deepseek-r1-distill-qwen:14b
```
Nota: `generate-frugal-config.ts:49` ainda usa `isMac ? 'qwen2.5:3b' : 'qwen2.5:7b'` — `qwen2.5:7b` não existe no router. **Loophole pequeno para próxima iteração** (não afecta onboarding UI directamente, só o `frugal_config` JSON guardado em DB).

### 🔴 ÚNICO PENDENTE MANUAL (Paulo)

**Restart do tester** para activar patches já commitados:
- Vai à janela cmd preta onde o `mooter-continuous-tester` está a correr
- `Ctrl+C` (pára limpo) → seta-para-cima → Enter (repete o comando)
- Activa: callOllama keepalive/timeout fix, warmup pass, misrouting null-skip, ollama-gen self-consistency

### Após restart, deixa correr 10-15 min e depois:
```
/mooter-summary
```
Esperado: Health Alerts de 10 → 0-2. Se algum modelo Ollama ainda falhar, stderr real é agora capturado e diagnosticável.

### ✅ Sessão #27 — 2026-04-18 (review #11 + counters data layer)

**Recap:** `/mooter-review` review #11 (6277 eventos novos desde 2026-04-17 20:25). 0 misroutings. T0 delta caiu para 61% vs 69.8% all-time — diagnosticado via `model-reasoner` como **artefacto histórico**, não regressão (264 events do mesmo cluster pré-fix `bc4f84f` a re-aparecer no replay; classificador *actual* devolve T0 correctamente). Paulo decidiu: investigar + garantir counters live (prompts, tokens, savings) para alimentar landing v11 que Claude Design vai construir a seguir.

**Commits desta sessão:**

| Commit | Ficheiro | Mudança |
|---|---|---|
| `418776a` | `tools/router/mooter-review.js` + `tools/router/mooter-continuous-tester.js` | Counters data layer completo: `tokens_used` (sum `runs × avg_tokens` em `model_performance`), `savings_usd_cumulative` (de `savings-tracker.computeMetrics`), `cost_usd` real (via `pricing.PRICES × tokens`, deixa de ser hardcoded 0). Nova flag `--write-counters <path>` que escreve JSON sem avançar watermark. `total_tokens_cumulative` exposto em `mooter-tester-stats.json`. **Zero blast em UI** — só data layer. |

**Output live (counters block):**
```json
{
  "prompts_tested": 12556,
  "tokens_used": 281602,
  "savings_usd_cumulative": 37.3377,
  "cost_usd": 0,
  "ab_tests_run": 158,
  "optimizer_tests": 95,
  "misroutings_found": 47,
  "embeddings_built": 260,
  "reviews_completed": 11
}
```

**Pendente Claude Design (próxima sessão):**
- Wirear consumer da landing para `counters.json`. Para alimentar o ficheiro basta agendar (cron 5min ou dentro do tester loop):
  ```bash
  node tools/router/mooter-review.js --write-counters mooter-landing/counters.json
  ```
- Decidir: static file (cron writes) ou Vercel API route (chama `mooter-review.js --counters` on-demand)?

**Pendentes secundários:**
- T1 cumulativa em 45.4% (baixa) — próxima review analisar se misroutings T1 são tuning-friendly.
- Focus rebalance: `statusline` está em 18.5% do tester volume. Considerar `/mooter-focus` para distribuir.
- `generate-frugal-config.ts:49` ainda usa `qwen2.5:7b` (não existe no router) — herdado de #26 v2.1, não bloqueante.

---

### Instruções originais (referência histórica)

---

**Contexto:** 3 sessões Cowork Mac consecutivas (2026-04-16 14:21→19:30 UTC) instalaram o Mooter no MacBook Pro, resolveram 3 bugs P0/P3/P4, e confirmaram o Mac como novo device no hub global. Duas prioridades críticas ficam para Claude Code atacar.

### 🔴 PRIORIDADE #1 — P1 OAuth fix no Friends Beta landing

**Root cause CONFIRMADO via Chrome DevTools + source code analysis:**

O botão "Sign in" em `landing-five-azure-16.vercel.app` chama `loginWithGitHub()` (linha 12 de `landing/app/page.tsx`). A função bailha silenciosamente se `process.env.NEXT_PUBLIC_SUPABASE_URL` estiver vazio:

```typescript
function loginWithGitHub() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;  // ← BAILS HERE (silent, no error)
  ...
}
```

Click físico em production produz **zero network requests** (confirmado via `read_network_requests` tool). Next.js substitui `NEXT_PUBLIC_*` em build time — se missing no momento do build, o string fica `undefined` no bundle → `return`.

Session Notion MP-7 (2026-04-12) documentou OAuth a funcionar. Regressão desde então. Provável: deploy posterior sem as env vars, ou as env vars foram removidas do Vercel.

**Fix steps:**
1. `vercel env ls --environment production` (CLI) OU Vercel dashboard → Settings → Environment Variables
2. Verificar/adicionar:
   - `NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...`
3. `vercel --prod` (trigger rebuild) OR Vercel dashboard → Redeploy
4. Validar: clicar Sign in → deve redirecionar para GitHub OAuth authorize

**Acceptance criteria:**
- Click em Sign in dispara redirect para `github.com/login/oauth/authorize?client_id=Ov23liKacZ4JUyjV0GLo&...`
- Após authorize, volta para `/auth/callback` com código
- `/dashboard` renderiza autenticado (não mais redirect para `/#access`)
- `frugal-doctor --sync` no Mac upserta em Supabase (`auth.token` criado em `~/.frugal/`)

### 🟠 PRIORIDADE #2 — P2: Adicionar endpoint `/api/device-heartbeat` no hub

**Status actual:** `curl -X POST .../api/device-heartbeat -d '{...}'` → `{"error":"not found"}`.

`install-mooter.command` do Cowork já tenta chamar este endpoint após install (linha que faz `curl -X POST ... /api/device-heartbeat`). Actualmente falha silenciosamente.

**Schema proposto** (consistente com `/api/delta` que funciona):
```typescript
POST /api/device-heartbeat
Body: {
  device_id: string (uuid),
  email?: string,
  os: 'macos' | 'windows' | 'linux',
  arch: string,
  hw_tier?: string,
  origin?: string,
  ts: string (ISO)
}
Response: { accepted: true, device_count_total: number }
Side effects: upsert em D1 `devices` table
```

**Benefício:** heartbeat permite popular `hw_distribution` em `/api/stats` **imediatamente após install** (hoje só aparece após primeiro backtest/hub-push, i.e. 24h + cooldown OU manual `--force`).

### ✅ Bugs RESOLVIDOS nesta sessão Cowork (não tocar; referência)

| Bug | Resolução | Commit |
|-----|-----------|--------|
| P0 classifier misroute | `ARCH_SIGNALS` guard threshold ≥2 matches → T3 | `3ee442c` |
| P3 hub-push schema | `strip "claude_" prefix + validate enum` | `b901c3d` |
| P4 hw-capability outdated | `recommended_t0 → qwen2.5-coder:14b` (installed) | local runtime |
| Hub URL stale | `frugal-hub` → `mooter-hub` em 24 ficheiros | `999f376` |

### 📋 Pendentes herdados (lower priority)

- [ ] Pull `qwen2.5-coder:7b` se quiser cobrir o range T0-code pequeno (optional)
- [ ] Correr validation-set completo no Mac para medir delta accuracy vs Windows
- [ ] Statusline redesign Sprint C (6 segmentos v0.9 spec)
- [ ] Multi-Model V2 (GPT/Gemini/Grok providers no classify.js)
- [ ] L10 self-healing `/mooter-review`
- [ ] Cleanup dos 15 subagents `gsd-*` velhos (de outra ferramenta, ocupam espaço)

### 🔧 Discoveries úteis para referência

1. **Hub enum para sub_profile:** só aceita `"max"` na versão testada (2026-04-16). Outros valores (`"pro"`, `"free"`, `"api"`, `"team"`, `"claude_max"`, `"claude_pro"`) retornam `{"error":"invalid sub_profile"}`. Talvez seja transitório durante beta; verificar quando Friends Beta abrir a mais users.

2. **`gemma4:e4b` IS um nome Ollama válido** (vs o que eu duvidei inicialmente). Pull funciona, modelo responde.

3. **`deepseek-r1-distill-qwen:14b` NÃO existe** no registry (manifest 404). O `hw-capability.json` tinha este como `recommended_t0` — actualizei para `qwen2.5-coder:14b` (installed). Alternativa pull-able: `deepseek-r1:14b` (se quiser).

4. **`hub-push.js` tem `PUSH_COOLDOWN_MS = 24h`** — usar `--force` para testar.

---

## 🏁 Sprints

| Sprint | Nome | Estado |
|--------|------|--------|
| v0.9.9 | INFRA.md + deploy | ✅ Shipped (2026-04-13) |
| Rebrand | frugal → Mooter | ✅ Shipped (2026-04-14) |
| Sprint B | METHODOLOGY + Shadow + Closed Loop | ✅ Shipped (2026-04-16) |
| Review #1 | Context-aware overrides + 48 TUNED | ✅ Shipped (2026-04-16, #22) |
| MacBook bootstrap | 3 Cowork sessions — install + 3 bugs fixed | ✅ Shipped (2026-04-16) |
| Sprint C | Statusline redesign + Multi-Model V2 | ⏳ Pendente |
| Full Rebrand | frugal → mooter em toda a app shell (dashboard, onboarding, setup, admin, settings, OG, APIs) | ✅ Shipped (2026-04-17, #24) |
| OAuth verification | Env vars OK, OAuth 302 OK, waitlist RLS fix, mooter.ai domain verified | ✅ Shipped (2026-04-17, #24) |
| v1.0 | Public OSS launch | 🔵 Roadmap |

## 📊 Stats actuais
| Métrica | Valor |
|---------|-------|
| Overall accuracy | 88.3% (GATE PASS) |
| Tests passing | 89/89 |
| Gold labels | 84+ |
| Patterns | 114+ (48 TUNED_PROMOTE_T0 + 7 ARCH_SIGNALS novos) |
| Mac savings-tracker | saved 69.2% ($0.24 over 4 prompts) |
| Hub global | 1 user, 1 prompt (Mac), 1 hw (apple-silicon), 1 sub (max) |

## 🧱 Stack técnica
| Camada | Tecnologia |
|--------|------------|
| Classifier | `classify.js` v0.10+ (regex, ~47KB, 11-pass + ARCH_SIGNALS guard) |
| Arbiter | Haiku 4.5 via Anthropic SDK |
| Hooks | UserPromptSubmit + PostToolUse + Stop |
| T0 Local | Ollama brew service (qwen2.5:3b/14b, gemma4:e4b, nomic-embed-text) |
| T1-T3 | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6 |
| Telemetry | savings-tracker :7821 + hub Cloudflare + D1 |
| Landing | `mooter.ai` (public waitlist) + `landing-five-azure-16.vercel.app` (Friends Beta) |

## 🔗 Links

| Recurso | URL |
|---------|-----|
| Notion HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| Notion Sessão #4 — Mirror Win→Mac | https://www.notion.so/3446f6e42bc4818d8b40f023b3ed758f |
| MacBook Install Playbook | https://www.notion.so/3446f6e42bc48156a7a7fab59fa87ac5 |
| Sessão 2026-04-16 — Review #1 + Multi-device | https://www.notion.so/3446f6e42bc4819eb313fa21cf15765d |
| Sessão 2026-04-17 — Review #2 + Classifier Detox | https://www.notion.so/3456f6e42bc4812e81e3dac67cb73b3f |
| Sessão 2026-04-17 — Landing Redesign + Reviews | https://www.notion.so/3456f6e42bc481d3b8fccacf8ed8a56b |
| Sessão 2026-04-17 — Post-crash Recovery + Router Deep Fixes (#25) | https://www.notion.so/3456f6e42bc4810099aae0b5d1ede30e |
| Sessão 2026-04-17 — Cowork Ship (#25-continued) | https://www.notion.so/3456f6e42bc481f991f0c9538438417e |
| Sessão 2026-04-18 — Review #11 + Counters data layer (#27) | https://www.notion.so/3466f6e42bc481c99569cb216e748c5f |
| GitHub repo (privado) | https://github.com/pauloloureiroshp-ship-it/frugal |
| Landing público | https://mooter.ai |
| Friends Beta (private) | https://landing-five-azure-16.vercel.app |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

---

*Cowork Mac working surface: `~/Documents/Claude/Projects/Mooter.ai (macOS)/` com logs, dumps, mapa operacional HTML, e este SYNC.md.*
