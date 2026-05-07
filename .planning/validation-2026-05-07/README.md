# Validation 2026-05-07

End-to-end production validation triggered by Paulo after the
Wave-1.5 + Wave-2 P1 + Migration-009 deploy on 2026-05-07.

## How to use

Open a fresh Claude Code terminal (not this one) and paste the entire
contents of `MASTER-PROMPT.md` as the first user message. The session
will execute autonomously and write its findings into `findings/` and
`evidence/`, then commit + update SYNC.md + post to Notion.

## What the validator must answer

1. Is mooter.ai 100% operationally correct in production today?
2. Is the router producing the cheapest viable tier per prompt given
   the user's hardware/subscription/software profile?
3. Does the statusline reflect the truth of what just happened?
4. Are savings honestly measured?
5. Is the architecture future-proof for new models, providers, and
   pricing changes over the next 12 months?
6. Is privacy non-negotiable in code, not just in marketing copy?

## Folder layout (filled in by the validator)

```
.
├── README.md                  ← this file
├── MASTER-PROMPT.md           ← the brief to paste into the new session
├── VALIDATION-REPORT.md       ← top-level verdict (validator writes)
├── findings/
│   ├── dim1-setup.md
│   ├── dim2-routing.md
│   ├── dim3-landing.md
│   ├── dim4-telemetry.md
│   ├── dim5-statusline.md
│   ├── dim6-onboarding.md
│   ├── dim7-routing-strategy.md
│   ├── dim8-polish.md
│   └── future-proofness.md
└── evidence/
    └── dim*-*.{json,txt,html} ← raw command outputs
```

## Constraints summary

- READ-ONLY against production (D1, Worker, landing)
- NO push, NO deploy, NO migration
- Spawn `Explore` / `model-reasoner` / `final-reviewer` subagents as needed
- Final commit + SYNC.md update + Notion sub-page are mandatory
