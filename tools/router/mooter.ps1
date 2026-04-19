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
