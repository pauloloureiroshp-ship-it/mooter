# job-065-amend-k1-msg.ps1 -- strip the BOM that Set-Content leaked into keeper 1's commit message
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

$head = (& git -C $W log -1 --format=%s 2>&1)
if ($head -notmatch 'keeper 1') { Write-Output ('HEAD is not keeper 1 commit, aborting: ' + $head); exit 2 }

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
$msgPath = Join-Path $env:TEMP 'k1-commit-msg-nobom.txt'
[IO.File]::WriteAllText($msgPath, $msg, [Text.UTF8Encoding]::new($false))
& git -C $W commit --amend --only -F $msgPath 2>&1
Write-Output ('amend exit=' + $LASTEXITCODE)
& git -C $W log --oneline -2 2>&1
Write-Output '== job-065 done =='
