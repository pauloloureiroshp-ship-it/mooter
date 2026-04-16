# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` no Mac, `C:\Users\Paulo Loureiro\frugal\SYNC.md` no Windows.
> Canal bidirecional Cowork ↔ Claude Code segundo o skill `/sync-project`.

**Última sync:** 2026-04-16 19:30 UTC (Cowork Mac — Session #3)
**Versão:** v0.9.9+ Sprint B + hotfixes Cowork (P0, P3, P4)
**Último commit main:** `b901c3d` (P3 hub-push sub_profile normalize)
**Sessão Claude Code:** #22 (repo Windows) + Cowork Mac sessions #1, #2, #3 (este log)

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

### Mac (Session #3 completo)
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
- `git pull origin main` traz os commits Cowork: `999f376`, `3ee442c`, `b901c3d`

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-16 19:30 UTC
**Estado:** 🟡 Por ler

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
| OAuth resurrection | Fix Supabase env em Vercel + device-heartbeat endpoint | 🟡 Em curso (Claude Code) |
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
| MacBook Install Playbook | https://www.notion.so/3446f6e42bc48156a7a7fab59fa87ac5 |
| GitHub repo (privado) | https://github.com/pauloloureiroshp-ship-it/frugal |
| Landing público | https://mooter.ai |
| Friends Beta (private) | https://landing-five-azure-16.vercel.app |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

---

*Cowork Mac working surface: `~/Documents/Claude/Projects/Mooter.ai (macOS)/` com logs, dumps, mapa operacional HTML, e este SYNC.md.*
