# tests/

Regression tests for the install flow. Small and focused — catch the obvious breakage before a public release candidate.

## install-smoke.sh

End-to-end smoke test of `install.sh`. Spins a **fresh** Docker container (no existing Claude Code / no mooter / no prior state), runs the installer, verifies every artifact lands correctly, and then runs `mooter uninstall` to verify clean removal.

### Run it

```bash
# From the repo root, with Docker Desktop running:
REPO_DIR=$(pwd -W 2>/dev/null || pwd)
docker run --rm -v "${REPO_DIR}:/repo:ro" node:20-bookworm-slim bash -c '
  apt-get update -qq > /dev/null && apt-get install -y -qq curl git uuid-runtime > /dev/null
  bash /repo/tests/install-smoke.sh
'
```

### What it validates

1. **Prereq gate** — without `claude` on PATH, installer exits 3 with a friendly message pointing to the Claude Code install.
2. **Happy path** — with Claude Code + Node 22+, installer populates:
   - `~/.local/bin/mooter` (shim)
   - `~/.mooter/{cli,env,version.json}` (CLI + env file)
   - `~/.claude/tools/router/` (runtime, ~91 JS scripts)
   - `~/.claude/hooks/` (5 event hooks)
   - `~/.frugal/device.id` (UUID)
   - Shell profile injection (idempotent markers in `.bashrc`)
   - `settings.json` hook registration (UserPromptSubmit + Stop)
3. **CLI commands** — `mooter --version`, `mooter --help`, `mooter doctor` all render correctly.
4. **Default behavior** — `mooter` (no args) spawns `claude` with `MOOTER_MODE=1`.
5. **Uninstall** — `mooter uninstall --yes` removes mooter dirs, de-registers hooks, leaves Claude Code untouched.

### Friends-beta pipe path

Separately verify the `curl | bash` behavior (should print friendly access message, zero disk writes):

```bash
docker run --rm -v "${REPO_DIR}:/repo:ro" node:20-bookworm-slim bash -c '
  apt-get update -qq > /dev/null && apt-get install -y -qq curl git > /dev/null
  mkdir -p ~/.local/bin ~/.claude
  echo "#!/bin/bash
echo fake" > ~/.local/bin/claude && chmod +x ~/.local/bin/claude
  export PATH=$HOME/.local/bin:$PATH
  mkdir /tmp/empty && cp /repo/install.sh /tmp/empty/
  cd /tmp/empty && bash install.sh
  [ -d ~/.mooter ] && echo "FAIL: disk touched" || echo "PASS: disk untouched"
'
```

### When to run

- Before merging any change to `install.sh`, `install.ps1`, or `tools/cli/`.
- Before any release candidate tagged for public traffic.
- After changing `version.json`, `tools/router/` layout, or the hook registration logic.

### Not yet covered

- **Windows fresh-install** — needs a Windows 11 sandbox VM. `install.ps1 -DryRun` catches parse errors locally but doesn't exercise the real install.
- **Real macOS** — Linux container proxies but Mac has `launchctl`, `sysctl hw.memsize`, and other Darwin-specific paths.
- **Network failures during Ollama pull** — installer degrades to warning, but the degradation path isn't smoke-tested.
