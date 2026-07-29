$ErrorActionPreference = 'Stop'

$msgPath = Join-Path $PSScriptRoot 'sync-commit-msg.txt'
$msgLines = @(
    'chore(sync): regenerar SYNC.md para v1.24.1',
    '',
    '- retrato do instante; o --check so estabiliza com a frota parada'
)
$msgText = [string]::Join([Environment]::NewLine, $msgLines)
[IO.File]::WriteAllText($msgPath, $msgText, [Text.UTF8Encoding]::new($false))

git add SYNC.md
git commit -F $msgPath

Remove-Item $msgPath -Force
