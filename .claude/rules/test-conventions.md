---
paths: ["**/*.test.js", "**/*.test.ts", "**/*.spec.js", "**/*.spec.ts", "tools/router/test/**"]
description: Testing conventions across router, hub, landing, dashboard
---

# Testing Conventions

## Framework choice
- `tools/router/` → Node `node:test` + `c8` coverage.
- `hub/` → `node:test` under `workerd` where possible, plain Node otherwise.
- `landing/`, `dashboard/` → Vitest (not Jest).

## Test isolation
- **Never mock the database in integration tests.** Use a real Supabase test instance or a spawned D1 local binding.
  Rationale: prior incident — mocked tests passed but prod migration broke.
- Mocks are allowed ONLY for: external APIs (Sentry, Anthropic), `Date.now()`, `fetch` at the boundary.

## Coverage gates (CI-enforced)
- `tools/router/` ≥ 70% branch coverage.
- New code must not drop overall coverage. Add tests in the same PR as the feature.

## Test structure
- One `describe` per exported function; one `it` per branch or invariant.
- Test names state the contract: `"returns T3 when prompt contains rm -rf"` not `"works"`.
- Never test implementation details — test observable behaviour.

## Fixtures
- Use `test/fixtures/` for sample prompts. Reuse across `validation-set.test.js` and `backtest.js`.
- When adding a fixture that represents a new failure mode, add to the validation set too.

## CI
- PR must show `tsc --strict` 0 errors + ESLint 0 warnings + all tests green before merge.
- `test.yml` in `.github/workflows/` is the source of truth for gates.
