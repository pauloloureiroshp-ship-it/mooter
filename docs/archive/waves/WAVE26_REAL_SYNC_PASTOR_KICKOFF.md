# WAVE 26 — Real Sync + Pastor Live (kickoff)

**Sequência:** Wave 25 v1.14.1 SHIPPED (`5408f9b`) → **Wave 26**
**Tag esperada:** `v1.15.0-pastor-live`
**Estimate:** ~12h CC + LoRA overnight
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo

---

## Por que esta wave (a verdade nua)

Wave 25 v1.14.1 fez o patch honesto na landing (claims + SEO). Ficou claro no Day 0 recon que **o stub do mooter-sync nunca foi conectado ao backend real**. O `runSyncReal` existe em código mas não tem o pipe vivo: nem ingestão CF Workers, nem dashboard a ler dados reais, nem Pastor a aprender online.

Esta wave fecha o loop. **Sem isto, friends-launch é vendedor de slides** — gente instala, usa, gera dados, mas nada chega ao hub, nada aparece no dashboard, Pastor não aprende. Doctrine diz: ship o que funciona, ou diz que ainda não funciona.

---

## Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ 5408f9b` |
| Branch feature | `wave26-real-sync-pastor` |
| Tag pré-merge | ❌ NÃO criar (lição Wave 21-25) |
| Tag pós-merge | `v1.15.0-pastor-live` apontando para main HEAD final |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) — `frugal-hub` permanece frozen |
| Secret canónico | `MOOTER_ADMIN_TOKEN` (já em dual-write desde Wave 13.x) |
| Doutrina | Honest > forced. Day 0 recon obrigatório antes de Day 1. |

---

## Sub-features (8 blocos, ordenados por dependência)

### 26.A — `runSyncReal` connect to CF Workers `/v1/events` 🔥
**O que:** Substituir stub no `runSyncReal` por POST real para `https://mooter-hub.frugal-hub.workers.dev/v1/events`.
**Inputs:** decisões locais (routing classifications), savings calculados, identidade do device (já em `device_id` do SQLite local).
**Validação:** `curl -X POST` manual → verificar D1 row aparece. Smoke test no CI.
**Tier sugerido:** T2 (Sonnet) — lógica clara mas needs HTTP retry + offline queue.

### 26.B — Hub events ingestion + auth model
**O que:** Endpoint CF Worker `/v1/events` (POST) validates HMAC (chave derivada de `device_id` + `MOOTER_ADMIN_TOKEN`), grava em D1 `events` table.
**Schema:**
```sql
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  tier TEXT NOT NULL,          -- T0|T1|T2|T3
  model TEXT,                  -- qwen2.5-coder:7b | haiku-4.5 | sonnet-4.6 | opus-4.7
  classification TEXT,         -- JSON do classify.js output
  savings_usd REAL,
  exec_drift INTEGER           -- 1 se intent ≠ execution (honest flag)
);
```
**Tier:** T2 (Sonnet) com gate T3-architect para HMAC scheme.

### 26.C — Deploy prod (wrangler.mooter.toml)
**O que:** `wrangler deploy --config wrangler.mooter.toml` com novo route `/v1/events`, secret `MOOTER_ADMIN_TOKEN` já existente.
**Smoke:** `curl https://mooter-hub.frugal-hub.workers.dev/v1/events` → 405 (GET not allowed, POST only).
**Tier:** T3-gate `final-reviewer` antes de deploy.

### 26.D — Pastor learning loop live
**O que:** CF Worker cron (`*/15 * * * *`) lê `events` últimos 15min → calcula drift signal por device → escreve `pastor_state` table → device pull em next sync.
**Output Pastor:** routing hint ajustado (e.g. "device X tem Ollama lento → bias T0 para T1 em prompts >500 tokens").
**Tier:** T3 (Opus) — design Pastor merece arquitectura.

### 26.E — Dashboard real data (no demo fallback)
**O que:** Em `landing/app/(app)/dashboard/page.tsx`, remover demo data fallback. Se device ainda não syncou, mostrar empty state honesto: "Aguardando primeiro sync. Run `mooter sync` no terminal."
**Wire-contract:** manter `frugal_*` field names (decisão Wave 25 — breaking sem ganho).
**Tier:** T1 (Haiku) — UI lift.

### 26.F — E2E test (Paulo machine → CF → Dashboard)
**O que:** Script `scripts/e2e_sync.sh` que: simula 5 routing decisions locais → corre `mooter sync` → faz GET ao dashboard endpoint → asserta que os 5 events apareceram.
**Tier:** T2 (Sonnet) — scripting de teste.

### 26.G — LoRA train 212 samples (carry Wave 23)
**O que:** 212 score≥8 instruction→summary pairs já exportados em Wave 23. Treinar adapter Q4_K_M sobre qwen2.5-coder:7b. Overnight job, RTX 4090.
**Output:** `mooter-pastor-v1.gguf` (adapter merged) para distribuição.
**Tier:** Manual + Ollama (não CC) — Paulo executa overnight, CC só prepara script.

### 26.H — 22.A herd v167 nuclear (carry Wave 22)
**O que:** Re-validar SubagentStop hook em CC v2.1.167 com 50-subagent herd test (synthetic + live). Wave 23 Phase 0 disse "backward-compatible"; herd nuclear confirma a 100%.
**Tier:** T3 (Opus) para análise + spawn massivo paralelo.

---

## Ordem de execução recomendada

```
Day 1 (~4h)     Day 0 honest recon (NÃO assumir nada do brief)
                26.A runSyncReal stub → real
                26.B Hub ingestion + auth
                Smoke local (Wrangler dev)

Day 2 (~4h)     26.C Deploy prod + smoke real
                26.E Dashboard remove demo fallback
                26.F E2E test (gate antes de merge)

Day 3 (~4h)     26.D Pastor learning loop
                26.H herd v167 nuclear
                final-reviewer gate
                PR feature → dev → main
                Tag v1.15.0-pastor-live (DEPOIS de merge, não antes)

Overnight       26.G LoRA train 212 samples (Paulo manual)
```

---

## Checklist pré-merge (doutrina Wave 25 lesson learned)

- [ ] Day 0 recon honest (sem assumir brief)
- [ ] Todos 8 sub-features ou justificação escrita para skip
- [ ] `final-reviewer` (Opus) corrido sem high severity
- [ ] E2E test 26.F passa contra prod
- [ ] CHANGELOG actualizado
- [ ] Dashboard mostra dados reais (sem demo data) numa conta Paulo limpa
- [ ] Pastor `pastor_state` table tem ≥1 entrada após 30min sync
- [ ] PR feature → dev mergeado
- [ ] PR dev → main mergeado
- [ ] **SÓ ENTÃO** `git tag v1.15.0-pastor-live <main HEAD>` + push

---

## Risks tracked

| Risco | Mitigação |
|---|---|
| HMAC scheme weak (key from `device_id` + admin token) | T3-architect review obrigatório. Considerar JWT short-lived. |
| CF Worker rate limit em sync bursty | Batch events client-side, 1 POST por minuto max |
| D1 storage limits com N devices ativos | Retention policy: events >30 dias → archive bucket |
| Pastor false signals (n=1 device) | Threshold: só emite hint quando ≥20 decisões por device |
| LoRA overfitting (212 samples) | Validation hold-out 20% + early stop |

---

## Marketing diff Wave 25 → Wave 26

- Tweet #6 (`audit/TWEET_THREAD.md` linha 13): `Wave 24's LoRA` → `Wave 26's LoRA` ⚠️ EDIT PENDENTE
- Blog post (`audit/BLOG_POST_DRAFT.md`): adicionar secção "Wave 26 closes the loop" pós-ship.

---

*Brief composto pós-ship Wave 25 v1.14.1. Day 0 recon começa próxima sessão CC — não confiar nas premissas acima sem validar com filesystem.*
