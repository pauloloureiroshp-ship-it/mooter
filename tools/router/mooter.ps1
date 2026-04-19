# mooter.ps1 -- "mooter mode" launcher for Claude Code.
#
# What `mooter` does (vs `claude`):
#   * exports MOOTER_MODE=1, which gsd-statusline.js (already wired in
#     ~/.claude/settings.json) reads and switches to the layered v6.4
#     multi-line dashboard renderer (4 box-drawn rows).
#   * runs `claude` in the SAME terminal -- no external windows, no
#     split panes, no companion processes.
#
# Smart routing is wired globally via the UserPromptSubmit hook, so
# `claude` already gets it. The ONLY user-visible difference between
# `claude` and `mooter` is the statusline shape:
#   claude  -> single-line v6.5 (conservative, fits narrow terminals)
#   mooter  -> 4-line layered dashboard (full v6.4 evolution restored)
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
