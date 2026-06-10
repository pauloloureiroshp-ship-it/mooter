# Skills Hierarchy Audit — Wave Mega 50-51, Phase 3.D (2026-06-09)

Scope: all 16 skills in repo `.claude/skills/` (11 pre-existing + 5 added this
phase). Recommendations only — nothing was changed or removed.

## Inventory

| Skill | Purpose | Overlap notes |
|---|---|---|
| `moo-dashboard` | Full Mooter dashboard TUI | Distinct (full-screen view); superset of `moo-status` data |
| `moo-distill` | Export Pastor routing → installable .skill.md | **Near-duplicate of `pastor-distill`** — see Redundancy 1 |
| `moo-effort` | Set session effort mode (low/default/high/ultramoo) | Distinct |
| `moo-help` | Mission + /moo-* command menu + live snapshot | **Partial overlap with `moo-status`** — see Redundancy 2 |
| `moo-herd` | Live local-worker herd + recent workflow runs | Distinct; adjacent to `moo-workflow` (state vs action) |
| `moo-pack` | Pack management (list/show/diff/validate) | Distinct |
| `moo-status` | One-shot plain-language status (`mooter status --didactic`) | `moo-help` ends by running the same command |
| `moo-workflow` | Run a local-first dynamic workflow | **Near-duplicate of `workflows`** — see Redundancy 1 |
| `mooter` | Router shortcuts dispatcher (`/mooter <sub>`) | Hub skill; `/mooter route` overlaps new `routing-decision-explain` (dispatcher runs the command; the new skill interprets it) |
| `pastor-distill` | Export learned routing patterns as markdown skill | Same job as `moo-distill`, different trigger phrasing |
| `workflows` | Local-first dynamic workflows (long-form description) | Same job as `moo-workflow`, different trigger phrasing |
| `routing-decision-explain` (new) | Run classify.js + interpret tier/confidence/cost | Complements `mooter route` (raw) with interpretation |
| `local-first-default` (new) | Prefer free local paths; smell test | Guidance layer above `moo-workflow`/`workflows` |
| `wave-brief-compose` (new) | Compose wave kickoff briefs in house style | Distinct (authoring aid) |
| `final-reviewer-honest` (new) | Pre-merge gate checklist + SHIP/NO-SHIP rubric | Distinct (process gate) |
| `pricing-correto-2026` (new) | Single authoritative pricing table | Distinct by design — other skills defer to it |

## Redundancies flagged

1. **`moo-distill` ≡ `pastor-distill`** and **`moo-workflow` ≡ `workflows`** —
   two pairs that wrap the same underlying commands (`mooter pastor distill`,
   `mooter workflow`) with slash-command vs natural-language triggers. Each
   pair doubles the skill-matching surface and risks divergent instructions
   over time. Recommendation: keep the `/moo-*` variant as the canonical body
   and reduce the other to a 3-line pointer ("see `moo-distill`"), or merge
   trigger phrases into one skill. *(Not applied — audit only.)*
2. **`moo-help` ⊃ `moo-status`** — `moo-help` ends by running
   `mooter status --didactic`, which is the entire body of `moo-status`. Low
   harm (help menus should show live state), but if either changes the status
   command, both must be edited. Recommendation: `moo-help` should say "then
   invoke `moo-status`" instead of repeating the command.
3. *(Minor)* `mooter route` vs `routing-decision-explain`: intentional
   layering, not duplication — the dispatcher shows raw JSON; the new skill
   adds interpretation + pricing. Worth one cross-link line in each.

## Hub-and-spoke recommendation (subagent tool sets)

Recommendation only — no agent definitions were changed. Principle: the hub
(orchestrator) keeps the full tool surface; each spoke gets the minimum set
for its role, which reduces blast radius and prompt-injection surface.

| Subagent | Role | Recommended tool set |
|---|---|---|
| `local-summarizer` / `local-transformer` | T0 summarize/extract/transform | **Read, Grep, Glob, Bash** (Bash only to call `ollama_call.sh`); no Write/Edit |
| `cheap-triage` | T1 commit msgs, docstrings, regex | Read, Grep, Glob; Bash optional for `git log/diff` read-only |
| `model-reasoner` | T2 bug hunt, plans | Read, Grep, Glob, Bash (read-only commands); Write only to scratch/`.planning/` |
| `final-reviewer` | T3 gate | **Read-only + Bash** (sha256sum, test suites, git diff/status); explicitly NO Write/Edit — a reviewer that can edit can self-approve |
| `model-architect` | T3 architecture/refactor | **Full** (Read/Write/Edit/Bash/Glob/Grep) — it is the only spoke that should produce multi-file changes |

Skills layer the same way: `pricing-correto-2026` is a leaf every other skill
defers to; `mooter` is the dispatcher hub; the four other new skills are
process spokes that reference (never restate) the leaf.
