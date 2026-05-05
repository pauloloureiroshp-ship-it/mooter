# mooter — Landing (v0.10.1)

Public landing page. URL analyser + waitlist. Next.js 15, port `127.0.0.1:7819`
locally, deployed on Vercel.

## Setup

```bash
cd landing
cp .env.local.example .env.local
# Edit .env.local and paste NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
# → http://127.0.0.1:7819
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://eymtobwinevywmmlmxqa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon JWT (public by design, see note below) |
| `FRUGAL_LANDING_STANDALONE` | no | Set to `1` for self-hosted Docker/Fly builds |

On Vercel: set both `NEXT_PUBLIC_*` vars in the project dashboard before first
deploy. They will be embedded at build time.

### About the anon key

Supabase anon keys are designed to be public — they identify the project, not
the user — and all security is enforced by Row Level Security policies on the
tables themselves. The `waitlist`, `url_analyses`, `router_deltas`, and
`sessions` tables have `INSERT`-only public policies; no table exposes
reads to anonymous clients except `waitlist.count`.

## What the landing does

1. **Hero** — tagline + CTA that scrolls to the analyser
2. **URL Analyser** (`POST /api/analyse`) — detects Platform (Vercel,
   Railway, Netlify, GitHub Pages, Cloudflare, Fly.io), Framework (Next.js,
   Remix, Nuxt, Gatsby, Hugo, Astro, SvelteKit, Vite, CRA, generic React),
   and LLM usage (scans HTML for anthropic/openai/claude/gpt/llm/model
   keywords). Shows a fixed savings estimate of **89%** (the real replay
   result on 1,437 prompts — we never fabricate a dynamic number).
3. **How it works** — 3 cards: Classify → Route → Save
4. **Waitlist** (`POST /api/waitlist`) — email + optional URL +
   savings_estimate. Live counter from `HEAD /rest/v1/waitlist`.
5. **Footer** — MIT license + GitHub link

## API routes

| Route | Method | Body | Description |
|---|---|---|---|
| `/api/analyse` | POST | `{ url }` | Detects stack, caches in Supabase `url_analyses` (24h TTL) |
| `/api/waitlist` | POST | `{ email, url?, savings_estimate? }` | Inserts into Supabase `waitlist`, returns new count |
| `/api/waitlist` | GET | — | Returns `{ total }` — cheap HEAD request for counter |

Both routes are fail-open: if Supabase is unreachable, the waitlist POST
returns 503 (honest) but the analyse POST still returns the analysis even if
the cache write fails (UX priority).

## Design choices

- **No `@supabase/supabase-js` dependency** — the REST API + `fetch` is ~100
  lines in `app/lib/supabase.ts` and saves ~300KB of bundled code. All we
  need is INSERT/UPSERT/SELECT/COUNT, no auth flow, no realtime.
- **Plain CSS, no Tailwind** — consistent with the dashboard. Variables live
  in `globals.css`.
- **No chart library** — the savings bar is a div with a CSS width transition.
- **Inter from Google Fonts** — preconnect in layout, one roundtrip.
- **Fail-open everywhere** — any Supabase error returns `null` and the UI
  either falls back silently or shows a friendly message.

## Deployment (Vercel)

```bash
cd landing
npx vercel --prod
# First run: prompts for project name → use "frugal-landing"
# Team: pauloloureiroshp-ship-its-projects
```

After deploy, add the two `NEXT_PUBLIC_*` env vars in the Vercel dashboard
and trigger a redeploy so the keys are embedded.

## Testing locally

Once `npm run dev` is running:

```bash
# Test the analyser
curl -X POST http://127.0.0.1:7819/api/analyse \
  -H "Content-Type: application/json" \
  -d '{"url":"https://vercel.com"}'

# Test the waitlist (replace with a real email you own)
curl -X POST http://127.0.0.1:7819/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","url":"https://github.com/pauloloureiroshp-ship-it/frugal"}'

# Live counter
curl http://127.0.0.1:7819/api/waitlist
```
