$ErrorActionPreference = "Continue"
$log = "$HOME\frugal\_handoff\push-parked-log.txt"
"PUSH RUN $(Get-Date -Format s)" | Out-File $log -Encoding ascii
Set-Location "$HOME\frugal"
$branches = @(
  "feat/quota-aware",
  "feat/fleet-arm",
  "feat/moo-dispatch",
  "feat/live-edit",
  "feat/lp-preview-diagnostics",
  "wave/lp-4-9-ux-intuitive"
)
foreach ($b in $branches) {
  "--- pushing $b" | Out-File $log -Append -Encoding ascii
  git push -u origin $b 2>&1 | Out-File $log -Append -Encoding ascii
}
"--- refs remotos apos push:" | Out-File $log -Append -Encoding ascii
git ls-remote --heads origin 2>&1 | Select-String "quota-aware|fleet-arm|moo-dispatch|live-edit|lp-preview|lp-4-9" | Out-File $log -Append -Encoding ascii
"DONE $(Get-Date -Format s)" | Out-File $log -Append -Encoding ascii
