# MASTERPROMPT — 📤 Aterrar o trabalho parked (tudo pushado)

Lê `_handoff/_MASTER_ORCHESTRATION.md` (invariantes). Missão: aterrar o trabalho **verde parado** em
`main`, na ordem certa, com gate por branch — para ficar **tudo pushado**.

## Inventário (confirma primeiro, read-only)
```
git -C ~/frugal log --oneline main..feat/cockpit-doctor-selfheal
git -C ~/frugal log --oneline main..feat/mission-control-v2
git -C ~/frugal diff --stat main..feat/cockpit-doctor-selfheal
git -C ~/frugal diff --stat main..feat/mission-control-v2
```
Verdes conhecidos: **Doctor** `feat/cockpit-doctor-selfheal @21556dc` (389/389) · **MC v2**
`feat/mission-control-v2 @b07a49b` (387/387). Mostra a tabela ao Paulo.
> ⚠️ Confirma os SHAs reais antes de tocar: `git rev-parse --short feat/cockpit-doctor-selfheal feat/mission-control-v2`.
> Já existem worktrees prunable para estas branches (`../frugal-doctor`, `../frugal-mc-v2`); corre `git worktree prune` se atrapalharem.
> Confirma a versão actual em main antes do bump: `git show main:packages/vscode-extension/package.json | grep version` (espera `0.16.44`).

## Processo (gate por branch, com o OK do Paulo)
1. **Doctor primeiro** (independente): num worktree, rebase/merge sobre `main @0ccb824`, resolve overlaps em
   `extension.js`/`host-extra.js` (o Handoff Truth já está em main → blocos additivos), `node --check` +
   `node --test` COMPLETO + `classify.js` sha → **final-reviewer** → ff/merge `main` → **PÁRA p/ OK** → `push`.
2. **MC v2** a seguir (toca nos mesmos ficheiros) — mesmo processo, rebased sobre o Doctor já landed.
3. **Bump 0.16.45:** `package.json` da extensão `0.16.44 → 0.16.45`, commit em main, empacota o vsix
   (`npx @vscode/vsce package --no-dependencies`), **verifica `node --check` no `extension.js` extraído do vsix**.

## Gate final (pára e reporta)
- `main` contém Doctor + MC v2 + bump 0.16.45 · todos os testes verdes · `classify.js` sha intacta.
- vsix válido (extraído passa `node --check`). Push com o teu OK **por branch**. Limpa worktrees já landed.
- O handoff do projecto deve agora mostrar **menos parked** (Doctor/MC v2 deixaram de aparecer).
