# job-041-codex-k1-retry.ps1 -- Keeper 1 retry with explicit model (default gpt-5.6-sol needs newer CLI)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

Write-Output '== config.toml model lines =='
Get-Content "$env:USERPROFILE\.codex\config.toml" -ErrorAction SilentlyContinue | Select-String -Pattern 'model|effort' | ForEach-Object { $_.Line }

Push-Location $W
$Model = $null
foreach ($cand in @('gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5-codex')) {
    Write-Output ('== probe ' + $cand + ' ==')
    'Reply with exactly: pong' | & codex.cmd exec --skip-git-repo-check -s read-only -m $cand - 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -eq 0) { $Model = $cand; break }
}
if (-not $Model) { Write-Output 'NO WORKING MODEL FOUND'; Pop-Location; exit 2 }
Write-Output ('== using model: ' + $Model + ' ==')

Write-Output '== codex exec keeper1 =='
'Read the file .codex-briefs/keeper1.md in this repository and execute it exactly. It is your complete task brief. Do not commit; leave working-tree edits only.' | & codex.cmd exec --skip-git-repo-check -s workspace-write -m $Model - 2>&1
Write-Output ('codex exit=' + $LASTEXITCODE)
Write-Output '== git status =='
& git status --porcelain=v1 2>&1
Write-Output '== diff stat =='
& git diff --stat 2>&1
& git diff 2>&1 | Set-Content -Path (Join-Path $F '_handoff\wux-run\results\k1.diff') -Encoding UTF8
Write-Output 'diff saved to results\k1.diff'
Pop-Location
Write-Output '== job-041 done =='
