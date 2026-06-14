# Wave 58.5 + 58.4.1 — Ship Commands (Claude Code)

> Composto no Cowork (2026-06-14). O Cowork **não consegue** shipar (sem GitHub MCP, sem `gh`,
> sem push auth, terminal-typing bloqueado tier "click"). Corre **isto no Claude Code**, que tem
> git auth + shell nativo. Lê os gates antes de colar.

## Invariantes (não violar)
- `classify.js` sha **`427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`** — NÃO tocar (CI-enforced).
- `packages/*` engine **FROZEN** — só `packages/cli/` é permitido nesta wave.
- **Selective `git add`** — só os ficheiros listados. Nunca `git add -A`.
- 2 PRs separadas (scope-split): α = package files · β = test files.

## Estado esperado do working tree (4 ficheiros modificados)
```
 M packages/cli/package.json          # esbuild ^0.24.0→^0.28.1 + overrides + _overrides_rationale
 M packages/cli/package-lock.json     # regenerado com overrides
 M packages/cli/tests/matrix.test.ts  # 14→17 models (3 edits)
 M packages/cli/tests/cost-perf.test.ts  # 336→408 + FIX truncation (já reparado no Cowork)
```
> ⚠️ O `cost-perf.test.ts` foi reparado na sessão Cowork (a edição anterior truncou o último teste →
> `Unterminated regular expression` na linha 247). O ficheiro real já está correcto. **Confirma com
> `git diff` antes de commitar.**

---

## BLOCO 0 — Recon (gate obrigatório)
```bash
cd ~/frugal            # Windows: cd C:\Users\Paulo Loureiro\frugal

# sha gate — TEM de imprimir 427d8c0b...
sha256sum tools/router/classify.js

git fetch origin
git status --short
git branch --show-current
git rev-parse --short HEAD          # esperado: 0463b47 (ou main já à frente)

# Se sobrou branch de sessão anterior, apaga-o (os 4 ficheiros vivem no working tree de main):
git branch -D wave58_5_cli_audit_fix 2>/dev/null || true
git branch -D wave58_4_1_hotfix_matrix_tests 2>/dev/null || true

# Garante que estás em main com os 4 ficheiros modificados:
git checkout main
```

---

## BLOCO A — PR α · Wave 58.5 (CLI npm audit HIGH → 0)
```bash
git checkout -b wave58_5_cli_audit_fix

# add SELECTIVO — só os 2 package files (deixa os 2 test files no working tree p/ a PR β)
git add packages/cli/package.json packages/cli/package-lock.json

# GATE: audit limpo
( cd packages/cli && npm audit )           # esperado: found 0 vulnerabilities

git commit \
  -m "chore(wave58.5): packages/cli npm audit HIGH to 0 vulnerabilities" \
  -m "esbuild override ^0.28.1 clears 3 HIGH advisories (GHSA-67mh-4wv8-2f99, GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr). Reaches tree via tsx (dev runtime + tests) and direct devDep. Dev-only, not in bundled mooter.js. Pattern Wave 58.3 D.2. classify.js sha 427d8c0b INTACT."

git push -u origin wave58_5_cli_audit_fix

gh pr create --base main --head wave58_5_cli_audit_fix \
  --title "chore(wave58.5): packages/cli npm audit HIGH → 0" \
  --body "Override \`esbuild ^0.28.1\` clears 3 HIGH advisories (GHSA-67mh-4wv8-2f99, GHSA-gv7w-rqvm-qjhr, GHSA-g7r4-m6w7-qqqr). Dev-only (tsx + devDep), não entra no bundle \`mooter.js\`. Padrão Wave 58.3 D.2. \`classify.js\` sha 427d8c0b INTACT. \`npm audit\` → 0 vulnerabilities."

# aguarda CI verde, depois:
gh pr merge wave58_5_cli_audit_fix --squash --delete-branch

# release
git checkout main && git pull origin main
git tag v1.38.5-cli-audit-fix
git push origin v1.38.5-cli-audit-fix
gh release create v1.38.5-cli-audit-fix --generate-notes --title "v1.38.5 — CLI audit fix"
```

---

## BLOCO B — PR β · Wave 58.4.1 (matrix tests 14→17 + truncation fix)
> Depende de α merged. `git pull` traz o α para main; os 2 test files continuam no working tree.
```bash
git checkout main && git pull origin main
git checkout -b wave58_4_1_hotfix_matrix_tests

# CONFIRMA o fix da truncation antes de commitar (deve mostrar /[Mm]anual|A\.16|no network/ + fecho }):
git diff packages/cli/tests/cost-perf.test.ts | tail -20

# add SELECTIVO — só os 2 test files
git add packages/cli/tests/matrix.test.ts packages/cli/tests/cost-perf.test.ts

# GATE: suite verde a 100% (era 591/1-fail por causa da truncation)
( cd packages/cli && npm test )            # esperado: # pass 592  # fail 0

git commit \
  -m "test(wave58.4.1): update matrix tests 14 to 17 models (Wave 58.4 expansion catch-up)" \
  -m "matrix.test.ts rows 14→17 (3 asserts); cost-perf.test.ts cells 336→408. Also repairs truncated final test (Unterminated regex at cost-perf.test.ts:247) left by prior session — restores /[Mm]anual|A\\.16|no network/ + closing. npm test 592/592 green. classify.js sha 427d8c0b INTACT."

git push -u origin wave58_4_1_hotfix_matrix_tests

gh pr create --base main --head wave58_4_1_hotfix_matrix_tests \
  --title "test(wave58.4.1): matrix tests 14→17 + cost-perf truncation fix" \
  --body "Catch-up à expansão Wave 58.4: matrix rows 14→17, cost-perf cells 336→408. Repara também o ficheiro \`cost-perf.test.ts\` truncado (Unterminated regex linha 247) deixado por sessão anterior. \`npm test\` 592/592. \`classify.js\` sha 427d8c0b INTACT."

gh pr merge wave58_4_1_hotfix_matrix_tests --squash --delete-branch

git checkout main && git pull origin main
git tag v1.38.4.1-matrix-tests-hotfix
git push origin v1.38.4.1-matrix-tests-hotfix
gh release create v1.38.4.1-matrix-tests-hotfix --generate-notes --title "v1.38.4.1 — matrix tests hotfix"
```

---

## Se não tiveres `gh` instalado
`winget install GitHub.cli` (Windows) ou `sudo apt install gh` (WSL Ubuntu), depois `gh auth login`.
Em alternativa: faz `git push` (auth nativa do Claude Code) e abre/merge a PR + release pela web UI do GitHub.

## Pós-ship (sync runtime, do CLAUDE.md)
Se algo tocasse `tools/router/` corre `/mooter-update` — **não toca aqui** (só `packages/cli/`), por isso não é preciso.
