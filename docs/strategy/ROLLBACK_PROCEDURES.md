# Rollback Procedures — se algo correr mal no Autonomous Pipeline

> **Quando ler**: se acordas, vês algo estranho em `dev` ou no Notion, ou Claude Code parou em STOP CONDITION e queres reverter.

## Estado actual de referência (antes do pipeline arrancar)

- **Branch dev**: tag `v0.2.1-polish` (Wave 2.5 closure) — commit `3bb94b8`
- **Branch main**: produção mooter.ai (intocada)
- **Wave em curso**: Wave 2.6 (master prompts prontos)

Para voltar exactamente a este estado:

```bash
cd ~/mooter
git checkout dev
git reset --hard v0.2.1-polish  # SUPER DESTRUTIVO — usa só se decidiste reverter tudo
git push --force-with-lease origin dev  # cuidado: force push
```

⚠️ **Só fazer se ainda não houver PRs merged que queiras manter.**

## Cenário 1: Quero reverter UM PR específico

```bash
# Identifica o commit squash do PR (ver audit/AUTONOMOUS_LOG.md)
SQUASH_COMMIT=<hash>

git checkout dev
git revert $SQUASH_COMMIT
git push origin dev

# Isto cria um commit de revert (não destrutivo, preserva history).
```

## Cenário 2: Quero reverter TODA a Wave 2.6 (manter Wave 2.5)

```bash
git checkout dev
git reset --hard v0.2.1-polish
git push --force-with-lease origin dev

# Apaga tag prematura se foi criada
git tag -d v0.2.2-reveal
git push origin :refs/tags/v0.2.2-reveal
```

## Cenário 3: Wave 2.7 simulation com BLOCKERS — não quero apagar relatórios

A Wave 2.7 só gera ficheiros em `audit/wave2-7-e2e-simulation/` — não toca código. Para manter o report mas reverter qualquer outra coisa:

```bash
# Cherry-pick só o commit do audit report
git checkout dev
git log --oneline | grep "audit(wave2.7)" | head -1
# Copia o hash, e:
git cherry-pick <hash>

# Reverter resto se necessário
```

## Cenário 4: PR mergeado para `main` por engano (NUNCA deveria acontecer)

⚠️ Pipeline tem invariante contra isto. Se acontecer, é bug crítico — para tudo:

```bash
# 1. Revert no main
git checkout main
git revert HEAD --no-edit
git push origin main

# 2. Re-deploy mooter.ai produção (Vercel detect automatic)

# 3. Investiga porque happened (raríssimo)
```

## Cenário 5: Cost runaway descoberto tarde

Se vires factura $$$ inesperada:

```bash
# Verifica audit log
cat audit/AUTONOMOUS_LOG.md | grep "Cost cumulative"

# Se passou de $100 sem stop, é bug no pipeline. Reporta.
# Anthropic billing: https://console.anthropic.com/billing

# Não há rollback de tokens consumidos — só preventivo (stop conditions)
```

## Cenário 6: Notion sub-pages criadas a mais

```bash
# Notion MCP tem delete? Não — usa UI manual:
# https://notion.so → HQ page → procurar pages com "Wave 2.6" ou "Wave 2.7"
# → ... → Delete

# Não há automatic cleanup
```

## Cenário 7: Memória persistente com info errada

Localiza em:
```
~/AppData/Roaming/Claude/local-agent-mode-sessions/.../spaces/.../memory/
```

Edita ou remove `project_mooter_wave2_6_shipped.md` ou `project_mooter_wave2_7_*.md` manualmente. Update `MEMORY.md` index.

## Cenário 8: Branches órfãs (não merged) no GitHub

```bash
# Lista branches remote
git fetch --prune
git branch -r | grep wave2.

# Apaga branches específicas
git push origin --delete wave2.6-day1-rebrand-mooter-moos
git push origin --delete wave2.6-day2-statusline-rich-dashboard
# etc.
```

## Quick sanity checks (correr quando voltas)

```bash
cd ~/mooter

# 1. Onde está dev?
git log dev --oneline -5

# 2. Tags criadas?
git tag -l | grep v0.2.

# 3. Audit log
cat audit/AUTONOMOUS_LOG.md | tail -50

# 4. Tests verdes?
npm test 2>&1 | tail -20

# 5. main intocado?
git log main --oneline -3

# 6. PRs no GitHub
gh pr list --state all --limit 10
```

## Quando NÃO reverter

- Se reviewer T3-gate aprovou + tests verdes + estás indeciso → **mantém**, podes sempre reverter mais tarde
- Se Wave 2.7 report mostra blockers → **mantém** o report, é precisamente o output esperado
- Se custo está dentro do cap → **mantém**, isso é normal
- Se Notion sub-page existe mas content é razoável → **mantém**

## Contacto de emergência

- Anthropic billing: https://console.anthropic.com/billing
- GitHub support: https://support.github.com/
- Vercel (produção mooter.ai): https://vercel.com/help

---

**Lembrete**: o pipeline foi desenhado para ser SAFE-BY-DEFAULT. Auto-merge é só para `dev` (quarantena), nunca `main`. Se segues estes procedures, qualquer dano é reversível.
