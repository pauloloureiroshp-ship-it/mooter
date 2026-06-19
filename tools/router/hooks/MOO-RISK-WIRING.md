# moo-risk — Safety Plane wiring (First Magic FASE 1)

Two layers, by design (hooks are best-effort *fail-open*, so a hard *deny rule* is the
real enforcement — see `hooks/HOOKS-SPEC.md` §4):

## 1. PreToolUse hook — explainable, logged gate
Add to `~/.claude/settings.json` (opt-in; default install stays byte-identical):

```jsonc
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "command",
          "command": "node \"$HOME/.claude/tools/router/hooks/PreToolUse-moo-risk.js\"" }
      ] }
    ]
  }
}
```

The hook scores the tool's action with `moo-risk` (zero-LLM). An irreversible
destructive op (`action === 'escalate_human'`) → **exit 2** (block) with the reason on
stderr, plus a `risk_blocked` event appended to `decisions.log` for the cockpit.

## 2. Permissions deny rule — hard, fail-closed backstop
The hook can fail open (process error, mis-config). For the worst ops, also add a deny
rule so the block holds even if the hook never runs:

```jsonc
{
  "permissions": {
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(*drop table*)",
      "Bash(*DROP TABLE*)",
      "Bash(*drop database*)",
      "Bash(*drop schema*)",
      "Bash(*truncate*)",
      "Bash(rm -rf*)",
      "Bash(rm -fr*)",
      "Bash(kubectl delete*)",
      "Bash(aws s3 rm*--recursive*)",
      "Bash(find *-delete*)"
    ]
  }
}
```

### Coverage boundary (honest)
The hook's destructive bank is an *explainable enumeration*, not an exhaustive list.
It covers the common SQL/git/secret/flag ops (drop/delete/truncate/wipe/vacuum,
`rm -rf` in any flag order, force-push long+short, secret rotation, MFA disable,
prod flag flips). It deliberately does **not** try to enumerate every infra verb
(`kubectl delete namespace`, `aws s3 rm --recursive`, `find . -delete`, `dropdb`
edge spellings). Those are the deny rule's job — that is exactly why the fail-closed
layer exists. Add to either list as new ops surface; FASE 5 tunes precision.

## Layer boundary (important)
- **Prompt layer** (chat / `classify.js` / `moo-risk.assess`) honours *asking-vs-doing*:
  `explain what rm -rf does` → **allow**. This is the FPR fix.
- **Tool layer** (this hook) is intentionally conservative: a *command* that literally
  contains `rm -rf` / `drop table` is gated even inside `echo`/`grep`, because at
  execution time the token is an action, not a question. The cost is a confirmation
  prompt; the benefit is no disguised destructive op slips through. FASE 5 may tune
  tool-layer precision.

## Verify (reproducible, $0)
```sh
cd tools/router
node moo-risk.js "drop the legacy_users table since nothing reads it"   # exit 2
node moo-risk.js "describe how rm -rf works"                            # exit 0
node moo-risk-validate.js                                               # Youden vs Arm C
node --test moo-risk.test.js hooks/PreToolUse-moo-risk.test.js local-fleet.test.js
```
