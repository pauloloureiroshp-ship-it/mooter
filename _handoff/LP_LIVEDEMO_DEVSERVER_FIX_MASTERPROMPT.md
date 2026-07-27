# ⇄ COWORK→CC · LP-COERÊNCIA-DEMO · Dev server 7819 confiável + prova automática E2E (sem GUI)

> **Cola este ficheiro inteiro numa janela FRESCA do Claude Code.** Objetivo: deixar o Live Preview do
> `frugal-lp-coerencia` a servir de forma **confiável** em `http://127.0.0.1:7819` e provar por teste
> automatizado (não GUI) que os 19 fixes de coerência (COH-01…19, PR #246) funcionam de ponta a ponta.
> O click-through visual final (selecionar elemento → prompt → Publish) é feito pelo Paulo/Cowork
> DEPOIS que este masterprompt terminar — tu não tocas na UI do VS Code, só no terminal/bash nativo.

## CONTEXTO (porque as tentativas remotas falharam — não repitas)
O Cowork (eu, via bridge remoto sem acesso nativo a processos/Task Manager) tentou 2x subir o dev server:
1. `npm install` puro em `frugal-lp-coerencia\landing` — ficou "a instalar" 13+ min sem log de progresso.
2. Copiar `node_modules` de `frugal-w2\landing\node_modules` via `robocopy /MIR /MT:16` — parou de escrever
   log por 20+ min sem terminar nem falhar visivelmente (o bridge remoto não tem `tasklist`/Get-Process).

Tu tens bash nativo completo — tens visibilidade real (processos, disk I/O, antivírus, etc.) que o bridge
remoto não tem. **Diagnostica a causa raiz** (antivírus a escanear `node_modules` em tempo real? disco
lento? `npm` a resolver rede em vez de cache local? postinstall preso?) em vez de só repetir robocopy.

## WHERE
`C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing` (worktree JÁ tem o vsix 0.16.67 instalado e o código
do PR #246 mergeado — não precisas mexer no código da extensão, só no ambiente do dev server).

## GUARD
- Não tocar em código da extensão (`packages/vscode-extension/**`) salvo se o diagnóstico mostrar que o
  próprio dev-server script do repo tem um bug real (nesse caso: fix mínimo, teste, commit atómico,
  branch `fix(demo): <causa-raiz>` — NÃO na árvore principal, NÃO push sem dizer ao Paulo).
- Não abrir/tocar VS Code, não clicar em nada de GUI. Este masterprompt é 100% terminal.
- Não faças deploy, não toques em `vercel`, não mexas em git fora deste worktree.
- `classify.js` FROZEN (mesma sha de sempre) — nem deves chegar perto, mas confirma no fim se tocaste em algo.

## FAZER

### 1. Diagnóstico rápido (2 min, antes de tentar nada)
```
Get-Process node,npm,robocopy -ErrorAction SilentlyContinue | Select Id,ProcessName,StartTime
Get-NetTCPConnection -LocalPort 7819 -ErrorAction SilentlyContinue
Test-Path "C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing\node_modules"
(Get-ChildItem "C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing\node_modules" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
```
Mata qualquer processo node/npm/robocopy órfão preso neste worktree antes de continuar.

### 2. Sobe o servidor pelo caminho mais rápido e confiável
Prioriza, nesta ordem:
1. **Junction (instantâneo, zero cópia)**: se `frugal-w2\landing\node_modules` (ou `frugal\landing\node_modules`)
   existe e tem `next` instalado e íntegro, usa `cmd /c mklink /J "<dest>\node_modules" "<src>\node_modules"`
   em vez de copiar. Confirma com `npm ls next --depth=0` que resolve.
2. Se a junction falhar (versões de lockfile divergentes) ou não houver sibling íntegro: `npm install`
   nativo, mas com timeout vigiado — corre em background (`Start-Process` ou job), faz poll do PID a cada
   10s, e se ao fim de 3 min não há progresso de I/O (usa `Get-Counter` ou simplesmente do tamanho da pasta
   crescendo), mata e tenta `npm install --prefer-offline --no-audit --no-fund` (cache local costuma já
   ter os pacotes de outros worktrees).
3. Documenta qual caminho funcionou e PORQUÊ o outro falhou — isto é conhecimento institucional, não só
   para hoje.

### 3. Confirma serving real
```
Start-Process -WindowStyle Minimized cmd -ArgumentList '/c cd /d "C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing" && npm run dev'
```
Poll `Invoke-WebRequest http://127.0.0.1:7819/ -UseBasicParsing` até `StatusCode -eq 200` (timeout 90s).
**NÃO PARES ESTE PROCESSO NO FIM** — tem de ficar a correr para o Cowork usar a seguir.

### 4. Prova automática E2E (sem GUI) dos 19 fixes de coerência
Corre a suite completa do repo (`lp-*.test.js` + complementares — o mesmo universo do PR #246, deve estar
318+/318+ e 111+/111 conforme o handoff anterior). Reporta números reais.

Além da suite, gera uma prova ao vivo dos 3 fixes mais críticos (mesmo padrão que o Codex já usou na
auditoria — reprodução por código, não por opinião):
- **COH-01 (lease)**: chama `resolveStage` (ou equivalente exportado) simulando 7819 morrer e 3000 subir —
  confirma que `servedRoot`/`selection` são invalidados (não apenas a URL muda).
- **COH-07 (Ask→Apply host-bound)**: prova que um `taskId` inválido/adulterado é recusado pelo host com
  razão explícita (não silenciosamente ignorado).
- **COH-10 (Publish destino)**: prova que o painel de Publish resolve `https://mooter.ai` a partir de
  `INFRA.md`/`env.ts` (não hardcoded, não `n/d` quando devia ter valor).

### 5. Fecho
Sem PR, sem commit a não ser que tenhas corrigido um bug real do dev-server script (nesse caso: commit
atómico descrito no GUARD, branch dedicada, **não** mergear/pushar).

## GATE
Nenhum — isto é operacional/diagnóstico, não muda produto. Só reporta.

## BACK (cola no Cowork)
```
⇄ CC→COWORK · LP-DEMO-DEVSERVER · <UP em 7819, confirmado 200 | ainda falha: <causa raiz exata>>
Caminho que funcionou: <junction | npm install limpo | outro> — porque os 2 anteriores falharam: <causa raiz>
Suite: <x>/<x> lp-* · <y>/<y> complementares
Prova COH-01: <output real>
Prova COH-07: <output real>
Prova COH-10: <output real>
classify.js sha: <intacta/tocada>
Servidor: DEIXADO A CORRER em 7819 (PID <n>) — pronto para o Cowork continuar o click-through visual.
```
