# npm audit baseline — Wave 30 Phase I (2026-06-07)

Gate policy: **block merge on any HIGH/critical**; moderates tracked, not blocking.

| Package | High/Critical | Moderate | Low | Notes |
|---|---|---|---|---|
| `tools/router` | 0 | 1 | 0 | brace-expansion (transitive) |
| `packages/cli` | 0 | 0 | 0 | clean |
| `hub` | 0 | 3 | 0 | transitive moderates |
| `landing` | 0 | some | some | Next.js toolchain transitives; `audit fix` available |
| `packages/synthesis` | 0 | 0 | 0 | Node builtins only (no runtime deps) |
| `packages/validation` | 0 | 0 | 0 | Node builtins only (no runtime deps) |

**Result: 0 HIGH/critical across all packages.** Security CI (`security.yml`) enforces this on PRs + weekly.

Tracked maintenance (non-blocking):
- SC-2: upgrade brace-expansion (router) + 3 hub moderates in a maintenance PR.
- landing: run `npm audit fix` on the Next.js toolchain.
