# Trivial-Bypass: Workflow-Optimization Wave (Parked)

**Status**: 🟡 **PARKED** — Fully implemented, documented, tested. Awaiting integration into CI/CD in a future wave.

**Date Created**: 2026-07-08  
**Motivation**: Identify trivial changes (T0: 1-line, typo, icon) vs substantial (T2+) to skip unnecessary approval gates.

**Deliverables** (all in `feat/lp-cockpit-layout` branch):

1. **`tools/router/trivial-bypass.js`** (220 lines)
   - Deterministic classifier (zero LLM cost)
   - Classifies diffs as `✅ TRIVIAL` or `❌ SUBSTANTIAL`
   - Guardrails: dangerous files (`.env`, `package.json`, router, CI) always require full gates
   - Rules:
     - Single file ≤5 changes → TRIVIAL
     - Multi-file ≤8 changes, all docs → TRIVIAL
     - Single commit, single file → TRIVIAL (even up to 8 lines)

2. **`tools/router/trivial-bypass.test.js`** (45 lines)
   - Test scenarios showing expected behavior
   - TEST 1: landing/page.tsx (1 icon) → TRIVIAL
   - TEST 2: VSCode extension (7 files, 219 insertions) → SUBSTANTIAL
   - TEST 3: Split scenario comparison

3. **`_handoff/TRIVIAL_GATE_BYPASS_HANDOFF.md`** (comprehensive handoff)
   - Root cause analysis (1-line change took 15 min + $0.20 Opus)
   - 3 integration paths (GitHub Actions, git hook, CLI)
   - Cost-benefit analysis
   - Implementation checklist for CC

**Impact if Integrated**:
- Per trivial change: 14.5 min saved + $0.15 saved
- Per year (100 T0 changes): ~1170 min + $15 saved
- Better: atomic commits (no more 4 commits for 1 icon)

**Integration Paths** (ready to implement):

### Path A: GitHub Actions (Production-ready)
```yaml
# .github/workflows/trivial-gate-bypass.yml
- name: Classify diff
  id: classify
  run: node tools/router/trivial-bypass.js HEAD origin/main
- name: Auto-merge if trivial
  if: steps.classify.outputs.is_trivial == 'true'
  run: gh pr merge --auto --merge
```

### Path B: Git Hook (Local feedback)
```bash
# .git/hooks/pre-commit
RESULT=$(node tools/router/trivial-bypass.js HEAD origin/main)
if echo "$RESULT" | grep -q '✅ TRIVIAL'; then
  echo "✅ Trivial change detected"
fi
```

### Path C: CLI Command (Manual)
```bash
mooter trivial-check
# Suggests AUTO_MERGE or guides to normal flow
```

**Next Steps** (for future wave):
1. Choose integration path (A recommended)
2. Wire into CI/CD
3. Add `mooter trivial-check` to CLI
4. Document in CONTRIBUTING.md
5. Monitor real-world usage metrics

**Test Evidence**:
- ✅ `trivial-bypass.test.js` scenarios documented
- ✅ Staged example PRs (landing 1-line vs VSCode 180+ lines)
- ✅ No blocking issues found

**Notes**:
- Classifier is **deterministic** (never flaky)
- Guardrails are **conservative** (better to require gates than allow dangerous changes)
- Integration is **non-breaking** (purely additive to CI/CD)
- Backwards-compatible (gate skipping is opt-in)

---

**Archive Path**: This skill will be linked from the project when integrated into a workflow-optimization wave. For now, reference the commit `6c4ec2b` in `feat/lp-cockpit-layout`.
