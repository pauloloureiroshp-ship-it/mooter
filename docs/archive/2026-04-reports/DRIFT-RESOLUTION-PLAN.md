# Drift Resolution Plan — canonical ↔ runtime

**Data:** 2026-04-21
**Autor:** Claude Opus 4.7 (sessão #36)
**Status:** Phase 1 (non-destructive scaffolding) executed. **Phase 2 aguarda aprovação do Paulo** — toca em `classify.js`/`backtest.js`/`update-router.js` (hot path).

## Contexto

`sync-to-runtime.sh --diff` (2026-04-21) revelou 9 ficheiros drifted entre canonical `frugal/tools/router/` e runtime `~/.claude/tools/router/`:

| # | Ficheiro | Tipo | Problema |
|---|---|---|---|
| 1 | `classify.js` | bidireccional | canonical: `@ts-check` + JSDoc. runtime: tuning state newer (threshold 0.35, sample 38364, generated_at 2026-04-21) |
| 2 | `inject_context.js` | canonical-only | `@ts-check` + JSDoc + `@ts-ignore` pragmas |
| 3 | `arbiter.js` | canonical-only | `@ts-check` + JSDoc |
| 4 | `backtest.js` | canonical-only | B4 block (104 linhas Implicit Signal Weight Boost) |
| 5 | `savings-tracker.js` | bidireccional | canonical: Sprint 8.4 Sentry init + sanitize/env imports. runtime: older F4.3 comment |
| 6 | `shadow-mode.js` | canonical-only | `@ts-check` + JSDoc |
| 7 | `pricing.js` | canonical-only | `@ts-check` + JSDoc |
| 8 | `event-builder.js` | canonical-only | `@ts-check` + JSDoc |
| 9 | `version.json` | bidireccional | canonical: v0.9.9/landing-five-azure-16. runtime: v0.10.0/mooter.ai. Verdadeiro actual: v0.10.1 |

## Diagnóstico

**O drift é uma violação da doutrina oficial** (`.claude/rules/router-logic.md`):

> `frugal/tools/router/*.js` = Canonical (SSoT) — all changes start here.
> `~/.claude/tools/router/*.js` = Runtime — will be overwritten by `/mooter-update`.

Duas classes:

1. **Code quality (6 canonical-only + 2 bidireccionais)** — `@ts-check`, JSDoc, B4 weight boost, Sentry init. Sprint A/B/D fixes shipped a canonical mas nunca propagaram para runtime. `sync-to-runtime.sh --apply` resolveria — **se** a classe 2 não o impedisse.

2. **Tuning state em `classify.js` + metadata em `version.json`** — `update-router.js` (que corre no scheduled backtest 02:00) reescreve o `TUNED_BLOCK` dentro de `classify.js`. Isto significa que qualquer `sync-to-runtime.sh --apply` destrói 4 dias de tuning patches acumulados em runtime (threshold, TUNED_DEMOTE_T3).

**A raiz é arquitectural:** tuning state e código vivem no mesmo ficheiro. Qualquer propagação ou refactor do código exige coordenação manual com o ciclo de tuning — impossível sem erro humano.

## Solução

Externalizar tuning state: `classify.js` lê constantes de um JSON em vez de ter as constantes inlined.

### Nova topologia

```
tools/router/
├── classify.js                    # canonical — pure code, zero tuning
├── tuning-state.defaults.json     # canonical — seed para fresh install
├── tuning-state.json              # RUNTIME-ONLY — gitignored, escrito por update-router.js
└── ...
```

`classify.js` no topo:
```js
function loadTuningState() {
  const path = require('path');
  const fs = require('fs');
  try {
    const live = path.join(__dirname, 'tuning-state.json');
    if (fs.existsSync(live)) return JSON.parse(fs.readFileSync(live, 'utf8'));
  } catch {}
  const defaults = path.join(__dirname, 'tuning-state.defaults.json');
  return JSON.parse(fs.readFileSync(defaults, 'utf8'));
}
const _tuning = loadTuningState();
const TUNED_COMPLEXITY_THRESHOLD = _tuning.complexity_threshold;
const TUNED_PROMOTE_T0 = (_tuning.promote_t0 || []).map(s => new RegExp(s, 'i'));
const TUNED_DEMOTE_T3 = (_tuning.demote_t3 || []).map(s => new RegExp(s, 'i'));
```

`update-router.js` passa a escrever `tuning-state.json` em vez de reescrever `classify.js`.

### Propriedades desejáveis

- Canonical `classify.js` torna-se determinístico e safe-to-sync (sem tuning embedded).
- Runtime `tuning-state.json` acumula tuning entre sessões (não sobreposto por sync).
- Fresh install: sem `tuning-state.json` → fallback para defaults → zero tuning inicial.
- `classify.js.bak` deixa de ser necessário (já não há write-back destrutivo).
- `npm test` deixa de testar o TUNED_BLOCK sintético — testa o carregamento real.

## Execução

### Phase 1 — Non-destructive scaffolding ✅ EXECUTADO (commit desta sessão)

- [x] Criar `tools/router/tuning-state.defaults.json` (seed com threshold 0.3, arrays vazios)
- [x] `.gitignore`: adicionar `tools/router/tuning-state.json`
- [x] `sync-to-runtime.sh`: documentar porque não sincroniza tuning-state.json
- [x] Canonical `version.json` → v0.10.1 + 2026-04-21 + mooter.ai (alinha com SYNC.md)
- [x] Este plano (`docs/DRIFT-RESOLUTION-PLAN.md`)

Safe porque: novos ficheiros/config, zero mudança no código hot path. Se Paulo rejeitar Phase 2, estes ficheiros ficam inertes (defaults.json existe mas ninguém o lê).

### Phase 2 — Core refactor (AGUARDA APROVAÇÃO) 🔶

Ordem crítica — **não reordenar**:

**2.1 — Seed runtime `tuning-state.json` a partir do estado actual de runtime `classify.js`**
```json
{
  "generated_at": "2026-04-21T10:29:19.926Z",
  "sample_size": 38364,
  "complexity_threshold": 0.35,
  "promote_t0": [],
  "demote_t3": ["\\bproxima\\b", "\\bavança\\s+com\\s+opção\\b", "\\bvamos\\s+para\\s+o\\b"]
}
```
Escrever este ficheiro em `~/.claude/tools/router/tuning-state.json` (runtime). Preserva 4 dias de tuning.

**2.2 — Refactor `classify.js` (canonical)**
- Remove linhas 29-37 (TUNED-BLOCK-START/END)
- Adicionar função `loadTuningState()` e 3 constantes derivadas antes da secção ARCH_SIGNALS
- Manter `// @ts-check` e JSDoc existentes

**2.3 — Refactor `update-router.js` (canonical)**
- Linha 24-25: remover `CLASSIFY`/`BACKUP` paths
- Linha 116: substituir `fs.writeFileSync(CLASSIFY, updated)` por `fs.writeFileSync(TUNING_STATE, JSON.stringify(tuningObj, null, 2))`
- Remover backup para `classify.js.bak` (já não necessário)
- Adicionar TUNING_STATE = `path.join(ROUTER_DIR, 'tuning-state.json')`

**2.4 — Rodar testes**
`cd tools/router && npm test` — esperar 130/130 green.
Se falhar: ver mensagem de erro, corrigir, repetir. Se não for corrigível em <15 min, rollback (`git reset --hard HEAD`).

**2.5 — Sync canonical → runtime**
`bash tools/router/sync-to-runtime.sh --apply` (com sync-to-runtime.sh já a skippar tuning-state.json).
Esperado: 8 ficheiros synced (classe 1 code quality + update-router.js), `tuning-state.json` preservado em runtime.

**2.6 — Verificação final**
- `bash tools/router/sync-to-runtime.sh --diff` deve dizer `0 synced, N identical, 0 diverged`
- `~/.claude/tools/router/classify.js` deve ter `@ts-check` E `const _tuning = loadTuningState()`
- `~/.claude/tools/router/tuning-state.json` deve existir com threshold 0.35, sample 38364
- Teste smoke: `node ~/.claude/tools/router/classify.js "hello world"` deve classificar T0 sem erro

**2.7 — Commits atómicos**
1. `refactor(router): externalize tuning state to tuning-state.json`
2. `refactor(router): update-router.js writes tuning-state.json (not classify.js)`
3. `chore(sync): canonical → runtime post-refactor (8 files)`

**2.8 — Final-reviewer gate → push main**

### Phase 3 — Remoção de artifacts legacy (opcional, pós-Phase 2 estável)

Depois de 1-2 dias sem incidentes:
- Remover `classify.js.bak` / `classify.js.sync-bak` em runtime (legacy)
- Remover `backtest.js.bak` / `backtest.js.sync-bak`
- Adicionar a `.gitignore`: `tools/router/*.bak`, `tools/router/*.sync-bak`

## Risco e rollback

**Risco principal (Phase 2.2):** refactor altera classify.js, que é core. Se o loadTuningState() tiver bug, classify.js pode falhar silenciosamente → hook devolve `claude_session` fallback em todos os prompts → router inoperante.

**Mitigações:**
1. `loadTuningState()` tem try/catch + fallback defaults — impossible crash
2. Defaults têm threshold 0.3 (antigo valor estável, 88.3% GATE PASS)
3. `npm test` antes de commit
4. Smoke test pós-sync antes de push
5. Se problema pós-push: `git revert <hash> && bash sync-to-runtime.sh --apply && git push` — 2 min rollback

**Risco secundário:** `update-router.js` refactor pode deixar o nightly backtest broken até next run. Impacto: 1-7 dias sem tuning update, mas zero impact em routing (classify.js lê a versão actual).

## Testes

Critério de sucesso Phase 2:
- 130/130 green pre-push
- `/mooter-status` reporta o mesmo tier/model que antes para 10 prompts de controlo
- 24h pós-deploy: decisions.log mostra distribuição de tier inalterada ±5%
