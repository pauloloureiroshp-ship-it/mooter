# CRITERIA — seguranca

Charter: continuous 3-promise audit + supply-chain surveillance of packs/MCP.

Measured success criteria (STANDING_POLICY.json is the machine copy):
- 0 leaks
- audit 100%

Round metric (real, measured every round): `leaks_found` — count of secret-shaped
matches (API keys, private key blocks, bearer tokens) from a git-grep scan of the
tracked tree. Criterion is 0.
