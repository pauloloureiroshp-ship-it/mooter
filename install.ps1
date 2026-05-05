#Requires -Version 5.1
<#
.SYNOPSIS
    mooter installer for Windows (PowerShell 5.1+)

.DESCRIPTION
    One-liner:  irm https://mooter.ai/install.ps1 | iex

    Zero-admin, zero-UAC. Installs in three locations:
      %USERPROFILE%\.claude\tools\router\   - routing runtime (existing engine)
      %USERPROFILE%\.mooter\cli\            - new `mooter` CLI binary
      %USERPROFILE%\.local\bin\mooter.cmd   - PATH shim (User PATH)

    Adds %USERPROFILE%\.local\bin to the User PATH via the .NET API
    (NEVER setx - setx truncates PATH at 1024 chars and corrupts it).

.PARAMETER DryRun
.PARAMETER NoPath
.PARAMETER Force
.PARAMETER Channel

.EXAMPLE
    irm https://mooter.ai/install.ps1 | iex
    .\install.ps1 -DryRun
    .\install.ps1 -Force
#>

param(
    [switch]$DryRun,
    [switch]$NoPath,
    [switch]$Force,
    [string]$Channel = "friends-beta"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# -- UI helpers -----------------------------------------------------------
function Say($m)  { Write-Host "  > $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [XX] $m" -ForegroundColor Red }
function Info($m) { Write-Host "  $m" -ForegroundColor DarkGray }
function DoRun($desc, [scriptblock]$action) {
    if ($DryRun) { Write-Host "  [dry-run] $desc" -ForegroundColor DarkGray } else { & $action }
}

# -- Paths ----------------------------------------------------------------
$ClaudeDir   = if ($env:CLAUDE_DIR) { $env:CLAUDE_DIR } else { Join-Path $HOME ".claude" }
$RouterDir   = Join-Path $ClaudeDir "tools\router"
$HooksDir    = Join-Path $ClaudeDir "hooks"
$MooterDir   = Join-Path $HOME ".mooter"
$MooterCliDir = Join-Path $MooterDir "cli"
$LocalBin    = Join-Path $HOME ".local\bin"
$ShimPath    = Join-Path $LocalBin "mooter.cmd"
$DeviceDir   = Join-Path $HOME ".frugal"

# When run via `irm | iex`, $MyInvocation.MyCommand.Path is $null.
# Clone the repo in that case.
$SrcDir = $null
if ($MyInvocation.MyCommand.Path) {
    $SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $SrcDir -or -not (Test-Path (Join-Path $SrcDir "tools\router\classify.js"))) {
    Write-Host ""
    Write-Host "  mooter is currently in private friends-beta." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  To install:"
    Write-Host "    1. Request access: " -NoNewline
    Write-Host "https://mooter.ai" -ForegroundColor White -NoNewline
    Write-Host " (or email paulo@mooter.ai)"
    Write-Host "    2. Once invited, clone the repo and run this script locally:"
    Write-Host "       git clone <your-invite-url> mooter" -ForegroundColor White
    Write-Host "       cd mooter; .\install.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "  The public one-liner (irm | iex) will light up when v1.0 ships" -ForegroundColor DarkGray
    Write-Host "  with signed tarballs. Follow along at mooter.ai." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

# -- Version --------------------------------------------------------------
$Version = "0.10.0"
$versionFile = Join-Path $SrcDir "tools\router\version.json"
if (Test-Path $versionFile) {
    try { $Version = (Get-Content $versionFile -Raw | ConvertFrom-Json).version } catch {}
}

# -- Banner ---------------------------------------------------------------
Write-Host ""
Write-Host "  mooter " -NoNewline -ForegroundColor Magenta
Write-Host "v$Version ($Channel)" -ForegroundColor DarkGray
Write-Host "  Intelligent model routing for Claude Code." -ForegroundColor DarkGray
Write-Host ""

# -- Prereq checks --------------------------------------------------------
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Fail "Claude Code CLI not found on PATH."
    Write-Host ""
    Info "  mooter wraps Claude Code - you need it installed first:"
    Info "    irm https://claude.ai/install.ps1 | iex"
    Write-Host ""
    Info "  Once installed, re-run: irm https://mooter.ai/install.ps1 | iex"
    Write-Host ""
    exit 3
}
Ok "Claude Code detected: $((Get-Command claude).Source)"

try {
    $nodeVer = (& node --version 2>$null).TrimStart('v')
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    if ($nodeMajor -lt 18) {
        Fail "Node.js $nodeVer found - mooter needs Node 18+."
        Info "Upgrade: winget upgrade OpenJS.NodeJS.LTS"
        exit 3
    }
    Ok "Node.js v$nodeVer"
} catch {
    Fail "Node.js not found. Install: winget install OpenJS.NodeJS.LTS (or nodejs.org)"
    exit 3
}

if (-not (Test-Path $ClaudeDir)) {
    Fail "~/.claude not found - open Claude Code once, then re-run."
    exit 3
}
Ok "~/.claude present"

# -- Copy runtime ---------------------------------------------------------
Say "Installing runtime to ~/.claude/tools/router/..."
foreach ($d in @($RouterDir, $HooksDir, (Join-Path $ClaudeDir "agents"), (Join-Path $ClaudeDir "skills"),
                 (Join-Path $ClaudeDir "docs"), $MooterCliDir, $LocalBin, $DeviceDir)) {
    DoRun "mkdir $d" { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

DoRun "Copy router .js" {
    Get-ChildItem (Join-Path $SrcDir "tools\router") -Filter *.js -File -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName $RouterDir -Force }
    Get-ChildItem (Join-Path $SrcDir "tools\router") -Filter *.json -File -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName $RouterDir -Force }
}

# Hooks live under ~/.claude/hooks/ - move + delete duplicates in router/
$hookNames = @('gsd-statusline.js','gsd-turn-end.js','frugal-turn-header.js','exec-logger.js','PostToolUse.js')
foreach ($h in $hookNames) {
    $src = Join-Path $SrcDir "tools\router\$h"
    if (Test-Path $src) {
        DoRun "Copy hook $h" { Copy-Item $src (Join-Path $HooksDir $h) -Force }
    }
    DoRun "Clean router orphan $h" { Remove-Item (Join-Path $RouterDir $h) -Force -ErrorAction SilentlyContinue }
}

DoRun "Copy CLI to ~/.mooter/cli/" {
    Copy-Item (Join-Path $SrcDir "tools\cli\*") $MooterCliDir -Recurse -Force
    if (Test-Path $versionFile) { Copy-Item $versionFile (Join-Path $MooterDir "version.json") -Force }
}

# Agents + skills (best-effort)
DoRun "Copy agents" {
    Get-ChildItem (Join-Path $SrcDir "agents") -Filter *.md -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName (Join-Path $ClaudeDir "agents") -Force }
}
if (Test-Path (Join-Path $SrcDir "skills")) {
    foreach ($skillDir in (Get-ChildItem (Join-Path $SrcDir "skills") -Directory -ErrorAction SilentlyContinue)) {
        $dst = Join-Path $ClaudeDir "skills\$($skillDir.Name)"
        DoRun "Skill $($skillDir.Name)" {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            $skillFile = Join-Path $skillDir.FullName "SKILL.md"
            if (Test-Path $skillFile) { Copy-Item $skillFile (Join-Path $dst "SKILL.md") -Force }
        }
    }
}

# CLAUDE.md (only if missing or -Force)
$claudeMdDst = Join-Path $ClaudeDir "CLAUDE.md"
$claudeMdSrc = Join-Path $SrcDir "CLAUDE.md"
if ((Test-Path $claudeMdSrc) -and ((-not (Test-Path $claudeMdDst)) -or $Force)) {
    DoRun "Install CLAUDE.md" { Copy-Item $claudeMdSrc $claudeMdDst -Force }
}

Ok "Runtime installed"

# -- Shim in ~/.local/bin/mooter.cmd --------------------------------------
Say "Installing mooter shim to $ShimPath..."
$shimContent = @"
@echo off
REM mooter launcher shim (installed by install.ps1)
node "%USERPROFILE%\.mooter\cli\mooter.js" %*
"@
if (-not $DryRun) { Set-Content -Path $ShimPath -Value $shimContent -Encoding ASCII }
if ($DryRun) { Write-Host "  [dry-run] Would write shim to $ShimPath" -ForegroundColor DarkGray } else { Ok "Shim: $ShimPath" }

# -- User PATH via .NET API (NOT setx) ------------------------------------
if (-not $NoPath) {
    $currentUserPath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
    if (-not $currentUserPath) { $currentUserPath = "" }
    $pathEntries = $currentUserPath -split ';' | Where-Object { $_ -ne '' }
    if ($pathEntries -notcontains $LocalBin) {
        Say "Adding $LocalBin to User PATH (via .NET API, no admin)..."
        $newPath = if ($currentUserPath) { "$currentUserPath;$LocalBin" } else { $LocalBin }
        if ($DryRun) {
            Write-Host "  [dry-run] Would set User PATH via .NET SetEnvironmentVariable" -ForegroundColor DarkGray
        } else {
            [System.Environment]::SetEnvironmentVariable("Path", $newPath, [System.EnvironmentVariableTarget]::User)
            $env:Path = "$env:Path;$LocalBin"
            Ok "PATH updated - new terminals will pick it up"
        }
    } else {
        Ok "$LocalBin already in User PATH"
    }
}

# -- Hook registration in settings.json -----------------------------------
$settingsPath = Join-Path $ClaudeDir "settings.json"
if (Test-Path $settingsPath) {
    Say "Registering hooks in settings.json..."
    $registerHooks = Join-Path $MooterCliDir "lib\register-hooks.js"
    DoRun "Register hooks" { & node $registerHooks $settingsPath $RouterDir $HooksDir | Out-Null }
    Ok "Hooks registered (UserPromptSubmit + Stop)"
}

# -- Device ID ------------------------------------------------------------
$deviceIdFile = Join-Path $DeviceDir "device.id"
if (-not (Test-Path $deviceIdFile)) {
    DoRun "Generate device.id" {
        # Pass path as positional argv[1] (NOT inline interpolation) so paths
        # with spaces (e.g. "C:/Users/Paulo Loureiro/.frugal/device.id") work.
        $nodeScript = "require('fs').writeFileSync(process.argv[1], require('crypto').randomUUID() + '\n')"
        & node -e $nodeScript $deviceIdFile
    }
    Ok "Device ID generated"
}

# -- Ollama (optional, non-blocking) --------------------------------------
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Ok "Ollama detected"
    try {
        $models = & ollama list 2>$null | Out-String
        if ($models -notmatch "qwen2\.5:3b") {
            Say "Pulling qwen2.5:3b (~1.9 GB) - required for T0 tier..."
            if (-not $DryRun) { & ollama pull qwen2.5:3b }
        } else {
            Ok "qwen2.5:3b ready"
        }
    } catch {
        Warn "Ollama detected but daemon not responding - start the Ollama app"
    }
} else {
    Warn "Ollama not installed - T0 (local, free) tier disabled."
    Info "To enable T0 later:"
    Info "  1. Install Ollama: https://ollama.com/download"
    Info "  2. Run: mooter doctor"
}

# -- API key hint ---------------------------------------------------------
if (-not $env:ANTHROPIC_API_KEY) {
    Warn "ANTHROPIC_API_KEY not set - T1 will use subagent fallback (still works)."
}

# -- Post-install ---------------------------------------------------------
Write-Host ""
Write-Host "  mooter v$Version installed." -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Open a new PowerShell window  " -NoNewline; Write-Host "(so PATH refreshes)" -ForegroundColor DarkGray
Write-Host "    2. " -NoNewline; Write-Host "mooter doctor" -ForegroundColor White -NoNewline; Write-Host "         (verify - 10 checks)" -ForegroundColor DarkGray
Write-Host "    3. " -NoNewline; Write-Host "mooter" -ForegroundColor White -NoNewline; Write-Host "                 (launches Claude Code with routing)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Uninstall anytime: mooter uninstall" -ForegroundColor DarkGray
Write-Host "  Docs: https://mooter.ai" -ForegroundColor DarkGray
Write-Host ""
