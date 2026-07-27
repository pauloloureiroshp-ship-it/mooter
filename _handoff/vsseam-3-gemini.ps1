# VSSEAM-3 GEMINI — roda a admissao no CLI gemini em modo headless (read-only) e captura o BACK
$log = Join-Path $PSScriptRoot "vsseam-3-gemini.log"
$repo = "C:\Users\Paulo Loureiro\frugal"
$mp = Join-Path $repo "_handoff\VS_SEAM_GEMINI_ADMISSAO_MASTERPROMPT.md"
"=== VSSEAM-3 GEMINI $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
if (-not (Test-Path $mp)) { "ERRO: masterprompt nao encontrado em $mp" | Out-File $log -Append -Encoding ascii; exit 1 }
Set-Location $repo
"Rodando gemini headless (pode demorar varios minutos - web + greps reais)..." | Out-File $log -Append -Encoding ascii
Get-Content $mp -Raw | gemini 2>&1 | Out-File $log -Append -Encoding ascii
"DONE. Cole o conteudo de vsseam-3-gemini.log no Cowork para o veredicto." | Out-File $log -Append -Encoding ascii
Write-Host "VSSEAM-3 concluido. Veja vsseam-3-gemini.log"
