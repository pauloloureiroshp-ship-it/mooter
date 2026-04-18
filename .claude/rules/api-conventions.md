---
paths: ["landing/app/api/**/*.ts", "dashboard/app/api/**/*.ts"]
description: Conventions for Next.js API routes in landing and dashboard
---

# API Route Conventions

## Auth
- `createServerClient` (Supabase SSR) FIRST — before any business logic.
- Return `401` for missing session, `403` for role mismatch. Never leak which case via error text.
- Never accept `user_id` from the client body — always derive from `session.user.id`.

## Request validation
- Parse JSON body through a Zod schema imported from `lib/schemas/`.
- On `ZodError`, return `400` with `{ error: "validation_failed", issues: parsed.error.issues }`.

## Hub calls
- Hub base URL **only** via `process.env.MOOTER_HUB_URL`. Never hardcoded.
- Always timeout at 5s with `AbortSignal.timeout(5000)`.
- Forward structured hub errors unchanged — do not re-wrap `isError` payloads.

## Responses
- Use `NextResponse.json(..., { status })`. Never `new Response()` raw.
- Set `Cache-Control: private, no-store` on any route that reads session state.
- Structured error shape: `{ error: string, errorCategory: "validation"|"permission"|"transient"|"internal", isRetryable: boolean }`.

## Observability
- Wrap handler body in `try/catch` and call `Sentry.captureException` with `{ tags: { route: '<path>' } }`.
- Never swallow errors silently — rethrow after capture or return structured error.
