# fleet-watch.ps1 - board AO VIVO de todos os pilares num so terminal (read-only, sem GPU).
# Mostra a evolucao de cada pilar (estado, ronda, heartbeat, ultimo passo) e atualiza a cada 3s.
# Uso:  pwsh -File _handoff/loop/fleet-watch.ps1     (ou clica direito > Run with PowerShell)
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
function Get-Buses {
  $b = @()
  if (Test-Path "$repo\_handoff\loop\STATE.json") { $b += [pscustomobject]@{ name="autopilot (pilar #1)"; dir="$repo\_handoff\loop" } }
  Get-ChildItem "$repo\_handoff\fleet" -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path "$($_.FullName)\STATE.json" } |
    ForEach-Object { $b += [pscustomobject]@{ name=$_.Name; dir=$_.FullName } }
  return $b
}
while ($true) {
  Clear-Host
  Write-Host ("=== MOOTER FLEET - board ao vivo  ({0}) ===" -f (Get-Date -Format "HH:mm:ss")) -ForegroundColor Cyan
  $buses = Get-Buses
  if ($buses.Count -eq 0) { Write-Host "Sem pilares ainda (a frota F1 esta a nascer). Volta quando a WF aterrar." -ForegroundColor DarkGray }
  foreach ($bus in $buses) {
    $line = "---"
    try {
      $s = Get-Content "$($bus.dir)\STATE.json" -Raw -EA Stop | ConvertFrom-Json
      $pill = switch ($s.status) { "cc_running" {"[a trabalhar]"} "awaiting_eval" {"[a avaliar]"} "awaiting_human" {"[PRECISA DE TI]"} "done" {"[feito]"} "stopped" {"[parado]"} default {"[$($s.status)]"} }
      $col  = switch ($s.status) { "cc_running" {"Yellow"} "awaiting_eval" {"Green"} "awaiting_human" {"Red"} "done" {"Green"} default {"Gray"} }
      $hbAge = "?"
      try { $hb = Get-Content "$($bus.dir)\heartbeat.json" -Raw -EA Stop | ConvertFrom-Json; $hbAge = [int]((Get-Date).ToUniversalTime() - (Get-Date $hb.ts).ToUniversalTime()).TotalSeconds } catch {}
      Write-Host ""
      Write-Host ("# {0}  {1}" -f $bus.name, $pill) -ForegroundColor $col
      Write-Host ("  wave={0}  round={1}/{2}  heartbeat={3}s atras" -f $s.wave, $s.round, $s.maxRounds, $hbAge)
      try { $last = Get-Content "$($bus.dir)\ledger.jsonl" -Tail 1 -EA Stop; Write-Host ("  ledger: {0}" -f $last) -ForegroundColor DarkGray } catch {}
      $ob = "$($bus.dir)\OUTBOX.md"
      if ((Test-Path $ob) -and ((Get-Item $ob).Length -gt 40)) { $head = (Get-Content $ob -TotalCount 2) -join " "; Write-Host ("  ultimo: {0}" -f $head.Substring(0,[Math]::Min(160,$head.Length))) -ForegroundColor DarkCyan }
      if (Test-Path "$($bus.dir)\ASK_HUMAN.md") { Write-Host "  >>> GATE: pede aprovacao (cria HUMAN_OK ou usa o cockpit)" -ForegroundColor Red }
    } catch { Write-Host ("# {0}  [a iniciar]" -f $bus.name) -ForegroundColor Gray }
  }
  Write-Host ""
  Write-Host "(atualiza a cada 3s - Ctrl+C para sair. O trabalho corre no servico pm2, nao aqui.)" -ForegroundColor DarkGray
  Start-Sleep -Seconds 3
}
