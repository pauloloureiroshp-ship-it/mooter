# ⇄ COWORK → CC · GREAT RENAME — frugal → mooter (pasta única, nome novo, zero perda)

> **STATUS: 🧊 PARKED — NÃO EXECUTAR AGORA.**
> **Gate de entrada (os 3, obrigatórios):** F4 do V2.1 fechada (`git status` ≤5) **·** F6 fechada
> (worktrees podadas para ≤5) **·** zero branch parked sem push (verificado no BACK da F6).
> Autor: Cowork 2026-07-15 · Decisão do Paulo: pasta única "mooter", frugal é nome antigo.
> Casa: `_handoff/` → arquivar em `_handoff/_archive/` no PR que fechar isto.

🎯 GOAL   Renomear a raiz `C:\Users\Paulo Loureiro\frugal` → `...\mooter`, agrupar worktrees em
          `...\mooter\worktrees\<nome>`, atualizar TODA a infraestrutura que aponta para o path antigo,
          e resolver a decisão de nome do `worktree-conductor` (colisão: MS lançou "Conductor" mai/26).
🔒 GUARD  classify.js FROZEN (sha `427d8c0b…`) · nada se apaga (tudo é move/rename) · cada passo gera
          log em `_handoff/rename/` · rollback documentado antes de cada mudança · git writes = Paulo.
✅ GATE   no fim: `git status` limpo · `git fsck` ok · sha intacta · pm2 online · scheduled tasks rodam ·
          statusline CC ok em sessão fresca · Cowork reconectado · zero referência quebrada (grep).

## FASE 0 — Preflight (read-only; ABORT se qualquer item falhar)

```powershell
# 0.1 Inventário completo (guarda o output — é o mapa do rollback)
cd "C:\Users\Paulo Loureiro\frugal"
git worktree list > _handoff\rename\inventory-worktrees.txt
git status --short >> _handoff\rename\inventory-worktrees.txt
git branch -vv --all > _handoff\rename\inventory-branches.txt
pm2 jlist > _handoff\rename\inventory-pm2.json
schtasks /Query /TN "MooterFleetWatchdog" /XML > _handoff\rename\task-watchdog.xml
schtasks /Query /TN "FrugalRouterBacktest" /XML > _handoff\rename\task-backtest.xml
```

Checklist manual: ☐ zero uncommitted ☐ zero unpushed ☐ VS Code e TODAS as sessões CC/Codex fechadas
☐ pasta desconectada do Cowork ☐ `pm2 save` feito.

## FASE 1 — Parar o mundo

```powershell
pm2 save
pm2 kill
schtasks /Change /TN "MooterFleetWatchdog" /DISABLE
schtasks /Change /TN "FrugalRouterBacktest" /DISABLE
```

## FASE 2 — Rename + worktrees agrupadas

```powershell
Rename-Item "C:\Users\Paulo Loureiro\frugal" "mooter"
cd "C:\Users\Paulo Loureiro\mooter"
git worktree repair
New-Item -ItemType Directory -Force "C:\Users\Paulo Loureiro\mooter\worktrees" | Out-Null
Add-Content .gitignore "`n/worktrees/"   # worktrees aninhadas NUNCA entram no índice
# Para cada worktree sobrevivente da F6 (ex.: frugal-w2):
git worktree move "C:\Users\Paulo Loureiro\frugal-w2" "C:\Users\Paulo Loureiro\mooter\worktrees\w2"
git worktree repair
git worktree list   # conferir: todas em mooter\worktrees\
```

## FASE 3 — Atualizar o que aponta para o path antigo (a lista É o trabalho)

| Alvo | Ação |
|---|---|
| `\MooterFleetWatchdog` (task) | editar XML salvo na F0 → path novo do `run-watchdog-hidden.vbs` → `schtasks /Create ... /XML` (recriar) + ENABLE |
| `\FrugalRouterBacktest` (task) | idem — e renomear para `MooterRouterBacktest` |
| `ecosystem.config.js` (fleet) | paths `frugal-fleet-arm` → novo local da worktree fleet |
| `run-watchdog-hidden.vbs` | path interno |
| `mooter.code-workspace` | folders |
| `CLAUDE.md` + `SYNC.md` header | linha do path canônico Windows |
| `INFRA.md` | qualquer path local |
| `~/.claude/` (runtime) | rodar `/mooter-update` no fim (re-sincroniza) |
| grep final | `grep -ri "Paulo Loureiro.frugal" --include="*.{md,js,mjs,ts,json,ps1,cmd,vbs,toml}" .` → deve retornar SÓ arquivos de `_archive/` e logs históricos |

## FASE 4 — Religar e provar

```powershell
pm2 resurrect        # ou: pm2 start ecosystem.config.js --update-env ; pm2 save
schtasks /Run /TN "MooterFleetWatchdog"     # roda 1x manual e confere log
cd "C:\Users\Paulo Loureiro\mooter" ; git fsck ; git status
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('tools/router/classify.js')).digest('hex'))"
# esperado: 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
```

Depois: reconectar a pasta `mooter` no Cowork · abrir CC fresco e conferir statusline · commit dos
arquivos alterados (add seletivo) → ⛔ STOP diff → OK Paulo → push.

## FASE 5 — Decisão de nome "Conductor" (junto, mesma wave)

MS lançou "Conductor" (mai/26). Decidir (Paulo): renomear `packages/worktree-conductor` →
proposta `packages/herd-conductor` (mantém a metáfora moo) ou manter nome interno e só evitar o termo
em marketing. Se renomear: `git mv` + grep de imports + testes verdes. Registrar a decisão em MEMORY.md.

## ROLLBACK (se qualquer gate falhar)

`Rename-Item ...\mooter → frugal` · `git worktree repair` em cada · re-importar os 2 XML de tasks da F0 ·
`pm2 resurrect` · os inventários da F0 são a referência byte a byte.

## BACK
Inventários antes/depois · output do grep final (zero refs vivas) · sha classify · pm2 list · print da
task rodando · statusline CC ok · decisão Conductor registrada.
