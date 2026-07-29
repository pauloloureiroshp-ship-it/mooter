$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
$homeDir = "C:\Users\Paulo Loureiro"
$log = Join-Path $repo "_handoff\validate-frugal-folders.log"
Start-Transcript -Path $log -Force | Out-Null

Write-Output "== VALIDATE FRUGAL FOLDERS (read-only, no mutations) =="
Write-Output (Get-Date -Format s)

Write-Output ""
Write-Output "== 1. Registered worktrees (git truth) =="
git -C $repo worktree list

Write-Output ""
Write-Output "== 2. All frugal* folders on disk =="
$dirs = Get-ChildItem $homeDir -Directory -Filter "frugal*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
foreach ($d in $dirs) { Write-Output $d }
Write-Output ("TOTAL FOLDERS: {0}" -f ($dirs | Measure-Object).Count)

Write-Output ""
Write-Output "== 3. Orphans (folder on disk but NOT a registered worktree) =="
$wtPaths = git -C $repo worktree list --porcelain | Where-Object { $_ -like 'worktree *' } | ForEach-Object { $_.Substring(9) }
$wtNames = @()
foreach ($p in $wtPaths) { $wtNames += (Split-Path $p -Leaf) }
$orphanCount = 0
foreach ($d in $dirs) {
  if ($wtNames -notcontains $d) {
    $orphanCount++
    $p = Join-Path $homeDir $d
    $top = (Get-ChildItem $p -ErrorAction SilentlyContinue | Measure-Object).Count
    $hasGit = Test-Path (Join-Path $p ".git")
    Write-Output ("ORPHAN: {0} | top-level entries: {1} | .git present: {2}" -f $d, $top, $hasGit)
  }
}
if ($orphanCount -eq 0) { Write-Output "No orphan folders. Disk matches git registry." }

Write-Output ""
Write-Output "== 4. Commits that exist on NO remote (parked work — the only losable thing) =="
$parked = git -C $repo log --branches --not --remotes --oneline --no-decorate 2>$null
Write-Output ("TOTAL UNPUSHED COMMITS (all local branches): {0}" -f ($parked | Measure-Object).Count)
Write-Output "-- first 40 with branch decoration:"
git -C $repo log --branches --not --remotes --oneline -n 40

Write-Output ""
Write-Output "== 5. Key branches: tip + unpushed count =="
$branches = @("wave/lp-producao-perfeita","feat/handoff-spine-v2-a-audit-fixes","wave/honest-controls","chore/tese-v2","backup/tree-snapshot-2026-07-14","feat/cockpit-live-preview-polish")
foreach ($b in $branches) {
  $tip = git -C $repo rev-parse --short $b 2>$null
  if ($tip) {
    $cnt = (git -C $repo log --oneline $b --not --remotes 2>$null | Measure-Object).Count
    Write-Output ("{0} @ {1} | unpushed commits: {2}" -f $b, $tip, $cnt)
  } else {
    Write-Output ("{0} | BRANCH NOT FOUND" -f $b)
  }
}

Write-Output ""
Write-Output "== 6. classify.js frozen check =="
$sha = (Get-FileHash (Join-Path $repo "tools\router\classify.js") -Algorithm SHA256).Hash.ToLower()
Write-Output ("sha256: {0}" -f $sha)
if ($sha -eq "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f") {
  Write-Output "FROZEN OK"
} else {
  Write-Output "!!! FROZEN VIOLATION - DO NOT PROCEED WITH ANY WAVE !!!"
}

Write-Output ""
Write-Output "== 7. Main tree dirty count =="
$dirty = (git -C $repo status --short 2>$null | Measure-Object).Count
Write-Output ("Modified/untracked entries in main tree: {0}" -f $dirty)

Write-Output ""
Write-Output "== DONE. Log: $log =="
Stop-Transcript | Out-Null
