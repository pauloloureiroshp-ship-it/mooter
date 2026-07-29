$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\install-0167.log'
"=== install 0.16.67 (lp-coerencia) $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
$wt = 'C:\Users\Paulo Loureiro\frugal-lp-coerencia'
Push-Location $wt
"--- git status ---" | Out-File -FilePath $log -Append -Encoding ascii
& git status --short 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"--- git log -1 (local) ---" | Out-File -FilePath $log -Append -Encoding ascii
& git log -1 --oneline 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"--- fetch origin main ---" | Out-File -FilePath $log -Append -Encoding ascii
& git fetch origin main 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"--- origin/main tip ---" | Out-File -FilePath $log -Append -Encoding ascii
& git log -1 --oneline origin/main 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
Pop-Location

$vsixDir = Join-Path $wt 'packages\vscode-extension'
$vsix = Get-ChildItem $vsixDir -Filter 'mooter-cockpit-0.16.67*.vsix' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $vsix) {
  "vsix 0.16.67 nao encontrado em $vsixDir, a tentar empacotar..." | Out-File -FilePath $log -Append -Encoding ascii
  Push-Location $vsixDir
  & npx --yes @vscode/vsce package --no-dependencies 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  Pop-Location
  $vsix = Get-ChildItem $vsixDir -Filter 'mooter-cockpit-0.16.67*.vsix' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $vsix) {
  "VSIX 0.16.67 NAO ENCONTRADO nem apos tentativa de empacotar. A listar vsix existentes:" | Out-File -FilePath $log -Append -Encoding ascii
  Get-ChildItem $vsixDir -Filter '*.vsix' -ErrorAction SilentlyContinue | Out-File -FilePath $log -Append -Encoding utf8
  exit 1
}
"vsix = $vsix" | Out-File -FilePath $log -Append -Encoding ascii
& code --install-extension "$vsix" --force 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"install exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding ascii
& code --list-extensions --show-versions 2>&1 | Select-String 'mooter' | Out-File -FilePath $log -Append -Encoding utf8
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
