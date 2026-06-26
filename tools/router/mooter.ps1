# mooter.ps1 -- "mooter mode" launcher for Claude Code.
#
# What `mooter` does (vs `claude`):
#   * exports MOOTER_MODE=1, which gsd-statusline.js (wired in
#     ~/.claude/settings.json) reads and switches to v6.7 flat multi-line
#     rendering -- 3 layered rows (L1 identity, L2 savings, L3 subscription)
#     rendered in-prompt with '-' ASCII filler instead of Unicode '-' corners,
#     because probe 1-7 (commit d8b596f) proved U+25xx box-drawing kills
#     Claude Code's in-prompt statusline parser multi-line. The external
#     boxed v6.4 dashboard lives in mooter-dashboard.js (launched separately
#     via `node mooter-dashboard.js` -- NOT by `mooter`).
#   * runs `claude` in the SAME terminal -- no external windows, no
#     split panes, no companion processes.
#
# Smart routing is wired globally via the UserPromptSubmit hook, so
# `claude` already gets it. The ONLY user-visible difference between
# `claude` and `mooter` is the statusline shape:
#   claude  -> single-line v6.5 (conservative, fits narrow terminals)
#   mooter  -> 3-row flat multi-line v6.7 (layered dashboard in-prompt)
#
# ASCII-only source so Windows PowerShell 5.1 parses it without BOM.

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- Cockpit-pollution guard ---------------------------------------------------
# `mooter` on PATH resolves to THIS launcher. A management/status subcommand --
# e.g. the cockpit's `mooter slash-commands status` health poll -- must NEVER be
# forwarded to `claude`: launching `claude <subcommand>` spins up a throwaway
# Claude Code session per call, which (1) floods decisions.log, (2) creates junk
# transcripts, and (3) overwrites .last-classified.json so the cockpit's
# active-session follow jumps off your real session. Management verbs are sent to
# the real mooter CLI when installed; otherwise answered locally -- never claude.
$MgmtSubcommands = @(
    'slash-commands','savings','route','explain','digest','local','tier','mcp',
    'vision','bench','why-not-fable','trail','pack','status','summary',
    'feedback','focus','effort','init','doctor','update','login','dashboard'
)
if ($ClaudeArgs -and $ClaudeArgs.Count -gt 0 -and ($MgmtSubcommands -contains $ClaudeArgs[0].ToLower())) {
    $cli = $null
    foreach ($c in @((Join-Path $HOME '.mooter\cli-v1\mooter.js'), (Join-Path $HOME '.mooter\cli\mooter.js'))) {
        if (Test-Path $c) { $cli = $c; break }
    }
    if ($cli -and (Get-Command node -ErrorAction SilentlyContinue)) {
        & node $cli @ClaudeArgs
    } else {
        # No CLI installed -> answer locally. NEVER launch claude for a mgmt call.
        Write-Output ("mooter CLI not installed (subcommand: {0})." -f $ClaudeArgs[0])
    }
    return
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host '[X] claude CLI not found on PATH. Install Claude Code first.' -ForegroundColor Red
    return
}

Write-Host ''
Write-Host '  mooter mode' -ForegroundColor Magenta -NoNewline
Write-Host ' -- multi-line statusline + smart routing' -ForegroundColor DarkGray
Write-Host ''

$env:MOOTER_MODE = '1'
& claude @ClaudeArgs
