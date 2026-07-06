# ⇄ COWORK → CC · MP-Q — Quota-Aware Routing (cirúrgico, S) · a moeda do user Max é a SEMANA, não o $

> **Porquê (dados reais, 2026-07-06):** print do Paulo (Max): Session 10% · **Weekly 89%** · **Fable 100%**. Burn: 66% ctx>150k · 37% subagents · 24% MCP context7. O Mooter optimiza $ — mas para user Max o marginal cost ≈ $0 e a restrição real é a quota semanal. Pilar competitivo nº1 da STRATEGY.md (subscription-aware) ganha o eixo que faltava.
>
> **Confronto código real (Cowork 2026-07-06 — cada costura VERIFICADA, não palpite):**
> | Costura | Ficheiro real | Estado |
> |---|---|---|
> | CC envia `rate_limits.five_hour/.seven_day` no stdin do statusline (CC ≥2.1.x, zero API calls) | `tools/router/gsd-statusline.js` **já lê o stdin JSON** (linhas 2229-2231) | ✅ só falta PERSISTIR |
> | Tracker central de quotas | `tools/router/quota-tracker.js` (+ teste) — "Additive only", `getQuotaRemaining()` | ✅ mas usa **estimativas próprias**, não os oficiais |
> | Tier capping no hook | `tools/router/inject_context.js` `applyBudgetCap(tier, budget)` (linha ~253) | ✅ padrão pronto a clonar |
> | Custo escondido | `inject_context.js` spawna child p/ `/api/oauth/usage` em ~20% dos prompts (cache miss) | 🩸 substituível pelo ficheiro local |
> | Chip statusline | padrão `limits-status.js` (line-3, opt-in) | ✅ clonar |
>
> `classify.js` FROZEN · princípio **no-proxy** intacto (nada senta entre user e LLM — só sinal no hint) · doctrine wins (floors T3 de push/deploy/secrets NUNCA baixam).

## 🎯 GOAL
O router passa a saber quanto resta da TUA semana e ajusta a agressividade local-first sozinho — com explicabilidade ("porquê local? weekly 89%") e honestidade (`n/d` quando o CC não manda rate_limits). Bónus cirúrgico: mata o spawn de `/api/oauth/usage` em 20% dos prompts.

## 📍 WHERE (R1/R5)
`git fetch` → `git worktree add ../frugal-quota main` → confirmar `git rev-parse --show-toplevel`. Branch `feat/quota-aware`. **Sonnet.** Sessão curta (a semana está a 89%): `/mcp` → desligar context7 e servers desnecessários · zero subagents · R2 commit por bloco · sair no GATE.

## ▶ DO (4 blocos, commit atómico cada — R2)
**Q0 · Probe honesto (não inventar schema):** adicionar ao `gsd-statusline.js` um dump diagnóstico único do stdin payload (`~/.mooter/statusline-stdin-sample.json`, escrito 1x, atómico) → inspecionar o shape REAL de `rate_limits` (nomes/percentagens/reset). O parser do Q1 constrói-se sobre o observado, não sobre blogs. → COMMIT.

**Q1 · Persistir os oficiais:** no `gsd-statusline.js` (que já corre a cada render), extrair `rate_limits` do stdin e escrever `~/.mooter/quota-live.json` `{five_hour_pct, seven_day_pct, opus_or_fable_pct?, resets, ts, source:"cc-statusline-stdin"}` — atómico (tmp+rename, padrão writeHeartbeat), fail-soft (payload sem rate_limits → não escreve, nunca crasha o statusline). → COMMIT + teste (fixture com/sem rate_limits).

**Q2 · Tracker lê oficial-primeiro:** função ADITIVA em `quota-tracker.js`: `getOfficialQuota()` lê quota-live.json (fresco ≤10min); `getQuotaRemaining('anthropic')` passa a preferir oficial, estimativa vira fallback (campo `basis: "official"|"estimated"` — honestidade). → COMMIT + teste.

**Q3 · Defcon no hook:** em `inject_context.js`, clonar o padrão `applyBudgetCap` → `applyQuotaDefcon(tier, quotaLive)`:
- `seven_day ≥70%` 🟡 borderline T1/T2 → bias local/T1;
- `≥85%` 🔴 cap T2 + local-first agressivo;
- `≥95%` ⚫ cloud SÓ floors de risco (T3 doctrine) — resto local;
- métrica Fable/Opus-class a 100% (se o payload a expuser) → suprimir sugestões `@fable`/T5.
**Floors T3 (push/deploy/secrets/migrations) NUNCA baixam — doctrine > optimizador** (princípio 5). Campo `reasoning` explica: `"weekly 89% → defcon 🔴 → local"`. **E substituir** o refresh via child `/api/oauth/usage` por leitura do quota-live.json quando fresco (child fica como fallback stale>10min) — menos spawns em ~20% dos prompts, menos latência. → COMMIT + testes (defcon por faixa · floors intocados · fallback).

**Q4 · Chip visível:** clonar padrão `limits-status.js` → chip line-3 opt-in `📅 semana 89% 🔴 (reset 3d)`; `n/d` honesto sem quota-live. Default statusline byte-idêntico (regra statusline). → COMMIT + teste.

## 🔒 GUARD
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — prova início e fim) · só `tools/router/*.js` host-side (NUNCA `packages/*` frozen) · aditivo: funções/ficheiros novos + a substituição pontual do refresh no `inject_context.js` · no-proxy · honest-copy (`n/d`/`basis`) · default statusline byte-idêntico · selective `git add` · **sem push/merge sem OK do Paulo** · PT-PT conversa/EN código.

## ✅ GATE
Payload real capturado e parser casa com ele · `quota-live.json` escrito pelo statusline em sessão real · `getQuotaRemaining` devolve `basis:"official"` · prompt de teste borderline com weekly ≥85% simulado roteia local com `reasoning` a explicar · floors T3 provados intocados (teste) · spawn `/api/oauth/usage` não ocorre com cache fresco (log) · chip mostra % real ou `n/d` · testes todos verdes · sha intacta · tudo committed. **PÁRA — cola git log + testes + o quota-live.json real (sem tokens/segredos).**

## ⏭ NEXT (fora deste MP — donos na fleet, §CHARTERS do FLEET_FASE3_LAUNCH_HANDOFF)
Subagent→moo local (matriz, 37% do burn) · MCP result distiller via mooter MCP server local (integracoes-llm, 24%) · Guardian ctx-diet como feature de user (vscode-plugin, 66%) · `est_cloud_tokens_avoided` no fleet-ledger (usa `usage-estimator.js` existente) · quota-aware no dashboard Economics do W15.

## ♻️ §REUSE — repos públicos que poupam esforço (web 2026-07-06 · verificar licença ANTES de copiar 1 linha)
- **`Maciek-roboblog/Claude-Code-Usage-Monitor` (MIT)** — já faz: rate_limits oficiais do statusline + estado machine-readable + **provenance labels** (≈ nosso honest-copy!) + forecasting. **Usar como referência do Q0/Q1**: o schema do payload e o formato de estado deles poupam o reverse-engineering; o forecasting inspira um defcon PREVISIONAL futuro ("ao ritmo actual, estouras 6ª"). NÃO adotar o monitor inteiro — o Mooter tem statusline próprio com identidade.
- **`ohugonnot/claude-code-statusline`** — parser de rate_limits/reset countdown já resolvido. Ler o parsing (licença a confirmar), não importar o statusline.
- **`ryoppippi/ccusage` (standard de facto, offline, lê os JSONL locais)** — **adotar como fonte complementar**: burn por modelo/sessão alimenta `est_cloud_tokens_avoided` e o Economics do W15 sem escrevermos um parser de JSONL do zero. `npx ccusage --json` numa ronda do cronista = $0.
- ❌ **`claude-code-ollama-proxy` / OpenClaude** — proxies completos violam o princípio nº1 do Mooter (no-proxy). Não adotar; registar o porquê no ledger se alguém propuser.

## 📋 BACK
Branch `feat/quota-aware` · `git log --oneline main..HEAD` · diff --stat · testes · sample do payload (sanitizado) · quota-live.json real · prova dos floors.
