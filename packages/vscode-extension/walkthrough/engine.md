# Install the Mooter engine

Mooter has two layers: a deterministic local-first routing engine and the VS Code project cockpit that turns its evidence into action. The engine uses Claude Code hooks; it does not proxy API traffic.

```
npx @mooter/cli
```

Once installed, open the cockpit to see sessions, project state, routing decisions, agents, and local health. Live Edit, Git publishing, and deploy remain separate, explicit actions with host-side gates. Learn more at [mooter.ai](https://mooter.ai).
