# SELF_FIX_MASTER_PROMPT.md
# frugal — Fixes que o Claude Code faz sozinho (sem browser, sem aprovação extra)
# Gerado: 2026-04-10 | Fonte: AUDIT_REPORT.md bloco 2.1 + bloco 6 scheduled task

> Lê inteiro antes de começar. São 2 tarefas independentes — podes fazê-las em paralelo.
> No fim: commit + push + página Notion.

---

## TAREFA 1 — Corrigir classify.js: "commit message" deve ser T1, não T0

### O problema
O smoke test da auditoria detectou:

| Prompt | Esperado | Obtido |
|--------|----------|--------|
| `generate commit message for this diff` | T1 | T0 ← ERRADO |

O pattern `/commit\s+message/i` existe no LOW_RISK (mapeado para T1) mas está a ser ultrapassado
pelos trivial signals do prompt ("generate" é curto, sem file hints, sem keywords MED_RISK).
O resultado é T0 (Ollama) em vez de T1 (Haiku). Ollama até funciona para commit messages,
mas o intent semântico é claramente T1.

### O que fazer

**Passo 1** — Confirmar onde está o pattern "commit" em `tools/router/patterns.js`:
```bash
grep -n "commit" tools/router/patterns.js
```

**Passo 2** — Verificar como o LOW_RISK é tratado no scoring de `tools/router/classify.js`:
```bash
grep -n "low\|LOW_RISK\|triv\|TRIVIAL" tools/router/classify.js | head -30
```

**Passo 3** — A fix pode tomar uma de duas formas (escolhe a mais simples):

**Opção A** (preferida — sem tocar no scoring): mover o pattern de commit message do LOW_RISK para o MED_RISK em `patterns.js`. MED_RISK garante T1 ou superior.

```javascript
// Em patterns.js, no array MED_RISK, adicionar:
/\bcommit\s+(message|msg)\b/i,           // "generate commit message" — T1 task (Haiku handles well)
/\bgera\s+(mensagem|msg)\s+de\s+commit/i, // PT-PT variant
```

E remover (ou deixar — não faz mal) do LOW_RISK se estiver lá.

**Opção B** (alternativa): adicionar um fast-path explícito no início do classify() que detecta "commit message" antes do scoring geral:
```javascript
// No início do bloco de classify(), antes dos hits():
if (/\bcommit\s+(message|msg)\b/i.test(p)) {
  return buildResult('T1', 'cheap_task', 'haiku', 0.85, 'commit-message-explicit');
}
```

Opção A é mais limpa. Opção B é mais explícita mas adiciona um fast-path extra.

**Passo 4** — Testar:
```bash
node tools/router/classify.js "generate commit message for this diff"
# expected: tier T1, recommended_model haiku (ou similar)

node tools/router/classify.js "rename handleConnect to onConnect"
# expected: tier T0 (deve continuar T0 — não regredir)

node tools/router/classify.js "why does the websocket reconnect fail sometimes"
# expected: tier T2 (deve continuar T2 — não regredir)
```

**Passo 5** — Correr o test suite para garantir que não há regressões:
```bash
node tools/router/classify.js --test 2>/dev/null || npm test
# ou o comando de testes que existir no package.json
```

Se os testes passarem, esta tarefa está feita.

---

## TAREFA 2 — Registar Scheduled Task Windows para backtest diário

### O problema
O AUDIT_REPORT confirmou que `run-backtest.cmd` existe mas o scheduled task NÃO está registado
no Windows Task Scheduler. O backtest auto-learning não está a correr automaticamente.

```
schtasks /query — resultado: nenhuma task "Frugal" encontrada
```

### O que fazer

**Passo 1** — Verificar o caminho exacto do run-backtest.cmd na máquina do Paulo:
```bash
ls ~/.claude/tools/router/run-backtest.cmd
# ou
ls "$USERPROFILE/.claude/tools/router/run-backtest.cmd"
```

Em PowerShell / cmd:
```powershell
Test-Path "$env:USERPROFILE\.claude\tools\router\run-backtest.cmd"
```

**Passo 2** — Registar o scheduled task.

**Em PowerShell (como utilizador normal, sem admin):**
```powershell
$action = New-ScheduledTaskAction -Execute "$env:USERPROFILE\.claude\tools\router\run-backtest.cmd"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable
Register-ScheduledTask -TaskName "FrugalRouterBacktest" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force
```

**Alternativa via schtasks.exe (mais universal):**
```cmd
schtasks /create /tn "FrugalRouterBacktest" /tr "\"%USERPROFILE%\.claude\tools\router\run-backtest.cmd\"" /sc daily /st 02:00 /ru "%USERNAME%" /rl LIMITED /f
```

**Passo 3** — Verificar que ficou registado:
```powershell
schtasks /query /tn "FrugalRouterBacktest" /fo list
```

Deverá mostrar:
```
TaskName: FrugalRouterBacktest
Status:   Ready
Next Run Time: [amanhã] 2:00:00 AM
```

**Passo 4** — Teste opcional (corre agora para ver se funciona):
```powershell
schtasks /run /tn "FrugalRouterBacktest"
Start-Sleep -Seconds 5
schtasks /query /tn "FrugalRouterBacktest" /fo list | Select-String "Last Run"
```

Se `Last Run Result` for `0x0`, funcionou.

---

## COMMIT + PUSH

Após ambas as tarefas:

```bash
git status
git diff tools/router/patterns.js tools/router/classify.js
```

Commitar **apenas** os ficheiros modificados nestas tarefas:

```bash
git add tools/router/patterns.js
# e/ou tools/router/classify.js se foi modificado
git commit -m "fix(classifier): commit message T0→T1 — move pattern to MED_RISK

Audit smoke test detected: 'generate commit message' was routing to T0 (Ollama)
instead of T1 (Haiku). Pattern moved to MED_RISK to ensure correct tier.

Affected: patterns.js (MED_RISK array)
Tests: all passing"
```

```bash
git push origin main
```

---

## PROTOCOLO NOTION — fim de sessão

Criar página no Notion HQ (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`):
- Título: `🔧 Sessão 2026-04-10 — Self-Fix: classify.js T1 + Scheduled Task`
- Conteúdo: commits, resultado dos testes, estado do scheduled task
- Actualizar SYNC.md secção "Notion HQ — Páginas de Referência" com o ID da página
