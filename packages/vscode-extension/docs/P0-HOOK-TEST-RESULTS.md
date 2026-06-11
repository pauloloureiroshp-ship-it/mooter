# P0 Hook Test — Results (2026-06-11)

**Question:** does the Mooter `UserPromptSubmit` hook fire inside the official Claude Code VS Code extension (graphical panel)?

**Answer: YES — on both surfaces.** Issue anthropics/claude-code#21736 does not reproduce on extension v2.1.153 (darwin-arm64).

## Method
Extra `UserPromptSubmit` hook appended to `~/.claude/settings.json` (config-only, no Mooter code touched), logging timestamp + parent process to `~/.mooter/hook-fire-test.log`. Prompt sent (a) via `claude -p` headless CLI as control, (b) via graphical panel opened with the `vscode://anthropic.claude-code/open?prompt=...` URI handler.

## Evidence
```
--- marker CLI-TEST 2026-06-11T19:11:10Z ---
2026-06-11T19:11:15Z ppid=10627 term=Apple_Terminal parent=/Users/.../.local/bin/claude
--- marker GUI-TEST 2026-06-11T19:11:21Z ---
2026-06-11T19:12:17Z ppid=10943 term=none parent=/Users/.../.vscode/extensions/anthropic.claude-code-2.1.153-darwin-arm64/resources/native-binary/claude
```

## Consequences for the extension (MASTERPROMPT updates)
1. **Launcher uses the graphical tab** via URI handler — confirmed working end-to-end (pre-filled prompt + 1 click).
2. `mooter.launcher.preferTerminal` default stays `false`.
3. Doctor "Hook integration" check: detect parent binary path to report which surface is active.
4. Note: the URI handler shows an "Allow extension to open this URI?" dialog per session — onboarding copy must mention it.

## Environment
macOS 26.3.1 arm64 · Claude Code extension 2.1.153 · CLI at ~/.local/bin/claude · Node v25.8.1
