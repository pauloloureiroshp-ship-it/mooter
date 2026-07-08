# DECISIONS — cronista (two-factor queue)

> One line per destructive/irreversible proposal. The fleet NEVER executes these;
> Paulo approves or rejects. Format: `- [ ] <date> · <proposal> · <why>`.
- 2026-07-08 · MODEL POLICY (Option C, OK Paulo): DAY model = qwen2.5-coder:14b (9.0GB) — best coder ≤10GB that coabits with the router's qwen2.5:3b (2.2GB) on the 23GB 4090. Fit verified via vram-preflight (9.0+2.2=11.2GB, needs 10.2GB free, ~20GB free with only the router resident → ok). qwen3:30b (18.9GB) RESERVED for an exclusive night window (FLEET_NIGHT_MODEL, window enforcement is a follow-up). Rationale: the router-vs-fleet VRAM contention is structural (F4 finding) — a light day model removes it; the heavy model runs when the router load is lowest.
