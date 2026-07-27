# PREPARAR-AMBIENTE.ps1 - tira do caminho as causas de ambiente que mataram waves. So ASCII.
$ErrorActionPreference = 'Continue'
Start-Transcript -Path 'C:\Users\Paulo Loureiro\frugal\_handoff\ambiente.txt' -Force
try {
  # 1. C:\tmp - o EPERM que matou a wave autoupdate-p1 (o codex tentou escrever la)
  if (-not (Test-Path 'C:\tmp')) {
    New-Item -ItemType Directory -Path 'C:\tmp' -Force | Out-Null
    Write-Host 'C:\tmp criado'
  } else { Write-Host 'C:\tmp ja existe' }
  $probe = 'C:\tmp\mooter-probe.txt'
  try {
    [IO.File]::WriteAllText($probe, 'ok')
    Remove-Item $probe -Force
    Write-Host 'C:\tmp e ESCRIVEL - o EPERM deixa de acontecer'
  } catch { Write-Host ('C:\tmp NAO e escrivel: ' + $_.Exception.Message) }

  # 2. index.lock stale do git (ja mordeu varias vezes)
  $lock = 'C:\Users\Paulo Loureiro\frugal\.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host 'index.lock stale removido' }
  else { Write-Host 'sem index.lock stale' }

  # 3. estado: quantas worktrees tem alteracoes por commitar (o lock exclusivo da O2.1)
  Push-Location 'C:\Users\Paulo Loureiro\frugal'
  $b = (git rev-parse --abbrev-ref HEAD).Trim()
  $sujos = (git status --porcelain | Measure-Object -Line).Lines
  $porPush = (git log --oneline '@{u}..HEAD' 2>$null | Measure-Object -Line).Lines
  Write-Host ('branch: ' + $b + ' · por commitar: ' + $sujos + ' · por push: ' + $porPush)
  Pop-Location
  Write-Host 'OK AMBIENTE PRONTO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
