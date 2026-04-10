# How to install frugal (5 minutes)

frugal saves ~90% of your Claude Code costs without changing anything in your project.
It works on Mac and Windows. It's free.

## Prerequisites

- **Claude Code** installed and working ([install guide](https://docs.anthropic.com/claude-code))
- **Node.js 20+** — check with: `node --version`
- **Optional:** [Ollama](https://ollama.com) — enables free local model for trivial tasks

## Getting access

frugal is a private repo. Paulo will add you as a collaborator on GitHub.
Once you have access:

## Mac / Linux (1 command)

```bash
git clone git@github.com:pauloloureiroshp-ship-it/frugal.git /tmp/frugal && bash /tmp/frugal/install.sh
```

## Windows (PowerShell)

```powershell
git clone git@github.com:pauloloureiroshp-ship-it/frugal.git $env:TEMP\frugal; & $env:TEMP\frugal\install-windows.ps1
```

> No SSH keys? Ask Paulo for a zip file instead.

## After installing

Open Claude Code and type:

```
/frugal-status
```

You should see something like:

```
frugal status — all green

  Router       active
  Classifier   ready (102 patterns)
  Self-test    T3 detection OK
  Savings      ready to save
```

## What changes (and what doesn't)

- Claude Code continues to work exactly the same
- Your prompts stay on your machine — always
- frugal works silently in the background
- Only the routing tier (T0/T1/T2/T3) is shared anonymously to improve the algorithm
- See [PRIVACY.md](PRIVACY.md) for full details

## Useful commands

| Command | What it does |
|---|---|
| `/frugal-status` | Full health check |
| `/frugal-savings` | How much you've saved |
| `/frugal-hello` | What happened on your last prompt |
| `/frugal-beast` | Force the most powerful model (Opus) on everything |
| `/frugal-zen` | Cap at the cheapest tier (maximum savings) |
| `/frugal-auto` | Back to intelligent automatic routing |

## Uninstall

```bash
# Mac/Linux
bash ~/.claude/tools/router/../../../frugal/install.sh --uninstall
# or simply:
rm -rf ~/.claude/tools/router ~/.claude/agents ~/.claude/skills/frugal-*
```

```powershell
# Windows
.\install-windows.ps1 -Uninstall
```

## Problems?

paulo.loureiro.shp@gmail.com
