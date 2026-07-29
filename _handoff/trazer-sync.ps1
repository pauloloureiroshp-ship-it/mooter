# trazer-sync.ps1 - so ASCII. Traz o sync.js da worktree frugal-eyeball para a principal.
# NAO faz merge de branch: copia os ficheiros novos e comita SELECTIVAMENTE.
# Motivo: as duas worktrees estao em branches diferentes; um merge traria tudo
# o que a eyeball tem por commitar, e nao e isso que queremos.
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\trazer-sync-saida.txt'
"== o que a eyeball produziu ==" | Out-File -Encoding ascii $log
Set-Location 'C:\Users\Paulo Loureiro\frugal-eyeball'
(git status --porcelain -- packages/mooter-bridge SYNC.md) | Out-File -Encoding ascii -Append $log

$origem = 'C:\Users\Paulo Loureiro\frugal-eyeball'
$destino = 'C:\Users\Paulo Loureiro\frugal'
$copiar = @(
  'packages\mooter-bridge\sync.js',
  'packages\mooter-bridge\sync.test.js'
)
"== copiar ==" | Out-File -Encoding ascii -Append $log
foreach ($f in $copiar) {
  $src = Join-Path $origem $f
  $dst = Join-Path $destino $f
  if (Test-Path $src) {
    Copy-Item $src $dst -Force
    $a = (Get-FileHash $src -Algorithm SHA256).Hash
    $b = (Get-FileHash $dst -Algorithm SHA256).Hash
    ("  " + $f + "  sha_origem=" + $a.Substring(0,12) + "  sha_destino=" + $b.Substring(0,12) + "  igual=" + ($a -eq $b)) | Out-File -Encoding ascii -Append $log
  } else {
    ("  FALTA na origem: " + $f) | Out-File -Encoding ascii -Append $log
  }
}

# o SYNC.md gerado tambem vem, se existir e for diferente
$syncSrc = Join-Path $origem 'SYNC.md'
if (Test-Path $syncSrc) {
  Copy-Item $syncSrc (Join-Path $destino 'SYNC.md') -Force
  "  SYNC.md copiado" | Out-File -Encoding ascii -Append $log
}

"== primeiras 40 linhas do SYNC.md gerado ==" | Out-File -Encoding ascii -Append $log
(Get-Content (Join-Path $destino 'SYNC.md') -TotalCount 40) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
