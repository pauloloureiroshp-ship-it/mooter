# job-075-commit-k2.ps1 -- atomic commit for keeper 2 (selective add, no push)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

& git -C $W add packages/vscode-extension/src/row-renderer.js packages/vscode-extension/src/extension.js packages/vscode-extension/src/data.test.js packages/vscode-extension/src/deck-floor.test.js 2>&1
Write-Output ('add exit=' + $LASTEXITCODE)

$msg = @"
feat(mc): keeper 2 - compact 1-line session row + disclosure + state buckets (B3)

W-UX keeper 2/4: each live session renders as ONE compact line (state dot,
honest type glyph incl. real scheduled flag, title, state chip, short model,
exactly 3 quick actions: pin/handoff/open-tab) with an accessible remembered
disclosure that keeps the ENTIRE existing card (mode seg, model select,
auto/loop, git flow, handoff, integrations) - nothing removed. Inside each
project group, sessions order into needs-you -> active -> idle/done buckets;
idle/done is born collapsed (persisted collapse mechanism reused). Errors rank
as needs-attention. Row aria moves to role=group with an explicit labelled open
action; 24px targets; prefers-reduced-motion on the chevron; var(--vscode-*)
only. Extension suite 1024/1024 green; classify.js sha intact.

Implementacao: codex exec (OpenAI plane, OAuth ChatGPT).
Orquestracao/verificacao: Cowork (Claude).
"@
$msgPath = Join-Path $env:TEMP 'k2-commit-msg.txt'
[IO.File]::WriteAllText($msgPath, $msg, [Text.UTF8Encoding]::new($false))
& git -C $W commit -F $msgPath 2>&1
Write-Output ('commit exit=' + $LASTEXITCODE)
& git -C $W log --oneline -3 2>&1
& git -C $W status --porcelain=v1 2>&1
Write-Output '== job-075 done =='
