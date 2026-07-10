# Wave 55 — Secrets Scan (pre-push gate, 2026-06-11)

> Triggered by the Day-0 finding that the repo is PUBLIC (Decision Option A: stay
> public for now; privatize after the Wave 55.1 install refactor). This scan gates
> the Wave 55 push: it must be clean (no real secret VALUES in history) before the
> 12 new commits go to a public repo.

## Scope
Full reachable history (`git log -p HEAD` = `main` + the 12 wave55 commits), scanned
for: `sk-ant-…`, `ghp_…`/`gho_…`, `AKIA…`, `AIza…`, `service_role` /
`SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `wrangler_secret`,
`MOOTER_ADMIN_TOKEN=…`. 25 raw matches; every one classified below.

## Verdict: ✅ CLEAN — public-safe push

**No real secret values are present in history.** All matches are env-var-NAME
references, `wrangler secret put` commands (which set a secret without its value),
placeholders, or well-known dummy fixtures.

| Match | What it actually is | Real secret? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (×~15) | env-var NAME in code (`env.SUPABASE_SERVICE_ROLE_KEY`), `wrangler secret put` commands, docs, and the guardrail string "NEVER expose service_role key" | ❌ no value |
| `SUPABASE_SERVICE_ROLE_KEY=eyJxxx` / `eyJxxx...` | **placeholder** in setup docs | ❌ placeholder |
| Supabase JWT (`ref:eymtobwinevywmmlmxqa`) | decodes to `{"role":"anon",…}` — the **anon** key, public-by-design (ships in the Next.js client bundle; access controlled by RLS) | ❌ public key |
| `AKIAIOSFODNN7EXAMPLE` (×2) | AWS's official **documentation dummy** key, inside a `sanitisePromptPreview` redaction TEST | ❌ dummy |
| `ghp_abcdefghijklmnopqrstuvwxyz1234567890` | sequential-alphabet **test dummy** | ❌ dummy |
| 2× `eyJ…sub:1234567890…` | the canonical **jwt.io example** token | ❌ example |
| "Binary files differ" (`store.ts`, `pattern-extractor.ts`) | git binary-detection artifact (non-UTF8/emoji byte); current content scanned — no secrets | ❌ artifact |

### Key finding (honest, not alarmist)
The committed Supabase JWT is the **anon** key (`role: anon`), which is designed to
be public — it is the same key shipped to every browser via
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Its safety depends on **Row Level Security being
correct** (the repo's own guardrail string: "NEVER change RLS to permissive").
The **service_role** key — the actual secret — was never committed; it is set only
via `wrangler secret put` at deploy time. No `sk-ant-`, real GitHub PAT, real
Google key, or `MOOTER_ADMIN_TOKEN=` value appears anywhere.

## Action
Push approved. No rotation required. (Standing item: privatize the repo after the
Wave 55.1 install refactor moves `install.sh` off `git clone` → npm/R2 tarball.)
