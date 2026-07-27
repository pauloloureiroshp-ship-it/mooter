$ErrorActionPreference = "Stop"

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "chore/mooter-20-h0") {
    Write-Host "ABORT: branch is $branch, expected chore/mooter-20-h0"
    exit 1
}

git log --oneline -3

$ahead = git rev-list --count origin/chore/mooter-20-h0..HEAD
if ($ahead -ne "2") {
    Write-Host "ABORT: ahead count is $ahead, expected 2"
    exit 1
}

$behind = git rev-list --count HEAD..origin/chore/mooter-20-h0
if ($behind -ne "0") {
    Write-Host "ABORT: behind count is $behind, expected 0"
    exit 1
}

$dirty = git status --porcelain -- packages/mooter-bridge SYNC.md .gitignore
if ($dirty) {
    Write-Host "ABORT: working tree not clean for guarded paths"
    exit 1
}

git push origin chore/mooter-20-h0
exit $LASTEXITCODE
