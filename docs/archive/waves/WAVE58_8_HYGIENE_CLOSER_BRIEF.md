# Wave 58.8 — Hygiene Closer (test-only)

> Composto no Cowork 2026-06-14. Estimate **~30-45min CC**. **Test-only → sem version bump / sem release** (lean; ou tag leve `v1.38.8` se preferires tag-every-wave). Doctrine V4: `classify.js` sha `427d8c0b…` INTACTA, selective adds.
> Fecha os 2 follow-ups que o ship 58.7 deixou.

## Objectivo
Dois fixes de teste pequenos, ambos surgidos no ship 58.7:
1. Reparar (guard) o `security.test.ts` "when sandbox is present" — para o cli-test CI ficar 100% sem skip.
2. Tornar o `cost-perf.test.ts` **self-healing** (derivar o esperado do roster) — mata de vez a classe de bug roster→teste.

## Day-0 recon (VERIFICADO no Cowork — reconfirmar no CC; o mount pode estar stale pós-merges)

**`packages/cli/tests/security.test.ts` (linha 19):**
```ts
test("security audit renders 4 layers and exit 0 when sandbox is present", () => {
  const r = runSecurity(["audit"], { env: {}, home: fakeHome(true) });
  assert.ok(r.output.includes("Layer 1"));
  assert.ok(r.output.includes("Layer 4"));
  // On a host with bwrap, network/fs layers pass → no FAIL → exit 0.
  assert.strictEqual(r.exitCode, 0);
});
```
**Causa:** o teste assume `bwrap` (bubblewrap) presente no host → exit 0. Em CI ubuntu / Windows **sem** bwrap, o audit reporta FAIL correctamente → exit ≠ 0 → o teste falha (em ambos os SOs). É o teste que está mal-guardado, não o produto. Foi skipado na 58.7 (`--test-skip-pattern` no job cli-test do `test.yml`).

**`packages/cli/tests/cost-perf.test.ts`:** após a 58.7 asserta `total_logical === 408` **literal**. O source `cost-perf.ts` já deriva 408 do roster — mas o teste não. Uma mudança de roster em `packages/router/src/specialization-matrix.ts` partiria o teste. `matrix.test.ts` já importa de `../../router/src/` (precedente).

## Allowlist explícito
- `packages/cli/tests/security.test.ts`
- `packages/cli/tests/cost-perf.test.ts`
- `.github/workflows/test.yml` (remover o skip-pattern do security test, agora redundante)
❌ NÃO tocar source nenhum, nem `classify.js`, nem o roster.

## Edits exactos

**F1 — guard `security.test.ts` (skip condicional em bwrap).** Adicionar helper no topo:
```ts
import { execSync } from "node:child_process";
function hasSandbox(): boolean {
  try { execSync("command -v bwrap", { stdio: "ignore" }); return true; }
  catch { return false; }
}
```
E guardar SÓ o teste dependente de sandbox (Node test runner suporta `{ skip }`):
```ts
test("security audit renders 4 layers and exit 0 when sandbox is present",
  { skip: hasSandbox() ? false : "no bwrap on this host (sandbox absent)" },
  () => { /* corpo inalterado */ });
```
Assim corre (e asserta exit 0) só quando há sandbox — coerente com o nome. Sem sandbox → skip honesto, não falha. (Windows: bwrap inexistente → skip.)

**F2 — `cost-perf.test.ts` self-healing.** Importar o roster e derivar o esperado:
```ts
import { MATRIX_MODELS } from "../../router/src/specialization-matrix.ts";
import { TASK_CATEGORIES } from "../../router/src/task-categories.ts";
// …
assert.equal(parsed.total_logical, MATRIX_MODELS.length * TASK_CATEGORIES.length);
```
Substituir o `408` literal (e o comentário "17×24=408") por esta derivação. O teste passa a auto-tracking — nenhuma mudança de roster o parte. (Confirmar o caminho relativo `../../router/src/` que o `matrix.test.ts` já usa.)

**F3 — `test.yml`:** remover a entrada do security test do `--test-skip-pattern` do job `cli-test` (já self-guarded por F1). Manter os outros skips se existirem.

## Gates
- `classify.js` sha INTACTA (não tocado).
- `( cd packages/cli && npm test )` verde local (cost-perf 25/25, security agora skip-ou-pass conforme host, matrix 20/20).
- **CI cli-test verde SEM skip-pattern do security** (prova que F1 guardou bem).
- Só os 3 ficheiros allowlisted (selective add).
- final-reviewer Opus SHIP.

## Ship flow (CC)
```bash
cd ~/frugal && git checkout main && git pull origin main
sha256sum tools/router/classify.js          # gate 427d8c0b…
git checkout -b wave58_8_hygiene_closer
# … F1, F2, F3 …
( cd packages/cli && npm test )
git add packages/cli/tests/security.test.ts packages/cli/tests/cost-perf.test.ts .github/workflows/test.yml
git commit -m "test(wave58.8): guard security sandbox test + self-healing cost-perf coverage" \
  -m "security.test.ts: skip 'sandbox present' test when bwrap absent (was failing on bwrap-less hosts; remove its cli-test skip-pattern). cost-perf.test.ts: derive total_logical from MATRIX_MODELS.length×TASK_CATEGORIES.length (self-healing; survives roster changes). Test-only. classify.js sha 427d8c0b INTACT."
git push -u origin wave58_8_hygiene_closer
gh pr create --base main --title "test(wave58.8): hygiene closer — sandbox guard + self-healing coverage" --body "…"
# STOP → confirmar cli-test verde sem skip-pattern antes do merge
gh pr merge --squash --delete-branch
```
**Release:** test-only → **lean skip** (sem version bump). Se quiseres tag-every-wave, `v1.38.8-hygiene-closer` (3 componentes → version-sync bumpa version.json; só se aceitares o bump por test-only).

## Scope: 1 PR
Os 2 fixes são test-only e pequenos → 1 PR ("test hygiene"). Sem source change, sem risco cruzado.
