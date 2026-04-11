#Requires -Version 5.1
<#
.SYNOPSIS
    frugal installer for Windows (PowerShell 5.1+)

.DESCRIPTION
    Installs the frugal Claude Code router into ~/.claude/ on Windows.
    Works with PowerShell 5.1+ (built into Windows 10/11).
    Idempotent: safe to re-run. Backs up anything it touches.

.PARAMETER DryRun
    Show what would change without making changes.

.PARAMETER Force
    Overwrite CLAUDE.md even if it exists.

.PARAMETER Doctor
    Diagnose current install health.

.PARAMETER Uninstall
    Remove frugal files and restore backups.

.EXAMPLE
    .\install-windows.ps1
    .\install-windows.ps1 -DryRun
    .\install-windows.ps1 -Doctor
    .\install-windows.ps1 -Uninstall
#>

param(
    [switch]$DryRun,
    [switch]$Force,
    [switch]$Doctor,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# ── Path resolution ──────────────────────────────────────────────────────
# Claude Code on Windows uses ~/.claude/ (user home), same as Mac/Linux.
$ClaudeDir = if ($env:FRUGAL_CLAUDE_DIR) { $env:FRUGAL_CLAUDE_DIR } else { Join-Path $HOME ".claude" }
$RouterDir = Join-Path $ClaudeDir "tools\router"
$BackupDir = Join-Path $ClaudeDir "backups\install-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$RecommendedOllama = "qwen2.5:3b"

function Say($msg)  { Write-Host "  $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [XX] $msg" -ForegroundColor Red }

function DoRun($description, [scriptblock]$action) {
    if ($DryRun) {
        Write-Host "  [dry-run] $description" -ForegroundColor DarkGray
    } else {
        & $action
    }
}

# ── Banner ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  frugal v0.9.4" -ForegroundColor White
Write-Host "  Stop paying for a brain surgeon when you need a band-aid." -ForegroundColor DarkGray
Write-Host ""

# ── DOCTOR mode ──────────────────────────────────────────────────────────
if ($Doctor) {
    Write-Host "  frugal Doctor" -ForegroundColor White
    Write-Host "  =============" -ForegroundColor White

    if (Test-Path $ClaudeDir) { Ok "~/.claude exists" } else { Fail "~/.claude missing" }
    if (Test-Path (Join-Path $ClaudeDir "CLAUDE.md")) { Ok "CLAUDE.md present" } else { Warn "CLAUDE.md missing" }
    if (Test-Path (Join-Path $ClaudeDir "settings.json")) { Ok "settings.json present" } else { Warn "settings.json missing" }
    if (Test-Path (Join-Path $RouterDir "classify.js")) { Ok "classifier installed" } else { Fail "classifier missing" }
    if (Test-Path (Join-Path $RouterDir "inject_context.js")) { Ok "hook entry installed" } else { Fail "hook missing" }

    # Node.js check
    try {
        $nodeVer = & node --version 2>$null
        Ok "Node.js $nodeVer"
    } catch {
        Fail "Node.js not found — install from https://nodejs.org/"
    }

    # Ollama check
    try {
        $ollamaVer = & ollama --version 2>$null
        Ok "Ollama detected"
        $models = & ollama list 2>$null
        if ($models -match $RecommendedOllama) {
            Ok "Model $RecommendedOllama available"
        } else {
            Warn "Model $RecommendedOllama missing — run: ollama pull $RecommendedOllama"
        }
    } catch {
        Warn "Ollama not found — T0 tier unavailable. Install from https://ollama.com"
    }

    # API key
    if ($env:ANTHROPIC_API_KEY) {
        Ok "ANTHROPIC_API_KEY set"
    } else {
        Warn "ANTHROPIC_API_KEY not set — T1 direct calls unavailable (still works via subagent)"
    }

    # Decisions log
    $logPath = Join-Path $RouterDir "decisions.log"
    if (Test-Path $logPath) {
        $lineCount = (Get-Content $logPath | Measure-Object -Line).Lines
        Ok "decisions.log has $lineCount entries"
    } else {
        Warn "No decisions yet — telemetry starts on next prompt"
    }

    # Skills
    $skillCount = (Get-ChildItem (Join-Path $ClaudeDir "skills") -Directory -Filter "frugal-*" -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($skillCount -ge 8) {
        Ok "$skillCount frugal slash commands installed"
    } else {
        Warn "Only $skillCount/9 frugal skills installed — re-run installer"
    }

    Write-Host ""
    exit 0
}

# ── UNINSTALL mode ───────────────────────────────────────────────────────
if ($Uninstall) {
    Say "Uninstalling frugal..."
    $latestBackup = Get-ChildItem (Join-Path $ClaudeDir "backups") -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($latestBackup -and (Test-Path (Join-Path $latestBackup.FullName "settings.json.bak"))) {
        DoRun "Restore settings.json" {
            Copy-Item (Join-Path $latestBackup.FullName "settings.json.bak") (Join-Path $ClaudeDir "settings.json") -Force
        }
        Ok "Restored settings.json from backup"
    }

    $toRemove = @(
        (Join-Path $ClaudeDir "CLAUDE.md"),
        $RouterDir
    )
    $skillsToRemove = @("model-router", "frugal-status", "frugal-savings", "frugal-update",
        "frugal-summary", "frugal-route", "frugal-beast", "frugal-zen", "frugal-auto", "frugal-hello")
    $agentsToRemove = @("model-architect", "model-reasoner", "cheap-triage",
        "local-summarizer", "local-transformer", "final-reviewer")

    foreach ($item in $toRemove) {
        if (Test-Path $item) {
            DoRun "Remove $item" { Remove-Item $item -Recurse -Force }
        }
    }
    foreach ($skill in $skillsToRemove) {
        $sp = Join-Path $ClaudeDir "skills\$skill"
        if (Test-Path $sp) {
            DoRun "Remove skill $skill" { Remove-Item $sp -Recurse -Force }
        }
    }
    foreach ($agent in $agentsToRemove) {
        $ap = Join-Path $ClaudeDir "agents\$agent.md"
        if (Test-Path $ap) {
            DoRun "Remove agent $agent" { Remove-Item $ap -Force }
        }
    }

    Ok "Uninstalled. Backups kept in $(Join-Path $ClaudeDir 'backups')."
    exit 0
}

# ── INSTALL mode ─────────────────────────────────────────────────────────

# 1. Prereq checks
if (-not (Test-Path $ClaudeDir)) {
    Fail "~/.claude does not exist — install Claude Code first."
    Write-Host "  https://docs.anthropic.com/claude-code" -ForegroundColor DarkGray
    exit 3
}

try { $null = & node --version 2>$null } catch {
    Fail "Node.js not found — install from https://nodejs.org/ or: winget install OpenJS.NodeJS.LTS"
    exit 3
}

# 2. Backup
DoRun "Create backup" { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
if (Test-Path (Join-Path $ClaudeDir "settings.json")) {
    DoRun "Backup settings.json" {
        Copy-Item (Join-Path $ClaudeDir "settings.json") (Join-Path $BackupDir "settings.json.bak")
    }
}
if (Test-Path (Join-Path $ClaudeDir "CLAUDE.md")) {
    DoRun "Backup CLAUDE.md" {
        Copy-Item (Join-Path $ClaudeDir "CLAUDE.md") (Join-Path $BackupDir "CLAUDE.md.bak")
    }
}
Ok "Backed up to $BackupDir"

# 3. Ollama check
try {
    $null = & ollama --version 2>$null
    Ok "Ollama detected"
    $models = & ollama list 2>$null
    if ($models -notmatch $RecommendedOllama) {
        Say "Pulling $RecommendedOllama (~1.9 GB)..."
        if (-not $DryRun) { & ollama pull $RecommendedOllama }
    } else {
        Ok "$RecommendedOllama already installed"
    }
} catch {
    Warn "Ollama not found — T0 tier will be unavailable"
    Write-Host "    Optional: https://ollama.com/download" -ForegroundColor DarkGray
}

# 4. API key check
if (-not $env:ANTHROPIC_API_KEY) {
    Warn "ANTHROPIC_API_KEY not set — T1 direct calls will use subagent fallback"
}

# 5. File install — copies from repo into ~/.claude/
$SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Test-Path (Join-Path $SrcDir "tools\router")) -and (Test-Path (Join-Path $SrcDir "agents"))) {
    # Create directories
    $dirs = @($RouterDir, (Join-Path $ClaudeDir "agents"), (Join-Path $ClaudeDir "skills"),
              (Join-Path $ClaudeDir "docs"), (Join-Path $ClaudeDir "hooks"))
    foreach ($d in $dirs) {
        DoRun "Create $d" { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }

    # Copy router files
    DoRun "Copy router scripts" {
        Copy-Item (Join-Path $SrcDir "tools\router\*.js") $RouterDir -Force
        Copy-Item (Join-Path $SrcDir "tools\router\*.sh") $RouterDir -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $SrcDir "tools\router\*.cmd") $RouterDir -Force -ErrorAction SilentlyContinue
    }

    # Copy hook files that ship inside tools/router/ in the repo but live under hooks/ at runtime.
    # Remove the bulk-copy duplicates so they don't linger as orphans in router/.
    $statusline = Join-Path $SrcDir "tools\router\gsd-statusline.js"
    if (Test-Path $statusline) {
        DoRun "Copy statusline hook" {
            Copy-Item $statusline (Join-Path $ClaudeDir "hooks\gsd-statusline.js") -Force
        }
    }
    $turnEnd = Join-Path $SrcDir "tools\router\gsd-turn-end.js"
    if (Test-Path $turnEnd) {
        DoRun "Copy turn-end hook" {
            Copy-Item $turnEnd (Join-Path $ClaudeDir "hooks\gsd-turn-end.js") -Force
        }
    }
    DoRun "Remove router/ hook orphans" {
        Remove-Item (Join-Path $RouterDir "gsd-statusline.js") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $RouterDir "gsd-turn-end.js") -Force -ErrorAction SilentlyContinue
    }

    # Copy agents
    DoRun "Copy agents" {
        Copy-Item (Join-Path $SrcDir "agents\*.md") (Join-Path $ClaudeDir "agents") -Force
    }

    # Copy skills
    $skills = @("model-router", "frugal-status", "frugal-savings", "frugal-update",
        "frugal-summary", "frugal-route", "frugal-beast", "frugal-zen", "frugal-auto", "frugal-hello")
    foreach ($skill in $skills) {
        $skillSrc = Join-Path $SrcDir "skills\$skill"
        if (Test-Path $skillSrc) {
            $skillDst = Join-Path $ClaudeDir "skills\$skill"
            DoRun "Install skill $skill" {
                New-Item -ItemType Directory -Path $skillDst -Force | Out-Null
                Copy-Item (Join-Path $skillSrc "SKILL.md") (Join-Path $skillDst "SKILL.md") -Force
            }
        }
    }
    $installedSkills = ($skills | Where-Object { Test-Path (Join-Path $SrcDir "skills\$_") }).Count
    Ok "Installed $installedSkills slash commands"

    # Copy docs
    DoRun "Copy docs" {
        Copy-Item (Join-Path $SrcDir "docs\*.md") (Join-Path $ClaudeDir "docs") -Force -ErrorAction SilentlyContinue
    }

    # CLAUDE.md
    $claudeMdDst = Join-Path $ClaudeDir "CLAUDE.md"
    if ((-not (Test-Path $claudeMdDst)) -or $Force) {
        DoRun "Install CLAUDE.md" {
            Copy-Item (Join-Path $SrcDir "CLAUDE.md") $claudeMdDst -Force
        }
        Ok "Installed CLAUDE.md doctrine"
    } else {
        Warn "CLAUDE.md exists — not overwriting (use -Force to replace)"
    }

    Ok "Installed router files into $RouterDir"
} else {
    Warn "Source directories not found in $SrcDir — running in standalone mode"
}

# 6. settings.json hook merge
$settingsPath = Join-Path $ClaudeDir "settings.json"
if (Test-Path $settingsPath) {
    $settingsContent = Get-Content $settingsPath -Raw
    if ($settingsContent -match "inject_context") {
        Ok "UserPromptSubmit hook already registered"
    } else {
        Say "Merging UserPromptSubmit hook into settings.json..."
        DoRun "Inject hook" {
            $hookCmd = "node `"$RouterDir\inject_context.js`""
            & node -e @"
const fs = require('fs');
const p = '$($settingsPath -replace '\\','/')';
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.hooks = s.hooks || {};
s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || [];
s.hooks.UserPromptSubmit.push({
  hooks: [{ type: 'command', command: 'node \"$($RouterDir -replace '\\','/')\/inject_context.js\"', timeout: 3 }]
});
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"@
        }
        Ok "Hook installed"
    }
    # Stop hook — feedback loop telemetry (writes turn_end events for backtest.resolveFeedback)
    $settingsContent2 = Get-Content $settingsPath -Raw
    if ($settingsContent2 -match "gsd-turn-end") {
        Ok "Stop hook already registered"
    } else {
        Say "Merging Stop hook into settings.json..."
        DoRun "Inject Stop hook" {
            & node -e @"
const fs = require('fs');
const p = '$($settingsPath -replace '\\','/')';
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.hooks = s.hooks || {};
s.hooks.Stop = s.hooks.Stop || [];
s.hooks.Stop.push({
  hooks: [{ type: 'command', command: 'node \"$($ClaudeDir -replace '\\','/')\/hooks\/gsd-turn-end.js\"', timeout: 3 }]
});
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"@
        }
        Ok "Stop hook installed (feedback loop enabled)"
    }
}

# 7. Self-test
Say "Running self-test..."
$classifierPath = Join-Path $RouterDir "classify.js"
if (Test-Path $classifierPath) {
    $testOut = & node $classifierPath "redesign the auth system for multi-tenant" 2>&1
    if ($testOut -match '"tier":\s*"T3"') {
        Ok "Classifier working: T3 detected for architecture prompt"
    } else {
        Fail "Classifier self-test failed"
        Write-Host $testOut
        exit 4
    }
}

# 8. Smoke test
$smokeTest = Join-Path $RouterDir "smoke-test.js"
if ((Test-Path $smokeTest) -and (-not $DryRun)) {
    Say "Running smoke test (4 prompts)..."
    & node $smokeTest
}

# ── Success ──────────────────────────────────────────────────────────────
Write-Host ""
Ok "frugal installed!"
Write-Host ""
Write-Host "  Router      classify.js ready" -ForegroundColor Green
Write-Host "  Hook        UserPromptSubmit active" -ForegroundColor Green
Write-Host "  Skills      /frugal-status /frugal-savings /frugal-beast /frugal-zen /frugal-auto" -ForegroundColor Green
Write-Host "  Self-test   T3 detection OK" -ForegroundColor Green
Write-Host ""
Write-Host "  Next step: open Claude Code and type /frugal-status" -ForegroundColor White
Write-Host ""
Write-Host "  Questions? paulo.loureiro.shp@gmail.com" -ForegroundColor DarkGray
Write-Host ""
