# 🐮👑 CONSOLIDATION MASTER SEQUENCE — uma pasta só, nada perdido, depois o agentic OS

> Cowork 2026-07-15 · A ordem-mestra que o Paulo pediu: **consolidar tudo numa pasta `mooter` ANTES** de
> rodar o super master prompt do agentic OS (a corrida Codex de `CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md`).
> Este ficheiro é um ORQUESTRADOR fino — aponta para os masterprompts que já existem, não os duplica.
> Regra absoluta: **nada se perde** (tudo é tag/backup/move, nunca delete cego) · git irreversível = gate do Paulo.
> Casa: `_handoff/` → arquiva em `_handoff/_archive/2026-07/` no PR que fechar a Great Rename.

## ESTADO REAL HOJE (medido na tua máquina 2026-07-15 via shell local)
- 15 pastas (1 principal + 14 worktrees) · 455 sujos na árvore principal · 185 branches locais.
- classify.js FROZEN ✅ · remote = github.com/pauloloureiroshp-ship-it/mooter.
- **47 commits não-pushados em 18 branches ANTIGAS** (nenhuma worktree ativa) — a única coisa perdível.
- Branches ativas (régua/spine/cockpit-polish/fleet-arm/wave-ux/w2/lp-producao-perfeita) = **0 não-pushados** (seguras).
- ⚠️ `wave/lp-producao-perfeita @d522ad8` (os "19 do frugal-final") **já foi pushed** — 0 perdível.

---

## PASSO -1 · LIMPAR O LOCK STALE (fazer AGORA, antes de tudo — 10 segundos)

Um `index.lock` preso ficou na árvore principal (de um `git status` interrompido). Ele bloqueia escritas git.
Fecha VS Code + qualquer sessão CC/Codex, e roda no PowerShell:

```powershell
Get-Process node,git,code -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item "C:\Users\Paulo Loureiro\frugal\.git\index.lock" -ErrorAction SilentlyContinue
cd "C:\Users\Paulo Loureiro\frugal"; git status --short | Measure-Object | % Count   # deve responder (sem erro de lock)
```

---

## PASSO 0 · INSURANCE — travar TODO commit antes de mexer em nada (native, com teu OK p/ push)

Garante matematicamente que nada se perde: uma tag em cada branch = commit alcançável para sempre, mesmo
que a branch seja deletada. Script pronto: `_handoff/insurance-tag-all.ps1` (entregue junto).

```powershell
cd "C:\Users\Paulo Loureiro\frugal"
powershell -NoProfile -ExecutionPolicy Bypass -File "_handoff\insurance-tag-all.ps1"
# cria tag insurance/<branch>-2026-07-15 em CADA branch local (aditivo, reversível).
# depois, com teu OK (push = irreversível):
git push origin --tags
```
⛔ STOP: confirmar no fim `git tag -l "insurance/*" | Measure-Object` = 185 (uma por branch). Só então avançar.

---

## PASSO 1 · FOUNDATION RESET (a consolidação lossless — é ISTO que junta as pastas)

**"Uma pasta só" = resolver as 14 worktrees. Não há atalho seguro — é a F1→F6 do V2.1.**
Abre UMA sessão Claude Code na pasta `frugal` e cola:

```
Lê e segue _handoff/FOUNDATION_RESET_MASTERPROMPT_V2_1.md na íntegra.
Pré-condição já feita: PASSO -1 (lock) e PASSO 0 (insurance tags) do CONSOLIDATION_MASTER_SEQUENCE.
Lê antes as 3 notas aditivas de _handoff/MOOTER_MASTER_ANALYSIS_2026-07-14.md.
Na F1.5 usa a worktree ../frugal-regua (chore/tese-v2, JÁ EXISTE) e aplica os textos da FASE 0 de
_handoff/SETUP_RADAR_MASTERPROMPT.md. Na F5 os 47 commits não-pushados em 18 branches antigas são
arquivados com tag (nunca deletados sem tag). Para em TODOS os ⛔ STOP e espera meu OK.
```
Resultado: 455 sujos → limpo · 14 worktrees → ≤5 · 47 não-pushados → arquivados-com-tag · régua atualizada.
Gate de saída: `git status` ≤5 (F4) + worktrees ≤5 (F6) + tudo pushed/tagged.

---

## PASSO 2 · GREAT RENAME → a pasta única `mooter` (só depois do PASSO 1 fechar)

Gate: F4+F6 verdes. Então, nova sessão CC:

```
Lê e segue _handoff/GREAT_RENAME_MASTERPROMPT.md. Confirma os 3 gates de entrada (F4 ok, F6 ok,
zero branch parked sem push/tag). Resultado: repo em C:\Users\Paulo Loureiro\mooter +
worktrees em mooter\worktrees\<nome>. Atualiza tasks/pm2/paths. Resolve o nome do worktree-conductor.
Para em cada ⛔ STOP.
```
Resultado: **uma pasta `mooter`** no lugar das 15 frugais. O estacionamento acabou.

---

## PASSO 3 · O AGENTIC OS PERFEITO (agora sim — a corrida Fable 5 / Codex)

Só depois de ter UMA pasta limpa. Terminal `codex` na pasta `mooter`:

```
Lê e segue _handoff/CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md. Executa C0 (recon, read-only) e PARA no
⛔ STOP com o mapa de colisões antes de escrever qualquer linha.
```
C0→C6: rede de testes → docs-hygiene → setup-state (12 inputs+turbo) → Radar read-only → Turbo Gauge →
Wizard mínimo. C7 (Morning Brief/Time Machine/Spec Rail) fica para depois do spine/F0.

---

## POR QUE ESTA ORDEM (a maestria está aqui)
Consolidar antes de limpar = renomear com 455 sujos + 47 não-pushados = o momento que já corrompeu o .git 2×.
Insurance-first (tags) torna o "nada se perde" uma **garantia matemática**, não uma esperança. A consolidação
real É o Foundation Reset (não dá para pular). O rename só vem com a casa limpa. E o agentic OS só brilha
numa pasta única — construir a cabine perfeita em cima de 15 pastas sujas seria o oposto de maestria.

## O QUE NUNCA FAZER
❌ Rename/delete/worktree-remove antes do PASSO 1 fechar · ❌ deletar branch sem tag (PASSO 0 cobre) ·
❌ git write pelo mount/Cowork (o lock stale de hoje provou a fragilidade) · ❌ 2 sessões CC na árvore
principal · ❌ apagar pastas frugal-* à mão · ❌ pular a insurance.
