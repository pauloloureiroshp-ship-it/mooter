# Mooter.ai - Gemini CLI environment diagnostic
# READ-ONLY: installs nothing, modifies nothing. Writes only its own log file.
# ASCII-only for PowerShell 5.1 compatibility.

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logPath = Join-Path $scriptDir 'diag-gemini-env.log'
Start-Transcript -Path $logPath -Force | Out-Null

Write-Output "=== MOOTER GEMINI ENV DIAGNOSTIC (read-only) ==="
Write-Output ("Timestamp  : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Output ("OS         : " + [System.Environment]::OSVersion.VersionString)
Write-Output ("PowerShell : " + $PSVersionTable.PSVersion.ToString())
Write-Output ("RepoRoot   : " + $repoRoot)

Write-Output ""
Write-Output "--- [1] Project root checks ---"
$items = @('package.json', '.git', 'AGENTS.md', 'CLAUDE.md', 'docs', 'GEMINI.md', 'CODEX.md', '.ai', 'scripts', 'docs\AGENT_HANDOFF.md', '.vscode\extensions.json', 'mooter.code-workspace')
foreach ($i in $items) {
  $p = Join-Path $repoRoot $i
  if (Test-Path $p) { $state = 'EXISTS' } else { $state = 'MISSING' }
  Write-Output ("{0,-30} : {1}" -f $i, $state)
}

function Show-Cmd {
  param([string]$label, [string]$exe, [string[]]$cmdArgs)
  Write-Output ""
  Write-Output ("--- " + $label + " ---")
  $found = Get-Command $exe -ErrorAction SilentlyContinue
  if (-not $found) {
    Write-Output ($exe + " : NOT FOUND on PATH")
    return
  }
  Write-Output ($exe + " path : " + $found.Source)
  try {
    $out = & $exe @cmdArgs 2>&1
    $out | ForEach-Object { Write-Output ("" + $_) }
  } catch {
    Write-Output ("ERROR running " + $exe + " : " + $_.Exception.Message)
  }
}

Show-Cmd "[2] Node.js" "node" @("--version")
Show-Cmd "[3] npm" "npm" @("--version")
Show-Cmd "[4] Gemini CLI" "gemini" @("--version")
Show-Cmd "[5] npm global list (gemini-cli)" "npm" @("list", "-g", "@google/gemini-cli", "--depth=0")
Show-Cmd "[6] npm global prefix" "npm" @("prefix", "-g")
Show-Cmd "[7] VS Code CLI" "code" @("--version")

Write-Output ""
Write-Output "--- [8] VS Code extensions (gemini / codex / claude / mooter / google) ---"
$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if ($codeCmd) {
  $ext = & code --list-extensions 2>&1
  $hits = $ext | Where-Object { $_ -match '(?i)gemini|codex|claude|mooter|google' }
  if ($hits) { $hits | ForEach-Object { Write-Output ("" + $_) } }
  else { Write-Output "No matching extensions found" }
  Write-Output ("Total extensions installed: " + ($ext | Measure-Object).Count)
} else {
  Write-Output "code CLI not found - skipped"
}

Write-Output ""
Write-Output "=== DIAGNOSTIC COMPLETE - nothing installed, nothing modified ==="
Stop-Transcript | Out-Null
