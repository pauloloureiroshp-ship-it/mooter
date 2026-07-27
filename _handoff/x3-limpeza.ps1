# x3-limpeza.ps1 - so ASCII. NAO APAGA NADA: move para _to_delete\.
# Fecha o lixo estrutural: pastas temporarias de teste dentro de scripts\,
# saidas de runners em _handoff\, e a worktree da super-auditoria.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\x3-limpeza-saida.txt'
$quarentena = 'C:\Users\Paulo Loureiro\frugal\_to_delete\2026-07-27'
New-Item -ItemType Directory -Force -Path $quarentena | Out-Null
"== quarentena: $quarentena ==" | Out-File -Encoding ascii $log
"(nada e apagado - ficam aqui ate tu decidires)" | Out-File -Encoding ascii -Append $log

# --- 1. pastas temporarias de teste dentro de scripts\ -------------------
# Padrao: prefixo conhecido + sufixo aleatorio do mkdtempSync. Sao lixo de
# testes que resolveram o tmpdir para dentro do repo.
$prefixos = @('lec-','lecw-','lecw-run-','leq-','leas-','le-task-snap-','lp-cd-','lp-del-','lp-edit-','lp-prompt-','lp-quality-','lp-tree-','lp-undo-','lpa-e2e-','lpa-fleet-','lpa-journal-','lpsk-','gj2-','gj3-','guardian-prebake-')
$movidas = 0
$destScripts = Join-Path $quarentena 'scripts-temp'
New-Item -ItemType Directory -Force -Path $destScripts | Out-Null
foreach ($d in (Get-ChildItem 'scripts' -Directory -ErrorAction SilentlyContinue)) {
  $bate = $false
  foreach ($p in $prefixos) { if ($d.Name -like ($p + '*')) { $bate = $true; break } }
  if (-not $bate) { continue }
  # so move se o git NAO conhecer nada la dentro
  $tracked = git ls-files -- ("scripts/" + $d.Name)
  if ($tracked) { ("MANTIDA (tem ficheiros versionados): scripts\" + $d.Name) | Out-File -Encoding ascii -Append $log; continue }
  Move-Item $d.FullName (Join-Path $destScripts $d.Name) -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $d.FullName)) { $movidas++ }
}
("pastas temporarias movidas de scripts\: " + $movidas) | Out-File -Encoding ascii -Append $log

# --- 2. saidas de runners em _handoff\ ----------------------------------
$destSaidas = Join-Path $quarentena 'handoff-saidas'
New-Item -ItemType Directory -Force -Path $destSaidas | Out-Null
$padroes = @('*-saida.txt','*-console.txt','*-resultado.txt','msg-*.txt','*.tmp')
$saidas = 0
foreach ($pat in $padroes) {
  foreach ($f in (Get-ChildItem '_handoff' -File -Filter $pat -ErrorAction SilentlyContinue)) {
    $tracked = git ls-files -- ("_handoff/" + $f.Name)
    if ($tracked) { continue }
    Move-Item $f.FullName (Join-Path $destSaidas $f.Name) -Force -ErrorAction SilentlyContinue
    $saidas++
  }
}
("saidas de runner movidas de _handoff\: " + $saidas) | Out-File -Encoding ascii -Append $log

# --- 3. a worktree da super-auditoria (lixo da sessao anterior) ----------
"== worktree da super-auditoria ==" | Out-File -Encoding ascii -Append $log
$wt = 'C:\Users\Paulo Loureiro\frugal-super-auditoria'
if (Test-Path $wt) {
  $sujo = git -C $wt status --porcelain
  if ($sujo) {
    "NAO REMOVIDA: tem alteracoes por commitar. Ve tu primeiro:" | Out-File -Encoding ascii -Append $log
    $sujo | Out-File -Encoding ascii -Append $log
  } else {
    git worktree remove $wt --force 2>&1 | Out-File -Encoding ascii -Append $log
    if (-not (Test-Path $wt)) {
      "worktree removida (estava limpa)" | Out-File -Encoding ascii -Append $log
      git branch -D 'mooter/wt-super-auditoria' 2>&1 | Out-File -Encoding ascii -Append $log
    }
  }
} else { "a worktree ja nao existe" | Out-File -Encoding ascii -Append $log }
git worktree prune 2>&1 | Out-File -Encoding ascii -Append $log

# --- 4. estado depois ----------------------------------------------------
"== untracked por familia, DEPOIS ==" | Out-File -Encoding ascii -Append $log
$por = git status --porcelain | Where-Object { $_ -like '?? *' } | ForEach-Object {
  $p = $_.Substring(3); if ($p.Contains('/')) { $p.Split('/')[0] + '/' } else { $p }
}
($por | Group-Object | Sort-Object Count -Descending | Select-Object -First 8 | ForEach-Object { "  " + $_.Count + "  " + $_.Name }) | Out-File -Encoding ascii -Append $log
("TOTAL untracked: " + $por.Count) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
