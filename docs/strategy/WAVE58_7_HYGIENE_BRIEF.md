# Wave 58.7 — Matrix Coverage Honest + CLI CI Gap (Hygiene)

> Composto no Cowork 2026-06-14. Estimate **~1-1.5h CC**. Tag esperada `v1.38.7-matrix-coverage-honest`.
> Doctrine V4: `classify.js` sha `427d8c0b…` INTACTA, selective git adds, derive > hardcode.
> Origem: follow-ups confirmados no ship Wave 58.5/58.4.1 (trio stale-14 + gap CI).

## Objectivo
A expansão Wave 58.4 levou o roster de 14→17 modelos, mas 3 sítios ficaram a 14. Corrigir **derivando do roster** (não re-hardcodar) para nunca mais ficar stale, e fechar o gap CI que deixou isto passar.

**Denominador = 408 (17×24), CONFIRMADO por 3 fontes:**
- `specialization-matrix.ts` linha 5: comentário "17 models × 24 categories = 408".
- `specialization-matrix.ts` linha 247: engine já calcula `MATRIX_MODELS.length * TASK_CATEGORIES.length` (=408).
- statusline live: `Matrix: 17 mod × 24 cat · 14/408 measured`.

## Day-0 recon (VERIFICADO no Cowork — reconfirmar no CC)
- **Roster canónico:** `MATRIX_MODELS` (17) em `packages/router/src/specialization-matrix.ts` (linhas 63-82). Os **3 novos** (delta 14→17): `gemini-3-flash`, `deepseek-v4-pro`, `kimi-k2.6` (Wave 58.4, price-only, células vazias).
- **`TASK_CATEGORIES`** (24) exportado de `packages/router/src/task-categories.ts` (linha 60).
- **stale-14 #1** `packages/cli/src/commands/cost-perf.ts` linhas 433-434: `// 14 models × 24 categories = 336` + `const LOGICAL_CELLS = 14 * 24;`.
- **stale-14 #2** mesmo ficheiro linha 286: usage "N of **336** logical cells measured".
- **stale-14 #3** `packages/router/src/benchmark-fetcher.ts` linhas 70-85: type `ModelId` lista 14 (+ comentário "All 14 matrix models").
- **`cost-perf.test.ts`** assert `total_logical === 336` (a mudança que a PR β dropou de propósito por o source ser 336). Ao corrigir o source → o teste vai a 408.
- **CI gap:** `test.yml` é router-only (sem job `packages/cli`); `install-reliability.yml` cobre install.sh. As 16 falhas "pré-existentes" que o CC viu eram **Windows-only** — CI corre em ubuntu, provável verde. **Verificar na branch.**
- `cost-perf.ts` já importa de `packages/router/src/` (o `fetcher`/`benchmark-fetcher.ts`) → importar `MATRIX_MODELS`/`TASK_CATEGORIES` do mesmo sítio é consistente; são arrays puros ESM, sem native dep → bundle seguro.

## Allowlist explícito (este brief desbloqueia SÓ estes ficheiros)
- `packages/cli/src/commands/cost-perf.ts`
- `packages/cli/tests/cost-perf.test.ts`
- `packages/router/src/benchmark-fetcher.ts`
- `.github/workflows/test.yml`
- `docs/` (este brief / SYNC)
❌ NÃO tocar `classify.js`, nem outro engine file, nem `specialization-matrix.ts`/`task-categories.ts` (são a fonte da verdade — só leitura/import).

## Edits exactos

**E1 — `benchmark-fetcher.ts` ModelId 14→17.** Comentário "All 14 matrix models" → "All 17 (keep in sync with MATRIX_MODELS)". Adicionar ao union, na ordem do roster: `"gemini-3-flash"` (após `gemini-3.1-pro`), `"deepseek-v4-pro"` (após `deepseek-v3.2`), `"kimi-k2.6"` (após `minimax`).

**E2 — `cost-perf.ts` derive (self-healing).** Adicionar imports no topo:
```ts
import { MATRIX_MODELS } from "../../../router/src/specialization-matrix.ts";
import { TASK_CATEGORIES } from "../../../router/src/task-categories.ts";
```
Hoist uma constante de módulo (perto do topo, fora da função):
```ts
// Logical-cell denominator = full roster × categories (derives from the engine,
// never goes stale — Wave 58.7 fix after the 14→17 roster expansion).
const LOGICAL_CELLS = MATRIX_MODELS.length * TASK_CATEGORIES.length; // 17×24 = 408
```
Remover o `const LOGICAL_CELLS = 14 * 24;` local (linha 434) e o comentário "14 models × 24 = 336". A função passa a usar a constante de módulo.

**E3 — `cost-perf.ts` usage (linha 286).** Trocar o "336" literal por interpolação da constante: `(${LOGICAL_CELLS} logical cells measured)` — ou texto dinâmico equivalente. Sem números mágicos.

**E4 — `cost-perf.test.ts`.** `grep 336` no ficheiro e actualizar TODAS as ocorrências para **408** (o assert `total_logical === 336` → `408`; qualquer assert do texto usage "336" → 408). Confirmar 25/25 do ficheiro.

**E5 — `test.yml` job `cli-test` (fecha o gap CI).** Adicionar job novo (não tocar o job router existente):
```yaml
  cli-test:
    name: packages/cli unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install cli deps
        working-directory: packages/cli
        run: npm ci --no-audit --no-fund
      - name: Run cli tests
        working-directory: packages/cli
        run: npm test
```
⚠️ **Verificar verde na branch.** Se surgir vermelho, investigar se são as 16 falhas Windows-only (improvável em Linux) ou reais; corrigir ou documentar antes de merge.

## Scope: 1 PR ou 2?
**Recomendo 1 PR** (Wave 58.7): o job CI adicionado no mesmo PR **corre logo** os testes cli e prova o stale-14 fix verde em CI — máxima validação, scope coerente ("matrix coverage honest + cli CI"). Alternativa scope-split: PR A (E1-E4 source/test) + PR B (E5 CI). Decisão do Paulo no 1º stop.

## Ship flow (CC)
```bash
cd ~/frugal && git checkout main && git pull origin main
sha256sum tools/router/classify.js          # gate: 427d8c0b…
git checkout -b wave58_7_matrix_coverage_honest
# … aplicar E1-E5 …
( cd packages/cli && npm ci && npm test )    # gate: cost-perf.test.ts 408, matrix 17, 0 regressões
git add packages/cli/src/commands/cost-perf.ts packages/cli/tests/cost-perf.test.ts \
        packages/router/src/benchmark-fetcher.ts .github/workflows/test.yml
git commit -m "fix(wave58.7): matrix coverage denominator 336→408 (derive from roster) + cli CI job" \
  -m "cost-perf.ts LOGICAL_CELLS now derives MATRIX_MODELS.length×TASK_CATEGORIES.length (17×24=408, self-healing after Wave 58.4 14→17). ModelId union 14→17 (gemini-3-flash, deepseek-v4-pro, kimi-k2.6). New test.yml cli-test job closes the gap that let the stale-14 slip. classify.js sha 427d8c0b INTACT."
git push -u origin wave58_7_matrix_coverage_honest
gh pr create --base main --title "fix(wave58.7): matrix coverage honest (408) + cli CI gap" --body "…"
# STOP → confirmar CI verde (incl. novo cli-test job) antes do merge
gh pr merge --squash --delete-branch
git checkout main && git pull origin main
git tag v1.38.7-matrix-coverage-honest && git push origin v1.38.7-matrix-coverage-honest
gh release create v1.38.7-matrix-coverage-honest --generate-notes --title "v1.38.7 — matrix coverage honest"
```
`version.json` → 1.38.7 (tag de 3 componentes dispara `version-sync.yml`; ok, é mudança real de comportamento de cobertura).

## Gates
- `classify.js` sha INTACTA (não tocado).
- Só os ficheiros allowlisted (selective add).
- `npm test` cli verde local + **novo job CI verde na branch**.
- `npm audit` 0 (não regredir Wave 58.5).
- final-reviewer Opus SHIP antes do merge.
