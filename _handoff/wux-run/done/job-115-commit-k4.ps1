# job-115-commit-k4.ps1 -- atomic commit for keeper 4 (selective add, no push)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

& git -C $W add packages/vscode-extension/src/extension.js packages/vscode-extension/src/host-extra.js packages/vscode-extension/src/row-renderer.js packages/vscode-extension/src/mission-control-view.js packages/vscode-extension/src/lp-diagnostics.js packages/vscode-extension/src/lp-publish-view.js packages/vscode-extension/src/lp-skills.js packages/vscode-extension/src/data.test.js packages/vscode-extension/src/deck-shell.test.js packages/vscode-extension/src/mission-control-view.test.js packages/vscode-extension/src/webview-syntax.test.js packages/vscode-extension/src/keeper4-controls.test.js packages/vscode-extension/src/recent-sessions-watch.test.js 2>&1
Write-Output ('add exit=' + $LASTEXITCODE)

$msg = @"
feat(mc): keeper 4 - auto-detect new CC tabs + exact tooltips on every control

W-UX keeper 4/4: (A) new Claude Code sessions now appear in the cockpit without
a manual reload - host-extra.watchRecentSessions() (recursive fs.watch on the
transcripts dir, 250ms debounce, honest ~21s fallback) triggers a cost-bounded
deep refresh; never fires while the view is hidden/busy, never spawns gh/git
more than the existing deep-refresh budget, degrades silently to previous
behaviour if watching fails. (B) tooltip sweep across the rendered surfaces:
195 controls audited, 102 title/aria definitions fixed to state the REAL
effect in PT (no vague 'abrir', no naked numbers). New suites:
recent-sessions-watch.test.js (watcher/budget logic) and
keeper4-controls.test.js (no interactive element without an exact tooltip).
Extension suite 1035/1035 green; classify.js sha intact.

Implementacao: codex exec (OpenAI plane, OAuth ChatGPT).
Orquestracao/verificacao: Cowork (Claude).
"@
$msgPath = Join-Path $env:TEMP 'k4-commit-msg.txt'
[IO.File]::WriteAllText($msgPath, $msg, [Text.UTF8Encoding]::new($false))
& git -C $W commit -F $msgPath 2>&1
Write-Output ('commit exit=' + $LASTEXITCODE)
& git -C $W log --oneline -5 2>&1
& git -C $W status --porcelain=v1 2>&1
Write-Output '== job-115 done =='
