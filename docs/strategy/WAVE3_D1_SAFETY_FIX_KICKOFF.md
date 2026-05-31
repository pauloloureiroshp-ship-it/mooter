# Wave 3 Day 1 — Safety Downgrade Fix (MAJ-1 + MAJ-2 from Wave 2.7 audit)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code que terminou Wave 2.7+2.8. Self-contained.
>
> **Pré-requisitos**: tags `v0.2.7-audit` + `v0.2.8-parity` existem em dev. Working dir = `~/mooter`.
>
> **O que faz**: fix dos 2 majors do Wave 2.7 audit:
> - **MAJ-1**: classify.js rota "design sharding strategy" para T0 (qwen2.5:3b) — should be T3
> - **MAJ-2**: accuracy <90% na fronteira T0↔T1
>
> Crítico: **NÃO toca classify.js** (P11 invariant). Fix é via layer de safety-boost por cima.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave3-day1-safety-downgrade-fix` (cria de `dev`). `--permission-mode bypassPermissions` (autorizado).

**Missão Wave 3 D1**: shippar 4 sub-features num único PR para `dev` que fixam os 2 majors do Wave 2.7 audit + protegem `classify.js` (P11):

1. **Heuristic boost layer** (NEW `tools/router/safety_boost.js`) — detecta keywords arquitecturais + applies post-classify uplift T0/T1→T2/T3
2. **Embedding examples reinforcement** — adiciona examples canónicos T3 para "design X strategy / architecture / audit / review" domain (golden seed extension)
3. **Regression test suite** — golden set 30+ cases T2/T3 que devem NÃO ir para T0, com case explícito de "design sharding strategy"
4. **Safety telemetry** — `mooter_event` (sem mudar schema) capta `safety_boost_applied: bool` + reason

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11) — verificar com `git diff dev tools/router/classify.js` no fim, deve ser zero
- ❌ **mooter_event.ts schema INTACTO** (Wave 2 D4 canónico)
- ❌ **Não tocar `docs/archive/**`** ou `~/.claude/agents/*`
- ❌ **Não `git add -A`**, **`--no-verify`**, ou merge para `main`
- ❌ **Não inventar números** (LoRA "none yet", accuracy real medida)
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.3.0-safety-fix** (incrementa minor — entra família Wave 3)
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: safety_boost dá razão verificável, NÃO black-box

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma fa011fd + tags v0.2.7-audit + v0.2.8-parity
git tag -l | grep v0.2.
git checkout -b wave3-day1-safety-downgrade-fix
```

Recon:
- `tools/router/classify.js` — lê (NÃO modifica) — entender output schema actual
- `tools/router/inject_context.js` — onde injectar o safety_boost wrap
- `audit/wave2-7-e2e-simulation/REPORT.md` — ler MAJ-1 + MAJ-2 evidence em detalhe
- `audit/wave2-7-e2e-simulation/persona-P2.md` — caso "design sharding strategy" detalhado
- `packages/router/src/embeddings/` (se existir) — onde adicionar examples
- `packages/router/src/types.ts` — confirma `mooter_event` fields disponíveis

## 3. Sub-feature 1 — Heuristic boost layer

### 3.1 Behaviour

Após `classify.js` decidir tier (e.g., T0 qwen2.5:3b), `safety_boost.js` examina:
- Keywords arquitecturais: `design`, `strategy`, `architecture`, `audit`, `review`, `refactor`, `migration`, `database schema`, `sharding`, `partitioning`, `consistency`, `transaction`
- Confidence original
- Tamanho do prompt

Se match keyword arquitectural + classifier deu T0/T1 + confidence < 0.9 → **boost para T2 (Sonnet)** com razão explícita.

Se match crítico (e.g., "design sharding", "schema migration", "redesign architecture") + qualquer tier < T3 → **boost para T3 (Opus)** com razão.

### 3.2 Ficheiro

**`tools/router/safety_boost.js` (NEW)**:

```javascript
'use strict';

const ARCHITECTURAL_KEYWORDS = [
  'design', 'strategy', 'architecture', 'audit', 'review',
  'refactor', 'redesign', 'migration', 'sharding', 'partitioning'
];

const CRITICAL_PHRASES = [
  /design\s+(?:a\s+)?sharding/i,
  /schema\s+migration/i,
  /redesign\s+(?:the\s+)?architecture/i,
  /security\s+audit/i,
  /database\s+(?:schema|sharding)/i,
  /distributed\s+(?:transaction|consistency)/i
];

function applySafetyBoost(classification, promptText) {
  const lower = promptText.toLowerCase();
  const hasKw = ARCHITECTURAL_KEYWORDS.some(k => lower.includes(k));
  const hasCritical = CRITICAL_PHRASES.some(re => re.test(promptText));
  
  const tier = classification.tier;
  const conf = classification.confidence || 0;
  
  // Critical phrase = always T3
  if (hasCritical && tier !== 'T3') {
    return {
      ...classification,
      tier: 'T3',
      model: 'claude-opus-4-8',
      provider: 'cloud',
      safety_boost_applied: true,
      safety_boost_reason: `critical_phrase_match: ${CRITICAL_PHRASES.find(re => re.test(promptText))}`,
      safety_boost_from: tier
    };
  }
  
  // Architectural keyword + T0/T1 + low confidence = upgrade to T2
  if (hasKw && (tier === 'T0' || tier === 'T1') && conf < 0.9) {
    return {
      ...classification,
      tier: 'T2',
      model: 'claude-sonnet-4-6',
      provider: 'cloud',
      safety_boost_applied: true,
      safety_boost_reason: `architectural_keyword + low_confidence (${conf})`,
      safety_boost_from: tier
    };
  }
  
  return { ...classification, safety_boost_applied: false };
}

module.exports = { applySafetyBoost, ARCHITECTURAL_KEYWORDS, CRITICAL_PHRASES };
```

### 3.3 Wire em `inject_context.js`

Após classify, antes de emitir hint:
```javascript
const { applySafetyBoost } = require('./safety_boost.js');
const classification = classify(prompt);
const boosted = applySafetyBoost(classification, prompt);
// resto do código usa `boosted` em vez de `classification`
```

### 3.4 Tests

`tools/router/tests/safety-boost.test.js` (NEW):

```javascript
const { applySafetyBoost } = require('../safety_boost.js');

test('MAJ-1 fix: "design a sharding strategy" → T3', () => {
  const cls = { tier: 'T0', model: 'qwen2.5:3b', confidence: 0.8 };
  const boosted = applySafetyBoost(cls, 'design a sharding strategy for the events table');
  expect(boosted.tier).toBe('T3');
  expect(boosted.safety_boost_applied).toBe(true);
  expect(boosted.safety_boost_reason).toMatch(/critical_phrase_match/);
});

test('architectural keyword + low confidence → T2 boost', () => {
  const cls = { tier: 'T1', model: 'haiku', confidence: 0.75 };
  const boosted = applySafetyBoost(cls, 'review this auth middleware');
  expect(boosted.tier).toBe('T2');
  expect(boosted.safety_boost_reason).toMatch(/architectural_keyword/);
});

test('high confidence T0 → not boosted (e.g., "summarize README")', () => {
  const cls = { tier: 'T0', model: 'qwen', confidence: 0.95 };
  const boosted = applySafetyBoost(cls, 'summarize the README');
  expect(boosted.tier).toBe('T0');
  expect(boosted.safety_boost_applied).toBe(false);
});

test('NO false-positive on casual mentions ("I designed it last week")', () => {
  const cls = { tier: 'T0', model: 'qwen', confidence: 0.95 };
  const boosted = applySafetyBoost(cls, 'check the colour I designed last week');
  expect(boosted.tier).toBe('T0');  // confidence high, NOT boosted
});

test('critical phrase always wins regardless of confidence', () => {
  const cls = { tier: 'T2', model: 'sonnet', confidence: 0.99 };
  const boosted = applySafetyBoost(cls, 'redesign the architecture for multi-tenant');
  expect(boosted.tier).toBe('T3');
});
```

## 4. Sub-feature 2 — Embedding examples reinforcement

Adiciona em `packages/router/src/embeddings/seed.json` (ou equivalente — confirma path) examples canónicos para o domain arquitectural. Mínimo 10 examples T3 com keywords críticos:

```json
{
  "text": "design a sharding strategy for the events table",
  "tier": "T3",
  "domain": "architecture",
  "confidence": 1.0,
  "added_by": "wave3.d1.safety_fix",
  "rationale": "MAJ-1 from W2.7 audit — must route to Opus for DB design"
}
```

Mais 9-14 examples similares (review architecture, security audit, migration strategy, distributed system design, etc.).

## 5. Sub-feature 3 — Regression test suite

`tools/router/tests/safety-regression.test.js` (NEW):

Golden set de 30+ prompts T2/T3 que devem NÃO ir para T0 (após safety_boost):

```javascript
const SAFETY_GOLDEN = [
  { prompt: 'design a sharding strategy for the events table', expected: 'T3' },
  { prompt: 'review the auth middleware for security holes', expected: 'T2' },
  { prompt: 'redesign the user model for multi-tenant', expected: 'T3' },
  { prompt: 'audit dependencies for known CVEs', expected: 'T2' },
  { prompt: 'migration plan from Postgres to ClickHouse', expected: 'T3' },
  // ... 25+ more
];

for (const { prompt, expected } of SAFETY_GOLDEN) {
  test(`safety regression: "${prompt}" → ${expected}`, () => {
    const cls = classify(prompt);
    const boosted = applySafetyBoost(cls, prompt);
    expect(boosted.tier).toBe(expected);
  });
}
```

## 6. Sub-feature 4 — Safety telemetry

No emit de `mooter_event` (sem mudar schema canónico — usa campo `metadata` ou similar JSON extensible):

```javascript
{
  ...existingFields,
  metadata: {
    ...existingMetadata,
    safety_boost_applied: boosted.safety_boost_applied,
    safety_boost_reason: boosted.safety_boost_reason || null,
    safety_boost_from: boosted.safety_boost_from || null
  }
}
```

`mooter trail --safety` (NEW flag) → mostra:
```
SAFETY BOOSTS (last 100 prompts)
  applied: 12 of 100 (12%)
  reasons:
    critical_phrase_match: 3
    architectural_keyword + low_confidence: 9
  upgrades:
    T0 → T2: 5
    T0 → T3: 3
    T1 → T2: 4
```

Tests para o trail --safety output.

## 7. Verification P11

```bash
git diff dev tools/router/classify.js
# DEVE retornar VAZIO (zero bytes changed)
```

Se mostrar qualquer diff → STOP CONDITION (P11 violado).

## 8. Tests aggregate

- Pre-W3 D1: CLI 72/72 (Wave 2.8 final)
- W3 D1: +30 (safety-boost) + 30 (safety-regression) + 5 (trail --safety) = +65
- Total: ~137 verdes

## 9. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave3-day1-safety-downgrade-fix vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11) — git diff dev tools/router/classify.js retorna VAZIO
- safety_boost.js: keywords sensatas (não false-positives demasiado agressivos)
- mooter_event schema INTACTO (só metadata extensível)
- MAJ-1 fix verificado: 'design a sharding strategy' → T3 com razão explícita
- Embedding seed: 10+ examples T3 architectural domain
- Regression golden: 30+ cases verdes
- trail --safety: counts correctos, sem inventar
- ~137 tests verdes
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 10. PR + auto-merge + tag

```bash
git push -u origin wave3-day1-safety-downgrade-fix
PR=$(gh pr create --base dev --title "Wave 3 Day 1: Safety downgrade fix (MAJ-1 + MAJ-2 from W2.7 audit)" --body-file - <<'EOF'
## Summary
Fix dos 2 majors do Wave 2.7 audit:
- **MAJ-1**: "design sharding strategy" T0→T3 via safety_boost critical_phrase
- **MAJ-2**: accuracy <90% T0↔T1 via architectural_keyword + low_confidence uplift

## P11 preserved
- classify.js byte-identical (verificado git diff)
- mooter_event schema INTACTO (só metadata extensível)

## Honesty
- safety_boost dá razão verificável + tier_from explícito
- Zero black-box decisions

## Tests
- ~137 verdes (72 W2.8 + 65 novos)
- Regression golden 30+ cases T2/T3
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog Wave 3
- Day 2: activation hub (depende de safety_boost estável)
- Day 3+: telemetry CF backend (per SHOWCASE_AUDIT Gap B)
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

# Auto-merge
sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 11. Closure D1

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck
git tag -a v0.3.0-safety-fix -m "Wave 3 D1: Safety downgrade fix (MAJ-1 + MAJ-2 from W2.7 audit) — P11 preserved"
git push origin v0.3.0-safety-fix
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave3_d1_shipped.md`.

## 12. Resumo final

```
✅ Wave 3 Day 1 — Safety Downgrade Fix COMPLETA
- Branch: wave3-day1-safety-downgrade-fix (merged)
- 4 sub-features: safety_boost · embedding seed · regression golden · trail --safety
- Tests: ~137 verdes
- Tag: v0.3.0-safety-fix
- P11 invariant: ✅ classify.js byte-identical
- MAJ-1 fixed: "design sharding strategy" → T3 (verified)
- MAJ-2 fixed: T0/T1 low-confidence + arch keyword → T2 uplift

⏸ Para. Wave 3 Day 2 (activation hub) precisa de novo kickoff do Cowork.
```

=== END ===
