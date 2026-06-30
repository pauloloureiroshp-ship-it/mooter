# MASTERPROMPT — 🅾️ ONDA 0 · Bootstrap dos docs em `main` (corre PRIMEIRO, sozinha)

**Porque existe:** os masterprompts e specs desta ronda vivem como ficheiros **untracked** no working-tree
partilhado `~/frugal` (branch `feat/overclock-moo-p1`). **Não estão em `main`.** Logo, qualquer
`git worktree add ../frugal-X main` nasce **sem** eles, e o "lê e segue _handoff/X.md" falha. Esta onda
aterra os docs em `main` (aditivo, docs-only) para que TODAS as ondas seguintes os herdem. **Bloqueia tudo
o resto** — corre isto, faz push com o OK do Paulo, e só depois abre as ondas paralelas.

## Invariantes
- **Docs-only, ADITIVO.** Não tocas em código, não tocas em `classify.js` (mas confirma a sha no fim na mesma).
- `git add` **selectivo** — lista exacta abaixo, nunca `-A`. English nos commits.
- **NÃO mexas no índice do working-tree partilhado `~/frugal`** (28 sessões partilham-no). Trabalha num
  worktree limpo de `main` e **copia** os ficheiros para lá.
- Push só com o OK do Paulo.

## Processo
```
# 1. worktree limpo a partir de main
git worktree add ../frugal-bootstrap main
cd ../frugal-bootstrap

# 2. copia os docs untracked DO working-tree partilhado para aqui (cria pastas se preciso)
mkdir -p _handoff/guardian docs/strategy
cp ~/frugal/_handoff/_MASTER_ORCHESTRATION.md            _handoff/
cp ~/frugal/_handoff/ONDA0_BOOTSTRAP_DOCS_MASTERPROMPT.md _handoff/
cp ~/frugal/_handoff/LAND_PARKED_MASTERPROMPT.md          _handoff/
cp ~/frugal/_handoff/SITE_HANDOFF_STORY_MASTERPROMPT.md   _handoff/
cp ~/frugal/_handoff/PERFECT_HANDOFF_MASTERPROMPT.md      _handoff/
cp ~/frugal/_handoff/TRIAGE_PARKED_OLD_MASTERPROMPT.md    _handoff/
cp ~/frugal/_handoff/guardian/F_LEDGER_SPINE_MASTERPROMPT.md _handoff/guardian/
cp ~/frugal/_handoff/guardian/_ORCHESTRATION.md          _handoff/guardian/
cp ~/frugal/docs/strategy/MOO_LEDGER_AND_ORCHESTRATION.md docs/strategy/
cp ~/frugal/docs/strategy/PERFECT_HANDOFF_SPEC.md         docs/strategy/

# 3. stage SELECTIVO (lista os ficheiros um a um) + sanidade
git add _handoff/_MASTER_ORCHESTRATION.md _handoff/ONDA0_BOOTSTRAP_DOCS_MASTERPROMPT.md \
        _handoff/LAND_PARKED_MASTERPROMPT.md _handoff/SITE_HANDOFF_STORY_MASTERPROMPT.md \
        _handoff/PERFECT_HANDOFF_MASTERPROMPT.md _handoff/TRIAGE_PARKED_OLD_MASTERPROMPT.md \
        _handoff/guardian/F_LEDGER_SPINE_MASTERPROMPT.md _handoff/guardian/_ORCHESTRATION.md \
        docs/strategy/MOO_LEDGER_AND_ORCHESTRATION.md docs/strategy/PERFECT_HANDOFF_SPEC.md
git status   # confirma: SÓ estes ficheiros staged, nada de código
```

## Gate (pára e reporta)
- `git diff --cached --stat` mostra **só** os docs acima (zero ficheiros de código, zero `classify.js`).
- Confirma a sha do `classify.js` em `main` intacta: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
- Commit: `docs(handoff): bootstrap masterprompts + specs into main (onda 2026-06-30)`.
- Mostra o diff ao Paulo. **Push `git push origin main` só com o OK dele.** Limpa o worktree no fim
  (`git worktree remove ../frugal-bootstrap`). A partir daqui, qualquer worktree de `main` vê os docs.
