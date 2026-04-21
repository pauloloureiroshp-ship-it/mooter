---
name: mooter-review
description: >
  Live snapshot of the 24/7 Mooter Continuous Tester findings. Reads directly
  from history — works instantly, no need to wait for hourly cycles.
  Use when the user types "/mooter-review", "review tester", "o que o tester
  encontrou", "review backlog", "aceitar melhorias", "tester report",
  "mooter review now", or wants to see and apply improvements from the tester.
---

# /mooter-review — Review Tester Findings

Reviews and applies findings from the Mooter Continuous Tester (24/7 local agent).

---

## What to do

1. Run the review report to see all pending findings:

```bash
node tools/router/mooter-review.js --report
```

2. Read the output and present a summary to the user with recommendations:
   - **Misroutings**: gold-label candidates — prompts the classifier got wrong
   - **Optimizer insights**: which tropicalization strategies help which models
   - **Model recommendations**: empirical quality matrix from A/B tests
   - **Counters**: stats for landing page and dashboard

3. For each finding category, suggest whether to accept:
   - Misroutings with clear tier mismatch (>1 tier off) → recommend accept
   - Optimizer insights with win rate >60% → recommend tuning
   - Model recommendations with ≥5 A/B tests → recommend updating model-profile.json

4. If the user accepts, apply the findings:

```bash
# Export accepted misroutings as gold labels
node tools/router/mooter-review.js --export-gold

# Validate accuracy hasn't regressed
node tools/router/validate-set.js --strict

# Run backtest to generate tuning suggestions from new data
node tools/router/backtest.js

# Apply tuning to classifier (with backup)
node tools/router/update-router.js
```

5. After applying, show the counters for dashboard/landing:

```bash
node tools/router/mooter-review.js --counters
```

6. Commit changes if accuracy is maintained:

```bash
git add tools/router/gold-labels.json tools/router/mooter-tester-backlog.json
git commit -m "feat(tester): apply N findings from continuous tester — accuracy X%"
```

## Important

- NEVER apply findings that would drop accuracy below 85%
- ALWAYS run validate-set.js --strict after any change
- The tester generates data 24/7 — review periodically (daily recommended)
- Counters in the backlog can be used to update landing page live counters
- All findings are tagged `source: mooter-tester` for traceability
