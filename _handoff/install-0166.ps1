$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\install-0166.log'
"=== install 0.16.66 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
$roots = @('C:\Users\Paulo Loureiro\frugal-final','C:\Users\Paulo Loureiro\frugal','C:\Users\Paulo Loureiro\frugal-w2')
$vsix = $null
foreach ($r in $roots) {
  $p = Join-Path $r 'packages\vscode-extension\mooter-cockpit-0.16.66.vsix'
  if (Test-Path $p) { $vsix = $p; break }
}
if (-not $vsix) {
  $vsix = Get-ChildItem 'C:\Users\Paulo Loureiro' -Recurse -Filter 'mooter-cockpit-0.16.66.vsix' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $vsix) { "VSIX 0.16.66 NAO ENCONTRADO" | Out-File -FilePath $log -Append -Encoding ascii; exit 1 }
"vsix = $vsix" | Out-File -FilePath $log -Append -Encoding ascii
& code --install-extension "$vsix" --force 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"install exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding ascii
& code --list-extensions --show-versions 2>&1 | Select-String 'mooter' | Out-File -FilePath $log -Append -Encoding utf8
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
