# SAVINGS_INTEGRITY_MASTER_PROMPT.md
# frugal — Savings Integrity + Response Routing Audit
# Versão: 2026-04-11 | Sessão #10

> **Missão:** Resolver 4 problemas reais de consistência nos savings do frugal.
> Lê este ficheiro inteiro antes de começar. Implementa na ordem indicada.

---

## CONTEXTO — O QUE FOI DESCOBERTO HOJE (Cowork)

Paulo está a tornar o plugin VSCode coerente em termos de **savings all-time**.
Durante a análise, foram identificados 4 problemas estruturais:

### Problema 1 — BUG CRÍTICO: `alltime` mostra `real_cost`, não `saved`

**Ficheiro:** `vscode-extension/extension.js`, linha ~109

```js
// CÓDIGO ACTUAL (ERRADO):
const alltime = fmtUsd(metrics.real_cost);  // ← real_cost = o que GASTASTE
statusBarItem.text = `💰 ${saved} (${pct}%) │ ${real} real │ alltime ${alltime}`;
```

`alltime` está a mostrar o que o utilizador **gastou** (real_cost), mas aparece
com a label "alltime" como se fossem poupanças acumuladas. Isto é:
- Confuso (parece que "alltime" é o savings total histórico)
- Errado (real_cost é o custo, não a poupança)

**O que deve ser:**
```js
// CORRECTO:
const allTimeSaved = fmtUsd(metrics.saved);  // saved = naive - real
statusBarItem.text = `💰 ${saved} (${pct}%) │ ${real} real │ alltime saved ${allTimeSaved}`;
```

Mas há um problema mais profundo: `metrics.saved` é calculado a partir de
`decisions.log`, que **só persiste por sessão no comportamento padrão**?
Verifica se `decisions.log` é append-only (acumula over time) ou é resetado
por sessão. Se for append-only → alltime = `metrics.saved` é correcto após
o fix. Se resetar → precisas de um `savings-snapshot.json` separado.

**Verificação antes de corrigir:**
```bash
wc -l ~/.claude/tools/router/decisions.log
tail -5 ~/.claude/tools/router/decisions.log
# Verificar se o log tem entradas de múltiplas datas
```

---

### Problema 2 — Savings sem contexto de plano do utilizador

**Situação actual:**
O frugal compara o custo real (tier routing) contra "naive Opus cost" (tudo em T3).
Mas **não considera o plano do utilizador**.

**Por que isto importa:**
- Utilizador com **Claude Max ($100/mês)** → os prompts Claude são "de graça" dentro
  do limite. O savings real é diferente vs um utilizador pay-per-token.
- Utilizador com **Claude Pro ($20/mês)** → limite de prompts, não token-based.
- Utilizador **só API** → cada token custa, o modelo actual é correcto.

**Campos já existentes no `inject_context.js`** (verificar):
```bash
grep -n "subscription\|claude_max\|plan\|seat_cost" ~/.claude/tools/router/inject_context.js
```

**O que implementar:**
1. Adicionar campo `user_plan` ao output do `/metrics` endpoint do savings-tracker
2. Calcular savings **de forma diferente por plano**:
   - `api_only`: savings = naive_opus_cost - real_cost ✅ (modelo actual correcto)
   - `claude_max`: savings = tokens_saved × Opus_price (o que "não consumiu" do limite)
     + uma nota: "X prompts que teriam ido a Opus foram para Ollama/Haiku"
   - `claude_pro`: savings = número de prompts "poupados" do limite mensal
3. O VSCode extension deve **mostrar o modo correcto** consoante o plano

**Ficheiro onde guardar o plano:**
`~/.claude/tools/router/subscription.json` (já existe? verifica)
```bash
cat ~/.claude/tools/router/subscription.json 2>/dev/null || echo "DOES NOT EXIST"
```

---

### Problema 3 — O routing captura o PROMPT mas não a RESPOSTA

**Situação actual:**
O frugal classifica cada prompt (UserPromptSubmit hook) e decide o tier.
Mas **não sabe** se a resposta que o utilizador recebeu foi realmente do modelo
que o router sugeriu. O `inject_context.js` injeta um `<router-hint>`, mas o
Claude Code pode ignorá-lo.

**O que está a falhar:**
- O frugal conta "mandei para T1 (Haiku)" → marca como savings
- Mas se o Claude Code usou Opus na mesma (ex: modo Beast activo sem frugal saber) → savings inflados
- Não há nenhum hook `PostToolUse` ou `Stop` que confirme o modelo usado

**O que implementar — verificação de coerência:**

Opção A (preferida, sem modificar Claude Code internals):
```js
// No Stop hook (gsd-turn-end.js, se existir) ou novo hook AfterResponse:
// Ler o campo `model` da resposta do Claude Code e comparar com o tier sugerido
// Se discrepância > threshold → logar como `routing_miss` no decisions.log
```

Verificar se já existe hook de Stop:
```bash
ls ~/.claude/hooks/ 2>/dev/null
cat ~/.claude/settings.json | grep -A 20 "hooks"
```

Opção B (mais simples):
Adicionar ao `inject_context.js` um campo `suggested_tier` na resposta injectada,
e no próximo prompt verificar se o último `suggested_tier` foi honrado
(indiretamente, pela latência medida vs baseline do tier).

**Campos a adicionar ao decisions.log:**
```json
{
  "event": "routing_audit",
  "suggested_tier": "T1",
  "actual_model_observed": "claude-haiku-4-5",  // ou null se não observável
  "routing_honored": true,
  "ts_ms": 1234567890
}
```

---

### Problema 4 — `hub-push` enriquece o algoritmo mas sem feedback loop completo

**Situação actual:**
- O `backtest.js` corre nocturnamente e faz push para o hub
- O hub tem `router-tuning-latest.json` e `model-catalog-latest.json` no R2
- O `hub-pull.js` faz pull e actualiza o classifier

**O que falta para o loop estar COMPLETO:**

1. **Confirmação de que o pull foi aplicado com sucesso** → logar `tuning_applied`
   no decisions.log com hash do ficheiro aplicado
2. **Métricas antes/depois** → backtest antes do pull vs depois do pull para
   saber se o tuning melhorou a accuracy
3. **Signal de savings real para o hub** → o hub actualmente recebe tier+confidence
   mas não sabe os savings reais ($ economizados). Adicionar ao payload do hub-push:
   ```json
   {
     "savings_usd": 0.045,
     "saved_pct": 87.3,
     "plan": "claude_max"
   }
   ```
   Isto permite ao hub calcular o **impacto económico real da comunidade**,
   não apenas os padrões de routing.

---

## PLANO DE IMPLEMENTAÇÃO (por ordem de prioridade)

### P1 — Fix imediato: bug `alltime` no VSCode extension
**Ficheiro:** `vscode-extension/extension.js`
**Tempo estimado:** 10 minutos
**Risco:** Baixo

1. Verificar se `decisions.log` é append-only (confirmar antes de mudar)
2. Corrigir `alltime` → mostrar `metrics.saved` (poupança acumulada), não `real_cost`
3. Actualizar label no statusbar: `alltime saved ${allTimeSaved}`
4. Actualizar tooltip da sidebar para incluir:
   - `Saved all-time: $X.XX`
   - `Based on: ${metrics.prompts} prompts`
   - `Methodology: estimated vs naive Opus baseline`
5. Rebuildar o `.vsix`: `cd vscode-extension && npx vsce package`

**Atenção:** Se `decisions.log` resetar por sessão → cria `savings-snapshot.json`
que acumula `saved` no final de cada sessão. O VSCode extension lê o snapshot
+ a sessão actual e soma.

---

### P2 — Plano-aware savings
**Ficheiros:** `savings-tracker.js`, `vscode-extension/extension.js`
**Tempo estimado:** 45 minutos
**Risco:** Médio

1. Verificar se `subscription.json` existe e qual o seu schema:
   ```bash
   cat ~/.claude/tools/router/subscription.json
   ```

2. Adicionar ao `savings-tracker.js` lógica de `readSubscription()`:
   ```js
   function readSubscription() {
     try {
       const p = path.join(ROUTER_DIR, 'subscription.json');
       return JSON.parse(fs.readFileSync(p, 'utf8'));
     } catch { return { plan: 'api_only' }; }
   }
   ```

3. Calcular savings condicionalmente no `computeMetrics()`:
   ```js
   const sub = readSubscription();
   
   if (sub.plan === 'api_only') {
     // Modelo actual: correcto
     m.savings_display = m.saved;
     m.savings_label = 'API savings';
   } else if (sub.plan === 'claude_max' || sub.plan === 'claude_pro') {
     // Savings = tokens/prompts "aliviados" do plano + Ollama gratuitos
     const ollama_prompts = m.by_tier.T0;
     const ollama_cost_if_opus = ollama_prompts * (m.naive_cost / m.prompts || 0);
     m.savings_display = ollama_cost_if_opus;  // o que teria custado na API se não tivesses plano
     m.savings_label = 'Opus equiv. deflected';
     m.subscription_note = `Plan: ${sub.plan} — ${ollama_prompts} prompts went to Ollama (free)`;
   }
   ```

4. Expor no `/metrics`:
   ```json
   {
     "savings_display": 0.45,
     "savings_label": "Opus equiv. deflected",
     "subscription_note": "Plan: claude_max — 47 prompts went to Ollama (free)",
     "plan": "claude_max"
   }
   ```

5. VSCode extension: mostrar `savings_label` em vez de texto hardcoded "Saved"

---

### P3 — Routing audit (confirmar que a resposta veio do modelo certo)
**Ficheiros:** `inject_context.js`, novo `gsd-response-audit.js` (ou PostToolUse hook)
**Tempo estimado:** 60 minutos
**Risco:** Médio-alto (modifica o hook principal)

1. Verificar hooks disponíveis:
   ```bash
   cat ~/.claude/settings.json | python3 -m json.tool | grep -A 5 hooks
   ls ~/.claude/hooks/ 2>/dev/null
   ```

2. Se existir hook `Stop` → adicionar ao `gsd-turn-end.js` (ou criar):
   ```js
   // Ler o model da API response se disponível no ambiente
   // Comparar com o last_suggested_tier
   // Logar routing_audit event
   ```

3. **Alternativa mais simples (sem risco):** No `inject_context.js`, após injectar
   o hint, adicionar o `suggested_tier` ao log com flag `audit_pending: true`.
   O próximo UserPromptSubmit hook lê o último `audit_pending` e estima se foi
   honrado baseado na latência (se latência ≈ baseline do tier sugerido →
   provavelmente honrado).

4. Adicionar ao `/metrics`:
   ```json
   {
     "routing_audit": {
       "audited_turns": 120,
       "estimated_honored": 98,
       "estimated_honored_pct": 81.7,
       "methodology": "latency_proxy"
     }
   }
   ```

---

### P4 — Hub-push com savings payload
**Ficheiros:** `hub-push.js`, Cloudflare Worker (`frugal-hub`)
**Tempo estimado:** 30 minutos
**Risco:** Baixo (additive)

1. Adicionar ao payload do `hub-push.js`:
   ```js
   const metricsSnap = await fetchLocalMetrics();  // GET :7821/metrics
   payload.savings_usd = metricsSnap?.saved || 0;
   payload.saved_pct = metricsSnap?.saved_pct || 0;
   payload.plan = sub?.plan || 'unknown';
   ```

2. No Cloudflare Worker (`frugal-hub`), adicionar coluna `savings_usd` à tabela
   D1 de deltas e agregar no `/api/stats` para mostrar na landing:
   ```sql
   ALTER TABLE routing_deltas ADD COLUMN savings_usd REAL DEFAULT 0;
   ALTER TABLE routing_deltas ADD COLUMN plan TEXT DEFAULT 'unknown';
   ```

3. Actualizar `/api/stats` para retornar:
   ```json
   {
     "total_savings_usd": 1234.56,
     "avg_savings_pct": 87.3,
     "community_prompts": 50000
   }
   ```

4. Landing viva: os counters da landing passam a mostrar savings reais da
   comunidade, não estimates — **muito mais poderoso para conversão**.

---

## VERIFICAÇÕES ANTES DE COMEÇAR

Correr estas verificações primeiro e reportar os resultados antes de alterar código:

```bash
# 1. decisions.log — é append-only?
echo "Linhas no log:" && wc -l ~/.claude/tools/router/decisions.log
echo "Primeira entrada:" && head -1 ~/.claude/tools/router/decisions.log
echo "Última entrada:" && tail -1 ~/.claude/tools/router/decisions.log
echo "Span de datas:" && cat ~/.claude/tools/router/decisions.log | python3 -c "
import sys, json
dates = []
for l in sys.stdin:
    try:
        e = json.loads(l)
        if 'ts' in e: dates.append(e['ts'][:10])
    except: pass
if dates: print(f'De {min(dates)} a {max(dates)} — {len(set(dates))} dias distintos')
else: print('Sem timestamps')
"

# 2. subscription.json existe?
cat ~/.claude/tools/router/subscription.json 2>/dev/null || echo "SUBSCRIPTION NOT FOUND"

# 3. Hooks configurados
cat ~/.claude/settings.json | python3 -m json.tool 2>/dev/null | grep -A 3 '"hooks"' || echo "No hooks section found"

# 4. Tracker a correr?
curl -s http://127.0.0.1:7821/health 2>/dev/null || echo "TRACKER NOT RUNNING"

# 5. Metrics actuais
curl -s http://127.0.0.1:7821/metrics 2>/dev/null | python3 -m json.tool | grep -E "saved|real_cost|naive|prompts|plan"
```

---

## REGRAS DE HONESTIDADE PARA O ALGORITMO DE SAVINGS

> Estas regras são inegociáveis. O frugal não pode inflar números.

1. **Nunca mostrar savings que incluam estimativas não marcadas como tal.**
   Qualquer número estimado deve ter `~ est` na label ou tooltip.

2. **`guaranteed_saved` > `advisory_saved`** → IMPOSSÍVEL. Se acontecer, há bug.
   `guaranteed_saved` são só os Option A hits (provados). `advisory_saved` inclui
   tudo (estimativa). Adicionar assertion:
   ```js
   console.assert(m.guaranteed_saved <= m.advisory_saved, 'Savings invariant broken');
   ```

3. **Alltime savings deve vir do log completo**, não da sessão actual.
   `decisions.log` é append-only → alltime = computeMetrics(allLines).
   Se o log for apagado → savings reset. Documentar isto claramente na UI.

4. **Plano do utilizador muda o que é "savings"**.
   Um utilizador Claude Max que usa Opus em tudo não paga mais por prompt.
   O savings real dele é: tokens não consumidos do limite + Ollama substitutions.
   Não mostrar o mesmo número que um utilizador API-only.

5. **Nunca mostrar savings negativos** (pode acontecer se T2 custar mais que T3
   por prompt curto). Floor a zero e logar o caso como `routing_inefficiency`.

---

## ESTRUTURA DE FICHEIROS A TOCAR

```
frugal/
├── vscode-extension/
│   ├── extension.js          ← P1: fix alltime bug + plan-aware labels
│   └── package.json          ← sem mudanças
├── tools/router/
│   ├── savings-tracker.js    ← P2: plano-aware, assertions, alltime robusto
│   ├── inject_context.js     ← P3: suggested_tier audit logging
│   ├── hub-push.js           ← P4: adicionar savings ao payload
│   ├── subscription.json     ← verificar/criar se não existir
│   └── pricing.js            ← sem mudanças (já correcto)
└── (Cloudflare Worker)       ← P4: schema D1 + /api/stats update
    └── (via wrangler deploy)
```

---

## OUTPUTS ESPERADOS

Após implementar P1-P4:

**VSCode statusbar (antes):**
```
💰 $0.45 (87%) │ $0.06 real │ alltime $0.06
```
(alltime mostrava real_cost — confuso e errado)

**VSCode statusbar (depois — API only):**
```
💰 $0.45 saved (87%) │ $0.06 real │ alltime saved $1.23
```

**VSCode statusbar (depois — Claude Max):**
```
💰 47 deflected (87% to Ollama) │ $0.00 API real │ Plan: Claude Max
```

**VSCode tooltip (depois):**
```
frugal — savings
─────────────────────────────
Prompts this session:    54
Alltime prompts:        892
─────────────────────────────
Saved (est):           $1.23  ← alltime, correcto
Guaranteed saved:      $0.31  ← Option A hits, provado
Real cost:             $0.08  ← o que realmente gastaste
Naive (all Opus):      $1.31  ← o que custaria sem frugal
─────────────────────────────
Plan: claude_max
Note: 47 prompts deflected to Ollama (free)
─────────────────────────────
Routing audit (est): 82% honored
Methodology: latency proxy
─────────────────────────────
Click for full report.
```

---

## DEPOIS DE IMPLEMENTAR — PROTOCOLO DE VALIDAÇÃO

```bash
# 1. Rebuild VSCode extension
cd ~/frugal/vscode-extension
npx vsce package
# Instalar no VSCode: Extensions > Install from VSIX > frugal-savings-0.5.0.vsix

# 2. Verificar assertions no tracker
node ~/.claude/tools/router/savings-tracker.js &
curl -s http://127.0.0.1:7821/metrics | python3 -m json.tool

# 3. Verificar que guaranteed_saved <= advisory_saved
curl -s http://127.0.0.1:7821/metrics | python3 -c "
import sys, json
m = json.load(sys.stdin)
assert m['guaranteed_saved'] <= m['advisory_saved'], 'INVARIANT BROKEN'
print('✅ Invariant OK')
print(f'  advisory_saved: {m[\"advisory_saved\"]}')
print(f'  guaranteed_saved: {m[\"guaranteed_saved\"]}')
print(f'  saved: {m[\"saved\"]}')
"

# 4. Verificar alltime span
node ~/.claude/tools/router/savings-tracker.js & 
sleep 1
curl -s http://127.0.0.1:7821/summary

# 5. Hub-push test
node ~/.claude/tools/router/hub-push.js --dry-run
```

---

## SNAPSHOT PARA O NOTION

No fim desta sessão, criar página Notion:
```
🔢 Sessão 2026-04-11 — Savings Integrity Audit + VSCode alltime fix
```

Registar:
- Bug encontrado: alltime = real_cost (estava errado)
- Fix aplicado: alltime = saved (acumulado do log)
- Plan-awareness: subscription.json + plano-aware savings
- Routing audit: latency-proxy method
- Hub-push: savings no payload para community stats

HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
