---
type: HANDOFF
handoff_schema: 1.1
id: vs-audit-ab-codex-20260719
from: codex
to: cowork
status: verified
state: awaiting-you
severity: high
generated_at: 2026-07-20T02:27:43Z
socio_pack: v1@manual
worktree: ../frugal-audit (removed after clean abort)
branch: detached origin/main + 782b8df + 9ff1735 (merge aborted)
sha: d108a40066a89aba434e969e41937587edf491ef
uncommitted: 1
tests: router 988/991 pass; VSIX 1420/1423 pass then failed test 1/1 pass isolated; CLI candidate 576/602 vs base 572/598 with the same 25 failures; receipts 4/4 pass
decisions_pending: ["Cowork validates this packet with moo-handoff-check; Paulo remains the gate for each real push or merge."]
ledger_ref: n/d (dispatch allowed only this report to be written)
---

# HANDOFF — VS-AUDIT-AB: D1 empirical proof + joint merge simulation

## SEVERITY / TL;DR

**HIGH · verified.** D1 is **SIM na fonte candidata**: on the current real machine telemetry, the canonical path returns `routing_advisory.saved_usd=$0.0855` and `execution_receipt.saved_usd=$0.0000`; both are non-negative and explicitly different methodologies. The joint merge simulation over `origin/main@d108a40` completed with zero conflicts and zero deterministic new REDs. It was aborted, and `../frugal-audit` was removed with no residue. This is not a claim that either local tip is pushed, merged, shipped, or already wired into the live UI.

## GOAL / INTENT

Independently prove the source fix for the negative-savings D1 and the real merge compatibility of local tips `feat/vs-w1-semaforo@782b8df` plus `feat/ledger-receipts@9ff1735`, without changing production code or performing a real merge.

## B — A/B EMPIRICAL (PRIMARY)

Real source: `C:\Users\Paulo Loureiro\.claude\tools\router\decisions.log`, SHA-256 `1309848c00e4372a80ea990098eb59f505ab854315c5409c703310e09893f6cb`, mtime `2026-07-19 23:09:58 -0300`. It contained 8/8 valid JSON records: 4 `executed`, 1 `classified`, 1 `arbiter_call`, 2 `turn_end`. All four executed records carried tokens, cost and outcome; all were `deferred` with 0 tokens and `$0` recorded cost. No fixture was used.

| metric | BEFORE — old Control path | AFTER — Cockpit `routing_advisory` | AFTER — Control `execution_receipt` |
|---|---:|---:|---:|
| corpus | live observation documented on 2026-07-19 | current real `decisions.log` | same current real `decisions.log` |
| `cloud_avoided_usd` | n/d — not exposed separately | `$0.0855` | `$0.0000` |
| `actual_cost_usd` | n/d — folded into old formula | `$0.0000` estimated routing cost | `$0.0000` recorded executed cost |
| `saved_usd` / displayed saved | **`-$109.39`** | **`$0.0855`** | **`$0.0000`** |
| `raw_delta_usd` | n/d — leaked as “saved” | `$0.0855` | `$0.0000` |
| `excess_cost_usd` | n/d — no separate bucket | `$0.0000` | `$0.0000` |
| `saved_pct` | n/d | `100%` | n/d (zero counterfactual denominator) |
| methodology | unlabelled per-session transcript counterfactual | `routing_advisory`, `estimated:true` | `execution_receipt`, counterfactual `estimated:true`; actual cost is recorded |

Evidence: the live defect is documented at `_handoff/MOOTER_BOTAO_A_BOTAO_2026-07-19.md:21-22`; the old unclamped accumulator is `packages/vscode-extension/src/host-extra.js:1925-1929` and was **not re-executed**. The candidate contract is `9ff1735:tools/router/savings-tracker.js:140-160`; execution aggregation is lines 173-225. The named projection contract is `9ff1735:tools/router/ledger-receipts.js:261-313` and renders advisory separately at lines 491-536.

**D1 verdict: SIM na fonte candidata.** `saved_usd=max(0, raw_delta_usd)` and `excess_cost_usd=max(0, -raw_delta_usd)` make negative “saved” unrepresentable while preserving the negative delta as evidence. The router suite also passed the clamp regression test. **Not yet end-to-end/live:** the UI consumer still must be wired/reviewed and both audited local tips are ahead of their remote refs.

Strongest objection: the BEFORE and AFTER values are not the same cohort. Per dispatch, BEFORE had to remain the documented live `-$109.39`; AFTER uses the current real log. Therefore this table proves the contract, live-data execution and non-contradictory labels, not a numerical improvement magnitude of `$109.4755`.

## A — JOINT MERGE SIMULATION (SECONDARY)

After `git fetch origin --prune`, the authoritative refs were: base `origin/main@d108a40`; local W1 `782b8df` (remote `1603652`); local receipts `9ff1735` (remote `a2ff16b`). The exact simulation was:

```text
git merge --no-commit --no-ff 782b8dfb427862da067ff34652459266d1871586 9ff1735139b982e490fe41efcd9dfd3dd03bd695
MERGE_RC=0 · MERGE_HEAD=2 entries · conflicts=0
28 files · +2880/-29 · git diff --cached --check=pass
```

Recommended real order: **`9ff1735` receipts first, then `782b8df` W1** — source contract before its UI/projection surface. This is architectural sequencing, not conflict avoidance; the joint merge was clean.

### Post-merge-sim gate

| gate | candidate result | baseline/delimitation | verdict |
|---|---|---|---|
| `tools/router npm test` | 988 pass / 991; 2 fail; 1 skip | only the declared `gsd-statusline` cold-spawn median/max tests failed | known flaky RED; no new functional failure |
| router typecheck | 109 errors / 17 files | after abort: exactly 109 / same 17 files | no delta; premise “only tier-mix:35” refuted |
| VS Code extension full suite | 1420 pass / 1423; 1 fail; 2 skip | unchanged `host-extra-git.test.js` failure passed isolated 1/1 | intermittent, not deterministic regression |
| CLI full suite | 576 pass / 602; 25 fail; 1 skip | base after abort: 572/598 with identical 25 failures/1 skip | +4 candidate tests, zero new failure |
| receipts targeted | 4/4 pass | new surface | PASS |
| combined classifier SHA | `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` | frozen expected SHA | PASS |

The full CLI run was dependency/environment limited in the node_modules-free ephemeral worktree (notably ESM package resolution and Windows HOME/temp semantics), but the base comparison used the identical runner. No deterministic RED unique to the combined candidate was found.

## ZERO-RESIDUE PROOF

- `git merge --abort`: rc 0; detached HEAD returned to `d108a40`; status count 0; no `MERGE_HEAD`.
- `git worktree remove C:\Users\Paulo Loureiro\frugal-audit`: rc 0; physical path absent; registry entry absent.
- Principal before/after: branch `chore/mooter-20-h0`, HEAD `27e4298a620c85d9565f02a697510245184a3a5b`, 464 pre-existing status records, status fingerprint unchanged: `e3bf2dc22bc4c73e231712413cf54041bf5888ecac6fbb5267ba4d10a2646969`.
- RED ALERT: the principal was already dirty; “intact” means byte-for-byte identical Git-status fingerprint, not clean. This allowed report is the only new persistent file.

## PRE-DISPATCH RED-TEAM GATE

| key | answer |
|---|---|
| fonte de verdade | Git objects/refs, real telemetry file + SHA, and command results above |
| escritor único | auditor wrote only this report; tracker/ledger remain the data writers |
| reversível vs irreversível | simulation fully reversed; no push/commit/real merge/deploy |
| script-first | Windows Git/Node commands and deterministic receipt functions produced all figures |
| projeção vs 2ª verdade | this HANDOFF is a projection; Git and telemetry remain truth; no new metric store |
| degradação graciosa | missing receipt fields become n/d; here executed fields existed and were zero |
| frozen/allowlist/n-d | classifier SHA passed; no production file edited; unknowns marked n/d |
| custo de reverter | already paid: abort + worktree removal; remaining report is one removable untracked artifact |

## PENDING / DO-NOT SURVIVOR / NEXT

- PENDING: Cowork runs `moo-handoff-check _handoff/VS_AUDIT_AB_REPORT_2026-07-19.md`, then coordinates the UI hookup and asks Paulo separately before each push/merge.
- No open decision question was asked in this Codex run; `handoff:qa` returned `n/d` because a Claude `--sid` was unavailable, not because a choice was omitted.
- DO-NOT survives: no real merge, push, commit, deploy, production fix, or claim that D1 is already live. Use the local SHAs, not the stale remote tips.

🤝 SOCIO: receita? na · despesa↓? na · risco↓? S · reversível? S · escopo? S

🔍 council-mini 3/3: fonte confrontada? S · reversível? S · projeção sem 2ª verdade? S

CCA: 5/5
⇄ END
