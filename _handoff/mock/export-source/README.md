# Mooter — design mock source

Hi-fi, interactive design mocks for both Mooter surfaces (website + VS Code "Cockpit" plugin).
Pure HTML + in-browser React/Babel — **no build step**. All data is mock.

## Run it
Open any file in `site/` in a browser (or serve the folder), e.g.:

    npx serve .        # then open /site/index.html

Each page loads React/Babel from CDN, then the shared `colors_and_type.css` and the `mooter-v1-*.jsx`
artboards from this root. (Internet needed for the React/Babel/font CDNs.)

## Structure
- `colors_and_type.css` — design tokens (single source of truth) + keyframes + responsive helpers
  (`.m-stack`, `.m-2col`, `.m-pad`, `.m-scroll-x`) + `prefers-reduced-motion` block.
- `mooter-v1-shared.jsx` — primitives: MooterMark (canonical cow), NavBar, Card, Btn, tiers, the
  single `MOOTER_VERSION` token, etc.
- `mooter-v1-iter1.jsx` — Hero, Under-the-hood, Compare (11×8), Methodology, Footer.
- `mooter-v1-demo.jsx` — the 2-terminal live-typing savings demo (IntersectionObserver + reduced-motion).
- `mooter-v1-showcase.jsx` — Conductor + Workflow sections.
- `mooter-v1-commands.jsx` / `-install.jsx` / `-stubs.jsx` — /commands, /install, honest stubs.
- `mooter-v1-onboarding.jsx` — login gate (offline-first + illustrative teaser) + onboarding.
- `mooter-v1-app.jsx` — logged-in dashboard/settings (collapsible sidebar).
- `mooter-v1-cmdk.jsx` — global ⌘K command palette (self-mounts).
- `mooter-v1-cockpit.jsx` — **the VS Code plugin**: 5 tabs, 300px + 560px, scenarios (happy/first-run/
  degraded). All mock data.

## Pages (`site/`)
`index.html` (home) · `compare.html` · `install.html` · `commands.html` · `conductor.html` ·
`workflow.html` · `methodology.html` · `packs.html` · `cockpit.html` (plugin) · `auth.html` (login) ·
`sessions.html` · `security.html` · `changelog.html` · `privacy.html` · `under-the-hood.html` ·
`app/dashboard.html` · `app/settings.html` · `app/packs.html`.

## Handoff (`handoff/`)
`SPEC.md` (one-page spec) + `assets/` (canonical cow, mono activity-bar cow, 512 marketplace icon,
favicon) + `_assets-preview.html` (renders the icon set).

Brand + honesty rules live in `handoff/SPEC.md` — read that first.
