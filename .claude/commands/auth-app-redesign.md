# /auth-app-redesign — Mooter Auth + App Area Redesign + Infra Check

> **Run AFTER `/landing-redesign` completes.** Do NOT run both simultaneously.

**START HERE — read these files completely before writing any code:**

```
1. Read /frugal/prompts/AUTH_APP_REDESIGN_MASTER.md     ← full brief (read this first)
2. Read /frugal/landing/app/(app)/layout.tsx             ← App shell + LoginHero
3. Read /frugal/landing/app/onboarding/page.tsx          ← 3-step wizard
4. Read /frugal/landing/app/(app)/dashboard/page.tsx     ← Dashboard (6 tabs)
5. Read /frugal/landing/app/(app)/settings/page.tsx      ← Settings page
6. Read /frugal/landing/app/globals.css                  ← current CSS (may be updated by /landing-redesign)
7. Read /frugal/INFRA.md                                 ← Vercel/Supabase/Cloudflare IDs
```

**DESIGN SYSTEM — warm dark (authenticated area):**
Landing = warm beige (#F2ECDF). App = warm dark (#110E0B).
Same brand. Different depth. Like walking from a sunny terrace into a cosy dark interior.

Add `.app-shell-root` CSS class with dark variable overrides to `globals.css`.
Apply it to outermost div of: `AppShellLayout`, `LoginHero`, `OnboardingPage`.

**ABSOLUTE DO-NOT-TOUCH:**
- `landing/app/api/` `landing/app/auth/` `landing/app/lib/` `landing/middleware.ts` `landing/migrations/`
- All fetch calls, OAuth logic, hardware detection, config generators

**EXECUTE in 7 phases:**

### Phase 1 — CSS foundation
Add `.app-shell-root` block to `globals.css` (do NOT replace landing CSS, ADD after it).
Add `className="app-shell-root"` to outer divs of `AppShellLayout`, `LoginHero`, `OnboardingPage`.
Run `npm run build` — must pass.

### Phase 2 — LoginHero redesign
Split-screen: left (60%) = warm dark + logo + headline + GitHub button + 3 live stats. Right (40%) = terminal mockup (Mooter statusline, static).
Keep: `useLoginStats()`, `handleLogin()`, exact OAuth URL construction.

### Phase 3 — Onboarding redesign
Progress bar (Step 1/3 → 2/3 → 3/3) in rose.
Step 1: large hardware chips with auto-detection + savings preview.
Step 2: subscription pills + budget options + dynamic explanation.
Step 3: install command block + CLI token (masked, copyable).
Keep ALL: `saveProfile()`, `useDetectedHardware()`, `estimateMonthlySavings()`, `recommendOllamaModel()`, `generateFrugalConfig()`, token fetch.

### Phase 4 — App Shell redesign
Sidebar: MOOTER_MARK SVG (not 🐮 emoji) + nav items with rose active state + user footer card.
Main: warm dark background, styled top bar.
Keep: all nav logic, auth check, logout handler.

### Phase 5 — Dashboard redesign
Apply warm dark cards throughout all 6 tabs.
Status pills: subtle colored backgrounds. Tab bar: underline style, rose active.
Savings hero, flow diagram, tier bars: keep exact logic, update only visual styles.
Keep: ALL component logic, data fetching, tab state. Run build after.

### Phase 6 — Settings redesign
Apply warm dark card system. Styled chips for active states.
Keep all data fetch and update logic. Run build.

### Phase 7 — Infra check + Deploy
```
1. get_project (Vercel) → check env vars exist: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_MOOTER_HUB_URL, SUPABASE_SERVICE_ROLE_KEY
2. execute_sql (Supabase, project eymtobwinevywmmlmxqa) → "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
3. web_fetch → "https://mooter-hub.frugal-hub.workers.dev/api/stats" → confirm JSON response
4. npm run build → exit 0
5. deploy_to_vercel → projectId: "prj_2aZMQagzjYOtLyvofeWPnEA0mM1b", teamId: "team_q3kDk3fEFhlL6AcNryTzH3o2"
6. list_deployments → confirm READY
7. get_runtime_logs → check for errors
8. Create Notion page: parent 33d6f6e4-2bc4-816b-977a-fe84bbe912c9, title "🎨 Sessão YYYY-MM-DD — Auth + App redesign + infra check"
```

**SUCCESS = all true:**
- [ ] `npm run build` exits 0
- [ ] LoginHero: warm dark split-screen, GitHub OAuth works
- [ ] Onboarding: progress bar, styled wizard, all logic preserved
- [ ] App shell: MOOTER_MARK SVG sidebar, warm dark throughout
- [ ] Dashboard: all 6 tabs styled, no logic regressions
- [ ] Settings: warm dark cards
- [ ] Vercel env vars verified
- [ ] Supabase DB accessible
- [ ] Hub API returns stats JSON
- [ ] mooter.ai deployed and READY
- [ ] Notion session log created

**INFRA IDs:**
```
Vercel:     prj_2aZMQagzjYOtLyvofeWPnEA0mM1b  /  team_q3kDk3fEFhlL6AcNryTzH3o2
Supabase:   eymtobwinevywmmlmxqa
Cloudflare: account b1093c8a6e663afd02f98a1e87d0fa34
Hub:        https://mooter-hub.frugal-hub.workers.dev/api/stats
Notion HQ:  33d6f6e4-2bc4-816b-977a-fe84bbe912c9
```
