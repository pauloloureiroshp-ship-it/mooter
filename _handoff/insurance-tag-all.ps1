# INSURANCE — tag every local branch so NO commit can ever be lost.
# Additive + reversible. Run native on Windows with git idle (VS Code / CC / Codex closed).
$ErrorActionPreference = 'Stop'
$repo = "C:\Users\Paulo Loureiro\frugal"
$stamp = "2026-07-15"
$log = Join-Path $repo "_handoff\insurance-tag-all.log"
Start-Transcript -Path $log -Force | Out-Null

Set-Location $repo

# Safety: refuse if a lock is present (means a writer is active or a stale lock needs cleaning first)
if (Test-Path "$repo\.git\index.lock") {
  Write-Output "ABORT: .git\index.lock present. Close git apps and run PASSO -1 first."
  Stop-Transcript | Out-Null
  exit 1
}

$branches = git for-each-ref --format='%(refname:short)' refs/heads/
$made = 0; $skipped = 0
foreach ($b in $branches) {
  $safe = ($b -replace '[\\/]', '-')
  $tag = "insurance/$safe-$stamp"
  $exists = git tag -l $tag
  if ($exists) { $skipped++; continue }
  git tag -a $tag $b -m "insurance snapshot $stamp of $b" 2>$null
  if ($LASTEXITCODE -eq 0) { $made++ } else { Write-Output "FAIL tag on $b" }
}

$total = (git tag -l "insurance/*" | Measure-Object).Count
Write-Output ""
Write-Output ("Branches: {0} | tags criadas agora: {1} | ja existiam: {2}" -f ($branches | Measure-Object).Count, $made, $skipped)
Write-Output ("TOTAL tags insurance/*: {0}" -f $total)
Write-Output ""
Write-Output "Nada foi deletado. Nada foi pushado. Para publicar a rede de seguranca no remote:"
Write-Output "    git push origin --tags"
Write-Output ""
Write-Output "Para DESFAZER tudo (se quiseres): git tag -l 'insurance/*' | % { git tag -d `$_ }"
Stop-Transcript | Out-Null
