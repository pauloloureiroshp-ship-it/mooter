# MASTERPROMPT — 🔎 Triagem honesta das 3 branches parked antigas

Lê `_handoff/_MASTER_ORCHESTRATION.md` (invariantes de ouro). Missão: decidir, **por branch**, se há
valor real **não-portado** em `wave64-compaction-advisor`, `wave62_5-confidence-cascade` e
`pilar/council` — e **extrair só esse valor de forma aditiva**, ou **arquivar**. Nunca mergear inteira.

## ⚠️ Porque NÃO se mergeia (facto medido 2026-06-30)
Diffstat vs `main` mostra deleções massivas — estas branches divergiram há muito e arrastam regressão:

| Branch | Ahead de main | Diffstat vs main |
|---|---|---|
| `wave64-compaction-advisor` | 13 commits | 557 fich · +1.598 / **−100.006** |
| `wave62_5-confidence-cascade` | 7 commits | 563 fich · +1.782 / **−100.766** |
| `pilar/council` | 39 commits | 468 fich · +7.205 / **−84.350** |

Mergear qualquer uma = apagar ~85–100k linhas de `main`. **Proibido.** A lição do `wave60` está
registada: merge cego de branch antiga **regride**. A régua aqui é **melhora ≠ muda**.

## Setup (worktree isolado, read-mostly)
```
git worktree add ../frugal-triage -b chore/triage-parked-old main
cd ../frugal-triage
```
Trabalha SÓ neste worktree. Esta sessão é **de análise + extracção cirúrgica**, não de merge.

## Invariantes (valem sempre)
- `tools/router/classify.js` **FROZEN** — prova a sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` no início e no fim.
- Tudo **ADITIVO**. `git add` **selectivo** (nunca `-A`). English no código, PT-PT no relatório.
- **NUNCA** `git branch -D` de uma parked nem `git push` sem o OK explícito do Paulo (irreversível = gate humano).
- Se um pré-requisito faltar → **pára e avisa**.

## Processo — por cada uma das 3 branches
1. **Identifica a IDEIA central** (read-only): `git log --oneline main..<branch>` +
   `git diff --stat main..<branch>`. Resume numa frase: *o que é que esta branch tentava entregar?*
2. **Já está superada / em prod?** Procura em `main` se a ideia já lá vive:
   - `wave64-compaction-advisor` → o **Compaction Advisor + chip 🪶** foi promovido pelo **Context
     Guardian F1** que **já está em prod** (`main`). Confirma com `git log main --oneline | grep -i guardian`
     e inspecciona `tools/router/`/cockpit. Se F1 cobre o que a wave64 fazia → a branch está **superada**.
   - `wave62_5-confidence-cascade` → procura "confidence"/"cascade" em `tools/router/` e nos packages do
     router em `main`. Vê se a cascata de confiança já está incorporada ou foi substituída por outro mecanismo.
   - `pilar/council` → `packages/council/` **já existe em `main`** (com `quality-eval`). Confirma o que a
     branch tem a mais que `main` não tem (e cruza com `_handoff/MASTERPROMPT_LAND_AND_EVAL.md`, que já
     trata o Council Quality Eval). Provável: a branch é uma versão antiga do que já está parcialmente em main.
3. **Veredicto por branch** (uma de três saídas):
   - **ARQUIVAR** — a ideia está em prod/superada, ou o custo de portar > valor. Acção: documenta e
     **propõe** `git branch -m <branch> archive/<branch>` (renomear, não apagar) — **só com OK do Paulo**.
   - **EXTRAIR** — há valor real **não em main**. Acção: re-implementa **só esse núcleo**, aditivo e limpo,
     numa branch nova pequena (`feat/<algo>-from-<branch>`), com testes verdes. **Não** faças cherry-pick de
     commits que arrastem as deleções; reescreve o mínimo viável. Mostra o diff (deve ser pequeno, +N/−~0).
   - **ADIAR** — valor incerto, precisa de eval. Acção: anota a hipótese e o teste que a decidiria; não mexas.
4. Para qualquer EXTRAIR: `node --check` + `node --test` COMPLETO (inclui `webview-syntax`) + sha do
   classify.js intacta antes de commitar. Commit atómico, English. **Sem push.**

## Entregável (pára e reporta)
- Escreve `_handoff/TRIAGE_VERDICT_2026-06-30.md`: tabela `branch → veredicto → racional → acção proposta`,
  com os SHAs reais e o que (se algo) foi extraído. Honesto — se a conclusão é "as 3 arquivam", diz isso.
- Mostra ao Paulo: o relatório + qualquer diff de extracção. **Espera o OK** antes de renomear/arquivar
  branches ou push. Régua final: `main` não perdeu nada, e só ganhou valor que **prova** melhorar.
