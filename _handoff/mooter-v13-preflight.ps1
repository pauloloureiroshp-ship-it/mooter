# mooter-v13-preflight.ps1 -- ASCII only (PowerShell 5.1 safe)
# Checks everything that must be true BEFORE and AFTER installing mooter-v130.mcpb.
# Read-only: touches no file except its own log. Nothing here can break anything.

$ErrorActionPreference = 'Continue'
$repo = Join-Path $env:USERPROFILE 'frugal'
$mcpb = Join-Path $repo '_handoff\mooter-v130.mcpb'
$log  = Join-Path $repo '_handoff\mooter-v13-preflight.log'
$expectSha = 'f81c7123e6f1d066f694cac92a6ffdf9c15503a2c8de2962ba5ab3a00273c9b9'
$lines = New-Object System.Collections.Generic.List[string]

function Say([string]$s) { Write-Host $s; $lines.Add($s) | Out-Null }

Say "=== MOOTER v1.3 PREFLIGHT === $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Say ""

# 1. bundle exists and is the exact one that was tested
Say "[1] Bundle"
if (Test-Path $mcpb) {
  $size = (Get-Item $mcpb).Length
  $sha  = (Get-FileHash $mcpb -Algorithm SHA256).Hash.ToLower()
  Say "    ficheiro : $mcpb"
  Say "    tamanho  : $size bytes"
  Say "    sha256   : $sha"
  if ($sha -eq $expectSha) { Say "    OK       : e' exactamente o bundle testado (75 testes verdes)" }
  else { Say "    ATENCAO  : sha diferente do testado. Re-empacota antes de instalar." }
} else {
  Say "    FALTA    : $mcpb nao existe"
}
Say ""

# 2. installed version, if any
Say "[2] Extensao instalada"
$extRoot = Join-Path $env:APPDATA 'Claude\Claude Extensions'
if (Test-Path $extRoot) {
  $found = Get-ChildItem $extRoot -Recurse -Filter 'manifest.json' -ErrorAction SilentlyContinue |
           Where-Object { (Get-Content $_.FullName -Raw) -match '"name"\s*:\s*"mooter"' }
  if ($found) {
    foreach ($f in $found) {
      $m = Get-Content $f.FullName -Raw | ConvertFrom-Json
      Say "    encontrada: versao $($m.version)  em  $($f.DirectoryName)"
      if ($m.version -eq '1.3.0') { Say "    OK       : ja e' a v1.3.0" }
      else { Say "    ACCAO    : desinstala e instala o mooter-v130.mcpb" }
    }
  } else { Say "    nenhuma extensao mooter encontrada (primeira instalacao)" }
} else { Say "    pasta de extensoes nao encontrada: $extRoot" }
Say ""

# 3. Ollama
Say "[3] Ollama (tier local)"
try {
  $ps = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 3
  Say "    OK       : daemon responde"
  if ($ps.models -and $ps.models.Count -gt 0) {
    foreach ($m in $ps.models) { Say "    residente: $($m.model)  VRAM $([math]::Round($m.size_vram/1GB,1)) GB" }
  } else { Say "    a correr, nenhum modelo residente (o primeiro job local carrega um)" }
  $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
  Say "    instalados: $($tags.models.Count) modelos"
} catch {
  Say "    n/d      : Ollama nao respondeu. O tier local fica indisponivel (nao e' fatal)."
}
Say ""

# 4. GPU
Say "[4] GPU"
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($smi) {
  $q = & nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>$null
  Say "    OK       : $q"
} else {
  Say "    n/d      : nvidia-smi nao encontrado. O painel dira 'placa n/d' (honesto)."
}
Say ""

# 5. CLIs the dispatcher spawns
Say "[5] CLIs de agente"
foreach ($bin in @('claude','codex','gemini')) {
  $c = Get-Command $bin -ErrorAction SilentlyContinue
  if ($c) { Say "    OK       : $bin -> $($c.Source)" } else { Say "    em falta : $bin nao esta no PATH (jobs desse agente vao falhar com ENOENT)" }
}
Say ""

# 6. ledger and stuck jobs
Say "[6] Ledger e jobs presos"
$ledger = Join-Path $env:USERPROFILE '.mooter\ledger.jsonl'
if (Test-Path $ledger) {
  $all = Get-Content $ledger
  Say "    linhas   : $($all.Count)"
  $state = @{}
  foreach ($l in $all) {
    try { $e = $l | ConvertFrom-Json } catch { continue }
    if (-not $e.job_id) { continue }
    if ($e.event -eq 'dispatched' -or $e.event -eq 'started') { $state[$e.job_id] = $e }
    if ($e.event -eq 'done' -or $e.event -eq 'failed' -or $e.event -eq 'collected') { $state.Remove($e.job_id) }
  }
  if ($state.Count -gt 0) {
    Say "    ATENCAO  : $($state.Count) job(s) sem estado terminal:"
    foreach ($k in $state.Keys) { Say "               $k  ($($state[$k].agent) em $($state[$k].worktree))" }
    Say "    ACCAO    : depois de instalar, corre  mooter_cancel(sweep:true)  no Cowork"
  } else { Say "    OK       : nenhum job preso" }
} else { Say "    sem ledger ainda (nenhum job despachado nesta maquina)" }
Say ""

# 7. vault
Say "[7] Vault Obsidian"
# Precedencia canonica (AGENTS.md § Agent boot & freshness, e journal.js): MOOTER_VAULT ->
# VAULT_PATH -> raiz do home. Documents\paulo-vault e o clone STALE (G15) e nao entra na lista.
$cands = @(
  $env:MOOTER_VAULT,
  $env:VAULT_PATH,
  (Join-Path $env:USERPROFILE 'paulo-vault')
) | Where-Object { $_ }
$vaultFound = $false
foreach ($c in $cands) {
  if (Test-Path (Join-Path $c '.obsidian')) { Say "    OK       : $c"; $vaultFound = $true; break }
}
if (-not $vaultFound) { Say "    n/d      : nenhum candidato tem .obsidian (o Mooter nao vai escrever as cegas)" }
Say ""

Say "=== FIM ==="
Say "Proximo passo: Settings > Desktop app > Extensions > mooter > Uninstall"
Say "               > Advanced settings > Install Extension... > $mcpb"
Say "               > confirmar Version 1.3.0 > fechar o Claude Desktop (tray incluida) > reabrir"

[IO.File]::WriteAllText($log, ($lines -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "log gravado em: $log"
Write-Host ""
Read-Host "Enter para fechar"
