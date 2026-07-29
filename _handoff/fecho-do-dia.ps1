# fecho-do-dia.ps1 - so ASCII. Limpa o ruido do mount e prova o estado final.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\fecho-do-dia-saida.txt'
"== descartar ruido do mount (so se o diff sem espacos vier VAZIO) ==" | Out-File -Encoding ascii $log
foreach ($f in @('packages/mooter-bridge/seamless.js','packages/mooter-bridge/tools6.js')) {
  $d = git diff --ignore-all-space --ignore-blank-lines -- $f
  if ($d) { ("MANTIDO (tem conteudo real): " + $f) | Out-File -Encoding ascii -Append $log }
  else { git checkout -- $f; ("descartado (ruido): " + $f) | Out-File -Encoding ascii -Append $log }
}

"== estado final ==" | Out-File -Encoding ascii -Append $log
("HEAD local:  " + (git rev-parse --short HEAD)) | Out-File -Encoding ascii -Append $log
("HEAD remoto: " + (git rev-parse --short origin/chore/mooter-20-h0)) | Out-File -Encoding ascii -Append $log
"por commitar (fora dos untracked historicos):" | Out-File -Encoding ascii -Append $log
(git status --porcelain -- packages SYNC.md CLAUDE.md landing docs) | Out-File -Encoding ascii -Append $log

"== gate: o SYNC.md esta fresco? (--check tem de nao escrever nada) ==" | Out-File -Encoding ascii -Append $log
node packages/mooter-bridge/sync.js --check 2>&1 | Out-File -Encoding ascii -Append $log
("exit do --check: " + $LASTEXITCODE) | Out-File -Encoding ascii -Append $log

"== versao instalada na pasta REAL da extensao ==" | Out-File -Encoding ascii -Append $log
$ext = 'C:\Users\Paulo Loureiro\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\Claude Extensions\local.mcpb.paulo-loureiro.mooter\server\manifest.json'
if (Test-Path $ext) {
  $m = Get-Content $ext -Raw | ConvertFrom-Json
  ("manifest instalado: " + $m.version) | Out-File -Encoding ascii -Append $log
  ("ficheiros na pasta: " + (Get-ChildItem (Split-Path $ext) -File).Count) | Out-File -Encoding ascii -Append $log
} else { "NAO ENCONTREI o manifest instalado" | Out-File -Encoding ascii -Append $log }

"== classify.js FROZEN ==" | Out-File -Encoding ascii -Append $log
((Get-FileHash 'tools\router\classify.js' -Algorithm SHA256).Hash.ToLower()) | Out-File -Encoding ascii -Append $log
"esperado: 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f" | Out-File -Encoding ascii -Append $log

"== jobs vivos (tem de ser zero antes de reiniciares) ==" | Out-File -Encoding ascii -Append $log
$cx = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'codex.exe' }
if ($cx) { foreach ($c in $cx) { ("VIVO: codex.exe pid " + $c.ProcessId) | Out-File -Encoding ascii -Append $log } }
else { "nenhum codex.exe vivo - e seguro reiniciar o Desktop" | Out-File -Encoding ascii -Append $log }
"FIM" | Out-File -Encoding ascii -Append $log
