# ADR 016 — TypeScript stack para o subsistema `packs/`

**Date**: 2026-05-28 (Wave 1, Day 1)
**Status**: 🟡 Proposed
**Owner**: Paulo Loureiro
**Wave**: 1 (Pastor)
**Reviewer**: final-reviewer (Opus + cache)
**Related**: ADR 015 (sub-decisão deste); `packs/package.json`; `packs/tests/schema.test.ts`; PASTOR §8 Day 3–5

---

## Contexto

O Day 1 da Wave 1 (ADR 015) exige um teste que valide `packs/pack.schema.yaml` e um pack mock contra o contrato. Ao implementar, o repo revelou-se sem infra de testes para este subsistema:

- **Sem `package.json` na raiz** (o repo não é um projecto npm monolítico) nem em qualquer subdir até depth 4.
- **Sem TypeScript, sem `node_modules`, sem `js-yaml`.** `yamllint`/`yq` ausentes; só `python3` + PyYAML global.
- Node 20.20 **não** faz strip de `.ts` nativo (só 22.6+), pelo que `node --test foo.test.ts` não corre sem loader.

O Master Prompt de Day 1 assumia `schema.test.ts` + `yamllint` — ferramentas que este repo não tem. Era preciso decidir o stack de teste, sabendo que **a decisão propaga-se**: PASTOR §8 prevê ficheiros `.ts` nos dias seguintes (`classify_domain.ts` Day 3, alterações a `inject_context` Day 4, `pack.ts` CLI Day 5).

## Decisão

Introduzir um **stack TypeScript mínimo, scoped ao subsistema `packs/`**:

1. **`packs/package.json` local** (`@mooter/packs`, `private`, `type: module`) — **não** se cria um `package.json` na raiz do repo; a infra fica isolada na pasta do subsistema.
2. **devDeps mínimas**: `tsx` (loader/runner TS, sem build step), `js-yaml` (parser YAML), `@types/node` + `@types/js-yaml`.
3. **Sem framework de teste** — continua-se a usar o runner nativo `node:test` (convenção já presente em `tools/router/*.js`), executado via `tsx --test`.
4. Script: `"test": "tsx --test tests/*.test.ts"` (relativo a `packs/`, onde o `package.json` vive).
5. `node_modules/` já está no `.gitignore` (linha 1); `packs/package-lock.json` **é** versionado.

## Alternativas consideradas

| # | Alternativa | Avaliação | Decisão |
|---|---|---|---|
| A | JS puro + PyYAML (zero-dep) | Corre já, sem deps; mas o teste seria `.js`, divergindo da direcção `.ts` de Day 3–5; migrar a meio da Wave seria mais sujo | ❌ Rejeitado |
| B | JS puro com parser YAML *vendored* | Zero deps e sem python, mas parser frágil em YAML não-trivial (timestamps, blocos `|`) | ❌ Rejeitado |
| C | `package.json` na **raiz** do repo + stack global | Maior blast radius; torna o repo inteiro um projecto npm que não era; toca config partilhada além do necessário | ❌ Rejeitado |
| D | **Stack TS mínimo scoped a `packs/`** | Cumpre a direcção TS do projecto; isola a infra ao subsistema; instala-se uma vez com o ADR a documentar, em vez de migrar a meio | ✅ **Escolhido** |

## Consequências

**Positivas**
- ➕ Alinhado com a direcção do projecto: Day 3–5 criam `.ts` e reutilizam este stack sem nova decisão.
- ➕ **Isolamento**: a infra npm vive só em `packs/`; o resto do repo permanece sem `package.json` na raiz.
- ➕ Sem build step — `tsx` corre `.ts` directamente; DX simples (`cd packs && npm test`).
- ➕ Lockfile versionado → builds reprodutíveis.

**Negativas / custos**
- ➖ Introduz `node_modules` (ignorado) e 4 devDeps onde antes havia zero. Mitigação: scoped a `packs/`, devDeps mínimas, sem framework de teste.
- ➖ Desvia da letra do Master Prompt (`yamllint`): a validação YAML de linha-de-comando passa a usar `python3 -c "import yaml; yaml.safe_load(...)"` (PyYAML disponível) em vez de `yamllint`.

## Status

**Proposed.** Aplicado no Day 1; a re-confirmar quando o Day 3 (`classify_domain.ts`) e Day 5 (`pack.ts`) reutilizarem o stack.
