# Sprint B — Shadow Mode (handoff para outro terminal Claude Code)

**Para colar num novo terminal Claude Code** no directório `C:\Users\Paulo Loureiro\frugal`.

**Pré-requisitos antes de arrancar (REVISTO 2026-04-16):**
1. ~~Verifica que `feedback-collector.js --stats` devolve ≥ 30 ratings totais~~ — **gate revogado**. Substituído por validation-set estruturado (ver Sprint B.0). Corre `node ~/.claude/tools/router/replay.js --gold-labels` e confirma que existe e reporta accuracy por secção. Baseline drift é aceitável; classifier tuning vive em Sprint B.1.
2. Lê `docs/METHODOLOGY.md` — é source of truth. Qualquer decisão neste sprint alinha com ela.
3. Lê as últimas commits (`git log --oneline -8`) para ver o que Sprint B.0 já fundou.
4. Lê `SYNC.md` secção "COWORK → CLAUDE CODE — Sprint B handoff" para contexto.

---

## Contexto (lê antes de escrever código)

O router `frugal`/`mooter` classifica cada prompt num tier (T0 Ollama / T1 Haiku / T2 Sonnet / T3 Opus). Sprint A (15 Abril) fechou o loop de feedback explícito:

- `/mooter-good` e `/mooter-bad` escrevem `quality_feedback` events em `~/.claude/tools/router/decisions.log`
- `backtest.js` consome esses events via `resolveExplicitFeedback()`:
  - Rated-bad T2/T3 → force into demote pool (ignora length)
  - Rated-good signatures → veto de demote (protege padrões validados)
- `/frugal-status` mostra count ambient para lembrar o user de ratear

**O problema que Sprint B resolve**: o router não sabe avaliar qualidade por si próprio. Sem shadow mode, cada rating humano é o único sinal. Com shadow mode, para cada prompt em tier alto o sistema corre o tier-inferior em paralelo e deixa o Ollama local julgar — amplifica o sinal ~10× sem custo marginal.

---

## Tarefa: implementar Shadow Mode Lite

### Contrato de alto nível

> Em 5% dos prompts com `tier ≥ T2`, depois da resposta principal, spawnar em background uma chamada ao tier imediatamente inferior (T2→T1, T3→T2). Persistir ambos os outputs. Nightly job local corre Ollama qwen3:30b como LLM-as-judge a comparar as duas respostas e escrever o veredicto. Nunca expor o output alternativo ao user.

### Invariantes (não negociáveis)

1. **Feature flag `SHADOW_MODE_ENABLED` em `~/.claude/tools/router/.mooter-mode.json`, default `false`**. Activar só após smoke test local.
2. **Zero blast radius para o user**: o output shadow é silencioso, vive só em `decisions.log` com `event: "shadow_pair"`.
3. **Sampling 5%** via `Math.random() < 0.05` no spawn site — não fazer sampling determinístico que crie padrões exploráveis.
4. **Judge corre nightly via Task Scheduler**, não em cada prompt. Latency-insensitive.
5. **Nenhuma mudança em `classify.js` nem em `inject_context.js`** — shadow vive num módulo novo.
6. **HIGH_RISK prompts nunca entram em shadow** (security: não queremos duas respostas divergentes para push/deploy/migration).
7. **Commit atómico por fase** — 4 fases abaixo, 4 commits.

### Fase 1 — schema + flag (sem spawn ainda)

**Ficheiros a criar/editar:**
- `hub/migrations/003_shadow_events.sql` — nova tabela `shadow_pairs`:
  ```sql
  CREATE TABLE shadow_pairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id TEXT NOT NULL,
    session_id TEXT,
    primary_tier TEXT NOT NULL,
    shadow_tier TEXT NOT NULL,
    primary_preview TEXT,
    shadow_preview TEXT,
    judge_verdict TEXT,  -- 'primary_better' | 'shadow_better' | 'tie' | NULL
    judge_confidence REAL,
    judged_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_shadow_unjudged ON shadow_pairs(judge_verdict) WHERE judge_verdict IS NULL;
  ```
- `tools/router/shadow-mode.js` — módulo novo, exporta:
  - `isEnabled()` → lê `.mooter-mode.json` e env var `SHADOW_MODE_ENABLED`
  - `shouldSample(prompt, tier, classification)` → retorna `boolean` (5% + não HIGH_RISK + tier ≥ T2)
  - `shadowTierFor(tier)` → T2→T1, T3→T2
- Teste unitário `tools/router/shadow-mode.test.js` — ≥ 6 casos, incluindo HIGH_RISK gate e sampling determinístico com seed mockada.
- CI: adicionar step em `.github/workflows/test.yml` a correr `node tools/router/shadow-mode.test.js`.

**Commit**: `feat(shadow): phase 1 — schema, flag, sampling module (default off)`

### Fase 2 — spawn background shadow

**Ficheiros a editar:**
- `tools/router/shadow-mode.js` — adicionar `spawnShadow(prompt, primaryTier, decisionId)` que invoca o tier-inferior via Task tool (se T2→T1) ou via ollama_call.sh (se T3→T2 downgrade para Sonnet — usar `anthropic_call.sh`). **Fire-and-forget com `detached: true` + `unref()`**. Escreve `event: "shadow_pair"` em `decisions.log` com `primary_preview`, `shadow_preview`, `primary_tier`, `shadow_tier`.
- Callsite: `tools/router/inject_context.js` depois do `<router-hint>` emitido, **se `isEnabled()` e `shouldSample()` retornarem true**, chamar `spawnShadow()` sem bloquear.
- Testar local: `SHADOW_MODE_ENABLED=true claude` depois 20 prompts T2/T3, verificar 1-2 `shadow_pair` events em decisions.log.
- **Safety check antes do commit**: correr `replay.js --gold-labels` — se accuracy regride abaixo de 85%, revert. Shadow não deve afectar a classificação principal de todo, mas verifica.

**Commit**: `feat(shadow): phase 2 — background spawn in sampling window`

### Fase 3 — judge nightly via Ollama

**Ficheiros a criar:**
- `tools/router/shadow-judge.js` — script standalone:
  ```
  node shadow-judge.js              # judge all unjudged pairs from last 24h
  node shadow-judge.js --limit 100  # cap number judged
  node shadow-judge.js --dry-run    # print verdicts, don't write
  ```
  Usa `ollama_call.sh` com qwen3:30b (já instalado). Prompt de julgamento:
  ```
  Compare these two responses to the same user prompt. Decide which is better.
  Criteria: correctness, completeness, conciseness. PT-PT or EN.
  Respond with exactly one token: PRIMARY | SHADOW | TIE
  
  User prompt: <prompt>
  Response A (primary, tier <X>): <primary_preview>
  Response B (shadow, tier <Y>): <shadow_preview>
  ```
  Escreve `event: "shadow_judgment"` em decisions.log com `verdict`, `judged_decision_id`, `judged_at`.
- Schedule: Task Scheduler Windows `FrugalShadowJudge` diariamente às 03:00.

**Commit**: `feat(shadow): phase 3 — Ollama LLM-as-judge nightly`

### Fase 4 — wire into backtest

**Ficheiros a editar:**
- `tools/router/backtest.js` — novo resolver `resolveShadowJudgments(decisions)` que tag os classified events correspondentes com `shadow_verdict`. Em `analyze()`, se `verdict === 'shadow_better'` e primary tier T2/T3, força-entry em demote pool (mesmo signal que explicit_rating=0 já dá).
- Testes: extend `backtest.test.js` com 3 fixtures para shadow.

**Commit**: `feat(shadow): phase 4 — backtest consumes shadow verdicts`

### Critério de sucesso

- 100 amostras shadow em 24h de uso normal → identifica ≥ 5 casos de over-routing onde `shadow_better`
- Zero regressão no gold-labels CI (≥85%)
- Zero user-facing impact
- Budget Ollama local não ultrapassa 15min de GPU time por dia

---

## Blockers / gotchas

- **spawn detached no Windows**: spawnSync não funciona. Usar `child_process.spawn(..., { detached: true, windowsHide: true, stdio: 'ignore' })` e `unref()`.
- **ollama_call.sh think mode**: o Gemma 4 e qwen3 podem devolver thinking preamble. Já fixado em `ollama_call.sh` com `think:false`. Confirma.
- **Privacy**: `primary_preview` e `shadow_preview` são truncados a 200 chars em `decisions.log`. O judge recebe trunc, não raw.
- **Rate limit Anthropic**: se shadow spawn T3→T2 via Sonnet, respeita budget. Verifica `budget-engine.js` antes de spawn.

## Plano B se algo partir

Cada fase é um commit atómico. `git revert <commit>` reverte só aquela fase. `SHADOW_MODE_ENABLED=false` desactiva runtime sem tocar código.

---

## No fim, antes de push

1. `replay.js --gold-labels` → ≥ 85%
2. `backtest.test.js` → 100% pass
3. `/mooter-status` → mostra shadow count na nova linha
4. **Final-reviewer obrigatório** (model-architect subagent) antes de merge
5. Notion session page criada sob HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
6. `SYNC.md` actualizado

## Recursos

- Handoff inicial: [Notion — Sessão 2026-04-15](https://www.notion.so/3446f6e42bc481269744cc7780b095fe)
- Bandit paper (Fase 5 futura): https://arxiv.org/abs/2510.07429
- TensorZero pattern: https://www.tensorzero.com/blog/bandits-in-your-llm-gateway/
