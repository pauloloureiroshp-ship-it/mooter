# job-042-codex-upgrade-k1.ps1 -- upgrade Codex CLI (runbook-sanctioned), then run keeper 1 on default model
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

Write-Output '== before =='
& codex.cmd --version 2>&1
Write-Output '== npm install -g @openai/codex@latest =='
& npm.cmd install -g '@openai/codex@latest' --no-audit --no-fund 2>&1 | Select-Object -Last 6
Write-Output ('npm exit=' + $LASTEXITCODE)
Write-Output '== after =='
& codex.cmd --version 2>&1
& codex.cmd login status 2>&1
Write-Output '== probe default model =='
Push-Location $W
'Reply with exactly: pong' | & codex.cmd exec --skip-git-repo-check -s read-only - 2>&1 | Select-Object -Last 3
Write-Output ('probe exit=' + $LASTEXITCODE)
if ($LASTEXITCODE -ne 0) { Write-Output 'PROBE FAILED - aborting keeper run'; Pop-Location; exit 2 }

Write-Output '== codex exec keeper1 =='
'Read the file .codex-briefs/keeper1.md in this repository and execute it exactly. It is your complete task brief. Do not commit; leave working-tree edits only.' | & codex.cmd exec --skip-git-repo-check -s workspace-write - 2>&1
Write-Output ('codex exit=' + $LASTEXITCODE)
Write-Output '== git status =='
& git status --porcelain=v1 2>&1
Write-Output '== diff stat =='
& git diff --stat 2>&1
& git diff 2>&1 | Set-Content -Path (Join-Path $F '_handoff\wux-run\results\k1.diff') -Encoding UTF8
Write-Output 'diff saved to results\k1.diff'
Pop-Location
Write-Output '== job-042 done =='
