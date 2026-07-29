# merge-248-249.ps1 — checa CI e mergeia #248 + #249 SE tudo estiver 100% verde.
# Se não estiver 100% verde, PARA e mostra o que falta — não força nada.
# Roda nativo (git idle noutras sessoes). Repo fixo abaixo, sem ambiguidade de pasta.
$ErrorActionPreference = 'Stop'
$repo = "C:\Users\Paulo Loureiro\frugal"
$log = Join-Path $repo "_handoff\merge-248-249.log"
Start-Transcript -Path $log -Force | Out-Null

Write-Output "== merge-248-249 =="
Write-Output (Get-Date -Format s)
Set-Location $repo
Write-Output ("Pasta: {0}" -f (Get-Location).Path)

Write-Output ""
Write-Output "== gh CLI =="
gh --version
if ($LASTEXITCODE -ne 0) {
  Write-Output "ABORT: gh CLI nao encontrado/autenticado. Nada foi tocado."
  Stop-Transcript | Out-Null
  exit 1
}

function Get-PrStatus($num) {
  $json = gh pr view $num --json number,state,mergedAt,mergeable,statusCheckRollup,title 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return $json | ConvertFrom-Json
}

function Get-CheckLabel($c) {
  # CheckRun usa .name/.conclusion ; StatusContext (ex. Vercel) usa .context/.state
  $n = if ($c.name) { $c.name } elseif ($c.context) { $c.context } else { "(sem nome)" }
  $v = if ($c.conclusion) { $c.conclusion } elseif ($c.state) { $c.state } else { $null }
  return @{ name = $n; verdict = $v }
}

function Test-AllGreen($pr) {
  if (-not $pr) { return $false }
  $labeled = $pr.statusCheckRollup | ForEach-Object { Get-CheckLabel $_ }
  $bad = $labeled | Where-Object { $_.verdict -and $_.verdict -notin @('SUCCESS','NEUTRAL','SKIPPED') }
  $pending = $labeled | Where-Object { -not $_.verdict }
  return @{ ok = ($bad.Count -eq 0 -and $pending.Count -eq 0); bad = $bad; pending = $pending; all = $labeled }
}

Write-Output ""
Write-Output "== #248 =="
$pr248 = Get-PrStatus 248
if (-not $pr248) { Write-Output "ABORT: nao consegui ler o #248."; Stop-Transcript | Out-Null; exit 1 }
Write-Output ("state={0} mergedAt={1} mergeable={2}" -f $pr248.state, $pr248.mergedAt, $pr248.mergeable)
if ($pr248.state -eq 'MERGED') { Write-Output "#248 ja esta MERGED. Ok, sigo para o #249." }

Write-Output ""
Write-Output "== #249 =="
$pr249 = Get-PrStatus 249
if (-not $pr249) { Write-Output "ABORT: nao consegui ler o #249."; Stop-Transcript | Out-Null; exit 1 }
Write-Output ("state={0} mergedAt={1} mergeable={2}" -f $pr249.state, $pr249.mergedAt, $pr249.mergeable)

$check249 = Test-AllGreen $pr249
$check248 = if ($pr248.state -eq 'OPEN') { Test-AllGreen $pr248 } else { @{ ok = $true; all = @() } }

Write-Output ""
Write-Output "== Checks do #248 =="
if ($check248.all.Count -eq 0) { Write-Output " (nenhum check reportado, ou #248 ja nao esta OPEN)" }
$check248.all | ForEach-Object { Write-Output (" - {0}: {1}" -f $_.name, $_.verdict) }

Write-Output ""
Write-Output "== Checks do #249 =="
$check249.all | ForEach-Object { Write-Output (" - {0}: {1}" -f $_.name, $_.verdict) }

if ($pr248.state -eq 'OPEN' -and -not $check248.ok) {
  Write-Output ""
  Write-Output "STOP: #248 nao esta 100% verde (bad=$($check248.bad.Count) pending=$($check248.pending.Count))."
  Write-Output "Nada foi mergeado. Ve a lista de checks do #248 acima."
  Stop-Transcript | Out-Null
  exit 1
}

if (-not $check249.ok) {
  Write-Output ""
  Write-Output "STOP: #249 nao esta 100% verde (bad=$($check249.bad.Count) pending=$($check249.pending.Count))."
  Write-Output "Nada foi mergeado. Se os unicos vermelhos forem os gsd-statusline ja investigados,"
  Write-Output "decide manualmente e roda: gh pr merge 248 --merge ; gh pr merge 249 --merge"
  Stop-Transcript | Out-Null
  exit 1
}

Write-Output ""
Write-Output "== Tudo 100% verde. Mergeando #248... =="
if ($pr248.state -eq 'OPEN') {
  gh pr merge 248 --merge --delete-branch=false
  if ($LASTEXITCODE -ne 0) { Write-Output "FALHA no merge do #248. Parei aqui de proposito."; Stop-Transcript | Out-Null; exit 1 }
}

Write-Output ""
Write-Output "== Mergeando #249... =="
gh pr merge 249 --merge --delete-branch=false
if ($LASTEXITCODE -ne 0) { Write-Output "FALHA no merge do #249."; Stop-Transcript | Out-Null; exit 1 }

Write-Output ""
git fetch origin main --quiet
$sha = git rev-parse origin/main
Write-Output ("SHA final de origin/main: {0}" -f $sha)
Write-Output "DONE."
Stop-Transcript | Out-Null
