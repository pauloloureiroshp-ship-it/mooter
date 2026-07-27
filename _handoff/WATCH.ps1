# WATCH.ps1 - janela de progresso ao vivo. Custo ZERO de interacoes. So ASCII.
# Deixa aberta num canto: actualiza de 5 em 5 s lendo o ledger e o out.log.
# Nao fala com o Cowork, nao gasta tokens, nao precisa de mim.
$ErrorActionPreference = 'SilentlyContinue'
$mooter = Join-Path $env:USERPROFILE '.mooter'
$ledger = Join-Path $mooter 'ledger.jsonl'
$jobsDir = Join-Path $mooter 'jobs'

function Duracoes {
  $out = New-Object System.Collections.ArrayList
  foreach ($line in (Get-Content $ledger -Tail 600)) {
    if ($line -notmatch '"duration_s"') { continue }
    if ($line -notmatch '"agent":"codex"') { continue }
    if ($line -match '"duration_s":([0-9]+)') {
      $n = [int]$matches[1]
      if ($n -gt 30) { [void]$out.Add($n) }
    }
  }
  return $out
}

while ($true) {
  Clear-Host
  Write-Host ("MOOTER - progresso ao vivo    " + (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Cyan
  Write-Host "(janela local: nao gasta interacoes nem tokens)" -ForegroundColor DarkGray
  Write-Host ""

  Write-Host "a ler o ledger..." -ForegroundColor DarkGray
  # ultimo evento por job — so a cauda: os jobs vivos estao sempre no fim
  $estado = @{}
  foreach ($line in (Get-Content $ledger -Tail 250)) {
    if ($line -notmatch '"job_id":"([^"]+)"') { continue }
    $id = $matches[1]
    $ev = ''; if ($line -match '"event":"([^"]+)"') { $ev = $matches[1] }
    $ag = ''; if ($line -match '"agent":"([^"]+)"') { $ag = $matches[1] }
    $wv = ''; if ($line -match '"wave":"([^"]+)"') { $wv = $matches[1] }
    $ts = ''; if ($line -match '"ts":"([^"]+)"') { $ts = $matches[1] }
    if (-not $estado.ContainsKey($id)) { $estado[$id] = @{ id=$id; agent=''; wave=''; ev=''; ts='' } }
    if ($ag) { $estado[$id].agent = $ag }
    if ($wv) { $estado[$id].wave = $wv }
    if ($ev) { $estado[$id].ev = $ev }
    if ($ts) { $estado[$id].ts = $ts }
  }

  $vivos = @()
  foreach ($k in $estado.Keys) {
    if ($estado[$k].ev -eq 'started' -or $estado[$k].ev -eq 'dispatched') { $vivos += $estado[$k] }
  }

  if ($vivos.Count -eq 0) {
    Write-Host "Nenhum job a correr." -ForegroundColor Green
  } else {
    $ds = Duracoes
    $mediana = $null
    if ($ds.Count -gt 0) { $s = $ds | Sort-Object; $mediana = $s[[int]($s.Count/2)] }

    foreach ($v in $vivos) {
      $el = 0
      if ($v.ts) { $el = [int]((Get-Date) - [datetime]::Parse($v.ts).ToLocalTime()).TotalSeconds }
      Write-Host ("JOB " + $v.id + "   [" + $v.agent + "]") -ForegroundColor Yellow
      Write-Host ("  wave: " + $v.wave)
      Write-Host ("  a correr ha: " + [int]($el/60) + " min " + ($el % 60) + " s")
      if ($mediana) {
        $falta = $mediana - $el
        if ($falta -gt 0) {
          Write-Host ("  ESTIMATIVA: faltam ~" + [int]($falta/60) + " min   (mediana de " + $ds.Count + " jobs: " + [int]($mediana/60) + " min)") -ForegroundColor Cyan
        } else {
          Write-Host ("  ESTIMATIVA: ja passou a mediana de " + [int]($mediana/60) + " min - pode estar quase ou preso") -ForegroundColor Magenta
        }
      } else {
        Write-Host "  ESTIMATIVA: n/d - sem historico suficiente" -ForegroundColor DarkGray
      }
      $log = Join-Path $jobsDir ($v.id + '\out.log')
      if (Test-Path $log) {
        $kb = [math]::Round(((Get-Item $log).Length / 1024), 1)
        Write-Host ("  out.log: " + $kb + " KB  (cresce = esta vivo)")
        foreach ($l in (Get-Content $log -Tail 60 | Where-Object { $_ -match '"command"|"agent_message"' } | Select-Object -Last 2)) {
          $txt = $l
          if ($l -match '"command":"([^"]{1,90})') { $txt = "comando: " + $matches[1] }
          elseif ($l -match '"text":"([^"]{1,90})') { $txt = $matches[1] }
          Write-Host ("    > " + $txt) -ForegroundColor DarkGray
        }
      } else {
        Write-Host "  (sem out.log ainda)" -ForegroundColor DarkGray
      }
      Write-Host ""
    }
  }
  Write-Host "Ctrl+C para fechar." -ForegroundColor DarkGray
  Start-Sleep -Seconds 5
}
