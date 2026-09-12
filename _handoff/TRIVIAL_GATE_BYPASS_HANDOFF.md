# HANDOFF: Gate Bypass for Trivial Changes

**Date**: 2026-07-08  
**Issue**: 1-ícone removido (T0) demorou 15 minutos + $0.15-0.20 Opus gate  
**Root Cause**: T0 mudanças misturadas com T2+ (VSCode extension), forçando gates pesadas  
**Solution**: Deterministic trivial-bypass classifier (zero-LLM, local-only)

---

## O Problema Visualizado

```
USER: Deleta ícone em landing/page.tsx (1 linha)
      ↓
CC:   4 commits + PR + Ollama analysis + OPUS FINAL-REVIEWER gate + merge + deploy
      ↓
TIME: ~15 minutos
COST: ~$0.15-0.20 (Opus)
ROOT CAUSE: PR tinha landing (T0) + VSCode extension (T2+) juntos
```

### Timeline Real
| Ação | Tempo | Modelo | Custo |
|---|---|---|---|
| 4 commits selectivos | 1m | nenhum | $0 |
| Push + PR manual | 1m | nenhum | $0 |
| Análise Ollama | 1m | Ollama | $0 |
| **final-reviewer Opus** | **~2m** | **Opus** | **~$0.15-0.20** ❌ |
| Merge + Vercel deploy | 3m | nenhum | $0 |
| **TOTAL** | **~8m** | - | **~$0.15** |

### O que DEVERIA ter acontecido

```
USER: Deleta ícone
      ↓
CC:   trivial-bypass classifier detecta: 1 arquivo, 1 linha, não é dangerous
      ↓
      Auto: git add → git commit → git push → auto-merge → deploy
      ↓
TIME: ~20-30 segundos
COST: $0
```

---

## A Solução: Trivial-Bypass Classifier

Ficheiro criado: `tools/router/trivial-bypass.js`

### Como funciona

Deterministic rules (ZERO LLM calls):

```javascript
// Rule 1: Dangerous files ALWAYS require gates
if (isDangerousFile) return NOT_TRIVIAL;

// Rule 2: Single file, ≤5 lines changed = TRIVIAL
if (filesChanged === 1 && totalChanges ≤ 5) return TRIVIAL;

// Rule 3: Multiple trivial files (docs/tests only) = TRIVIAL
if (filesChanged ≤ 3 && allAreDocs) return TRIVIAL;

// Rule 4: Single commit, single file = TRIVIAL (even if up to 8 lines)
if (commitCount === 1 && filesChanged === 1) return TRIVIAL;
```

### Classificação

```bash
# Test it
$ node tools/router/trivial-bypass.js HEAD origin/main

Result: ❌ SUBSTANTIAL
Reason: 7 files, 219 insertions (threshold: ≤5 for 1 file)
Suggested action: NORMAL_FLOW (PR, review, gates)
Cost savings: None

---

# Vs trivial change
$ node tools/router/trivial-bypass.js feat/typo-fix origin/main

Result: ✅ TRIVIAL
Reason: SINGLE_FILE_TRIVIAL: "src/typo.js" changed 1 line
Suggested action: AUTO_MERGE_DEPLOY
Cost savings: $0.15-0.20 (skip Opus gate)
```

---

## Integração: 3 Caminhos

### Path A: GitHub Actions (Recomendado - Production-ready)

```yaml
# .github/workflows/trivial-gate-bypass.yml
name: Trivial Bypass Gate

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  classify:
    runs-on: ubuntu-latest
    outputs:
      is_trivial: ${{ steps.classify.outputs.is_trivial }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - name: Classify diff
        id: classify
        run: |
          RESULT=$(node tools/router/trivial-bypass.js HEAD origin/${{ github.base_ref }})
          echo "is_trivial=$(echo "$RESULT" | grep -q '✅ TRIVIAL' && echo 'true' || echo 'false')" >> $GITHUB_OUTPUT
          echo "$RESULT"
      
      - name: Auto-merge if trivial
        if: steps.classify.outputs.is_trivial == 'true'
        run: gh pr merge ${{ github.event.pull_request.number }} --auto --merge
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Path B: Git Hook (Instant Feedback - Local)

```bash
# .git/hooks/pre-commit
#!/bin/bash
RESULT=$(node tools/router/trivial-bypass.js HEAD origin/main)
if echo "$RESULT" | grep -q '✅ TRIVIAL'; then
  echo "✅ Trivial change detected — auto-commit approved"
  exit 0
else
  echo "⚠️  Substantial change — ensure PR review before push"
  exit 0  # Warning only, don't block
fi
```

### Path C: CLI Command (Manual but Fast)

```bash
# Before push:
$ mooter trivial-check

# Suggests:
AUTO_MERGE: Yes, this is trivial. 
STEPS:
  1. git push origin feat/icon-fix
  2. gh pr create --base main --fill
  3. gh pr merge --auto

OR just push and it auto-merges.
```

---

## Implementação Step-by-Step

1. **✅ Criado**: `tools/router/trivial-bypass.js` (classifier logic)
2. **✅ Testado**: `tools/router/trivial-bypass.test.js` (scenarios)
3. **TODO**: Integrar em GitHub Actions (Path A — recommended)
4. **TODO**: Adicionar comando `mooter trivial-check` ao CLI
5. **TODO**: Wir git hook no `.git/hooks/` (Path B — optional)

---

## Benefícios Esperados

| Métrica | Antes | Depois | Economia |
|---|---|---|---|
| Tempo deploy (T0 change) | 15 min | 20-30 seg | ~14.5 min / deploy |
| Custo Opus/deploy (T0) | $0.15-0.20 | $0 | 100% |
| Commits (T0 change) | 4 (ineficientes) | 1 (atomic) | 3 commits |
| Gates (T0 change) | 2 (Ollama + Opus) | 0 | 2 gates skipped |
| Annual savings (100 T0 changes/year) | $15-20 + ~1200 min | $0 + ~30 min | $15-20 + 1170 min |

---

## Guardrails (NEVER Skip)

Dangerous files sempre requerem full gates, mesmo se 1 linha:

```javascript
DANGEROUS_PATTERNS = [
  /^\.env/,
  /^package\.json$/,
  /^tsconfig/,
  /tools\/router\/classify\.js$/, // FROZEN classifier
  /\.github\/workflows/,
  /supabase\/migrations/,
];
```

---

## Para o CC: Checklist

- [ ] Revisar `tools/router/trivial-bypass.js` logic
- [ ] Testar contra real mudanças triviais
- [ ] Testar contra dangerous files (deve recusar)
- [ ] Integrar GitHub Action (Path A) se queres auto-merge
- [ ] Atualizar docs/CONTRIBUTING.md com workflow novo
- [ ] Comunicar à team: "Mudanças T0 agora auto-deploy"
- [ ] Monitor: track quantas mudanças são T0 vs T2+ (estimar economia real)

---

## Próximas Ondas

Quando isto estiver live:
1. Usar analytics para identificar padrões de T0 (typos, icon deletions, doc updates)
2. Agrupar T0 mudanças em batches (5 mudanças triviais = 1 commit, 1 deploy)
3. Considerar "commit squashing automático" para T0 chains

---

**Final Word**: Este projeto foi deployado hoje mesmo sem isto, mas o classifier está pronto. Implementação é decisão tua.
