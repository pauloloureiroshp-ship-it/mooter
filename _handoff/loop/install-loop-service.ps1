# install-loop-service.ps1 - instala o Autopilot Loop como SERVICO de fundo (corre 1 vez na vida).
# Depois disto o loop sobrevive a reboots e a crashes (auto-restart) e corre sozinho para sempre.
# O unico toque humano que sobra e' o gate de merge (por design - seguranca).
#
# Uso (PowerShell, na raiz do repo):
#   ./_handoff/loop/install-loop-service.ps1
#
# Metodo: pm2 (auto-restart + arranque no login). Fallback: Task Scheduler (ver fim).

$ErrorActionPreference = "Stop"
$repo   = (Resolve-Path "$PSScriptRoot\..\..").Path
$runner = Join-Path $repo "_handoff\loop\loop-runner.mjs"
Write-Host "Repo:   $repo"
Write-Host "Runner: $runner"

# 1) pre-requisitos
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node nao encontrado no PATH." }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Write-Warning "claude CLI nao encontrado no PATH - o runner vai falhar ate o instalares." }
$ollama = $false
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:11434/api/tags | Out-Null; $ollama = $true } catch {}
if (-not $ollama) { Write-Warning "Ollama nao responde em :11434 - liga o Ollama (modelos locais) para o council correr a $0." }

# 2) pm2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "A instalar pm2 (global)..."
  npm install -g pm2 pm2-windows-startup
}

# 3) arranca o runner sob pm2 (cwd = repo; env de autonomia)
$env:REPO = $repo
$env:PERMISSION_MODE = "acceptEdits"   # autonomia no reversivel; gate humano no irreversivel fica no protocolo
pm2 delete mooter-loop 2>$null | Out-Null
pm2 start "$runner" --name mooter-loop --cwd "$repo" --time --update-env
pm2 save

# 4) arranque automatico no login (sobrevive a reboot)
try { pm2-startup install } catch { Write-Warning "pm2-startup falhou; usa o fallback Task Scheduler abaixo." }

Write-Host ""
Write-Host "OK. Loop instalado como servico 'mooter-loop'."
Write-Host "  Estado:   pm2 status"
Write-Host "  Logs:     pm2 logs mooter-loop"
Write-Host "  Parar:    pm2 stop mooter-loop   (ou cria o ficheiro _handoff/loop/STOP)"
Write-Host "  Remover:  pm2 delete mooter-loop"
Write-Host ""
Write-Host "Fallback (sem pm2) - Task Scheduler, corre 1 vez:"
Write-Host '  $a = New-ScheduledTaskAction -Execute "node" -Argument "''' + $runner + '''" -WorkingDirectory "' + $repo + '"'
Write-Host '  $t = New-ScheduledTaskTrigger -AtLogOn'
Write-Host '  $s = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)'
Write-Host '  Register-ScheduledTask -TaskName "mooter-loop" -Action $a -Trigger $t -Settings $s -RunLevel Limited'
