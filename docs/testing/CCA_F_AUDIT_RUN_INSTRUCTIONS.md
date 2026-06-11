# CCA-F Audit — Overnight Run (Wave 55, Phase C.3)

> Paulo runs the full 60-question audit overnight (it needs the GPU + Claude Max
> quota; CC does not run it). First run is pending — Day-0 P3 confirmed
> `~/.mooter/cca-f/audit/` is absent. **NOT the official Anthropic exam.**

## Prerequisites
- Setup done (see [[CCA_F_AUDIT_SETUP.md]]); `npx tsx src/index.ts cca-f audit --help` works.
- Ollama up with a routing-capable local model: `ollama list` shows e.g. `qwen3:30b`.
- Claude Max signed in for the Sonnet self-judge: `claude` CLI works (no API key needed).
- Quota headroom: `mooter status` shows Claude Max not exhausted.

## Run (before sleeping)

```powershell
cd C:\Users\Paulo Loureiro\frugal-wave55\packages\cli
npx tsx src/index.ts cca-f audit --seed 42 --overnight
```

- `--seed 42` makes the 60-question set reproducible (same seed ⇒ same questions).
- `--count` defaults to 60 (the official domain allocation); omit it for the full run.
- `--overnight` just labels the cohort — no behavioural change.
- Each question = route on local Ollama (free) → resolve → Sonnet self-judge (Claude
  Max). Budget roughly a few hours; the judge is the only cloud touch.

## Morning — read the report

```powershell
# newest run dir:
$run = Get-ChildItem "$HOME\.mooter\cca-f\audit" | Sort-Object LastWriteTime -Desc | Select-Object -First 1
Get-Content "$($run.FullName)\report.md" | Select-Object -First 120
```

Each run dir contains: `report.md` · `report.json` · `decisions.jsonl` ·
`notion-page.md` (paste under Notion HQ, or push via MCP) · `chip.json`.

### What "good" looks like (directional, not a certification)
- `pass_rate` ≥ ~70% (Sonnet self-judge — single grader, single cohort n=1).
- `routing_accuracy` high (Pastor/classify routed to the expected tier).
- `classify_intact: true` — the audit MEASURES the sha vs the frozen value, it
  does not assert it.

## After a run
- The `📜 cca-f` statusline chip auto-reads the newest report (enable it per
  [[CCA_F_AUDIT_SETUP.md]]).
- `notion-page.md` is ready to paste under Notion HQ; tags `wave-54, cca-f-audit`.

## Honest caveats
Single cohort (n=1, your machine), a model self-judge (not a human grader), and a
synthetic question set. This is reproducible internal evidence of routing quality —
**directional confidence, not an Anthropic certification.**
