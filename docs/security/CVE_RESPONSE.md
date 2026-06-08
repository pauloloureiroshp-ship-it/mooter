# Mooter — Security Disclosure & CVE Response

Mooter is local-first: most issues affect a single developer's machine, but a
sandbox-escape or a poisoned shared artifact (pack, adapter, federated aggregate)
can have wider blast radius. This is how we handle disclosures.

## Reporting
- **Private first.** Email the maintainer (Paulo Loureiro) or open a **private**
  GitHub security advisory. Do **not** open a public issue for an unpatched flaw.
- Include: affected version (`mooter --version`), platform, repro steps, and the
  blast radius you observed.

## Severity & SLA (target)
| Severity | Examples | Target response | Target fix |
|---|---|---|---|
| Critical | sandbox escape, secret exfiltration, RCE | 24h ack | 72h patch or mitigation |
| High | privilege boundary weakness, key leak path | 72h ack | next wave |
| Medium | DoS, info-leak with low impact | 1 week ack | scheduled |

## Our process
1. **Acknowledge** privately within the SLA.
2. **Reproduce** with a synthetic test added to the repo (e.g. the
   `mooter security spawn-test` style real-sandbox assertion).
3. **Patch** in a dedicated branch; the fix ships with the test that proves it.
4. **Verify** `classify.js` sha is still intact and the 4 sandbox layers still
   pass `mooter security spawn-test`.
5. **Disclose** after a patched release: changelog entry + (if a CVE is assigned)
   a security advisory crediting the reporter.

## Precedent — CVE-2025-59528 (Google Antigravity sandbox escape, CVSS 10.0)
This class of bug — an agent escaping its sandbox to touch the host — is exactly
why Mooter's spawn feature ships with **mandatory** sandboxing and **no
unsandboxed mode**. We carry a synthetic reproduction of the escape scenario as a
permanent regression test (`runSandboxEscapeTest`): it tries to read `~/.ssh`,
write outside the worktree, and leak the provider key, and must be blocked on
every release.

## What we will NOT do
- Auto-apply fixes that touch shared config (`settings.json`, CI) without the
  developer's explicit confirmation.
- Weaken a sandbox layer for convenience. If a layer breaks a legitimate workflow,
  we add a narrower allowance — never a blanket `--no-sandbox`.

See also: [THREAT_MODEL.md](./THREAT_MODEL.md) · [SANDBOX_LAYERS.md](./SANDBOX_LAYERS.md)
