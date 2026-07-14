# job-095-commit-k3.ps1 -- atomic commit for keeper 3 (selective add, no push)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

& git -C $W add packages/vscode-extension/src/extension.js packages/vscode-extension/src/honest-controls.test.js 2>&1
Write-Output ('add exit=' + $LASTEXITCODE)

$msg = @"
feat(mc): keeper 3 - optimistic feedback on the remaining B1 toggles

W-UX keeper 3/4 (audit B1): control-by-control confront showed 7 of 9 controls
already optimistic (modeBadge, pin-next, effort, setMode/setModel/setAuto/
setLoop - left untouched, evidence in the wave report). Fixed the two gaps:
budget apply and rate stars now flip visual state in the panel on click
(flashApply pattern), with an honest 'a aplicar...' indicator for CLI-backed
applies (<=8s) and snapshot reconciliation that always restores host truth
(no sticky optimistic state on rejection). 24px targets, var(--vscode-*),
prefers-reduced-motion. Extension suite 1028/1028 green; classify.js sha intact.

Implementacao: codex exec (OpenAI plane, OAuth ChatGPT).
Orquestracao/verificacao: Cowork (Claude).
"@
$msgPath = Join-Path $env:TEMP 'k3-commit-msg.txt'
[IO.File]::WriteAllText($msgPath, $msg, [Text.UTF8Encoding]::new($false))
& git -C $W commit -F $msgPath 2>&1
Write-Output ('commit exit=' + $LASTEXITCODE)
& git -C $W log --oneline -4 2>&1
& git -C $W status --porcelain=v1 2>&1
Write-Output '== job-095 done =='
