# Review and publish a change

Use **Mooter: Open Live Preview ⚡** to inspect the running app and select an element.

Deterministic edits show a diff before writing and are bound to the confirmed preview tree and source hash. Agent-assisted edits require Workspace Trust, use the workspace's Claude Agent SDK, and return for keep/revert review.

Before publishing, accepted changes must pass a current Security Review. Commit + Push selects only approved paths and never force-pushes. A production deploy requires the exact Vercel project name and uses the immutable commit already sent to Git.

> Community project. Not affiliated with, or endorsed by, Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic, PBC.
