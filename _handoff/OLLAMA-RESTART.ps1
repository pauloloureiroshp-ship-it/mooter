# OLLAMA-RESTART.ps1 - reinicia o Ollama e PROVA que o KV cache q8_0 pegou. So ASCII.
# Sem isto o OLLAMA_KV_CACHE_TYPE gravado na Onda 1 fica gravado e inactivo.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
Start-Transcript -Path (Join-Path $repo '_handoff\ollama-restart.txt') -Force
try {
  Write-Host '=== ANTES ==='
  $env_kv = [Environment]::GetEnvironmentVariable('OLLAMA_KV_CACHE_TYPE','User')
  Write-Host ('env User OLLAMA_KV_CACHE_TYPE = ' + $env_kv)
  try {
    $ps = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 5
    foreach ($m in $ps.models) { Write-Host ('  residente: ' + $m.name + ' ctx=' + $m.context_length) }
    if (-not $ps.models) { Write-Host '  (nenhum modelo residente)' }
  } catch { Write-Host '  /api/ps nao respondeu' }

  Write-Host '=== A PARAR ==='
  $procs = Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue
  foreach ($p in $procs) { Write-Host ('  a matar ' + $p.ProcessName + ' pid=' + $p.Id) }
  if ($procs) { $procs | Stop-Process -Force; Start-Sleep -Seconds 4 }

  Write-Host '=== A ARRANCAR ==='
  # a app de tray relanca o servidor; se nao existir, cai para `ollama serve`
  $app = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
  if (Test-Path $app) {
    Start-Process -FilePath $app -WindowStyle Hidden
    Write-Host ('  lancado: ' + $app)
  } else {
    $exe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
    if (-not $exe) { throw 'nao encontrei o executavel do ollama' }
    Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden
    Write-Host ('  lancado: ' + $exe + ' serve')
  }

  Write-Host '=== A ESPERAR PELO DAEMON ==='
  $ok = $false
  for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
      if ($tags) { $ok = $true; Write-Host ('  responde ao fim de ' + ($i*2) + 's · ' + $tags.models.Count + ' modelos instalados'); break }
    } catch { }
  }
  if (-not $ok) { throw 'o daemon nao voltou em 60s' }

  Write-Host '=== PROVA: um pedido real com num_ctx alto ==='
  # escolhe o modelo mais pequeno instalado para a prova ser rapida
  $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5
  $gen = $tags.models | Where-Object { $_.name -notmatch 'embed|bge|gte|minilm|nomic|mxbai' } | Sort-Object size | Select-Object -First 1
  Write-Host ('  modelo de prova: ' + $gen.name)
  $body = @{ model = $gen.name; messages = @(@{ role='user'; content='responde apenas: ok' });
             stream = $false; keep_alive = '10m'; options = @{ temperature = 0.2; num_ctx = 16384 } } | ConvertTo-Json -Depth 5
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
  Write-Host ('  resposta: ' + $r.message.content)

  Write-Host '=== DEPOIS (a prova que interessa) ==='
  $ps2 = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 5
  foreach ($m in $ps2.models) {
    Write-Host ('  residente: ' + $m.name + '  context_length=' + $m.context_length + '  vram=' + $m.size_vram)
    if ($m.context_length -ge 16384) { Write-Host '  VEREDICTO: num_ctx >= 16384 CONFIRMADO' }
    else { Write-Host ('  VEREDICTO: ainda ' + $m.context_length + ' - o num_ctx nao pegou') }
  }
  Write-Host 'OK OLLAMA REINICIADO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
