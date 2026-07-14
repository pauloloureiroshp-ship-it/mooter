# job-codex-k4 -- Keeper 4 via codex exec (OpenAI plane, OAuth ChatGPT)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'
$B = Join-Path $W '.codex-briefs'
New-Item -ItemType Directory -Path $B -Force | Out-Null
Copy-Item (Join-Path $F '_handoff\wux-run\prompts\keeper4.md') -Destination (Join-Path $B 'keeper4.md') -Force
Push-Location $W
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Write-Output '== codex exec keeper4 =='
'Read the file .codex-briefs/keeper4.md in this repository and execute it exactly. It is your complete task brief. Do not commit; leave working-tree edits only.' | & codex.cmd exec --skip-git-repo-check -s workspace-write - 2>&1
Write-Output ('codex exit=' + $LASTEXITCODE)
Write-Output '== git status =='
& git status --porcelain=v1 2>&1
Write-Output '== diff stat =='
& git diff --stat 2>&1
& git diff 2>&1 | Set-Content -Path (Join-Path $F '_handoff\wux-run\results\k4.diff') -Encoding UTF8
Write-Output 'diff saved to results\k4.diff'
Pop-Location
Write-Output '== job done =='
