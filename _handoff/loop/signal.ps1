# signal.ps1 - CC -> Cowork "preciso de uma decisao" signal (event-driven HITL handoff).
# Chamado pelo Notification hook (matcher permission_prompt) OU pelo runner num defer irreversivel.
# Faz: (1) le session_id do stdin do hook (2) escreve o ficheiro de correlacao p/ o plugin
# (.cowork-pending.json em ROUTER) (3) escreve NEEDS_DECISION.json no bus p/ o Cowork
# (4) toast instantaneo (5) push ntfy opcional.
param([string]$Source = "cc", [string]$Note = "Claude Code precisa de uma decisao", [string]$Title = $null, [string]$Project = $null)
$ErrorActionPreference = "SilentlyContinue"

# session_id vem no JSON do hook via stdin (Claude Code passa o evento em stdin)
$sid = $null
try { $stdin = [Console]::In.ReadToEnd(); if ($stdin) { $sid = (ConvertFrom-Json $stdin).session_id } } catch {}

$loop   = Join-Path $env:USERPROFILE "frugal\_handoff\loop"
$router = Join-Path $env:USERPROFILE ".claude\tools\router"
$ts = (Get-Date).ToString("o")

# (a) ficheiro de correlacao lido pelo PLUGIN (estado "waiting for Cowork")
$pending = @{ session_id = $sid; status = "pending"; note = $Note; coworkTitle = $Title; coworkProject = $Project; ts = $ts } | ConvertTo-Json -Compress
if (Test-Path $router) { Set-Content -Path (Join-Path $router ".cowork-pending.json") -Value $pending -Encoding UTF8 }

# (b) sinal lido pelo COWORK (governador)
$sig = @{ ts = $ts; source = $Source; note = $Note; session_id = $sid; cwd = (Get-Location).Path } | ConvertTo-Json -Compress
if (Test-Path $loop) { Set-Content -Path (Join-Path $loop "NEEDS_DECISION.json") -Value $sig -Encoding UTF8 }

# (c) toast Windows instantaneo
try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
  $tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
  $tx  = $tpl.GetElementsByTagName("text")
  [void]$tx.Item(0).AppendChild($tpl.CreateTextNode("Mooter - decisao precisa de ti"))
  [void]$tx.Item(1).AppendChild($tpl.CreateTextNode($Note))
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Mooter").Show([Windows.UI.Notifications.ToastNotification]::new($tpl))
} catch { try { [console]::beep(880,300) } catch {} }

# (d) push opcional ao telemovel (define MOOTER_NTFY_TOPIC)
if ($env:MOOTER_NTFY_TOPIC) { try { Invoke-RestMethod -Method Post -Uri ("htt