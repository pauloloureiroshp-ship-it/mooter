/* site/_layout.jsx — wrappers used on every page of the site.
   Exposed: Page, PageMarketing, PageApp, RouteTable
   The route table is the single source of truth for nav between pages. */

const ROUTE_TABLE = {
  // public marketing
  home:           'index.html',
  install:        'install.html',
  signin:         'auth.html',
  packs:          'packs.html',
  'under-hood':   'under-the-hood.html',
  compare:        'compare.html',
  conductor:      'conductor.html',
  cockpit:        'cockpit.html',
  workflow:       'workflow.html',
  commands:       'commands.html',
  sessions:       'sessions.html',
  security:       'security.html',
  changelog:      'changelog.html',
  methodology:    'methodology.html',
  privacy:        'privacy.html',
  forge:          'forge.html',
  how:            'under-the-hood.html',
  'install-cta':  'install.html',
  // onboarding (handled within onboarding.html via ?step=N)
  // app (logged-in)
  dashboard:      'app/dashboard.html',
  'app-packs':    'app/packs.html',
  settings:       'app/settings.html',
  digest:         'app/digest.html',
  community:      'app/community.html',
  // app sidebar key (matches AppShell nav key — override per app page)
  // 'packs' default points to public marketing; AppShell pages override to app/packs.html
};

window.MOOTER_ROUTES = ROUTE_TABLE;
window.MOOTER_SET_ROUTES = (overrides) => { Object.assign(window.MOOTER_ROUTES, overrides); };

/* PageMarketing — wraps a section component with NavBar (top) + Footer (bottom).
   The section component is rendered as-is. */
function PageMarketing({children, activeNav}) {
  const {NavBar, FooterBlock} = window;
  const Footer = window.FooterArtboard;
  return (
    <div style={{minHeight:'100vh', background:'var(--bg)', color:'var(--text)'}}>
      <NavBar activeKey={activeNav}/>
      <div>{children}</div>
      <div style={{minHeight: 900}}>
        <Footer/>
      </div>
    </div>
  );
}

/* PageApp — for logged-in app routes; AppShell already includes a sidebar. */
function PageApp({children}) {
  return <div style={{minHeight:'100vh', background:'var(--bg)', color:'var(--text)'}}>{children}</div>;
}

/* PageBare — auth + onboarding (no nav, no sidebar). */
function PageBare({children}) {
  return <div style={{minHeight:'100vh', background:'var(--bg)', color:'var(--text)'}}>{children}</div>;
}

Object.assign(window, { PageMarketing, PageApp, PageBare });
