# PHASE A — GATE REPORT (Spine V2)

> Executado por Claude Code (Opus, beast) 2026-07-10, após GO humano do Paulo. Branch pronta para revisão. **Sem merge, sem push.**

## Provenância
- Worktree: `C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-a`
- Branch: `feat/handoff-spine-v2-a-audit-fixes` · HEAD `1d9d020` · **1 ahead / 0 behind `origin/main` (c5cda85)** · unpushed
- Working tree: clean · Uncommitted: 0 · PR/Merge/CI: nenhum (local)
- Shared tree `frugal`: **NÃO tocado** (isolamento por worktree)

## O que aconteceu
1. Worktree criado de `origin/main` (não do main local stale).
2. Patch Codex preservado aplicado via **`git apply --3way`** — 9/10 ficheiros base-idênticos, só `host-extra.js` divergia (região não-sobreposta: remoção `mkDebounce`), 3-way limpo, **0 conflitos**.
3. 2 novos ficheiros copiados (hash conferido). Commit seletivo dos 12.

## Diff = exatamente os 12 da allowlist (nada fora)
10 mod: `_MASTER_ORCHESTRATION.md`, `MOOTER_CODEX_MASTERPROMPT.md`, `HANDOFF.template.md`, `PERFECT_HANDOFF_SPEC.md`, `package.json`, `handoff-accumulator.test.js`, `host-extra.js`, `ledger-decision.js`, `ledger-decision.test.js`, `tools/router/package.json` · 2 novos: `tools/docs-hygiene.js`, `tools/docs-hygiene.test.js`.

## Gate A — provas (pass/total reais)
| Check | Resultado |
|---|---|
| `classify.js` sha256 | `427d8c0b…364bc48f` **frozen** (pré e pós commit) |
| docs-hygiene unit (`npm run test:docs-hygiene`) | **4/4** |
| docs-hygiene doctor live | error=0 · warn=4 (SYNC_TOO_LONG@3050, STATUS_MISSING×10, BROKEN_REFS×19, ROOT_OPERATIONAL×3) · `--strict` exit 2 (correto) |
| ledger targeted (`node --test ledger-decision/prov/event/reduce`) | **23/23** |
| router full (`npm test`) | **969/971** — 1 fail preexistente (`moo-verify` `false!==null`) + 1 skip intencional; **0 regressões** (`classify tuned_demote` passou) |
| vscode targeted (`handoff-accumulator` + `perfect-handoff`) | **21/21** |
| vscode full (`npm test`) | **1021/1021** (baseline 670 era do tree eba5d3b; suite cresceu em origin/main — não é regressão) |
| Reviewer independente (adversarial) | **APPROVE-WITH-NITS** — allowlist ✅, sha ✅, `_isToolError` correto/wired/exported, `baseOpts` traçado seguro via callers reais, template sem 2º ledger, banners superseded, doctor completo/read-only/zero-dep |

## Objetivos Phase A — confirmados
- ✅ Só o patch Codex importado.
- ✅ `composeHandoff()` preserva `perfect/ledgerEvents/sessionGit/expectedCwd/recent` (código traçado; teste cobre 3/5 — ver nit 2).
- ✅ Tool errors nunca viram decisões humanas (`_isToolError`, testado is_error + textual).
- ✅ Doctor valida SHA/SYNC-len/crowded/untracked/status/refs/dupes/operational/`--strict`.
- ✅ Template = work order/projeção, **não** 2º ledger manual (RULES §1).
- ✅ Docs superseded com banner NÃO-EXECUTAR (não confundíveis com instruções ativas).

## Refutações / correções honestas (Phase A)
1. **"Codex aplicável cegamente sobre main"** → refutado e tratado: base divergia em `host-extra.js`; exigiu 3-way, não apply cego.
2. **(auto-correção)** A minha frase do Day 0 "o teste exercita a preservação dos 5 campos" é **3/5** real (asserta perfect/sessionGit/ledgerEvents; `expectedCwd`/`recent` fluem no código mas não são assertados). Ver nit 2.
3. **Baseline vscode 670/670** → corrigido: em origin/main a suite tem 1021 testes (crescimento), 670 era do tree eba5d3b. Não é regressão.

## Nits (P2 — gaps de cobertura sobre lógica correta; todos in-allowlist)
1. `ledger-decision.test.js`: branch `error != null` (erro estruturado sem `is_error`/sem marcador textual) **não testado** — gate de branch-coverage do `tools/router/`.
2. `handoff-accumulator.test.js`: regressão asserta 3/5 campos — faltam asserts de `expectedCwd` e `recent`.
3. `docs-hygiene.test.js`: `HANDOFF_EXACT_DUPLICATES` e `PENDING_DELETION_BUCKETS` sem teste.

## P3 / notas para fases seguintes
- origin/main `SYNC.md` = **3050 linhas** (a redução do SYNC não aterrou em main) → contexto para Fase C/E, não Fase A.
- **Gate D (decisão antecipada do Paulo):** `npm test` do `worktree-conductor` partido no Windows → correr via `tsx` direto (20/20 provado) e documentar; **não** tocar `packages/worktree-conductor/package.json` (fora da allowlist D). Registado.

## Human gate (Phase B só inicia após A revisada + integrada por Paulo)
- **Decisão:** aceitar A e integrar, ou fechar os 3 nits antes?
- **Recomendação:** fechar ≥ o nit 1 (branch-coverage é gate real do router) numa emenda no mesmo branch antes do merge; nits 2/3 opcionais.

## Como retomar / rever
```powershell
# rever:
git -C "C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-a" show 1d9d020
git -C "C:\Users\Paulo Loureiro\frugal-handoff-spine-v2-a" diff origin/main --stat
# se pedires para fechar nits: edito os 3 test files na allowlist + re-run Gate A + commit no mesmo branch
```
