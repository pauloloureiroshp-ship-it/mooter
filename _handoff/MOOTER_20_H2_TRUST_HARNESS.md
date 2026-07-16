# ⇄ CC → COWORK · MOOTER 2.0 · H2 — Live Preview TRUST HARNESS · spec

```
⇄ MOO HANDOFF · H2 Live Preview Trust Harness · 2026-07-16
STATE:    awaiting-you        ← spec pronta; aprovação do Paulo antes de virar wave (pós-F1)
WORKTREE: ~/frugal · chore/mooter-20-h0 @08575b4 · 1 ahead of origin/main · UNPUSHED ⚠
GATE:     read-only ✓ · zero código ✓ · testes LP executados de verdade: 687/687 ✓ ·
          suite completa 1393/1394 (1 platform-skip) ✓ · classify.js sha intacto ✓
WORK:     0 ficheiros alterados nesta fase (spec pura)
NEXT:     Paulo aprova a spec → vira wave de implementação (2 ficheiros novos + 1 workflow)
⇄ END
```

---

## 0. 🚩 A conclusão que muda o problema

**O Live Preview não tem um problema de código. Tem um problema de CI.** Verificado nos ficheiros:

- `.github/workflows/test.yml:6-15` filtra paths para `tools/router/**` e `packages/cli/**`. Só isso.
- O **único** workflow que corre testes da extensão é `.github/workflows/publish-cockpit.yml:6`, e dispara
  em `push: tags: ['cockpit-v*']` — os testes correm **depois** da decisão de shipar.
- Nenhum workflow tem `packages/vscode-extension/**` nos paths de `pull_request`.

> **Um PR pode partir os 687 testes do Live Preview e o CI fica verde.**

A desconfiança do Paulo não é paranoia — é a leitura correcta de um gate que não existe. **É isso que o
H2 tem de fechar, e não escrever mais testes.**

## 0.1 Duas premissas do masterprompt que não sobreviveram

| Premissa | Realidade medida |
|---|---|
| "os 68/68 testes COH existentes são a base" | **Errado por ~10×.** Executado: `node --test src/lp-*.test.js` → **546/546**. Union LP (a definição das próprias auditorias): **687/687**. Suite completa: **1394 testes, 1393 pass, 1 skip, 0 fail** (127,9s). Os `318+111=429` da auditoria eram verdade na `0.16.66`; a árvore está na `0.16.78` — a suite **cresceu**. |
| as auditorias justificam desconfiança no código | **COH-01 — o P0 que fez a auditoria dizer NO-GO — está FECHADO.** Commit `e2924ce` ("transactional identity lease (origin↔servedRoot↔epoch)"), 15 testes em `lp-lease-host.test.js`. COH-02/06/07/08/09/10 também têm ficheiros de teste aterrados. |

---

## 1. Proof set — 7 provas (5 validadas, 2 acrescentadas por evidência, 0 largadas)

| # | Prova | Finding que a sustenta | Como é asserida | Ficheiro |
|---|---|---|---|---|
| **P1** | **Lease de origem** — swap de origem anula root+seleção, sobe epoch; origem nova bloqueada até `lp-ready` fresco; escrita de epoch antigo recusada; HMR same-origin sobrevive (controlo negativo); `tree:'unknown'` nunca ausente | **COH-01 (P0)** `LP_COHERENCE_AUDIT_REPORT.md:51`, §6:148-168; **COH-04** `:54` | 6 testes nomeados, inclui race de epoch adversarial | `src/lp-lease-host.test.js:95,114,130,195,208,221,290` |
| **P2** | **SHA-guard no undo/revert** — undo sha-gated; escrita externa → `undo-stale`, nada escrito; árvore mudou → `preview-tree-mismatch`; apply sem hash de preview → `bad-request` | ⚠️ **Sem finding aberto.** É *invariante* certificado (`:360`). **Isto é um lock de regressão, não um fix** — dito honestamente | 5 testes nomeados | `src/live-edit-undo.test.js:24,125,168`; `src/lp-edit-host.test.js:63,81,119` |
| **P3** | **Security fail-closed** — sem scan → `security-scan-required`; falhado → `security-scan-failed`; stale → `security-scan-stale`; Critical → `critical-open`; `overrideCritical` **ignorado**; npm-audit prod critical → `critical-open`. Todos asserem "nunca faz spawn" | **D6 (P0)** `LP_CODEX_AUDIT_REPORT.md:127`; override `:131` | 6 testes, cada um assere `r.reason` + ausência de spawn | `src/lp-publish-host.test.js:828,841,855,868,892,905` |
| **P4** | **Publish só com aceite explícito** — payload forjado não autoriza ficheiros paralelos nem sujidade pré-existente no mesmo path; gate de aprovação global; deploy exige commit imutável pushed + lease de identidade Vercel | **D6 (P1)** `LP_CODEX_AUDIT_REPORT.md:131`; **COH-10** `:60` | 5 testes nomeados | `src/lp-publish-host.test.js:170,553,627,654,681` |
| **P5** | **Zero escrita fora do preview path** — servedRoot irmão/nulo recusa em `_applyEdit`/`_deleteNode`/`_promptApply`/`_taskRun`; `_promptEdit` recusa **antes de enviar bytes do nó**; regressão do incidente twin-worktree assere alvo **byte-idêntico** | **COH-01** §6:164 ("pode editar o workspace enquanto o iframe mostra outra aplicação"); D2 `:74` | 9 testes nomeados | `src/lp-tree-host.test.js:134,145,156,165,211,233,244,253,265` |
| **P6** ➕ | **Honestidade da telemetria** — evento cloud/agent nunca `local:true`; `local:false` inferido do tier cloud; deploy nunca local; fase do ciclo viaja no evento | **COH-08 (P1)** `:58` — *"a narrativa de custo/modelo fica materialmente falsa"* | 4 testes | `src/lp-routing-host.test.js:47,59,65,75,82` |
| **P7** ➕ | **Revalidação do lease no Ask→Apply** — askId desconhecido/expirado recusa; payload adulterado ignorado (compõe do Q+A **armazenado**); one-shot | **COH-07 (P1)** `:57` | 4 testes | `src/lp-ask-apply-host.test.js:59,82,108,123` |

**Porque P6/P7 entraram (evidência, não gosto):** o P7 é o **único write path cujo id vem do webview** —
sem ele o lease do P1 tem bypass, e um P1 verde **exageraria** a segurança. O P6 porque a desconfiança do
Paulo é sobre **ser enganado**: um harness que fica verde enquanto a UI reporta um edit do Opus como
"local · $0" (COH-08) **não ganha confiança**. **Nada foi largado** — as 5 provas nomeadas têm todas
finding a sustentá-las.

---

## 2. Spec do harness

**Blast radius: 2 ficheiros novos + 1 workflow novo + 1 linha no `package.json` da raiz. Zero ficheiros
de teste ou de engine tocados.**

| Ficheiro | Papel |
|---|---|
| `tools/lp-trust-proofs.json` | manifesto declarativo: proof id → `{name, backing, files, match, minCount}` |
| `tools/lp-trust-harness.js` | orquestrador, Node ≥22, **sem deps novas** |
| `.github/workflows/lp-trust.yml` | workflow novo — **não alargar o `test.yml`**: o job dele instala deps do router e carrega a semântica do classify congelado; a extensão precisa do seu `npm ci` |
| `package.json` (raiz) | `+ "lp:trust": "node tools/lp-trust-harness.js"` |

**Invocação** — local: `npm run lp:trust` (flags `--json`, `--proof=P3`, `--no-receipt`).
CI: `lp-trust.yml` em `pull_request` + `push: main` + `workflow_dispatch`; paths
`packages/vscode-extension/**`, `landing/app/_components/lp-error-tap.ts`, `tools/lp-trust-*`.

| Estágio | Acção | Falha quando |
|---|---|---|
| S0 | `sha256(tools/router/classify.js)` vs `.sha256` (espelha `test.yml:80-92`) | mismatch |
| S1 | `npm ci --no-audit --no-fund` em `packages/vscode-extension` | erro de install |
| S2 | `node --test --test-reporter=json` sobre a **união de ficheiros do manifesto** (lista explícita, não glob) | runner rebenta |
| S3 | parse do reporter JSON → `testName → {status, file, durationMs}` | não parseia |
| S4 | **Assert anti-apodrecimento**: por prova, match por regex + `minCount` | testes da prova **ausentes** → `proof-unbacked` |
| S5 | Política de skip: skip dentro do proof set falha, salvo allowlist no manifesto com `{reason, platform}` | skip não-allowlisted |
| S6 | Escreve recibo `_handoff/live-preview/trust-receipt.json` (gitignored) | escrita falha |
| S7 | Exit 0/1 | — |

**Verde = tudo:** zero testes a falhar no proof set · cada prova cumpre `minCount` · zero skips
não-allowlisted · sha do classify intacto · recibo escrito. **Recibo que não se consegue escrever = sem
confiança ⇒ fatal.** Allowlist conhecida: `host-extra-git.test.js:344` `{skip: platform === 'win32'}` —
condicional de plataforma, corre no ubuntu do CI.

> **O anti-apodrecimento é o ponto todo:** o gate não são os testes verdes — é **a existência da prova**.
> Apagar `lp-lease-host.test.js` hoje deixa o CI **mais verde**. Sob o harness, falha `proof-unbacked`.

**Schema do recibo:** `{schema:1, generatedAt, commit:<git rev-parse HEAD>, extensionVersion:"0.16.78",
status:"green"|"red", proofs:{total:7,green:N}, tests:{total,pass,fail,skipped}, durationMs,
proofDetail:[{id,name,backing,status,tests:[]}]}`. No CI, também `actions/upload-artifact`.

Runtime esperado: ~45s local (subset), bem dentro do budget vs os 128s da suite completa.

---

## 3. Spec do recibo na UI

**Fonte:** `_handoff/live-preview/trust-receipt.json` (local, gitignored — **nunca commitado: um recibo
commitado é uma alegação stale**).

**Host:** `extension.js` lê o recibo e injecta-o no **mesmo payload de estado que já leva `readiness`**.
Regra de staleness **reutiliza o conceito de scan-staleness do D6 verbatim**: se
`receipt.commit !== git rev-parse HEAD` → não é verde.

**Render:** `packages/vscode-extension/src/lp-sidebar-view.js` › `renderHeader()` na **:644**, ao lado dos
nós `health`/`health-label` existentes (**:647-652**).

| Condição | Chip | Tom |
|---|---|---|
| verde ∧ commit == HEAD | `LP: último E2E verde 2026-07-16 · 7/7 provas` | ready |
| commit != HEAD | `LP: E2E desatualizado (2026-07-16 · 7/7) — HEAD mudou` | amber |
| status red | `LP: E2E vermelho 2026-07-16 · 5/7 provas` | error |
| recibo ausente | `LP: sem E2E nesta árvore` + acção | neutral |

Regras: **nunca fabricar verde** (ausente ≠ verde — a lição exacta do D6 "sem scan"); `esc()` em todos os
campos; **zero paths absolutos do host** (espelha `lp-security-host.test.js:106`); clique → corre
`npm run lp:trust`. Ficheiro novo `src/lp-trust-receipt.test.js` assere os 4 estados + ausência de leak de
path.

---

## 4. ♻️ REUSE gate — contagens VERIFICADAS

**A alegação dos "68/68" é falsa. Não encontrei 68 em lado nenhum.** Executado nesta árvore:

```
node --test src/lp-*.test.js                    → 546 testes · 546 pass · 0 fail · 38,6s
node --test src/{live-preview-runtime,live-edit-context,live-edit-task,
                 live-edit-cloud,live-preview-view,webview-syntax}.test.js
                                                → 141 testes · 141 pass · 0 fail · 5,0s
node --test src/*.test.js  (completa)           → 1394 testes · 1393 pass · 0 fail · 1 skip · 127,9s
```

- **Union LP (a definição das próprias auditorias): 687/687 verde** (546 + 141)
- **Suite completa da extensão: 1393/1394 verde**, 1 platform-skip · 90 ficheiros `*.test.js`

**O harness reescreve zero testes.** Consome o reporter JSON do `node --test` e assere *sobre* os testes.
A única superfície nova de assert é o manifesto. Proof set ≈ **39 testes nomeados** — subconjunto estrito
dos 687.

---

## 5. Objeção mais forte a esta spec — e como se resolveu

**A objeção:** o manifesto pina **nomes de teste**, criando uma segunda fonte de verdade que deriva. Um
rename parte o CI, o que cria pressão para afrouxar o manifesto até não asserir nada — e o harness apodrece
em teatro. Pior: **o P2 (SHA-guard) não tem finding ID estável nos nomes dos testes** (ex.: `'applyUndo
round-trips any single-splice write and is sha-guarded'`), logo é a prova mais frágil e a primeira a ser
afrouxada.

**Resolução:** fazer match nos **finding IDs da própria auditoria, já embebidos nos nomes dos testes** —
`C0/COH-01:`, `COH-07:`, `COH-08:`, `D6 `, `G2 ` — e não em frases inteiras. Esses prefixos são a parte
estável; a prosa a seguir fica livre de mudar. Cada prova declara `minCount`, por isso **apagar continua a
falhar enquanto renomear continua livre**. Para o P2, onde não há ID, fazer match por
`file + /sha-guarded|undo-stale|preview-tree-mismatch|bad-request/ + minCount:5` em vez de editar os
títulos dos testes — mantendo o REUSE gate intacto (o harness não toca em nenhum ficheiro de teste).

**Risco residual, dito com todas as letras:** o P2 é apanhado por regex de comportamento, logo um rename
suficientemente determinado ainda consegue escapar-lhe. É uma fraqueza **conhecida e limitada a 1 das 7
provas** — e fica **visível no manifesto** em vez de escondida num hábito.

**UNVERIFIED / fora de âmbito:** `landing/app/_components/lp-error-tap.ts` não tem prova neste set — os
testes dele vivem em `landing/` (`landing-test.yml`), que não executei. Comportamento GUI/visual, fluxos
live de Ollama/Agent-SDK/Vercel, e o estado remoto do PR #245 continuam por verificar, exactamente como as
duas auditorias já diziam.

---

## Rodapés

`CCA: n/d` — os 5 critérios do CCA-F não estão definidos em lado nenhum citável neste repo
(`AUDIT_CCA.md` não existe; o único doc com critérios tem **10**, não 5). Regra de ouro do
`PERFECT_HANDOFF_SPEC.md:95`: *"Quando incerto → 'n/d', nunca palpite."*

`🔍 council n/d · objeção mais forte: o manifesto cria 2ª fonte de verdade que deriva; renames partem o CI
e a pressão afrouxa-o até virar teatro — e o P2 é o elo frágil por não ter finding ID · resolvida: match
por finding-ID prefix (estável) em vez de frase, + minCount por prova (apagar falha, renomear não), + P2
por regex de comportamento com o risco residual declarado no manifesto em vez de escondido.`
As 8 perguntas do pre-dispatch red-team gate **não estão no vault** — `00-core/reasoning-protocol.md`
(Axioma 4) remete para uma memória do Cowork inacessível a esta sessão. Corridos os 5 checks nomeados no
Axioma 4: advogado do diabo ✓ · fontes/freshness ✓ (números re-executados, não citados) · colisão com
trabalho em voo ✓ · custo/reversibilidade ✓ (zero código) · reuse-antes-de-construir ✓ (§4). Assino `n/d`
em vez de `8/8` porque não sei quais são as 8.
