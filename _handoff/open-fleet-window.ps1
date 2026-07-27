$ErrorActionPreference = "Continue"
$log = "$HOME\frugal\_handoff\open-fleet-window-log.txt"
"OPEN FLEET WINDOW $(Get-Date -Format s)" | Out-File $log -Encoding ascii
$target = "$HOME\frugal-fleet-arm"
$code = "code"
if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
  $code = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd"
}
"using: $code -> $target" | Out-File $log -Append -Encoding ascii
& $code -n $target 2>&1 | Out-File $log -Append -Encoding ascii
"DONE exit=$LASTEXITCODE $(Get-Date -Format s)" | Out-File $log -Append -Encoding ascii
