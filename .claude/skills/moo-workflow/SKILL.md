---
name: moo-workflow
description: Run a Mooter local-first dynamic workflow — fan a task out across FREE local Ollama workers with one cloud synthesis call. Use when the user types /moo-workflow or wants to audit/migrate/research across many files cheaply.
---

# /moo-workflow

Kick off a Mooter Workflow Engine run for the user's task. The expensive model is
used **once** to write the orchestration script; the work then fans out across
free local Ollama workers, with adversarial verification on findings.

## Do this

1. Take the user's task description (everything after `/moo-workflow`).
2. Run:

```bash
mooter workflow create "<task>" --local-first --adversarial
```

3. Show the rendered plan and the saved script path. If the user approves, run it:

```bash
mooter workflow run <name>
mooter workflow watch <run_id>     # live Mission Control (p/r/k controls)
```

Workers run on Ollama (local, $0); only the script writer + synthesis touch the
cloud. A typical run costs ~$0.45 and your code stays on-device.
