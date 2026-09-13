# npm audit baseline — refeito 2026-09-13 (era de 2026-06-07, Wave 30 Phase I)

Gate policy: **block merge on any HIGH/critical** em cada perna da matriz do
`.github/workflows/security.yml`; moderates e lows registam-se aqui, não bloqueiam.

Medido a `npm audit --package-lock-only --json` em **todos os 14 `package-lock.json`**
versionados (`find . -name package-lock.json -not -path '*/node_modules/*'`), no commit que
refez este ficheiro. Número sem fonte não entra; onde não foi medido está `n/d`.

## Na matriz (8 pernas — bloqueiam)

| Perna | Critical | High | Moderate | Low | Entrou | Notas |
|---|---|---|---|---|---|---|
| `tools/router` | 0 | 0 | 0 | 0 | 2026-06-07 | js-yaml 4.3.1→4.3.2 (#489, transitivo via `@eslint/eslintrc`) |
| `packages/cli` | 0 | 0 | 0 | 0 | 2026-06-07 | js-yaml 4.3.1→4.3.2 (#489) — **entra no bundle** `mooter.js` |
| `hub` | 0 | 0 | 0 | 0 | 2026-06-07 | sharp 0.35.3→0.35.4 (#489); overrides com racional no `package.json` |
| `packages/router` | 0 | 0 | 0 | 0 | 2026-09-11 (#501) | `@dsnp/parquetjs` **pin exacto 1.8.8** — 1.9.3 é publish partido, 1.8.9 pede Node ≥24.18 |
| `packs` | 0 | 0 | 0 | 0 | 2026-09-11 (#504) | js-yaml 4.1.1→4.3.2 |
| `.` (raiz) | 0 | 0 | 0 | 0 | 2026-09-12 (#507) | só `@anthropic-ai/claude-agent-sdk`; 5 advisories, todos transitivos |
| `dashboard` | 0 | 0 | 0 | 0 | 2026-09-12 (#507) | next 15.5.15→15.5.25 (**2 RCE critical**); postcss por override |
| `landing` | 0 | 0 | 0 | 0 | 2026-09-13 | next 15.5.15→15.5.25 (#513, **mesmos 2 RCE**, superfície Vercel); vitest 2→5, `@vitest/ui` removido |

## Fora da matriz (6 lockfiles — não bloqueiam, medidos na mesma)

| Lockfile | Critical | High | Moderate | Low | Notas |
|---|---|---|---|---|---|
| `packages/mooter-bench` | 0 | 0 | 0 | 1 | |
| `packages/workflow` | 0 | 0 | 0 | 1 | |
| `design/tools` | 0 | 0 | 0 | 0 | |
| `mooter-package` | 0 | 0 | 0 | 0 | |
| `packages/mooter-bridge` | 0 | 0 | 0 | 0 | |
| `packages/vscode-extension` | 0 | 0 | 0 | 0 | |

**Resultado: 0 HIGH/critical e 0 moderate nos 14; 2 lows.** O `security.yml` verifica as
8 pernas em cada PR que toque `**/package.json`, `**/package-lock.json`, `packages/**`,
`hub/**`, `tools/router/**`, e às segundas 06:00 UTC.

## Como se chegou aqui (para não voltar atrás)

- Até 2026-09-11 (merge do #501) a matriz tinha **3** pernas, e a 2026-09-10 as 3 estavam
  vermelhas há dias sem ninguém ver: o audit não é check *required* na protecção do `main`. O `sharp` (hub) e o `js-yaml`
  (cli, router) eram duas causas distintas, não uma.
- Um pacote que ninguém audita **não fica verde, fica invisível**: `packages/router` tinha
  3 HIGH + 1 low fora da matriz; a `raiz` 2 HIGH; o `dashboard` 6 HIGH + **1 critical**;
  o `landing` 8 HIGH + **3 critical**. Nenhum aparecia em lado nenhum.
- O `landing` esteve fora da matriz de 2026-06-07 a 2026-09-13 «porque o toolchain do Next
  tem HIGH pré-existentes». Essa excepção foi tomada quando eram advisories de ferramentas;
  deixou de valer no dia em que o mesmo `next` passou a ter dois RCE não autenticados —
  e o `landing` é o que está em produção.
- Padrão fixado nos 6 PRs: o piso do range nomeia a versão que limpa o aviso; transitivo →
  lockfile-only; pin exacto quando as versões acima não servem (e diz-se porquê no
  `package.json`); nunca `npm audit fix --force` às cegas — no hub ele propunha um
  **downgrade** do wrangler.
- O que a régua não cobre: `packages/router` recebe `npm ci` no CI mas nunca `npm test`
  (3 falhas de ambiente pré-existentes); `landing` corre typecheck + lint + vitest no
  `landing-test.yml`; `dashboard` e `raiz` não têm teste em CI que exercite a dependência
  auditada (a raiz corre `test:handoff-preflight`, `test:cockpit-runner` e `test:guarda-home`,
  nenhum toca o SDK). O audit ao lockfile é a guarda; o comportamento prova-se localmente e fica escrito no PR.

## Histórico

- **2026-06-07 · Wave 30 Phase I** — matriz `[tools/router, packages/cli, hub]`, landing
  informacional. Registava 0 HIGH nos 3 e «SC-2: brace-expansion (router) + 3 hub moderates».
- **2026-09-11 · #489** (aberto a 10, fundido a 11) — hub sharp; js-yaml em cli, router e tools/router.
- **2026-09-11 · #501, #504** — packages/router e packs entram; `benchmark-libs.test.ts`.
- **2026-09-12 · #507** — raiz e dashboard entram; 2 RCE fechados no dashboard.
- **2026-09-13 · #513 + este** — landing: runtime (2 RCE em produção) e depois toolchain;
  landing entra na matriz; job informacional removido; este ficheiro refeito.
