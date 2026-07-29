# redact-pat.ps1 v2 -- remove o PAT do fix-mooter-connector.log, com telemetria
$p = 'C:\Users\Paulo Loureiro\frugal\_handoff\fix-mooter-connector.log'
$o = 'C:\Users\Paulo Loureiro\frugal\_handoff\redact-pat.out.txt'
$msg = New-Object System.Collections.ArrayList
$t = [IO.File]::ReadAllText($p)
[void]$msg.Add("len antes: $($t.Length)")
$rx = New-Object System.Text.RegularExpressions.Regex 'github_pat_[A-Za-z0-9_]{20,}'
$hits = $rx.Matches($t).Count
[void]$msg.Add("ocorrencias PAT: $hits")
$t2 = $rx.Replace($t, 'PAT_REDACTED')
[void]$msg.Add("len depois: $($t2.Length)")
[IO.File]::WriteAllText($p, $t2, (New-Object System.Text.UTF8Encoding($false)))
$check = [IO.File]::ReadAllText($p)
[void]$msg.Add("PAT restante no disco: $((New-Object System.Text.RegularExpressions.Regex 'github_pat_[A-Za-z0-9_]{20,}').Matches($check).Count)")
[IO.File]::WriteAllText($o, ($msg -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
