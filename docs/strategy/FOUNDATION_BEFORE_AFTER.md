# Foundation — Before / After (2026-07-14)

> The forensic "before" snapshot of the foundation reset (masterprompt
> `_handoff/FOUNDATION_SUPER_MASTERPROMPT.md`). The "after" column is filled at **F7**.
> This is also the first artifact of the **Resume** pillar: measuring the drift we let
> accumulate is the baseline for proving Resume works. Numbers are mechanical (git plumbing);
> `n/d` where not yet measured — never a guess.

## Repo state — `~/frugal` (main tree, branch `wave/honest-controls`)

| Metric | Before (2026-07-14) | After (F7) |
|---|---|---|
| Dirty entries (`git status --porcelain \| wc -l`) | **440** | _tbd_ |
| Dirty files (`ls-files`, dirs expanded) | **1569** untracked + 25 tracked-modified | _tbd_ |
| — meaningful WIP preserved | **299** (see F1 snapshot) | — |
| — junk/temp in `scripts/` | **~910** | _tbd_ |
| — `_to_delete/` (trash) | **379** | _tbd_ |
| — `.planning/` (GSD state) | **5** | _tbd_ |
| Local branches | **182** (61 without upstream) | _tbd_ |
| Worktrees | **12** (target F6: 3–5) | _tbd_ |
| Stashes | **8** | _tbd_ |
| Open PRs (`gh pr list --state open`) | **25** | _tbd_ |
| `classify.js` sha256 | `427d8c0b…bc48f` (frozen, intact) | must stay intact |

## F1 snapshot (preservation — pushed to origin 2026-07-14, Cowork-authorized)

- Branch: `backup/tree-snapshot-2026-07-14` @ **`9d53209`**, **pushed to `origin`** (6 commits:
  `m-canon · m-code · docs-novos · lote-g · handoff-vivo` + a `lote-g` fix adding
  `docs/ai/AI_SETUP_SUMMARY.md` — the only artifact that lived uncommitted in a stale worktree).
- Size: **299 files, ~+28.6k / −114**.
- **Scope A** (partners' decision 2026-07-14): only meaningful WIP is snapshotted. Excluded and
  left dirty for F4 to move via manifest — **~910 junk `scripts/`** (temp prefixes +
  `gitkraken/guardian/gj/leas/wux` cruft), **`_to_delete/` (379)**, **`.planning/` (5)**. The
  masterprompt's "~243 temp" estimate was stale; the real junk footprint is ~910.
- `classify.js` sha in the snapshot: **intact**.
- The uncommitted `## 3rd-brain` hunk of `AGENTS.md` was **preserved** in the `m-canon` batch
  (integrated coherently at F3-E, never committed standalone).

## Forensic finding — main tree write-locked 69h (Watch-pillar evidence)

A stale `.git/index.lock` (0 bytes, mtime `2026-07-11 08:41`, from a crashed git process) had
**blocked every write to `~/frugal` for ~69h** — the root cause of the 440 uncommitted changes
piling up with no warning. Removed during F1 (guard: 0 bytes + age > 60 min). Logged as an
`OBSERVADO` entry in `LOOP.md`: this is exactly the silent state the **Watch** pillar exists to
surface. (Two 37h-old zombie `git` processes from GitLens remain — F6 cleanup.)

## Notes

- Outstanding cross-machine debt (tracked in the vault `VAULT-ROADMAP.md`): the **Mac** global
  `~/.claude/settings.json` still needs the 3rd-brain hooks wired with the Mac vault path.
