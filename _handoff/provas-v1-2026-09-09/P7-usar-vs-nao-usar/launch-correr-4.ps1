# launch-correr-4.ps1 — P7: lança o R-24 --correr como processo SEPARADO da sessão Claude Code, com log.
# A guarda ambienteApto() do controlador recusa correr dentro de uma sessão (marcas de ambiente abaixo).
# Uso (a partir da sessão): Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<este ficheiro>' -WindowStyle Hidden
foreach ($k in 'CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH','CLAUDE_CODE_SESSION_ID','CLAUDECODE') {
  if (Test-Path "Env:$k") { Remove-Item "Env:$k" }
}
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\r24\correr-corrida-4.log'
"=== launch $(Get-Date -Format o) pid $PID ===" | Out-File -FilePath $log -Append -Encoding utf8
node tools/ab/r24-diagnostico.mjs --prereg tools/ab/r24-prereg.json 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== --correr $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --snapshots 'C:/Users/Paulo Loureiro/AppData/Local/Temp/r24-snapshots-c4' --correr 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== --correr exit $LASTEXITCODE $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --snapshots 'C:/Users/Paulo Loureiro/AppData/Local/Temp/r24-snapshots-c4' --analisar 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"=== --analisar exit $LASTEXITCODE $(Get-Date -Format o) ===" | Out-File -FilePath $log -Append -Encoding utf8
