$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\diag-ports.log'
"=== ports $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
foreach ($port in @(3000, 7819, 3311)) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    foreach ($c in ($conns | Select-Object -First 2)) {
      $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess) -ErrorAction SilentlyContinue
      (":" + $port + " pid=" + $c.OwningProcess + " cmd=" + $(if ($p) { $p.CommandLine } else { '?' })) | Out-File -FilePath $log -Append -Encoding utf8
    }
  } else {
    (":" + $port + " sem listener") | Out-File -FilePath $log -Append -Encoding ascii
  }
}
"done" | Out-File -FilePath $log -Append -Encoding ascii
