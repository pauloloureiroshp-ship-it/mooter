# CRITERIA — council

Charter: improve council quality + calibration (length-neutral, ACT, cost)
without regression.

Measured success criteria (STANDING_POLICY.json is the machine copy):
- oracle_gap <= 5%
- p99 <= 100ms

Round proxy metric (honest label): `probe_latency_ms` — wall-clock of a fixed
local scoring probe on the 4090. It is a PROXY for p99, not p99 itself; the
ledger records it as such.
