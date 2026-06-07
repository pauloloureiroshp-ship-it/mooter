# Tweet draft — Mooter Workflow Engine launch (Wave 28)

## Primary (single tweet)

> Most "agent workflows" run one expensive model N times.
>
> Mooter flips it: Opus writes the orchestration script **once**, then the work
> fans out across free local Ollama workers — one cloud call for synthesis.
>
> A 12-file unused-exports audit: 25 agents, 24 local, **$0.0028**. 🐮

## Thread version

1/ Most multi-agent "workflows" are one expensive model called in a loop. The
bill scales with the work.

Mooter Workflow Engine inverts that. 🧵

2/ One Opus call writes a JS orchestration script. That's the only guaranteed
cloud spend. The script then runs in a sandboxed V8 isolate (isolated-vm — no fs,
no network, no process) and fans the actual work out across **free local Ollama
workers**.

3/ Real run — `mooter workflow run audit-unused-exports --target packages/workflow/src`:

```
✅ completed
   agents: 25 (24 local, 1 cloud) · cost $0.0028 · saved $0.12
   { "files_audited": 12, "candidates": [] }
```

24 free local agents. One Opus synthesis. ~a third of a cent.

4/ The differentiator: **cross-session resume**. State is in local SQLite; every
phase checkpoints. Kill it mid-run, restart — it continues from the last
checkpoint instead of redoing finished work. (Most dynamic workflows are
same-session only.)

5/ The primitives a workflow composes with: `agent()`, `parallel()`, `vote()`,
`converge()`, `checkpoint()`. Workers default to qwen2.5-coder:7b; the cloud is
reserved for the one synthesis step.

6/ Local-first, on-device, ~$0 per run. Your code never leaves the machine — the
sandbox has no filesystem; the host hands workers their material explicitly.

Built as a Claude Code skill: `/workflows`. 🐮

## Notes (not for posting)
- Numbers are from a real run on 2026-06-07 (Wave 28). Re-run before posting if
  the codebase changed materially.
- Cost gate was < $0.50; actual was $0.0028.
- Tag: v1.16.0-workflow-engine-mvp.
