# Mooter.ai - Gemini CLI + VS Code setup (idempotent, reversible)
# - Installs @google/gemini-cli globally ONLY if absent
# - Installs VS Code extension Google.gemini-cli-vscode-ide-companion ONLY if absent
# - Creates GEMINI.md / .ai/GEMINI_SETUP.md stubs ONLY if absent (never overwrites)
# - ASCII-only for PowerShell 5.1. Log: scripts/setup-gemini-vscode.log
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup-gemini-vscode.ps1

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logPath = Join-Path $scriptDir 'setup-gemini-vscode.log'
Start-Transcript -Path $logPath -Force | Out-Null

$summary = @()
Write-Output "=== MOOTER GEMINI SETUP (idempotent) ==="
Write-Output ("Timestamp: " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Output ("RepoRoot : " + $repoRoot)

# [1] Node / npm
$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  Write-Output "FATAL: node/npm not found on PATH. Install Node.js first (nodejs.org). Nothing was changed."
  Stop-Transcript | Out-Null
  exit 1
}
Write-Output ("node : " + (& node --version 2>&1))
Write-Output ("npm  : " + (& npm --version 2>&1))
$summary += "node/npm: OK"

# [2] Gemini CLI
$gemini = Get-Command gemini -ErrorAction SilentlyContinue
if ($gemini) {
  Write-Output ("gemini already installed: " + (& gemini --version 2>&1))
  $summary += "gemini CLI: already installed (skipped)"
} else {
  Write-Output "gemini not found - installing @google/gemini-cli globally..."
  & npm install -g "@google/gemini-cli" 2>&1 | ForEach-Object { Write-Output ("" + $_) }
  $gemini = Get-Command gemini -ErrorAction SilentlyContinue
  if ($gemini) {
    Write-Output ("gemini installed: " + (& gemini --version 2>&1))
    $summary += "gemini CLI: INSTALLED"
  } else {
    Write-Output "ERROR: gemini still not found after install. Check npm global prefix is on PATH (npm prefix -g)."
    $summary += "gemini CLI: INSTALL FAILED"
  }
}

# [3] VS Code CLI + companion extension
$code = Get-Command code -ErrorAction SilentlyContinue
if (-not $code) {
  Write-Output "WARN: 'code' CLI not found - skipping extension step. In VS Code: Ctrl+Shift+P > 'Shell Command: Install code command'."
  $summary += "VS Code CLI: NOT FOUND (extension skipped)"
} else {
  Write-Output ("code : " + ((& code --version 2>&1) | Select-Object -First 1))
  $ext = & code --list-extensions 2>&1
  $companion = $ext | Where-Object { $_ -match '(?i)^google\.gemini-cli-vscode-ide-companion$' }
  if ($companion) {
    Write-Output "Extension Google.gemini-cli-vscode-ide-companion already installed."
    $summary += "Companion extension: already installed (skipped)"
  } else {
    Write-Output "Installing Google.gemini-cli-vscode-ide-companion..."
    & code --install-extension Google.gemini-cli-vscode-ide-companion 2>&1 | ForEach-Object { Write-Output ("" + $_) }
    $ext2 = & code --list-extensions 2>&1
    if ($ext2 | Where-Object { $_ -match '(?i)^google\.gemini-cli-vscode-ide-companion$' }) {
      $summary += "Companion extension: INSTALLED"
    } else {
      $summary += "Companion extension: INSTALL FAILED (try /ide install inside gemini)"
    }
  }
}

# [4] GEMINI.md stub (only if absent - full version is committed by Cowork setup)
$geminiMd = Join-Path $repoRoot 'GEMINI.md'
if (Test-Path $geminiMd) {
  Write-Output "GEMINI.md exists - NOT touching it."
  $summary += "GEMINI.md: exists (untouched)"
} else {
  $stub = "# GEMINI.md - Mooter.ai`r`n`r`nGemini CLI context file. See .ai/GEMINI_SETUP.md and AGENTS.md.`r`nRead order: AGENTS.md, CLAUDE.md, SYNC.md, docs/strategy/STRATEGY.md, ARCHITECTURE.md.`r`nRole: reviewer / second opinion. Never act as primary agent without authorization.`r`n"
  Set-Content -Path $geminiMd -Value $stub -Encoding ASCII
  Write-Output "GEMINI.md stub created."
  $summary += "GEMINI.md: stub CREATED"
}

# [5] .ai/GEMINI_SETUP.md stub (only if absent)
$aiDir = Join-Path $repoRoot '.ai'
if (-not (Test-Path $aiDir)) { New-Item -ItemType Directory -Path $aiDir | Out-Null }
$setupMd = Join-Path $aiDir 'GEMINI_SETUP.md'
if (Test-Path $setupMd) {
  Write-Output ".ai/GEMINI_SETUP.md exists - NOT touching it."
  $summary += ".ai/GEMINI_SETUP.md: exists (untouched)"
} else {
  $stub2 = "# Gemini CLI Setup`r`n`r`nStart: run 'gemini' in the VS Code integrated terminal at repo root.`r`nIf IDE mode is off: /ide enable (or /ide install).`r`nFirst prompt: read GEMINI.md, AGENTS.md, CLAUDE.md, SYNC.md and do full onboarding, change nothing.`r`n"
  Set-Content -Path $setupMd -Value $stub2 -Encoding ASCII
  Write-Output ".ai/GEMINI_SETUP.md stub created."
  $summary += ".ai/GEMINI_SETUP.md: stub CREATED"
}

Write-Output ""
Write-Output "=== SUMMARY ==="
$summary | ForEach-Object { Write-Output (" - " + $_) }
Write-Output "=== SETUP COMPLETE ==="
Stop-Transcript | Out-Null
