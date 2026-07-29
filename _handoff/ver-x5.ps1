# ver-x5.ps1 - so ASCII. Le o que o X5 fez na worktree eyeball. Nao altera nada.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\ver-x5-saida.log'
Set-Location 'C:\Users\Paulo Loureiro\frugal-eyeball'
"== status da eyeball ==" | Out-File -Encoding ascii $log
(git status --porcelain) | Out-File -Encoding ascii -Append $log
"== diff --stat ==" | Out-File -Encoding ascii -Append $log
(git diff --stat) | Out-File -Encoding ascii -Append $log
"== workflows ==" | Out-File -Encoding ascii -Append $log
if (Test-Path '.github\workflows') { (Get-ChildItem '.github\workflows' -File | Select-Object -ExpandProperty Name) | Out-File -Encoding ascii -Append $log }
else { "nao existe .github/workflows" | Out-File -Encoding ascii -Append $log }
"== sync:check no CI? ==" | Out-File -Encoding ascii -Append $log
(Select-String -Path '.github\workflows\*' -Pattern 'sync:check|sync.js' -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { $_.Filename + ':' + $_.LineNumber + '  ' + $_.Line.Trim() }) | Out-File -Encoding ascii -Append $log
"== barra.test.js: quantos testes ==" | Out-File -Encoding ascii -Append $log
if (Test-Path 'packages\mooter-bridge\barra.test.js') {
  ((Select-String -Path 'packages\mooter-bridge\barra.test.js' -Pattern "^test\(" ).Count.ToString() + " testes") | Out-File -Encoding ascii -Append $log
  (Select-String -Path 'packages\mooter-bridge\barra.test.js' -Pattern "^test\(" | ForEach-Object { '  ' + $_.Line.Trim() }) | Out-File -Encoding ascii -Append $log
}
"== .gitignore protege os .jsonl? ==" | Out-File -Encoding ascii -Append $log
(Select-String -Path '.gitignore' -Pattern 'jsonl' | ForEach-Object { '  ' + $_.LineNumber + ': ' + $_.Line }) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
