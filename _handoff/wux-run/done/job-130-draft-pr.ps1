# job-130-draft-pr.ps1 -- push wave-ux branch + open draft PR (merge stays Paulo's)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'

Write-Output '== push branch (draft PR sanctioned by brief; merge = Paulo) =='
& git -C $W push -u origin wave-ux 2>&1 | Select-Object -Last 6
Write-Output ('push exit=' + $LASTEXITCODE)

Write-Output '== gh pr create --draft =='
Push-Location $W
& gh.exe pr create --draft --base main --head wave-ux --title 'feat(mc): W-UX - Live Sessions clean (4 keepers via Codex plane)' --body-file (Join-Path $F '_handoff\wux-run\prompts\pr-body.md') 2>&1
Write-Output ('gh exit=' + $LASTEXITCODE)
Pop-Location
Write-Output '== job-130 done =='
