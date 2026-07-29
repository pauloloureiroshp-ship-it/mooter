# limpar-e-commitar-claudemd.ps1 - so ASCII. Auto-validante.
# Descarta SO ruido do mount (whitespace/CRLF, zero conteudo) e comita o CLAUDE.md.
# NAO toca em landing/app/page.tsx - mudanca de cor orfa, decisao do Paulo.
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\limpar-saida.txt'
"== status antes ==" | Out-File -Encoding ascii $log
(git status --porcelain) | Out-File -Encoding ascii -Append $log

"== confirmar que os 3 sao mesmo ruido (diff --ignore-all-space tem de vir VAZIO) ==" | Out-File -Encoding ascii -Append $log
$ruido = @(
  'packages/mooter-bridge/seamless.js',
  'packages/mooter-bridge/tools6.js',
  '_handoff/_archive/2026-07/cleanup-log.txt'
)
$seguro = $true
foreach ($f in $ruido) {
  $d = git diff --ignore-all-space --ignore-blank-lines -- $f
  if ($d) {
    ("PARA TUDO: " + $f + " tem conteudo real, nao e ruido") | Out-File -Encoding ascii -Append $log
    $seguro = $false
  } else {
    ("ok ruido: " + $f) | Out-File -Encoding ascii -Append $log
  }
}
if (-not $seguro) { "ABORTADO - nada foi descartado" | Out-File -Encoding ascii -Append $log; exit 1 }

foreach ($f in $ruido) { git checkout -- $f }
"== descartados ==" | Out-File -Encoding ascii -Append $log

git add -- 'CLAUDE.md'
$msg = @"
docs: CLAUDE.md aponta para o AGENTS.md em vez de repetir

Pointer-discipline: o canon tool-agnostico vive no AGENTS.md e e
auto-importado. Duplicar aqui cria duas verdades que divergem.
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-claudemd.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-claudemd.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
"== status depois (so deve sobrar landing/app/page.tsx) ==" | Out-File -Encoding ascii -Append $log
(git status --porcelain) | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
