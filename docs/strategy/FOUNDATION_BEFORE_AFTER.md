# Foundation — Before / After (2026-07-14)

> The forensic "before" snapshot of the foundation reset (masterprompt
> `_handoff/FOUNDATION_SUPER_MASTERPROMPT.md`). The "after" column is filled at **F7**.
> This is also the first artifact of the **Resume** pillar: measuring the drift we let
> accumulate is the baseline for proving Resume works. Numbers are mechanical (git plumbing);
> `n/d` where not yet measured — never a guess.

## Repo state — `~/frugal` (main tree)

| Metric | Before (2026-07-14) | After (F7) |
|---|---|---|
| Dirty entries (`git status --porcelain \| wc -l`) | **441** | _tbd_ |
| Local branches | **182** | _tbd_ |
| Branches without upstream | **61** | _tbd_ |
| Worktrees | **12** | _tbd_ |
| Stashes | **8** | _tbd_ |
| Open PRs (`gh pr list --state open`) | **~25** | _tbd_ |
| `classify.js` sha256 | `427d8c0b…bc48f` (frozen, intact) | must stay intact |

## F1 snapshot (preservation, no push — kept local by decision 2026-07-14)

- Branch: `backup/tree-snapshot-2026-07-14` (5 named batch commits: `m-canon · m-code · docs-novos · lote-g · handoff-vivo`).
- Size: **298 files, +28 286 / −114**.
- Temp `scripts/` (≈242, prefixes `lec-/leq-/lecw-/lp-*/lpa-/lpsk-/le-task-snap-/node-compile-cache`) **excluded** from the snapshot — they are F4's `_to_delete/` job.
- `classify.js` sha in the snapshot: **intact**.
- The uncommitted `## 3rd-brain` hunk of `AGENTS.md` was **preserved** in the `m-canon` batch (integrated coherently at F3-E, never committed standalone).

## Notes

- The F1 backup stays **local** (not pushed to the public `origin`) — it holds internal `_handoff/`
  and `docs/strategy/` WIP; on-disk preservation is enough. Offsite backup is a separate decision.
- Outstanding cross-machine debt (tracked in the vault `VAULT-ROADMAP.md`): the **Mac** global
  `~/.claude/settings.json` still needs the 3rd-brain hooks wired with the Mac vault path.
