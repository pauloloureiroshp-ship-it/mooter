# CRITERIA — cronista

Charter: record everything, verify cross-pillar harmony, pre-bake handoffs.

Measured success criteria (STANDING_POLICY.json is the machine copy):
- DIGEST.md fresh: at most 1 round behind the newest pillar round.
- 0 unreported incoherences (invariants checked every round: classify.js sha
  frozen · caps respected vs heartbeat · ledger schema valid · every delta has a
  source, 1 claim re-verified per round by the U2 judge · no pillar stalled
  > 2 rounds without an incident).
- HANDOFF_NEXT.md pre-baked per active pillar (a fresh session can resume from
  it alone).
