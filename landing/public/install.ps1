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
$DeviceDir   = $MooterDir
$LegacyDeviceIdFile = Join-Path $HOME ".frugal\device.id"

# When run via `irm | iex`, $MyInvocation.MyCommand.Path is $null.
# Fetch the public repo in that case and remove the temporary checkout on exit.
$RepoUrl = if ($env:MOOTER_REPO_URL) { $env:MOOTER_REPO_URL } else { "https://github.com/pauloloureiroshp-ship-it/mooter.git" }
$CloneParent = $null

try {
$SrcDir = $null
if ($MyInvocation.MyCommand.Path) {
    $SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $SrcDir -or -not (Test-Path (Join-Path $SrcDir "tools\router\classify.js"))) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Fail "git not found - install Git first, then re-run, or clone manually:"
        Info "  git clone $RepoUrl mooter; cd mooter; .\install.ps1"
        exit 1
    }

    $CloneParent = Join-Path ([System.IO.Path]::GetTempPath()) ("mooter-install-" + [guid]::NewGuid().ToString("N"))
    $CloneDir = Join-Path $CloneParent "mooter"
    Say "Fetching mooter from the public repo..."
    try {
        DoRun "git clone --depth 1 $RepoUrl $CloneDir" {
            New-Item -ItemType Directory -Path $CloneParent -Force | Out-Null
            & git clone --depth 1 $RepoUrl $CloneDir
            if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }
        }
        $SrcDir = $CloneDir
    } catch {
        Fail "Couldn't fetch mooter - check your network, or clone manually:"
        Info "  git clone $RepoUrl mooter; cd mooter; .\install.ps1"
        exit 1
    }

    if (-not $DryRun -and -not (Test-Path (Join-Path $SrcDir "tools\router\classify.js"))) {
        Fail "Fetched repo is missing the router runtime - please report at https://mooter.ai."
        exit 1
    }
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
    $NodeExe = (Get-Command node).Source
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    # 22 e nao 18 — mesmo piso do install.sh e do engines.node do packages/cli.
    # Copia por necessidade (corre antes de o repo existir), verificada por
    # tools/cockpit/runner/piso-de-node.mjs.
    if ($nodeMajor -lt 22) {
        Fail "Node.js $nodeVer found - mooter needs Node 22+."
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

# The runtime mirror is defined ONCE, in tools/router/sync-runtime.js — the same
# call install.sh and /mooter-update make. Until 2026-08-31 there were THREE
# definitions of "the runtime" (here, install.sh, and the updater) and they had
# already drifted: the updater's glob was non-recursive, so providers/ never got
# refreshed on an updated machine. Measured that day: an update printed five OK
# and left a stale providers/ollama-api.js behind, which is how a fix for the
# free local engine reached the repo but never the runtime.
#
# sync-runtime.js walks recursively, derives the .json set from what the code
# actually requires, copies only what git tracks (never local state such as
# router-tuning.json, never coverage/), and skips the wired hooks — those are
# installed to $HooksDir just below. It also drops the blanket *.json copy this
# block used to do: package.json / tsconfig.json are project config, not runtime,
# and a package.json inside $RouterDir governs module resolution for that tree.
$syncRuntime = Join-Path $SrcDir "tools\router\sync-runtime.js"
DoRun "Mirror router runtime" {
    & node $syncRuntime --src (Join-Path $SrcDir "tools\router") --dest $RouterDir
}

# Hooks live under ~/.claude/hooks/ - move + delete duplicates in router/
# Keep in lockstep with WIRED_HOOKS (tools/router/sync-hooks.js) and install.sh.
# live-preview-tap.js (Live Preview MP0) is the file-bus tap - additive/read-only/fail-soft.
# NOTA: manter em lockstep com WIRED_HOOKS (tools/router/sync-hooks.js) e com o
# loop `for h in ...` do install.sh. Os dois `_model-resolver*` entraram a
# 2026-08-23: o exec-logger e o PostToolUse fazem `require('./_model-resolver')`,
# que resolve para ~/.claude/hooks/, e nenhum dos tres canais os copiava para la.
$hookNames = @('gsd-statusline.js','gsd-turn-end.js','mooter-turn-header.js','frugal-turn-header.js','exec-logger.js','PostToolUse.js','live-preview-tap.js','_model-resolver.js','_model-resolver-core.js')
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

# -- Wave 8/61 - v1.0 product CLI (self-contained esbuild bundle) ----------
# Built from source into a single esbuild bundle and shipped alongside the legacy
# CLI; the hybrid shim below routes v1.0 commands here. Mirrors install.sh. The
# cross-platform `npm run build` (node build.mjs) is what makes this work under
# cmd.exe on Windows (Wave 61 C5 — the old POSIX `NODE_PATH=... esbuild` failed here).
$MooterCliV1Dir = Join-Path $MooterDir "cli-v1"
$MooterPacksDir = Join-Path $MooterDir "packs"
$CliSrc = Join-Path $SrcDir "packages\cli"
if (Get-Command npm -ErrorAction SilentlyContinue) {
    Say "Building v1.0 CLI bundle (esbuild)..."
    if ($DryRun) {
        Info "[dry-run] cd packages\cli; npm install; npm run build; copy bundle + packs"
    } else {
        $v1ok = $false
        Push-Location $CliSrc
        try {
            & npm install --no-audit --no-fund --silent
            if ($LASTEXITCODE -eq 0) {
                & npm run build
                if (($LASTEXITCODE -eq 0) -and (Test-Path (Join-Path $CliSrc "mooter.js"))) { $v1ok = $true }
            }
        } catch { $v1ok = $false }
        finally { Pop-Location }
        if ($v1ok) {
            New-Item -ItemType Directory -Path $MooterCliV1Dir -Force | Out-Null
            New-Item -ItemType Directory -Path $MooterPacksDir -Force | Out-Null
            Copy-Item (Join-Path $CliSrc "mooter.js") (Join-Path $MooterCliV1Dir "mooter.js") -Force
            $packsSrc = Join-Path $SrcDir "packs"
            if (Test-Path $packsSrc) { Copy-Item (Join-Path $packsSrc "*") $MooterPacksDir -Recurse -Force -ErrorAction SilentlyContinue }
            Ok "v1.0 CLI bundle installed (feedback - forge - login - adapter - trail - pack)"
        } else {
            Warn "v1.0 bundle build failed - legacy CLI only (feedback/forge unavailable). Re-run with npm available."
        }
    }
} else {
    Warn "npm not found - v1.0 commands (feedback/forge/...) unavailable; legacy CLI only."
}

# Agents + skills (best-effort)
DoRun "Copy agents" {
    Get-ChildItem (Join-Path $SrcDir "agents") -Filter *.md -ErrorAction SilentlyContinue |
        ForEach-Object { Copy-Item $_.FullName (Join-Path $ClaudeDir "agents") -Force }
}
$skillsSrc = Join-Path $SrcDir ".claude\skills"
if (Test-Path $skillsSrc) {
    foreach ($skillDir in (Get-ChildItem $skillsSrc -Directory -ErrorAction SilentlyContinue)) {
        $dst = Join-Path $ClaudeDir "skills\$($skillDir.Name)"
        DoRun "Skill $($skillDir.Name)" {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Copy-Item (Join-Path $skillDir.FullName "*") $dst -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# CLAUDE.md (only if missing or -Force) — install the personal-doctrine
# template, never the repo's own project-specific CLAUDE.md (that one is
# Mooter-internal: FROZEN classify.js, sha256, tier ladder — not meant to
# become the user's global ~/.claude/CLAUDE.md). Mirrors install.sh.
$claudeMdDst = Join-Path $ClaudeDir "CLAUDE.md"
$claudeMdSrc = Join-Path $SrcDir "CLAUDE.md.template"
if ((Test-Path $claudeMdSrc) -and ((-not (Test-Path $claudeMdDst)) -or $Force)) {
    DoRun "Install CLAUDE.md" { Copy-Item $claudeMdSrc $claudeMdDst -Force }
}

Ok "Runtime installed"

# -- Shim in ~/.local/bin/mooter.cmd --------------------------------------
Say "Installing mooter shim to $ShimPath..."
$shimContent = @'
@echo off
REM mooter launcher shim (installed by install.ps1). Wave 61 hybrid dispatch:
REM   v1.0 product commands  -> bundled CLI (%USERPROFILE%\.mooter\cli-v1\mooter.js)
REM   legacy/installer cmds   -> legacy CLI  (%USERPROFILE%\.mooter\cli\mooter.js)
setlocal
set "V1=%USERPROFILE%\.mooter\cli-v1\mooter.js"
set "LEGACY=%USERPROFILE%\.mooter\cli\mooter.js"
set "NODE=__MOOTER_NODE__"
if "%MOOTER_PACKS_DIR%"=="" set "MOOTER_PACKS_DIR=%USERPROFILE%\.mooter\packs"
set "MCMD=%~1"
if /I "%MCMD%"=="doctor"    goto legacy
if /I "%MCMD%"=="update"    goto legacy
if /I "%MCMD%"=="uninstall" goto legacy
if /I "%MCMD%"=="version"   goto legacy
if /I "%MCMD%"=="--version" goto legacy
if /I "%MCMD%"=="-v"        goto legacy
if /I "%MCMD%"=="help"      goto legacy
if /I "%MCMD%"=="--help"    goto legacy
if /I "%MCMD%"=="-h"        goto legacy
if "%MCMD%"==""             goto legacy
if exist "%V1%" ( "%NODE%" "%V1%" %* ) else ( "%NODE%" "%LEGACY%" %* )
goto :eof
:legacy
"%NODE%" "%LEGACY%" %*
'@
$shimContent = $shimContent.Replace('__MOOTER_NODE__', $NodeExe)
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
if (-not (Test-Path $settingsPath)) {
    DoRun "Create empty settings.json" { Set-Content -Path $settingsPath -Value "{}" -Encoding ASCII }
    Ok "Created empty settings.json"
}
Say "Registering hooks in settings.json..."
$registerHooks = Join-Path $MooterCliDir "lib\register-hooks.js"
DoRun "Register hooks" { & node $registerHooks $settingsPath $RouterDir $HooksDir | Out-Null }
Ok "Hooks registered (UserPromptSubmit + Stop)"

# -- Device ID ------------------------------------------------------------
$deviceIdFile = Join-Path $DeviceDir "device.id"
if (-not (Test-Path $deviceIdFile)) {
    if (Test-Path $LegacyDeviceIdFile) {
        DoRun "Preserve legacy device.id" { Copy-Item $LegacyDeviceIdFile $deviceIdFile -Force }
        Ok "Device ID preserved from legacy location"
    } else {
        DoRun "Generate device.id" {
            # Pass path as positional argv[1] (NOT inline interpolation) so paths
            # with spaces work.
            $nodeScript = "require('fs').writeFileSync(process.argv[1], require('crypto').randomUUID() + '\n')"
            & node -e $nodeScript $deviceIdFile
        }
        Ok "Device ID generated"
    }
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
} finally {
    if ($CloneParent -and (Test-Path -LiteralPath $CloneParent)) {
        Remove-Item -LiteralPath $CloneParent -Recurse -Force -ErrorAction SilentlyContinue
    }
}
