# /landing-redesign — Mooter Landing Redesign (warm beige)

You are executing the Mooter landing redesign. This replaces the dark Next.js landing at `landing/` with the new warm beige design built in Claude Designer.

**START HERE — read these files before touching any code:**

```
1. Read /frugal/prompts/LANDING_REDESIGN_MASTER.md      ← full brief (read this first, completely)
2. Read /frugal/mooter-design-updated/landing.css        ← new design tokens
3. Read /frugal/mooter-design-updated/landing-core.jsx   ← Nav, HeroTerminalDemo, MOOTER_MARK SVG
4. Read /frugal/mooter-design-updated/landing-sections-a.jsx  ← FlowDiagram, ModelsSection, CompareSection
5. Read /frugal/mooter-design-updated/landing-sections-b.jsx  ← TerminalCompare, InstallSection
6. Read /frugal/mooter-design-updated/landing-sections-c.jsx  ← MooterStatusline (6-row TTY)
7. Read /frugal/landing/app/globals.css                  ← current CSS to replace
8. Read /frugal/landing/app/page.tsx                     ← current page to replace
```

**ABSOLUTE DO-NOT-TOUCH:**
- `landing/app/api/` `landing/app/auth/` `landing/app/onboarding/` `landing/app/setup/` `landing/app/admin/`
- `landing/middleware.ts` `landing/migrations/` `landing/next.config.ts` `landing/package.json`
- Do NOT add new npm packages. Do NOT touch backend logic.

**PRESERVE from current page.tsx:**
- `loginWithGitHub()` — exact implementation
- `useCommunityStats()` — live hub fetch
- `AnimatedNumber` — scroll-triggered counter
- `useInView` — IntersectionObserver hook
- `InstallBlock` — clipboard + npm/bash toggle logic
- All `process.env.NEXT_PUBLIC_*` references

**EXECUTE in 5 phases:**

### Phase 1 — CSS (do this first, build must pass before proceeding)
Replace `landing/app/globals.css` with the new beige design system from `landing.css`.
New root variables: `--beige-bg: #F2ECDF`, `--ink: #1A1613`, `--rose: #C25F65`, tier colors adjusted for light background.
Add keyframes: `fadeIn`, `pulse-dot`, `blink`.
Keep `.reveal` / `.reveal.visible` scroll animation pattern.

### Phase 2 — Core layout
- Replace `Nav` (beige bg on scroll, keep loginWithGitHub + GitHub link)
- Replace `MooterLogo` with `MOOTER_MARK` (ears visible: `fill="#B8C0C8"`)
- Replace `RouterAnimation` with `HeroTerminalDemo` (4 scenarios, 3.5s auto-cycle, fade 250ms, mini statusline strip)
- Replace `Hero` section (two-column: copy left, terminal right, keep useCommunityStats)
- Run `npm run build` — fix any TypeScript errors before Phase 3

### Phase 3 — Section components
- `FlowDiagram` (5 steps 01→05 with arrows) replaces `HowItWorks`
- `ModelsSection` with 4-column tier grid + subscription labels per model + "~ est. only" note
- `MooterStatusline` section (NEW) — shows the 6-row TTY HUD, headline: "What appears in your terminal after install"
- `TerminalCompare` with replay button, step-by-step animation, live cost accumulators
- Run `npm run build`

### Phase 4 — Compare, Install, Footer
- `CompareSection` — 8-row table: Mooter vs LiteLLM vs OpenRouter vs Cursor vs Plain CC
- `InstallSection` — two-panel: install block left, VS Code card right
- `Footer` — logo + nav + community links + MIT badge
- Run `npm run build`

### Phase 5 — Deploy
```
npm run build   ← must exit 0
```
Then deploy via Vercel MCP:
```
deploy_to_vercel → projectId: "prj_2aZMQagzjYOtLyvofeWPnEA0mM1b", teamId: "team_q3kDk3fEFhlL6AcNryTzH3o2"
```
Then verify:
```
list_deployments → confirm status = READY
get_runtime_logs → check for errors
```

**SUCCESS = all true:**
- [ ] `npm run build` exits 0
- [ ] mooter.ai loads with `#F2ECDF` background (not dark)
- [ ] Hero terminal auto-cycles T0→T3 scenarios
- [ ] "Run session" button in TerminalCompare animates step-by-step
- [ ] Model cards show subscription labels (Free · Pro · Max · etc.)
- [ ] Compare table has 8 rows
- [ ] Cow logo ears are visible (grey, not invisible on beige)
- [ ] GitHub OAuth login still works
- [ ] `/api/stats` still returns data
