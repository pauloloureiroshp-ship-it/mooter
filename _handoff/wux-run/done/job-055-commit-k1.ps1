# job-055-commit-k1.ps1 -- atomic commit for keeper 1 (selective add, no push)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

& git -C $W add packages/vscode-extension/src/extension.js packages/vscode-extension/src/mission-control-view.js packages/vscode-extension/src/mission-control-view.test.js 2>&1
Write-Output ('add exit=' + $LASTEXITCODE)

$msg = @"
feat(mc): keeper 1 - openSession routes through canonical openSessionTab deep-link

W-UX keeper 1/4 (W15 law 4, wave=sessao=aba): the legacy 'openSession' webview
message now delegates to the registered mooter.openSessionTab command (id+title)
and keeps its cockpit open-and-scope semantics; the 'openSessionTab' message is
the pure open path (no scoping). Mission Control pure-open buttons (mcv2-tgopen,
mcf-brow, mcf-gitlink) wire the canonical command with the session title and an
exact tooltip; mcf-pushbtn keeps open-and-scope. Tests: wiring + delegation +
tooltip coverage. Extension suite 1022/1022 green; classify.js sha intact.

Implementacao: codex exec (OpenAI plane, OAuth ChatGPT).
Orquestracao/verificacao: Cowork (Claude).
"@
Set-Content -Path (Join-Path $env:TEMP 'k1-commit-msg.txt') -Value $msg -Encoding UTF8
& git -C $W commit -F (Join-Path $env:TEMP 'k1-commit-msg.txt') 2>&1
Write-Output ('commit exit=' + $LASTEXITCODE)
& git -C $W log --oneline -2 2>&1
& git -C $W status --porcelain=v1 2>&1
Write-Output '== job-055 done =='
